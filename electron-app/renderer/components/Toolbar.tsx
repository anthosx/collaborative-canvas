import { useState, useRef, useEffect } from 'react';

interface ToolbarProps {
  drawingName: string;
  onSave: () => void;
  onExport: (format: 'png' | 'svg' | 'excalidraw') => void;
  onOpen: () => void;
  onClearCanvas: () => void;
  onNameChange?: (newName: string) => void;
  isSaving: boolean;
  isExporting: boolean;
  theme?: 'light' | 'dark';
}

function Toolbar({ drawingName, onSave, onExport, onOpen, onClearCanvas, onNameChange, isSaving, isExporting, theme = 'dark' }: ToolbarProps) {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const isDark = theme === 'dark';
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(drawingName);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Update editedName when drawingName prop changes (e.g., after save)
  useEffect(() => {
    if (!isEditingName) {
      setEditedName(drawingName);
    }
  }, [drawingName, isEditingName]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  const handleNameClick = () => {
    setIsEditingName(true);
  };

  const handleNameBlur = () => {
    setIsEditingName(false);
    if (editedName.trim() && editedName !== drawingName) {
      onNameChange?.(editedName.trim());
    } else {
      setEditedName(drawingName); // Reset if empty or unchanged
    }
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      nameInputRef.current?.blur();
    } else if (e.key === 'Escape') {
      setEditedName(drawingName);
      setIsEditingName(false);
    }
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Excalidraw-matching styles
  const islandBg = isDark ? '#232329' : '#ffffff';
  const islandBorder = isDark ? 'none' : '1px solid #e0e0e0';
  const islandShadow = isDark
    ? '0 0 0 1px rgba(255,255,255,0.06), 0 2px 4px rgba(0,0,0,0.16)'
    : '0 0 0 1px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.12)';
  const textColor = isDark ? '#a5a5a5' : '#333';
  const hoverBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';

  // Button styling to match Excalidraw's ToolIcon buttons
  const buttonBase: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 12px',
    backgroundColor: 'transparent',
    color: textColor,
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    fontFamily: 'Assistant, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    transition: 'background-color 0.15s ease',
    whiteSpace: 'nowrap',
  };

  return (
    <div style={{
      position: 'absolute',
      top: '12px',
      left: '12px',
      right: '12px',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      pointerEvents: 'none', // Allow clicks to pass through to canvas
      zIndex: 3, // Above canvas but below Excalidraw toolbar
    }}>
      {/* Drawing name - Editable underlined text */}
      <div style={{
        pointerEvents: 'auto',
        maxWidth: '300px',
      }}>
        {isEditingName ? (
          <input
            ref={nameInputRef}
            type="text"
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            onBlur={handleNameBlur}
            onKeyDown={handleNameKeyDown}
            style={{
              fontSize: '14px',
              fontWeight: 600,
              fontFamily: 'Assistant, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              color: isDark ? '#e3e3e8' : '#1b1b1f',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${isDark ? '#e3e3e8' : '#1b1b1f'}`,
              outline: 'none',
              padding: '4px 0',
              width: '200px',
              caretColor: isDark ? '#e3e3e8' : '#1b1b1f',
            }}
          />
        ) : (
          <div
            onClick={handleNameClick}
            style={{
              fontSize: '14px',
              fontWeight: 600,
              fontFamily: 'Assistant, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              color: isDark ? '#e3e3e8' : '#1b1b1f',
              borderBottom: `1px solid ${isDark ? 'rgba(227, 227, 232, 0.5)' : 'rgba(27, 27, 31, 0.5)'}`,
              padding: '4px 0',
              cursor: 'text',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              transition: 'border-color 0.15s ease',
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderBottomColor = isDark ? '#e3e3e8' : '#1b1b1f'}
            onMouseLeave={(e) => e.currentTarget.style.borderBottomColor = isDark ? 'rgba(227, 227, 232, 0.5)' : 'rgba(27, 27, 31, 0.5)'}
          >
            {drawingName}
          </div>
        )}
      </div>

      {/* Right side buttons - Island style */}
      <div style={{
        backgroundColor: islandBg,
        border: islandBorder,
        borderRadius: '8px',
        boxShadow: islandShadow,
        padding: '4px',
        display: 'flex',
        gap: '2px',
        alignItems: 'center',
        pointerEvents: 'auto',
      }}>
        {/* Open button */}
        <button
          onClick={onOpen}
          style={buttonBase}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = hoverBg}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          Open
        </button>

        {/* Save button */}
        <button
          onClick={onSave}
          disabled={isSaving}
          style={{
            ...buttonBase,
            cursor: isSaving ? 'not-allowed' : 'pointer',
            opacity: isSaving ? 0.6 : 1,
          }}
          onMouseEnter={(e) => !isSaving && (e.currentTarget.style.backgroundColor = hoverBg)}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>

        {/* Separator */}
        <div style={{
          width: '1px',
          height: '20px',
          backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          margin: '0 4px',
        }} />

        {/* Export dropdown */}
        <div ref={exportMenuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            disabled={isExporting}
            style={{
              ...buttonBase,
              cursor: isExporting ? 'not-allowed' : 'pointer',
              opacity: isExporting ? 0.6 : 1,
            }}
            onMouseEnter={(e) => !isExporting && (e.currentTarget.style.backgroundColor = hoverBg)}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            {isExporting ? 'Exporting...' : 'Export ▾'}
          </button>

          {showExportMenu && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '8px',
              backgroundColor: islandBg,
              border: islandBorder,
              borderRadius: '8px',
              boxShadow: islandShadow,
              minWidth: '180px',
              padding: '4px',
              zIndex: 1001,
            }}>
              <button
                onClick={() => { onExport('png'); setShowExportMenu(false); }}
                style={{
                  ...buttonBase,
                  width: '100%',
                  justifyContent: 'flex-start',
                  padding: '10px 12px',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = hoverBg}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                Export as PNG
              </button>
              <button
                onClick={() => { onExport('svg'); setShowExportMenu(false); }}
                style={{
                  ...buttonBase,
                  width: '100%',
                  justifyContent: 'flex-start',
                  padding: '10px 12px',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = hoverBg}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                Export as SVG
              </button>
              <div style={{
                height: '1px',
                backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                margin: '4px 8px',
              }} />
              <button
                onClick={() => { onExport('excalidraw'); setShowExportMenu(false); }}
                style={{
                  ...buttonBase,
                  width: '100%',
                  justifyContent: 'flex-start',
                  padding: '10px 12px',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = hoverBg}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                Save as .excalidraw
              </button>
            </div>
          )}
        </div>

        {/* Separator */}
        <div style={{
          width: '1px',
          height: '20px',
          backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          margin: '0 4px',
        }} />

        {/* Clear Canvas button */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowClearConfirm(true)}
            style={buttonBase}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = hoverBg}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            Clear
          </button>

          {showClearConfirm && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '8px',
              backgroundColor: islandBg,
              border: islandBorder,
              borderRadius: '8px',
              boxShadow: islandShadow,
              minWidth: '200px',
              padding: '12px',
              zIndex: 1001,
            }}>
              <div style={{
                fontSize: '13px',
                color: textColor,
                marginBottom: '12px',
                fontFamily: 'Assistant, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              }}>
                Clear all elements?
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  style={{
                    ...buttonBase,
                    padding: '6px 12px',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = hoverBg}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onClearCanvas();
                    setShowClearConfirm(false);
                  }}
                  style={{
                    ...buttonBase,
                    padding: '6px 12px',
                    backgroundColor: '#d32f2f',
                    color: '#fff',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#b71c1c'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#d32f2f'}
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Toolbar;
