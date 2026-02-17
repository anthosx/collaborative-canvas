import { Menu, app, shell } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';

/**
 * Create custom application menu
 * Removes "Electron" references and provides clean, professional menu
 */
export function createApplicationMenu(): Menu {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        {
          label: 'Preferences',
          accelerator: 'Cmd+,',
          click: () => {
            // TODO: Open preferences dialog
            console.log('Preferences clicked');
          }
        },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const }
      ]
    }] : []),

    // File menu
    {
      label: 'File',
      submenu: [
        {
          label: 'New Drawing',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            // TODO: Create new drawing
            console.log('New drawing clicked');
          }
        },
        {
          label: 'Open Drawing',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            // TODO: Open drawing picker
            console.log('Open drawing clicked');
          }
        },
        { type: 'separator' as const },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            // TODO: Save current drawing
            console.log('Save clicked');
          }
        },
        {
          label: 'Export',
          submenu: [
            {
              label: 'Export as PNG',
              click: () => {
                console.log('Export PNG clicked');
              }
            },
            {
              label: 'Export as SVG',
              click: () => {
                console.log('Export SVG clicked');
              }
            }
          ]
        },
        { type: 'separator' as const },
        isMac ? { role: 'close' as const } : { role: 'quit' as const }
      ]
    },

    // Edit menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'delete' as const },
        { type: 'separator' as const },
        { role: 'selectAll' as const }
      ]
    },

    // View menu
    {
      label: 'View',
      submenu: [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        { type: 'separator' as const },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const },
        ...(process.env.NODE_ENV === 'development' ? [
          { type: 'separator' as const },
          { role: 'toggleDevTools' as const }
        ] : [])
      ]
    },

    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const },
          { type: 'separator' as const },
          { role: 'window' as const }
        ] : [
          { role: 'close' as const }
        ])
      ]
    },

    // Help menu
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: async () => {
            await shell.openExternal('https://github.com/anthosx/collaborative-canvas');
          }
        },
        {
          label: 'Report Issue',
          click: async () => {
            await shell.openExternal('https://github.com/anthosx/collaborative-canvas/issues');
          }
        },
        { type: 'separator' as const },
        {
          label: 'About Claude Code',
          click: async () => {
            await shell.openExternal('https://claude.com/claude-code');
          }
        }
      ]
    }
  ];

  return Menu.buildFromTemplate(template);
}
