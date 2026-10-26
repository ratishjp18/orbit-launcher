'use strict';

const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  nativeImage,
  Tray,
  Menu,
  globalShortcut,
} = require('electron');
const path   = require('path');
const os     = require('os');
const fs     = require('fs');
const zlib   = require('zlib');
const { spawn } = require('child_process');

// ── Globals ──────────────────────────────────────────────────────────────────
let mainWindow = null;
let tray       = null;

const HOTKEY   = 'CommandOrControl+Alt+Space'; // Ctrl+Alt+Space on Windows

// ── Tray icon: 16×16 purple circle PNG built at runtime (no asset file) ─────
function createTrayIconBuffer() {
  const W = 16, H = 16;
  const cx = (W - 1) / 2, cy = (H - 1) / 2;

  const rows = [];
  for (let y = 0; y < H; y++) {
    const row = [0]; // PNG filter byte: None
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= 6.8) row.push(138, 43, 226, 255); // #8a2be2
      else          row.push(0, 0, 0, 0);
    }
    rows.push(Buffer.from(row));
  }
  const compressed = zlib.deflateSync(Buffer.concat(rows), { level: 9 });

  // CRC32 lookup table
  const CRC = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    CRC[n] = c;
  }
  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function pngChunk(type, data) {
    const t = Buffer.from(type, 'ascii');
    const l = Buffer.allocUnsafe(4); l.writeUInt32BE(data.length, 0);
    const r = Buffer.allocUnsafe(4); r.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([l, t, data, r]);
  }

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = ihdr[11] = ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── System tray ───────────────────────────────────────────────────────────────
function createTray() {
  try {
    const icon = nativeImage.createFromBuffer(createTrayIconBuffer());
    tray = new Tray(icon);
    tray.setToolTip('Orbit Launcher');

    const showWindow = () => {
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    };

    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Show Orbit Launcher', click: showWindow },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => { app.isQuitting = true; app.quit(); },
      },
    ]));

    // Single-click on tray icon also shows the window
    tray.on('click', showWindow);
    tray.on('double-click', showWindow);
  } catch (err) {
    console.error('[OrbitLauncher] Tray creation failed:', err.message);
  }
}

// ── Global hotkey ─────────────────────────────────────────────────────────────
function registerHotkey() {
  const ok = globalShortcut.register(HOTKEY, () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      mainWindow.hide();
    } else {
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  if (!ok) {
    // Notify renderer once it's ready
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send(
        'toast',
        `⚠ Hotkey ${HOTKEY} is already in use by another app`,
      );
    });
  }
}

// ── Prevent multiple instances ────────────────────────────────────────────────

app.on('second-instance', () => {
  if (mainWindow) {
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
});

// ── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    fullscreen: true,
    frame: false,
    transparent: false,
    backgroundColor: '#000814',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Strict Content-Security-Policy — no remote resources, no eval
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "font-src 'self' data:",
            "connect-src 'none'",
          ].join('; '),
        ],
      },
    });
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Close → hide to tray (Quit from tray menu or Ctrl+Alt+Space to bring back)
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

// ── Default tile helpers ─────────────────────────────────────────────────────
function findFirst(...candidates) {
  return candidates.find((p) => {
    try { return fs.existsSync(p); } catch { return false; }
  }) ?? candidates[candidates.length - 1];
}

