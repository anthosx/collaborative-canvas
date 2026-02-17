import { forwardRef, useImperativeHandle, useRef, useMemo } from 'react';
import { Excalidraw, convertToExcalidrawElements } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/types/element/types';
import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types/types';

interface ExcalidrawCanvasProps {
  initialElements: readonly ExcalidrawElement[];
  initialAppState: Partial<AppState>;
  onChange: (elements: readonly ExcalidrawElement[], appState: AppState) => void;
}

export interface ExcalidrawCanvasRef {
  updateElements: (newElements: readonly ExcalidrawElement[]) => void;
  getExcalidrawAPI: () => ExcalidrawImperativeAPI | null;
}

const ExcalidrawCanvas = forwardRef<ExcalidrawCanvasRef, ExcalidrawCanvasProps>(
  ({ initialElements, initialAppState, onChange }, ref) => {
    const excalidrawAPI = useRef<ExcalidrawImperativeAPI | null>(null);

    // Helper to check if an element is complete (has version/seed from Excalidraw)
    const isElementComplete = (el: any): boolean => {
      return el && ('version' in el || 'seed' in el);
    };

    // SAFETY: Generate a fallback ID for elements missing one
    const generateFallbackId = (): string => {
      return `fallback_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    };

    // SAFETY: Validate and sanitize elements to prevent crashes
    // - Ensures all elements have required 'id' and 'type' fields
    // - Filters out completely invalid elements
    // - Generates fallback IDs for elements missing them
    const sanitizeElements = (elements: readonly any[]): any[] => {
      return elements
        .filter(el => {
          if (!el || typeof el !== 'object') {
            console.warn('⚠️ Filtered out invalid element (not an object):', el);
            return false;
          }
          if (!el.type) {
            console.warn('⚠️ Filtered out element missing type:', el);
            return false;
          }
          return true;
        })
        .map(el => {
          if (!el.id) {
            console.warn(`⚠️ Element missing ID, generating fallback for type "${el.type}"`);
            return { ...el, id: generateFallbackId() };
          }
          return el;
        });
    };

    // Normalize elements - convert compact elements while preserving complete ones
    const normalizedInitialElements = useMemo(() => {
      const rawElements = initialElements || [];
      if (rawElements.length === 0) {
        return [];
      }

      // SAFETY FIRST: Sanitize all elements to ensure they have IDs and valid structure
      const elements = sanitizeElements(rawElements);
      if (elements.length === 0) {
        console.warn('⚠️ All elements were filtered out during sanitization');
        return [];
      }

      // Separate complete elements (user-created, have version/seed) from compact (Claude-created)
      const completeElements: any[] = [];
      const compactElements: any[] = [];
      const compactIndices: number[] = [];

      elements.forEach((el, idx) => {
        if (isElementComplete(el)) {
          completeElements.push(el);
        } else {
          compactElements.push(el);
          compactIndices.push(idx);
        }
      });

      // If all elements are complete, return as-is (preserves text-container bindings)
      if (compactElements.length === 0) {
        console.log('📂 Loading complete elements (skipping conversion)');
        return elements;
      }

      // If all elements are compact, convert all
      if (completeElements.length === 0) {
        try {
          console.log('🔄 Converting all skeleton elements to full format');
          return convertToExcalidrawElements(elements as any);
        } catch (error) {
          console.error('Error normalizing elements:', error);
          return elements;
        }
      }

      // Mixed: convert only compact elements, then merge back in order
      try {
        console.log(`🔄 Converting ${compactElements.length} compact elements, keeping ${completeElements.length} complete`);
        const convertedCompact = convertToExcalidrawElements(compactElements as any);

        // Rebuild array in original order
        const result: any[] = [...elements];
        compactIndices.forEach((originalIdx, convertedIdx) => {
          result[originalIdx] = convertedCompact[convertedIdx];
        });

        return result;
      } catch (error) {
        console.error('Error normalizing mixed elements:', error);
        return elements;
      }
    }, [initialElements]);

    // Expose updateElements method and API access to parent
    useImperativeHandle(ref, () => ({
      updateElements: (newElements: readonly ExcalidrawElement[]) => {
        if (!excalidrawAPI.current) return;

        // SAFETY FIRST: Sanitize all elements before processing
        const sanitizedElements = sanitizeElements(newElements);
        if (sanitizedElements.length === 0 && newElements.length > 0) {
          console.error('❌ All elements were invalid - not updating scene');
          return;
        }

        // Separate complete from compact elements
        const completeElements: any[] = [];
        const compactElements: any[] = [];
        const compactIndices: number[] = [];

        sanitizedElements.forEach((el, idx) => {
          if (isElementComplete(el)) {
            completeElements.push(el);
          } else {
            compactElements.push(el);
            compactIndices.push(idx);
          }
        });

        // All complete - use directly
        if (compactElements.length === 0) {
          excalidrawAPI.current.updateScene({
            elements: sanitizedElements as ExcalidrawElement[],
          });
          return;
        }

        // All compact - convert all
        if (completeElements.length === 0) {
          try {
            const normalized = convertToExcalidrawElements(sanitizedElements as any);
            excalidrawAPI.current.updateScene({
              elements: normalized as ExcalidrawElement[],
            });
          } catch (error) {
            console.error('Error normalizing elements for update:', error);
            excalidrawAPI.current.updateScene({
              elements: sanitizedElements as ExcalidrawElement[],
            });
          }
          return;
        }

        // Mixed: convert only compact, merge back
        try {
          const convertedCompact = convertToExcalidrawElements(compactElements as any);
          const result: any[] = [...sanitizedElements];
          compactIndices.forEach((originalIdx, convertedIdx) => {
            result[originalIdx] = convertedCompact[convertedIdx];
          });
          excalidrawAPI.current.updateScene({
            elements: result as ExcalidrawElement[],
          });
        } catch (error) {
          console.error('Error normalizing mixed elements for update:', error);
          excalidrawAPI.current.updateScene({
            elements: sanitizedElements as ExcalidrawElement[],
          });
        }
      },
      getExcalidrawAPI: () => excalidrawAPI.current,
    }));

    // Sanitize appState by removing runtime-only fields that cause crashes when reloaded
    const sanitizedAppState = {
      ...initialAppState,
      // Default to dark mode and normal (non-hand-drawn) style
      theme: initialAppState.theme || 'dark',
      currentItemStrokeStyle: initialAppState.currentItemStrokeStyle || 'solid',
      currentItemRoughness: initialAppState.currentItemRoughness ?? 0,
      currentItemFontFamily: initialAppState.currentItemFontFamily ?? 1, // Normal font (not hand-drawn)
    };

    // Remove problematic fields that cause re-render loops or crashes
    delete sanitizedAppState.collaborators;
    delete sanitizedAppState.cursorButton;
    delete sanitizedAppState.draggingElement;
    delete sanitizedAppState.editingElement;
    delete sanitizedAppState.multiElement;
    delete sanitizedAppState.resizingElement;
    delete sanitizedAppState.selectionElement;

    return (
      <>
        {/* Theme-aware CSS for light/dark mode */}
        <style>{`
          /* Base styles - background color managed by App.tsx */
          body {
            margin: 0;
            padding: 0;
            overflow: hidden;
            transition: background-color 0.2s ease;
          }

          html, body, #root {
            width: 100%;
            height: 100%;
          }

          /* Dark mode toolbar styling */
          .excalidraw.theme--dark .App-toolbar {
            background-color: #1e1e1e;
            border-bottom-color: #333;
          }

          .excalidraw.theme--dark .App-top-bar {
            background-color: transparent;
            border-bottom-color: #333;
          }

          /* Force normal font on drawing name (not hand-drawn) */
          .excalidraw .ProjectName,
          .excalidraw .ProjectName * {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
            font-style: normal !important;
            font-weight: 600 !important;
            letter-spacing: normal !important;
          }

          .excalidraw.theme--dark .Island {
            background-color: #2b2b2b;
          }

          .excalidraw.theme--dark button,
          .excalidraw.theme--dark .ToolIcon {
            color: #e3e3e3;
          }

          .excalidraw.theme--dark button:hover {
            background-color: #3a3a3a;
          }

          /* Ensure canvas fills entire space */
          .excalidraw {
            width: 100%;
            height: 100%;
          }

          /* Push Excalidraw's top UI down to make room for custom topbar */
          /* Also adjust height so footer controls (zoom, etc.) aren't clipped */
          .excalidraw .layer-ui__wrapper {
            top: 56px !important;
            height: calc(100% - 56px) !important;
          }
        `}</style>

        <div style={{ flex: 1, overflow: 'hidden' }}>
          <Excalidraw
            excalidrawAPI={(api: ExcalidrawImperativeAPI) => {
              excalidrawAPI.current = api;
            }}
            initialData={{
              elements: normalizedInitialElements as ExcalidrawElement[],
              appState: sanitizedAppState,
            }}
            onChange={(elements, appState) => {
              // Wrap onChange to catch errors
              try {
                onChange(elements, appState);
              } catch (error) {
                console.error('Error in onChange:', error);
              }
            }}
            UIOptions={{
              canvasActions: {
                // Disable most hamburger menu items - functions moved to custom toolbar
                // Keep toggleTheme for light/dark mode switching
                saveAsImage: false,
                loadScene: false,
                export: false,
                saveToActiveFile: false,
                clearCanvas: false,
                changeViewBackgroundColor: false,
                toggleTheme: true, // Re-enabled for light/dark mode control
              },
            }}
          />
        </div>
      </>
    );
  }
);

ExcalidrawCanvas.displayName = 'ExcalidrawCanvas';

export default ExcalidrawCanvas;
