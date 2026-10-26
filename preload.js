'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Expose a minimal, typed surface to the renderer.
// Nothing from Node or Electron internals leaks through.
contextBridge.exposeInMainWorld('orbitAPI', {
  /** Load the saved tile layout (or defaults on first run). */
  getTiles: () => ipcRenderer.invoke('get-tiles'),

  /** Persist the tile layout. */
  saveTiles: (data) => ipcRenderer.invoke('save-tiles', data),

  /**
   * Launch a tile.
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  launchTile: (tile) => ipcRenderer.invoke('launch-tile', tile),

  /** Open a native file picker for .exe / .lnk files. */
  pickFile: () => ipcRenderer.invoke('pick-file'),

  /** Open a native folder picker. */
  pickFolder: () => ipcRenderer.invoke('pick-folder'),

  /**
   * Extract the native Windows icon for a file.
   * @returns {Promise<string|null>} base-64 data URL or null
   */
  getFileIcon: (filePath) => ipcRenderer.invoke('get-file-icon', filePath),

  /** Returns true if the given path exists on disk. */
  pathExists: (p) => ipcRenderer.invoke('path-exists', p),

  /** Minimize / hide the launcher window. */
  hideWindow: () => ipcRenderer.send('hide-window'),

  /** Show and focus the launcher window. */
  showWindow: () => ipcRenderer.send('show-window'),

  /** Listen for toast messages sent by the main process (e.g. hotkey conflicts). */
  onToast: (cb) => ipcRenderer.on('toast', (_, msg) => cb(msg)),
});