function buildDefaultTiles() {
  const LA  = process.env.LOCALAPPDATA          ?? path.join(os.homedir(), 'AppData', 'Local');
  const AR  = process.env.APPDATA               ?? path.join(os.homedir(), 'AppData', 'Roaming');
  const PF  = process.env.ProgramFiles           ?? 'C:\\Program Files';
  const PFx = process.env['ProgramFiles(x86)']  ?? 'C:\\Program Files (x86)';
  const SM  = path.join(AR, 'Microsoft', 'Windows', 'Start Menu', 'Programs');

  return [
    // ── Row 1 ────────────────────────────────────────────────────────────────
    {
      id: 'teams',
      name: 'Teams',
      action: {
        type: 'url',
        path: 'ms-teams://',
        iconPath: path.join(LA, 'Microsoft', 'WindowsApps', 'ms-teams.exe'),
      },
    },
    {
      id: 'outlook',
      name: 'Outlook',
      action: {
        type: 'app',
        path: path.join(SM, 'Chrome Apps', 'Outlook (PWA).lnk'),
      },
    },
    {
      id: 'vscode',
      name: 'VS Code',
      action: {
        type: 'app',
        path: path.join(LA, 'Programs', 'Microsoft VS Code', 'Code.exe'),
      },
    },
    {
      id: 'antigravity',
      name: 'Antigravity IDE',
      action: {
        type: 'app',
        path: path.join(SM, 'Antigravity IDE', 'Antigravity IDE.lnk'),
      },
    },
    {
      id: 'kiro',
      name: 'Kiro',
      action: {
        type: 'app',
        path: path.join(LA, 'Programs', 'Kiro', 'Kiro.exe'),
      },
    },
    {
      id: 'github',
      name: 'GitHub Desktop',
      action: {
        type: 'app',
        path: path.join(SM, 'GitHub, Inc', 'GitHub Desktop.lnk'),
      },
    },

    // ── Row 2 ────────────────────────────────────────────────────────────────
    {
      id: 'postgresql',
      name: 'PostgreSQL',
      action: {
        type: 'app',
        path: 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\PostgreSQL 18\\pgAdmin 4.lnk',
      },
    },
    {
      id: 'sqlserver',
      name: 'SQL Server',
      action: {
        type: 'app',
        path: 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Microsoft SQL Server Tools 22\\SQL Server Management Studio 22.lnk',
      },
    },
    {
      id: 'docker',
      name: 'Docker Desktop',
      action: {
        type: 'app',
        path: 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe',
      },
    },
    {
      id: 'chatgpt',
      name: 'ChatGPT',
      action: {
        // Store app — launched via App User Model ID
        type: 'store',
        path: 'OpenAI.Codex_2p2nqsd0c76g0!App',
      },
    },
    {
      id: 'claude',
      name: 'Claude',
      action: {
        type: 'url',
        path: 'claude://',
        iconPath: path.join(LA, 'Microsoft', 'WindowsApps', 'claude-desktop.exe'),
      },
    },
    {
      id: 'movemouse',
      name: 'Move Mouse',
      action: {
        // Store app — launched via App User Model ID
        type: 'store',
        path: '1258EllAbi.MoveMouse_hjfwaxvfbwh7t!MyDesktopAppStep1',
      },
    },
    // ── Row 3 ────────────────────────────────────────────────────────────────
    {
      id: 'cisco',
      name: 'Cisco',
      action: {
        type: 'app',
        path: 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Cisco\\Cisco Secure Client\\Cisco Secure Client.lnk',
      },
    },
    {
      id: 'remotedesktop',
      name: 'Remote Desktop',
      action: {
        type: 'app',
        path: 'C:\\Windows\\System32\\mstsc.exe',
      },
    },
    {
      id: 'edge',
      name: 'Edge',
      action: {
        type: 'app',
        path: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      },
    },
    {
      id: 'chrome',
      name: 'Chrome',
      action: {
        type: 'app',
        path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      },
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      action: {
        type: 'store',
        path: '5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App',
      },
    },
    {
      id: 'applemusic',
      name: 'Apple Music',
      action: {
        type: 'store',
        path: 'AppleInc.AppleMusicWin_nzyj5cx40ttqa!App',
      },
    },
  ];
}

