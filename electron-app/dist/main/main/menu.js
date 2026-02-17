import { Menu, app, shell } from 'electron';
/**
 * Create custom application menu
 * Removes "Electron" references and provides clean, professional menu
 */
export function createApplicationMenu() {
    const isMac = process.platform === 'darwin';
    const template = [
        // App menu (macOS only)
        ...(isMac ? [{
                label: app.name,
                submenu: [
                    { role: 'about' },
                    { type: 'separator' },
                    {
                        label: 'Preferences',
                        accelerator: 'Cmd+,',
                        click: () => {
                            // TODO: Open preferences dialog
                            console.log('Preferences clicked');
                        }
                    },
                    { type: 'separator' },
                    { role: 'services' },
                    { type: 'separator' },
                    { role: 'hide' },
                    { role: 'hideOthers' },
                    { role: 'unhide' },
                    { type: 'separator' },
                    { role: 'quit' }
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
                { type: 'separator' },
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
                { type: 'separator' },
                isMac ? { role: 'close' } : { role: 'quit' }
            ]
        },
        // Edit menu
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'delete' },
                { type: 'separator' },
                { role: 'selectAll' }
            ]
        },
        // View menu
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' },
                ...(process.env.NODE_ENV === 'development' ? [
                    { type: 'separator' },
                    { role: 'toggleDevTools' }
                ] : [])
            ]
        },
        // Window menu
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                ...(isMac ? [
                    { type: 'separator' },
                    { role: 'front' },
                    { type: 'separator' },
                    { role: 'window' }
                ] : [
                    { role: 'close' }
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
                { type: 'separator' },
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
//# sourceMappingURL=menu.js.map