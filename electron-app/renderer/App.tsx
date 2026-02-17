import { useState, useEffect, useRef } from 'react';
import ExcalidrawCanvas, { ExcalidrawCanvasRef } from './components/ExcalidrawCanvas';
import Toolbar from './components/Toolbar';
import SaveConfirmDialog from './components/SaveConfirmDialog';
import { loadDrawing, saveDrawing } from './api/drawings';
import { exportToBlob, exportToSvg } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/types/element/types';
import type { AppState } from '@excalidraw/excalidraw/types/types';

// Canned responses shown while Claude is working
const COLLABORATION_MESSAGES = [
  'Analyzing your masterpiece...',
  'Consulting the architecture gods...',
  'Measuring pixels with great precision...',
  'Contemplating design choices...',
  'Studying the flow of arrows...',
  'Decoding your visual language...',
  'Calculating optimal placements...',
  'Admiring your creative vision...',
  'Processing boxes and connections...',
  'Channeling diagramming energy...',
  'Interpreting shapes and colors...',
  'Brewing insights from your canvas...',
  'Mapping the conceptual landscape...',
  'Harmonizing visual elements...',
  'Translating drawings to thoughts...',
  'Absorbing the diagram essence...',
  'Pondering architectural patterns...',
  'Evaluating spatial relationships...',
  'Synthesizing visual information...',
  'Almost there, just a moment...',
];