// ── IPC handlers ─────────────────────────────────────────────────────────────
function setupIPC() {
  const TILES_FILE = path.join(app.getPath('userData'), 'tiles.json');

  // Get tiles — return saved layout or write + return defaults
  ipcMain.handle('get-tiles', async () => {
    if (fs.existsSync(TILES_FILE)) {
      try {
        const data = JSON.parse(fs.readFileSync(TILES_FILE, 'utf8'));
        // v1 → v2: grid changed from 2×6 (12/page) to 3×6 (18/page).
        // Tile order is preserved; only page-break positions change.
        if ((data.layoutVersion ?? 1) < 2) {
          data.layoutVersion = 2;
          fs.writeFileSync(TILES_FILE, JSON.stringify(data, null, 2), 'utf8');
        }
        return data;
      } catch { /* fall through to defaults */ }
    }
    const defaults = { layoutVersion: 2, tiles: buildDefaultTiles() };
    fs.writeFileSync(TILES_FILE, JSON.stringify(defaults, null, 2), 'utf8');
    return defaults;
  });

  // Save tiles
  ipcMain.handle('save-tiles', async (_e, data) => {
    fs.writeFileSync(TILES_FILE, JSON.stringify(data, null, 2), 'utf8');
    return { ok: true };
  });

  // Launch a tile — never builds a shell string from user paths
  ipcMain.handle('launch-tile', async (_e, tile) => {
    try {
      const { type, path: target, cwd, ide } = tile.action ?? {};

      switch (type) {
        case 'app':
        case 'folder': {
          const err = await shell.openPath(target);
          return err ? { success: false, error: err } : { success: true };
        }

        case 'url': {
          await shell.openExternal(target);
          return { success: true };
        }

        // Windows Store / MSIX app — launch by App User Model ID via Explorer
        case 'store': {
          const proc = spawn('explorer.exe', [`shell:AppsFolder\\${target}`], {
            detached: true,
            stdio: 'ignore',
          });
          proc.unref();
          return { success: true };
        }

        // command tiles run a user-authored shell command — intentional shell use
        case 'command': {
          const proc = spawn(target, [], {
            shell: true,
            detached: true,
            stdio: 'ignore',
            cwd: cwd ?? os.homedir(),
          });
          proc.unref();
          return { success: true };
        }

        // project tiles open a folder in a specific IDE with argv, no shell
        case 'project': {
          const editor = ide ?? 'code';
          const proc = spawn(editor, [target], {
            detached: true,
            stdio: 'ignore',
          });
          proc.unref();
          return { success: true };
        }

        default:
          return { success: false, error: `Unknown action type: ${type}` };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // File picker (executables + shortcuts)
  ipcMain.handle('pick-file', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose application or shortcut',
      properties: ['openFile'],
      filters: [
        { name: 'Apps & Shortcuts', extensions: ['exe', 'lnk'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    return res.canceled ? null : res.filePaths[0];
  });

  // Folder picker
  ipcMain.handle('pick-folder', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose a folder',
      properties: ['openDirectory'],
    });
    return res.canceled ? null : res.filePaths[0];
  });

  // Extract native icon → data URL
  // For .lnk shortcut files, Windows Shell resolves the target icon automatically
  ipcMain.handle('get-file-icon', async (_e, filePath) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) return null;
      const icon = await app.getFileIcon(filePath, { size: 'large' });
      // On some Windows builds getFileIcon returns a tiny generic icon for .lnk
      // files. If the returned image is suspiciously small (≤16×16) try again
      // with the 'normal' size which sometimes picks up the target icon better.
      if (icon.isEmpty()) return null;
      const size = icon.getSize();
      if (size.width <= 16 && filePath.toLowerCase().endsWith('.lnk')) {
        const icon2 = await app.getFileIcon(filePath, { size: 'normal' });
        if (!icon2.isEmpty()) return icon2.toDataURL();
      }
      return icon.toDataURL();
    } catch {
      return null;
    }
  });

  // Simple path-existence check
  ipcMain.handle('path-exists', (_e, p) => {
    try { return fs.existsSync(p); } catch { return false; }
  });

  // Window visibility — hide to tray, hotkey or tray click to restore
  ipcMain.on('hide-window', () => mainWindow?.hide());
  ipcMain.on('show-window', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  setupIPC();
  createWindow();
  createTray();
  registerHotkey();

  // Register as a Windows startup item (Option 1 — start with Windows)
  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: false,
    path: process.execPath,
    args: process.argv.slice(1).concat(['--started-from-login']),
  });
});

app.on('window-all-closed', () => {
  // Stay alive in the system tray — do not quit when the window closes
});

app.on('before-quit', () => { app.isQuitting = true; });

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (tray) { tray.destroy(); tray = null; }
});
