import { ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import lockfile from 'proper-lockfile';
// XDG-compliant storage path
const xdgDataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
const storageDir = path.join(xdgDataHome, 'collaborative-canvas');
// DIRECT write to hooks-queue.json - bypasses MCP server to avoid race conditions
// when multiple Claude instances are running with different MCP server versions
const HOOKS_QUEUE_FILE = path.join(storageDir, 'hooks-queue.json');
async function writeToHooksQueue(drawingId, drawingName, elementCount, type) {
    let release;
    try {
        // Ensure queue file exists
        if (!existsSync(HOOKS_QUEUE_FILE)) {
            writeFileSync(HOOKS_QUEUE_FILE, '[]', 'utf8');
        }
        // Acquire exclusive lock
        release = await lockfile.lock(HOOKS_QUEUE_FILE, {
            retries: { retries: 10, minTimeout: 100, maxTimeout: 1000 },
            stale: 10000
        });
        // Read, modify, write
        const content = readFileSync(HOOKS_QUEUE_FILE, 'utf8');
        const queue = JSON.parse(content);
        queue.unshift({
            drawingId,
            drawingName,
            elementCount,
            timestamp: Date.now(),
            type
        });
        writeFileSync(HOOKS_QUEUE_FILE, JSON.stringify(queue, null, 2));
        console.log(`🔒 Direct write to hooks-queue.json: ${drawingId} (${type})`);
    }
    finally {
        if (release) {
            try {
                await release();
            }
            catch (e) { /* ignore */ }
        }
    }
}
// In-memory storage for close signals and mermaid conversions
// (matches web-app/server/index.ts pattern)
const closeSignals = new Map();
const mermaidConversions = new Map();
/**
 * Register all IPC handlers for drawing operations
 * This replaces the HTTP API from the web-app version
 */
export function registerIpcHandlers(storage) {
    // Load drawing
    ipcMain.handle('load-drawing', async (_event, drawingId) => {
        console.log(`📖 IPC: Loading drawing ${drawingId}`);
        const drawing = await storage.getDrawing(drawingId);
        if (!drawing) {
            throw new Error(`Drawing ${drawingId} not found`);
        }
        return drawing;
    });
    // Update drawing name
    ipcMain.handle('update-drawing-name', async (_event, drawingId, newName) => {
        console.log(`✏️  IPC: Updating drawing name ${drawingId} to "${newName}"`);
        await storage.updateDrawing(drawingId, { name: newName });
        return { success: true };
    });
    // Save drawing
    ipcMain.handle('save-drawing', async (_event, drawingId, data) => {
        console.log(`💾 IPC: Saving drawing ${drawingId} (${data.elements?.length || 0} elements)`);
        // Mark new user elements with creation timestamps
        const existing = await storage.getDrawing(drawingId);
        if (!existing) {
            throw new Error(`Drawing ${drawingId} not found`);
        }
        const existingElementIds = new Set(existing.elements.map((el) => el.id));
        // Filter out incomplete/invalid elements before saving
        // This prevents corrupted elements from being persisted
        const validElements = data.elements.filter((el) => {
            // Skip deleted elements
            if (el.isDeleted)
                return false;
            // Skip elements with null coordinates (incomplete creation)
            if (el.x === null || el.y === null)
                return false;
            // Skip freedraw elements with invalid points (null values in points array)
            if (el.type === 'freedraw' && el.points) {
                const hasInvalidPoints = el.points.some((p) => p === null || p[0] === null || p[1] === null);
                if (hasInvalidPoints)
                    return false;
            }
            // Skip arrows with invalid points
            if (el.type === 'arrow' && el.points) {
                const hasInvalidPoints = el.points.some((p) => p === null || p[0] === null || p[1] === null);
                if (hasInvalidPoints)
                    return false;
            }
            return true;
        });
        const filteredCount = data.elements.length - validElements.length;
        if (filteredCount > 0) {
            console.log(`⚠️  Filtered out ${filteredCount} incomplete elements`);
        }
        const markedElements = validElements.map((el) => {
            const isNewElement = !existingElementIds.has(el.id);
            if (isNewElement && !el.customData?.createdBy) {
                // Mark new user elements (don't overwrite Claude's markers)
                return {
                    ...el,
                    customData: {
                        ...(el.customData || {}),
                        createdBy: 'user',
                        createdAt: Date.now()
                    }
                };
            }
            return el;
        });
        await storage.updateDrawing(drawingId, {
            elements: markedElements,
            appState: data.appState,
        });
    });
    // Check listen status
    ipcMain.handle('listen-status', async (_event, drawingId) => {
        try {
            const listenStatePath = path.join(storageDir, `listen-state-${drawingId}.json`);
            // Check if listen state file exists
            try {
                await fs.access(listenStatePath);
            }
            catch {
                // File doesn't exist - not listening
                return { isListening: false };
            }
            // Read listen state
            const listenStateData = await fs.readFile(listenStatePath, 'utf-8');
            const listenState = JSON.parse(listenStateData);
            // Check if state matches this drawing and hasn't expired
            const isListening = listenState.drawingId === drawingId &&
                listenState.isListening === true &&
                Date.now() < listenState.expiresAt;
            if (isListening) {
                return {
                    isListening: true,
                    expiresAt: listenState.expiresAt
                };
            }
            else {
                return { isListening: false };
            }
        }
        catch (error) {
            console.error('Failed to check listen status:', error);
            return { isListening: false };
        }
    });
    // Collaborate request - writes DIRECTLY to hooks-queue.json
    // This bypasses the MCP server to avoid race conditions with multiple Claude instances
    ipcMain.handle('collaborate', async (_event, drawingId, data) => {
        console.log(`🤖 IPC: Collaboration requested for drawing ${drawingId}`);
        // Get current drawing state
        const drawing = await storage.getDrawing(drawingId);
        if (!drawing) {
            throw new Error(`Drawing ${drawingId} not found`);
        }
        const elementCount = drawing.elements?.length || 0;
        // Write DIRECTLY to hooks-queue.json (Claude Code only)
        // This bypasses MCP server to avoid race conditions with multiple instances
        await writeToHooksQueue(drawingId, drawing.name, elementCount, 'collaborate');
        // Mark as completed immediately (no retry logic with direct write)
        await storage.updateCollaborationStatus(drawingId, 'completed', 0);
        return {
            success: true,
            message: 'Collaboration request queued (direct)',
            drawingId,
            elementCount,
            timestamp: Date.now()
        };
    });
    // Finished request - writes DIRECTLY to hooks-queue.json
    // This bypasses the MCP server to avoid race conditions with multiple Claude instances
    ipcMain.handle('finished', async (_event, drawingId, data) => {
        console.log(`✅ IPC: Finished request for drawing ${drawingId}`);
        // Get current drawing state
        const drawing = await storage.getDrawing(drawingId);
        if (!drawing) {
            throw new Error(`Drawing ${drawingId} not found`);
        }
        const elementCount = drawing.elements?.length || 0;
        // Write DIRECTLY to hooks-queue.json (Claude Code only)
        // This bypasses MCP server to avoid race conditions with multiple instances
        await writeToHooksQueue(drawingId, drawing.name, elementCount, 'finished');
        // Mark as completed immediately (no retry logic with direct write)
        await storage.updateCollaborationStatus(drawingId, 'completed', 0);
        return {
            success: true,
            message: 'Finished request queued (direct)',
            drawingId,
            elementCount,
            timestamp: Date.now()
        };
    });
    // Get collaboration status
    ipcMain.handle('collaborate-status', async (_event, drawingId) => {
        const status = await storage.getCollaborationStatus(drawingId);
        if (!status) {
            return {
                status: 'none',
                retryCount: 0,
                timestamp: Date.now()
            };
        }
        return status;
    });
    // Check close signal (both in-memory and file-based)
    ipcMain.handle('close-signal', async (_event, drawingId) => {
        // Check in-memory signal first (for backward compatibility)
        let shouldClose = closeSignals.get(drawingId) || false;
        if (shouldClose) {
            closeSignals.delete(drawingId);
            console.log(`✅ In-memory close signal consumed for drawing: ${drawingId}`);
        }
        // Also check for file-based close signal (for Electron mode)
        if (!shouldClose) {
            const closeSignalPath = path.join(storageDir, `close-signal-${drawingId}.json`);
            try {
                await fs.access(closeSignalPath);
                // File exists - this is a close signal
                shouldClose = true;
                // Delete the signal file after reading
                await fs.unlink(closeSignalPath);
                console.log(`✅ File-based close signal consumed for drawing: ${drawingId}`);
            }
            catch {
                // File doesn't exist - no close signal
            }
        }
        return {
            shouldClose,
            drawingId,
            timestamp: Date.now()
        };
    });
    // Get Mermaid conversion status
    ipcMain.handle('mermaid-status', async (_event, drawingId) => {
        const conversion = mermaidConversions.get(drawingId);
        if (!conversion) {
            return { hasPending: false };
        }
        // Clear after retrieval
        mermaidConversions.delete(drawingId);
        return {
            hasPending: true,
            definition: conversion.definition,
            timestamp: conversion.timestamp
        };
    });
    // Check for screenshot request (file-based, from MCP server)
    ipcMain.handle('screenshot-request', async (_event, drawingId) => {
        const requestPath = path.join(storageDir, `screenshot-request-${drawingId}.json`);
        try {
            await fs.access(requestPath);
            // Request exists - read it
            const content = await fs.readFile(requestPath, 'utf8');
            const request = JSON.parse(content);
            // Delete the request file
            await fs.unlink(requestPath);
            return { hasPending: true, ...request };
        }
        catch {
            return { hasPending: false };
        }
    });
    // Write screenshot result (for MCP server to read)
    ipcMain.handle('screenshot-result', async (_event, drawingId, result) => {
        const resultPath = path.join(storageDir, `screenshot-result-${drawingId}.json`);
        await fs.writeFile(resultPath, JSON.stringify({
            ...result,
            timestamp: Date.now()
        }), 'utf8');
        console.log(`📸 Screenshot result written: ${resultPath}`);
        return { success: true };
    });
    // DELETE /api/drawings/:id/listen-state equivalent
    ipcMain.handle('delete-listen-state', async (_event, drawingId) => {
        console.log(`🧹 IPC: Cleaning listen state for drawing ${drawingId}`);
        const listenStatePath = path.join(storageDir, `listen-state-${drawingId}.json`);
        // Delete the per-drawing listen state file
        try {
            await fs.unlink(listenStatePath);
            console.log(`✅ Listen state deleted successfully for drawing ${drawingId}`);
        }
        catch (err) {
            // File might not exist - that's OK
            console.log(`⚠️  Listen state file not found (already deleted or never existed)`);
        }
        return { success: true };
    });
    // Native file export - bypasses broken File System Access API
    ipcMain.handle('export-to-file', async (event, options) => {
        console.log(`💾 IPC: Native export request for ${options.fileType} file`);
        const window = BrowserWindow.fromWebContents(event.sender);
        if (!window) {
            throw new Error('No window found for export');
        }
        // Define file type filters
        const filters = {
            excalidraw: [{ name: 'Excalidraw', extensions: ['excalidraw'] }],
            json: [{ name: 'JSON', extensions: ['json'] }],
            png: [{ name: 'PNG Image', extensions: ['png'] }],
            svg: [{ name: 'SVG Image', extensions: ['svg'] }],
        };
        const result = await dialog.showSaveDialog(window, {
            title: 'Export Drawing',
            defaultPath: options.defaultName,
            filters: filters[options.fileType] || filters.excalidraw,
        });
        if (result.canceled || !result.filePath) {
            console.log('⚠️  Export cancelled by user');
            return { success: false, cancelled: true };
        }
        try {
            // Handle different content types
            if (options.fileType === 'png' && options.content.startsWith('data:image/png;base64,')) {
                // PNG: decode base64 and write binary
                const base64Data = options.content.replace(/^data:image\/png;base64,/, '');
                await fs.writeFile(result.filePath, Buffer.from(base64Data, 'base64'));
            }
            else if (options.fileType === 'svg' && options.content.startsWith('data:image/svg+xml;base64,')) {
                // SVG: decode base64 and write text
                const base64Data = options.content.replace(/^data:image\/svg\+xml;base64,/, '');
                await fs.writeFile(result.filePath, Buffer.from(base64Data, 'base64').toString('utf-8'));
            }
            else {
                // Text content (JSON, .excalidraw)
                await fs.writeFile(result.filePath, options.content, 'utf-8');
            }
            console.log(`✅ Exported to: ${result.filePath}`);
            return { success: true, filePath: result.filePath };
        }
        catch (err) {
            console.error('❌ Export failed:', err);
            throw err;
        }
    });
    // Native file open dialog
    ipcMain.handle('open-file-dialog', async (event, options) => {
        console.log(`📂 IPC: Native open file dialog`);
        const window = BrowserWindow.fromWebContents(event.sender);
        if (!window) {
            throw new Error('No window found for dialog');
        }
        const filters = [];
        if (options.fileTypes.includes('excalidraw')) {
            filters.push({ name: 'Excalidraw', extensions: ['excalidraw'] });
        }
        if (options.fileTypes.includes('json')) {
            filters.push({ name: 'JSON', extensions: ['json'] });
        }
        const result = await dialog.showOpenDialog(window, {
            title: 'Open Drawing',
            filters,
            properties: ['openFile'],
        });
        if (result.canceled || result.filePaths.length === 0) {
            return { success: false, cancelled: true };
        }
        const filePath = result.filePaths[0];
        const content = await fs.readFile(filePath, 'utf-8');
        console.log(`✅ Opened: ${filePath}`);
        return { success: true, filePath, content };
    });
    // Capture screenshot of the current window
    ipcMain.handle('capture-screenshot', async (event, options) => {
        console.log(`📸 IPC: Capturing screenshot for drawing ${options.drawingId}`);
        const window = BrowserWindow.fromWebContents(event.sender);
        if (!window) {
            throw new Error('No window found for screenshot');
        }
        try {
            // Capture the window contents
            const image = await window.webContents.capturePage();
            const pngBuffer = image.toPNG();
            const base64 = pngBuffer.toString('base64');
            // Optionally save to file
            if (options.saveToFile) {
                const screenshotDir = path.join(storageDir, 'screenshots');
                await fs.mkdir(screenshotDir, { recursive: true });
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const filename = `screenshot-${options.drawingId}-${timestamp}.png`;
                const filePath = path.join(screenshotDir, filename);
                await fs.writeFile(filePath, pngBuffer);
                console.log(`✅ Screenshot saved: ${filePath}`);
                return {
                    success: true,
                    base64,
                    filePath,
                    width: image.getSize().width,
                    height: image.getSize().height,
                };
            }
            return {
                success: true,
                base64,
                width: image.getSize().width,
                height: image.getSize().height,
            };
        }
        catch (err) {
            console.error('❌ Screenshot capture failed:', err);
            throw err;
        }
    });
    console.log('✅ IPC handlers registered');
}
/**
 * Set close signal for a drawing (called by MCP server via close_widget tool)
 */
export function setCloseSignal(drawingId) {
    closeSignals.set(drawingId, true);
    console.log(`🚪 Close signal set for drawing: ${drawingId}`);
}
/**
 * Add Mermaid conversion request (called by MCP server via save_drawing tool)
 */
export function addMermaidConversion(drawingId, definition) {
    mermaidConversions.set(drawingId, {
        definition,
        timestamp: Date.now()
    });
    console.log(`🧜‍♀️ Mermaid conversion queued for drawing: ${drawingId}`);
}
//# sourceMappingURL=ipc-handlers.js.map