function App() {
  const [drawingId, setDrawingId] = useState<string | null>(null);
  const [drawingName, setDrawingName] = useState<string>('Untitled Drawing');
  const [initialElements, setInitialElements] = useState<readonly ExcalidrawElement[]>([]);
  const [initialAppState, setInitialAppState] = useState<Partial<AppState>>({});
  const elementsRef = useRef<readonly ExcalidrawElement[]>([]);
  const appStateRef = useRef<Partial<AppState>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastModified, setLastModified] = useState<number>(0);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isCollaborating, setIsCollaborating] = useState(false);
  const [collaborationMessage, setCollaborationMessage] = useState<string>(COLLABORATION_MESSAGES[0]);
  const [isFinishing, setIsFinishing] = useState(false);
  const [isListenActive, setIsListenActive] = useState(false);
  const canvasRef = useRef<ExcalidrawCanvasRef>(null);
  const closeSignalPollRef = useRef<NodeJS.Timeout | null>(null);
  const mermaidPollRef = useRef<NodeJS.Timeout | null>(null);
  const listenPollRef = useRef<NodeJS.Timeout | null>(null);
  const lastSaveTimeRef = useRef<number>(0); // Track when we last saved
  const lastInteractionTimeRef = useRef<number>(0); // Track when user last interacted with canvas
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const savedElementsSnapshotRef = useRef<readonly ExcalidrawElement[]>([]);
  const isIntentionalCloseRef = useRef(false); // Track when we intentionally want to close

  // Load drawing on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');

    if (id) {
      setDrawingId(id);
      loadDrawing(id)
        .then((drawing) => {
          setDrawingName(drawing.name);
          setInitialElements(drawing.elements);
          setInitialAppState(drawing.appState);
          elementsRef.current = drawing.elements;
          appStateRef.current = drawing.appState;
          savedElementsSnapshotRef.current = drawing.elements; // Initialize saved snapshot
          setLastModified(drawing.modified);
          setIsLoading(false);
        })
        .catch((error) => {
          console.error('Failed to load drawing:', error);
          setIsLoading(false);
        });
    } else {
      // New drawing
      setIsLoading(false);
    }
  }, []);

  // Poll for updates every 2 seconds
  useEffect(() => {
    if (!drawingId) return;

    const interval = setInterval(async () => {
      try {
        const drawing = await loadDrawing(drawingId);

        // Skip reload if we just saved (within last 3 seconds)
        // UNLESS we're waiting for collaboration response
        const timeSinceLastSave = Date.now() - lastSaveTimeRef.current;
        if (timeSinceLastSave < 3000 && !isCollaborating) {
          console.log('⏸️  Skipping reload - just saved');
          return;
        }

        // Skip reload if user is actively interacting with canvas (within last 1 second)
        // This prevents race conditions where polling overwrites mid-creation elements
        const timeSinceLastInteraction = Date.now() - lastInteractionTimeRef.current;
        if (timeSinceLastInteraction < 1000) {
          console.log('⏸️  Skipping reload - user actively interacting');
          return;
        }

        // Skip reload ONLY if we have MORE local elements than server
        // (meaning unsaved additions). If server has more, that's collaboration!
        const localElementCount = elementsRef.current.length;
        const serverElementCount = drawing.elements.length;
        if (localElementCount > serverElementCount) {
          console.log('⏸️  Skipping reload - unsaved local additions detected');
          return;
        }

        // Only update if drawing was modified externally (not by us)
        // AND our lastModified is explicitly behind
        if (drawing.modified > lastModified && lastModified > 0) {
          console.log('📥 Drawing updated externally, updating elements via API...');

          // Use imperative API to update elements without remounting
          if (canvasRef.current) {
            canvasRef.current.updateElements(drawing.elements);
          }

          // Update refs for save operations
          elementsRef.current = drawing.elements;
          appStateRef.current = drawing.appState;
          savedElementsSnapshotRef.current = drawing.elements; // Update snapshot when elements reload from server
          setLastModified(drawing.modified);

          // Detect Claude's response: new elements arrived while we were collaborating
          if (isCollaborating && drawing.elements.length > collaborationStartElementCountRef.current) {
            console.log('✅ Claude responded - new elements detected, ending collaboration state');
            setIsCollaborating(false);
          }
        }
      } catch (error) {
        console.error('Failed to poll for updates:', error);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [drawingId, lastModified, isCollaborating]); // Include isCollaborating to detect Claude's response

  // Track element count when collaboration started to detect Claude's response
  const collaborationStartElementCountRef = useRef<number>(0);


  // Rotate through collaboration messages while waiting
  useEffect(() => {
    if (!isCollaborating) {
      return;
    }

    // Pick a random starting message
    setCollaborationMessage(COLLABORATION_MESSAGES[Math.floor(Math.random() * COLLABORATION_MESSAGES.length)]);

    // Rotate to a new random message every 2.5 seconds
    const interval = setInterval(() => {
      setCollaborationMessage(COLLABORATION_MESSAGES[Math.floor(Math.random() * COLLABORATION_MESSAGES.length)]);
    }, 2500);

    return () => clearInterval(interval);
  }, [isCollaborating]);

  // Poll for close signal
  useEffect(() => {
    if (!drawingId) {
      if (closeSignalPollRef.current) {
        clearInterval(closeSignalPollRef.current);
        closeSignalPollRef.current = null;
      }
      return;
    }

    const pollCloseSignal = async () => {
      try {
        const data = await window.electronAPI.closeSignal(drawingId);
        if (data.shouldClose) {
          console.log('🚪 Close signal received, closing widget...');
          window.close();
        }
      } catch (error) {
        console.error('Failed to poll close signal:', error);
      }
    };

    pollCloseSignal();
    closeSignalPollRef.current = setInterval(pollCloseSignal, 2000); // Poll every 2 seconds

    return () => {
      if (closeSignalPollRef.current) {
        clearInterval(closeSignalPollRef.current);
        closeSignalPollRef.current = null;
      }
    };
  }, [drawingId]);

  // Poll for Mermaid conversions every 2 seconds
  useEffect(() => {
    if (!drawingId) {
      if (mermaidPollRef.current) {
        clearInterval(mermaidPollRef.current);
        mermaidPollRef.current = null;
      }
      return;
    }

    const pollMermaid = async () => {
      try {
        const data = await window.electronAPI.mermaidStatus(drawingId);
        if (data.hasPending && data.definition) {
          console.log('🧜‍♀️ Mermaid conversion pending, processing...');
          await handleMermaidConversion(data.definition);
        }
      } catch (error) {
        console.error('Failed to poll for Mermaid conversion:', error);
      }
    };

    pollMermaid();
    mermaidPollRef.current = setInterval(pollMermaid, 2000); // Poll every 2 seconds

    return () => {
      if (mermaidPollRef.current) {
        clearInterval(mermaidPollRef.current);
        mermaidPollRef.current = null;
      }
    };
  }, [drawingId]);

  // Poll for listen status every 3 seconds
  useEffect(() => {
    if (!drawingId) {
      if (listenPollRef.current) {
        clearInterval(listenPollRef.current);
        listenPollRef.current = null;
      }
      return;
    }

    const pollListenStatus = async () => {
      try {
        const data = await window.electronAPI.listenStatus(drawingId);
        setIsListenActive(data.isListening || false);
      } catch (error) {
        console.error('Failed to poll listen status:', error);
      }
    };

    pollListenStatus();
    listenPollRef.current = setInterval(pollListenStatus, 3000); // Poll every 3 seconds

    return () => {
      if (listenPollRef.current) {
        clearInterval(listenPollRef.current);
        listenPollRef.current = null;
      }
    };
  }, [drawingId]);

  // Poll for screenshot requests from Claude (every 2 seconds)
  const screenshotPollRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!drawingId) {
      if (screenshotPollRef.current) {
        clearInterval(screenshotPollRef.current);
        screenshotPollRef.current = null;
      }
      return;
    }

    const pollScreenshotRequest = async () => {
      try {
        const data = await window.electronAPI.screenshotRequest(drawingId);
        if (data.hasPending) {
          console.log('📸 Screenshot requested by Claude, capturing...');
          try {
            const result = await window.electronAPI.captureScreenshot({
              drawingId,
              saveToFile: data.saveToFile ?? true,
            });
            await window.electronAPI.screenshotResult(drawingId, result);
            console.log('✅ Screenshot captured and result written');
          } catch (error) {
            console.error('❌ Screenshot capture failed:', error);
            await window.electronAPI.screenshotResult(drawingId, {
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }
      } catch (error) {
        console.error('Failed to poll screenshot request:', error);
      }
    };

    pollScreenshotRequest();
    screenshotPollRef.current = setInterval(pollScreenshotRequest, 2000);

    return () => {
      if (screenshotPollRef.current) {
        clearInterval(screenshotPollRef.current);
        screenshotPollRef.current = null;
      }
    };
  }, [drawingId]);

  const handleMermaidConversion = async (mermaidDefinition: string) => {
    try {
      // Get Excalidraw API from canvas ref
      if (!canvasRef.current) {
        throw new Error('Canvas ref not available');
      }

      const api = canvasRef.current.getExcalidrawAPI();
      if (!api) {
        throw new Error('Excalidraw API not initialized yet');
      }

      console.log('🧜‍♀️ Converting Mermaid to Excalidraw elements...');
      console.log(`   Definition: ${mermaidDefinition.substring(0, 100)}...`);

      // @ts-ignore - ExcalidrawImperativeAPI has parseMermaidToExcalidraw but types may not be fully updated
      if (!api.parseMermaidToExcalidraw) {
        throw new Error('Mermaid conversion not supported in this Excalidraw version');
      }

      // Parse Mermaid to Excalidraw skeleton elements
      // @ts-ignore
      const { elements, files } = await api.parseMermaidToExcalidraw(mermaidDefinition);

      console.log(`✅ Converted ${elements.length} elements from Mermaid`);

      // Add converted elements to canvas
      canvasRef.current.updateElements([...elementsRef.current, ...elements]);
      elementsRef.current = [...elementsRef.current, ...elements];

      // Save the updated drawing
      if (drawingId) {
        await saveDrawing(drawingId, elementsRef.current, appStateRef.current);
        lastSaveTimeRef.current = Date.now();
        console.log('✅ Mermaid elements saved to drawing');
      }
    } catch (error) {
      console.error('❌ Mermaid conversion failed:', error);
      alert(`Failed to convert Mermaid diagram: ${error instanceof Error ? error.message : 'Unknown error'}\n\nSupported: flowcharts and sequence diagrams only`);
    }
  };

  const handleSave = async (): Promise<boolean> => {
    if (!drawingId) {
      console.warn('No drawing ID - cannot save');
      return false;
    }

    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await saveDrawing(drawingId, elementsRef.current, appStateRef.current);
      lastSaveTimeRef.current = Date.now(); // Track save time
      console.log('Drawing saved successfully');

      // Update lastModified to current time to prevent immediate reload
      setLastModified(Date.now());

      // Clear unsaved changes flag and update snapshot
      setHasUnsavedChanges(false);
      savedElementsSnapshotRef.current = elementsRef.current;

      // Show success feedback
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      return true;
    } catch (error) {
      console.error('Failed to save drawing:', error);
      alert('Failed to save drawing. Please try again.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleCollaborate = async () => {
    if (!drawingId) {
      alert('Please save your drawing first before collaborating.');
      return;
    }

    if (isCollaborating) {
      return; // Prevent multiple clicks
    }

    console.log('🤖 Collaboration requested for drawing:', drawingId);
    setIsCollaborating(true);
    collaborationStartElementCountRef.current = elementsRef.current.length; // Track element count to detect Claude's response

    try {
      // Step 1: Save the current drawing state
      console.log('💾 Saving drawing before collaboration...');
      await saveDrawing(drawingId, elementsRef.current, appStateRef.current);
      const saveTime = Date.now();
      lastSaveTimeRef.current = saveTime; // Track save time to prevent reload
      setLastModified(saveTime); // Update lastModified so polling can detect NEW changes after this
      console.log('✅ Drawing saved');

      // Clear unsaved changes flag and update snapshot (same as handleSave)
      setHasUnsavedChanges(false);
      savedElementsSnapshotRef.current = elementsRef.current;

      // Step 2: Send collaboration request
      const elementCount = elementsRef.current.length;
      await window.electronAPI.collaborate(drawingId, {
        elementCount,
        timestamp: Date.now(),
      });
      console.log('✅ Collaboration request sent to MCP server');
    } catch (error) {
      console.error('Failed to collaborate:', error);
      alert('Failed to start collaboration. Please try again.');
      setIsCollaborating(false);
    }
  };

  const handleFinish = async () => {
    if (!drawingId) {
      alert('Please save your drawing first before finishing.');
      return;
    }

    if (isFinishing) {
      return; // Prevent multiple clicks
    }

    console.log('✅ User finished working on drawing:', drawingId);
    setIsFinishing(true);

    try {
      // Step 1: Save the current drawing state
      console.log('💾 Saving drawing before finishing...');
      await saveDrawing(drawingId, elementsRef.current, appStateRef.current);
      const saveTime = Date.now();
      lastSaveTimeRef.current = saveTime;
      setLastModified(saveTime);
      console.log('✅ Drawing saved');

      // Clear unsaved changes flag and update snapshot (same as handleSave)
      setHasUnsavedChanges(false);
      savedElementsSnapshotRef.current = elementsRef.current;

      // Step 2: Send 'finished' request
      const elementCount = elementsRef.current.length;
      await window.electronAPI.finished(drawingId, {
        elementCount,
        timestamp: Date.now(),
      });
      console.log('✅ Finished request sent to MCP server');
      console.log('⏳ Waiting for Claude to close widget...');
    } catch (error) {
      console.error('Failed to finish:', error);
      alert('Failed to send finish signal. Please try again.');
      setIsFinishing(false);
    }
  };

  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>('dark');
  const [isExporting, setIsExporting] = useState(false);

  // Update body/html background when theme changes
  useEffect(() => {
    const bgColor = currentTheme === 'dark' ? '#121212' : '#f5f5f5';
    document.body.style.backgroundColor = bgColor;
    document.documentElement.style.backgroundColor = bgColor;
  }, [currentTheme]);

  // Native file open using Electron IPC (bypasses broken File System Access API)
  const handleOpenFile = async () => {
    try {
      const result = await window.electronAPI.openFileDialog({
        fileTypes: ['excalidraw', 'json'],
      });

      if (result.cancelled || !result.success || !result.content) {
        return;
      }

      // Parse the .excalidraw file
      const data = JSON.parse(result.content);

      if (data.type !== 'excalidraw' || !Array.isArray(data.elements)) {
        throw new Error('Invalid .excalidraw file format');
      }

      // Update canvas with imported elements
      if (canvasRef.current) {
        canvasRef.current.updateElements(data.elements);
        elementsRef.current = data.elements;

        // Update appState if provided (but filter out grid settings to prevent grid appearing)
        if (data.appState) {
          const importedAppState = { ...data.appState };
          // Don't import grid settings - they can be annoying
          delete importedAppState.gridSize;
          delete importedAppState.showGrid;
          appStateRef.current = { ...appStateRef.current, ...importedAppState };
        }
      }

      console.log(`✅ Opened file: ${result.filePath}`);
    } catch (error) {
      console.error('Failed to open file:', error);
      alert(`Failed to open file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Native export using Electron IPC (bypasses broken File System Access API)
  const handleNativeExport = async (fileType: 'excalidraw' | 'png' | 'svg') => {
    if (isExporting) return;
    setIsExporting(true);

    try {
      const api = canvasRef.current?.getExcalidrawAPI();
      if (!api) {
        throw new Error('Excalidraw API not available');
      }

      let content: string;
      const defaultName = `${drawingName || 'drawing'}.${fileType}`;

      if (fileType === 'excalidraw') {
        // Export as .excalidraw (JSON format)
        const scene = {
          type: 'excalidraw',
          version: 2,
          source: 'collaborative-canvas',
          elements: elementsRef.current,
          appState: {
            viewBackgroundColor: appStateRef.current.viewBackgroundColor || '#ffffff',
            gridSize: appStateRef.current.gridSize,
          },
          files: {},
        };
        content = JSON.stringify(scene, null, 2);
      } else if (fileType === 'png') {
        // Export as PNG using standalone exportToBlob function
        const blob = await exportToBlob({
          elements: elementsRef.current as any,
          appState: {
            ...appStateRef.current,
            exportWithDarkMode: appStateRef.current.theme === 'dark',
          } as any,
          files: api.getFiles?.() || null,
          mimeType: 'image/png',
        });
        // Convert blob to base64 data URL
        const reader = new FileReader();
        content = await new Promise((resolve, reject) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } else if (fileType === 'svg') {
        // Export as SVG using standalone exportToSvg function
        const svg = await exportToSvg({
          elements: elementsRef.current as any,
          appState: {
            ...appStateRef.current,
            exportWithDarkMode: appStateRef.current.theme === 'dark',
          } as any,
          files: api.getFiles?.() || null,
        });
        content = new XMLSerializer().serializeToString(svg);
      } else {
        throw new Error(`Unsupported file type: ${fileType}`);
      }

      // Use native Electron dialog
      const result = await window.electronAPI.exportToFile({
        defaultName,
        content,
        fileType,
      });

      if (result.success) {
        console.log(`✅ Exported to: ${result.filePath}`);
      } else if (!result.cancelled) {
        throw new Error('Export failed');
      }
    } catch (error) {
      console.error('Export failed:', error);
      alert(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Dialog handlers
  const handleSaveAndClose = async () => {
    const saved = await handleSave();
    if (!saved) {
      // Save failed, don't close - user can retry or cancel
      return;
    }
    // Notify Claude that user is finished (auto-trigger "I'm Finished")
    if (drawingId && isListenActive) {
      try {
        const elementCount = elementsRef.current.length;
        await window.electronAPI.finished(drawingId, {
          elementCount,
          timestamp: Date.now(),
        });
        console.log('✅ Auto-triggered "finished" on close');
      } catch (err) {
        console.error('Failed to send finished signal:', err);
      }
      // Clean up listen state
      try {
        await window.electronAPI.deleteListenState(drawingId);
      } catch (err) {
        console.error('Failed to clean listen state:', err);
      }
    }
    // CRITICAL: Mark as intentional close to bypass beforeunload check
    isIntentionalCloseRef.current = true;
    setHasUnsavedChanges(false);
    setShowCloseDialog(false);
    // Use setTimeout to ensure React state is flushed before closing
    setTimeout(() => window.close(), 50);
  };

  const handleDiscardChanges = async () => {
    // Notify Claude that user is finished (auto-trigger "I'm Finished")
    if (drawingId && isListenActive) {
      try {
        const elementCount = elementsRef.current.length;
        await window.electronAPI.finished(drawingId, {
          elementCount,
          timestamp: Date.now(),
        });
        console.log('✅ Auto-triggered "finished" on close');
      } catch (err) {
        console.error('Failed to send finished signal:', err);
      }
      // Clean up listen state
      try {
        await window.electronAPI.deleteListenState(drawingId);
      } catch (err) {
        console.error('Failed to clean listen state:', err);
      }
    }
    // CRITICAL: Mark as intentional close to bypass beforeunload check
    isIntentionalCloseRef.current = true;
    setHasUnsavedChanges(false);
    setShowCloseDialog(false);
    setTimeout(() => window.close(), 50);
  };

  const handleCancelClose = () => {
    setShowCloseDialog(false);
  };

  const handleClearCanvas = () => {
    if (canvasRef.current) {
      canvasRef.current.updateElements([]);
      elementsRef.current = [];
      setHasUnsavedChanges(true);
      console.log('🗑️ Canvas cleared');
    }
  };

  const handleNameChange = async (newName: string) => {
    if (!drawingId) return;

    try {
      await window.electronAPI.updateDrawingName(drawingId, newName);
      setDrawingName(newName);
      console.log(`✏️  Drawing renamed to "${newName}"`);
    } catch (error) {
      console.error('Failed to update drawing name:', error);
      alert('Failed to update drawing name. Please try again.');
    }
  };

  // Beforeunload handler for window close detection
  useEffect(() => {
    if (!drawingId) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // If we're intentionally closing (via Save & Close or Discard), allow it
      if (isIntentionalCloseRef.current) {
        return;
      }

      // If there are unsaved changes, show save confirmation dialog
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = ''; // Required for Chrome/Electron
        setShowCloseDialog(true);
        return;
      }

      // Auto-trigger "finished" and clean up listen state when closing without unsaved changes
      if (isListenActive) {
        // Fire-and-forget: notify Claude that user is finished
        const elementCount = elementsRef.current.length;
        window.electronAPI.finished(drawingId, {
          elementCount,
          timestamp: Date.now(),
        }).catch((err: Error) => {
          console.error('Failed to send finished signal:', err);
        });
        // Clean up listen state
        window.electronAPI.deleteListenState(drawingId).catch((err: Error) => {
          console.error('Failed to clean listen state:', err);
        });
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [drawingId, isListenActive, hasUnsavedChanges]);

  const handleChange = (
    newElements: readonly ExcalidrawElement[],
    newAppState: AppState
  ) => {
    elementsRef.current = newElements;
    appStateRef.current = newAppState;

    // Track interaction time to prevent polling race conditions
    lastInteractionTimeRef.current = Date.now();

    // Track theme changes from Excalidraw
    if (newAppState.theme && newAppState.theme !== currentTheme) {
      setCurrentTheme(newAppState.theme as 'light' | 'dark');
    }

    // Check if there are unsaved changes by comparing with saved snapshot
    const currentElementIds = newElements.map(el => el.id).sort().join(',');
    const savedElementIds = savedElementsSnapshotRef.current.map(el => el.id).sort().join(',');
    if (currentElementIds !== savedElementIds) {
      setHasUnsavedChanges(true);
    }

    // Auto-save disabled - use Save button instead
  };

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontFamily: 'system-ui'
      }}>
        Loading drawing...
      </div>
    );
  }

  // Island style variables matching Excalidraw
  const isDark = currentTheme === 'dark';
  const islandBg = isDark ? '#232329' : '#ffffff';
  const islandShadow = isDark
    ? '0 0 0 1px rgba(255,255,255,0.06), 0 2px 4px rgba(0,0,0,0.16)'
    : '0 0 0 1px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.12)';

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Toolbar is absolutely positioned, doesn't affect flex layout */}
      <Toolbar
        drawingName={saveSuccess ? `${drawingName} ✓ Saved` : drawingName}
        onSave={handleSave}
        onExport={handleNativeExport}
        onOpen={handleOpenFile}
        onClearCanvas={handleClearCanvas}
        onNameChange={handleNameChange}
        isSaving={isSaving}
        isExporting={isExporting}
        theme={currentTheme}
      />
      <ExcalidrawCanvas
        ref={canvasRef}
        initialElements={initialElements}
        initialAppState={initialAppState}
        onChange={handleChange}
      />

      {/* Action buttons - Island style, centered at top */}
      <div style={{
        position: 'fixed',
        top: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: islandBg,
        borderRadius: '8px',
        boxShadow: islandShadow,
        padding: '4px',
        display: 'flex',
        gap: '2px',
        zIndex: 4, // Above Excalidraw toolbar
      }}>
        {/* Collaborate button */}
        <button
          onClick={handleCollaborate}
          disabled={!isListenActive || isCollaborating || isFinishing}
          style={{
            padding: '8px 12px',
            backgroundColor: (!isListenActive || isCollaborating || isFinishing) ? 'transparent' : (isCollaborating ? 'rgba(232, 154, 92, 0.2)' : 'transparent'),
            color: (!isListenActive || isCollaborating || isFinishing) ? (isDark ? '#666' : '#999') : '#e89a5c',
            border: 'none',
            borderRadius: '8px',
            cursor: (!isListenActive || isCollaborating || isFinishing) ? 'not-allowed' : 'pointer',
            fontSize: '13px',
            fontWeight: 500,
            fontFamily: 'Assistant, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'background-color 0.15s ease',
          }}
        >
          <span style={{ fontSize: '14px' }}>🤖</span>
          {isCollaborating ? collaborationMessage : 'Collaborate'}
        </button>

        {/* Separator */}
        <div style={{
          width: '1px',
          height: '20px',
          backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          margin: '0 2px',
          alignSelf: 'center',
        }} />

        {/* I'm Finished button */}
        <button
          onClick={handleFinish}
          disabled={!isListenActive || isFinishing || isCollaborating}
          style={{
            padding: '8px 12px',
            backgroundColor: (!isListenActive || isFinishing || isCollaborating) ? 'transparent' : (isFinishing ? 'rgba(147, 112, 219, 0.2)' : 'transparent'),
            color: (!isListenActive || isFinishing || isCollaborating) ? (isDark ? '#666' : '#999') : '#9370db',
            border: 'none',
            borderRadius: '8px',
            cursor: (!isListenActive || isFinishing || isCollaborating) ? 'not-allowed' : 'pointer',
            fontSize: '13px',
            fontWeight: 500,
            fontFamily: 'Assistant, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'background-color 0.15s ease',
          }}
        >
          <span style={{ fontSize: '14px' }}>✓</span>
          {isFinishing ? 'Finishing...' : "I'm Finished"}
        </button>
      </div>

      {/* Close confirmation dialog */}
      <SaveConfirmDialog
        isOpen={showCloseDialog}
        onSaveAndClose={handleSaveAndClose}
        onDiscardChanges={handleDiscardChanges}
        onCancel={handleCancelClose}
        isSaving={isSaving}
      />
    </div>
  );
}

export default App;
