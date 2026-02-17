/**
 * Drawing storage manager - handles CRUD operations for drawings
 */
import type { Drawing, DrawingMetadata, CreateDrawingData, ListDrawingsOptions, CollaborationRequest, CollaborationStatus } from "./types.js";
export declare class DrawingStorage {
    private baseDir;
    constructor();
    /**
     * Initialize storage directories
     */
    initialize(): Promise<void>;
    /**
     * Create a new drawing
     */
    createDrawing(data: CreateDrawingData): Promise<Drawing>;
    /**
     * Get a drawing by ID
     */
    getDrawing(id: string): Promise<Drawing | null>;
    /**
     * Update an existing drawing
     */
    updateDrawing(id: string, updates: Partial<Drawing>): Promise<void>;
    /**
     * Delete a drawing
     */
    deleteDrawing(id: string): Promise<void>;
    /**
     * List all drawings with optional filtering
     */
    listDrawings(opts?: ListDrawingsOptions): Promise<DrawingMetadata[]>;
    /**
     * Get metadata for a drawing
     */
    private getMetadata;
    /**
     * Save drawing to .excalidraw file
     */
    private saveDrawing;
    /**
     * Save metadata to .meta.json file
     */
    private saveMetadata;
    /**
     * Ensure all required directories exist
     */
    private ensureDirectories;
    /**
     * Add a collaboration request to the queue
     */
    addCollaborationRequest(drawingId: string, elementCount: number, type?: 'collaborate' | 'finished'): Promise<void>;
    /**
     * Get all pending collaboration requests
     */
    getCollaborationRequests(): Promise<CollaborationRequest[]>;
    /**
     * Clear a collaboration request from the queue
     */
    clearCollaborationRequest(drawingId: string): Promise<void>;
    /**
     * Increment retry count for a collaboration request in the queue
     */
    incrementCollaborationRetry(drawingId: string): Promise<void>;
    /**
     * Update collaboration status for a drawing
     */
    updateCollaborationStatus(drawingId: string, status: CollaborationStatus['status'], retryCount: number): Promise<void>;
    /**
     * Get collaboration status for a drawing
     */
    getCollaborationStatus(drawingId: string): Promise<CollaborationStatus | null>;
    /**
     * Update a collaboration request in the queue
     */
    updateCollaborationRequest(drawingId: string, updates: Partial<CollaborationRequest>): Promise<void>;
    /**
     * Get the base directory path
     */
    getBaseDir(): string;
}
//# sourceMappingURL=DrawingStorage.d.ts.map