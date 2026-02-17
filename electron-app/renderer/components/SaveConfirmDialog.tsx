interface SaveConfirmDialogProps {
  isOpen: boolean;
  onSaveAndClose: () => void;
  onDiscardChanges: () => void;
  onCancel: () => void;
  isSaving?: boolean;
}

const fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export default function SaveConfirmDialog({
  isOpen,
  onSaveAndClose,
  onDiscardChanges,
  onCancel,
  isSaving = false,
}: SaveConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        fontFamily,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          backgroundColor: '#2b2b2b',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: '400px',
          width: '90%',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            margin: '0 0 16px 0',
            fontSize: '20px',
            fontWeight: 600,
            color: '#e3e3e3',
            fontFamily,
          }}
        >
          Unsaved Changes
        </h2>
        <p
          style={{
            margin: '0 0 24px 0',
            fontSize: '14px',
            lineHeight: '1.5',
            color: '#b3b3b3',
            fontFamily,
          }}
        >
          You have unsaved changes to your drawing. What would you like to do?
        </p>
        <div
          style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={onCancel}
            disabled={isSaving}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: 500,
              fontFamily,
              border: '1px solid #555',
              backgroundColor: 'transparent',
              color: '#b3b3b3',
              borderRadius: '4px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              opacity: isSaving ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onDiscardChanges}
            disabled={isSaving}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: 500,
              fontFamily,
              border: '1px solid #d32f2f',
              backgroundColor: 'transparent',
              color: '#f44336',
              borderRadius: '4px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              opacity: isSaving ? 0.5 : 1,
            }}
          >
            Discard Changes
          </button>
          <button
            onClick={onSaveAndClose}
            disabled={isSaving}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: 500,
              fontFamily,
              border: 'none',
              backgroundColor: '#1976d2',
              color: '#fff',
              borderRadius: '4px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              opacity: isSaving ? 0.7 : 1,
            }}
          >
            {isSaving ? 'Saving...' : 'Save & Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
