# Orbit Launcher

A fullscreen Windows desktop launcher built with Electron.  
Glass tiles, animated space background, keyboard & scroll navigation.

---

## Running in development

```bash
npm install
npm start
```

The launcher opens fullscreen. Press **Esc** or click a tile to minimize it back.  
To quit, use **Alt + F4** or kill the process.

> **Tip:** Tiles for programs not installed at their default path are shown dimmed
> with a *"Not found · click to set path"* label. They won't break anything — just
> fix the path once the edit UI lands in Step 3/5.

---

## Building the installer

```bash
npm run build
```

Produces a one-click NSIS installer in `dist/`.

---

## Keyboard & navigation

| Input | Action |
|-------|--------|
| **Mouse wheel ↓ / ↑** | Next / previous page |
| **Arrow Down / Page Down** | Next page |
| **Arrow Up / Page Up** | Previous page |
| **Esc** | Minimize launcher |
| Click page dot (right edge) | Jump to that page |
| Trackpad / touch swipe | Next / previous page |

---

## Default tiles (Page 1)

| # | Name | Default path searched |
|---|------|-----------------------|
| 1 | VS Code | `%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe` |
| 2 | Kiro | `%LOCALAPPDATA%\Programs\Kiro\Kiro.exe` |
| 3 | pgAdmin 4 | `%ProgramFiles%\pgAdmin 4\v8\runtime\pgAdmin4.exe` (also tries v7) |
| 4 | DBeaver | `%ProgramFiles%\DBeaver\dbeaver.exe` |
| 5 | Docker Desktop | `%ProgramFiles%\Docker\Docker\Docker Desktop.exe` |
| 6 | Postman | `%LOCALAPPDATA%\Postman\Postman.exe` |
| 7 | Notepad | `%WINDIR%\System32\notepad.exe` |
| 8 | Notepad++ | `%ProgramFiles%\Notepad++\notepad++.exe` |
| 9 | PowerShell | `%WINDIR%\System32\WindowsPowerShell\v1.0\powershell.exe` |
| 10 | File Explorer | `%WINDIR%\explorer.exe` |
| 11 | Chrome | `%ProgramFiles%\Google\Chrome\Application\chrome.exe` |
| 12 | Projects | `%USERPROFILE%\Documents\Projects` |

The app tries several common install locations for each tile.
Tiles that are found at a valid path extract their Windows icon automatically.

---

## Editing tiles manually (until Step 5 ships)

Open:
```
%APPDATA%\orbit-launcher\tiles.json
```
Edit the JSON and restart the app. The `layoutVersion` field lets future
versions migrate old layouts safely.

---

## Project structure

```
orbit-launcher/
├── main.js          — Electron main process (window, IPC, security)
├── preload.js       — contextBridge API exposed to the renderer
├── renderer/
│   ├── index.html   — HTML shell
│   ├── styles.css   — glass tiles, grid, page dots
│   └── renderer.js  — space animation + tile grid + navigation
├── package.json
└── .gitignore
```

---

## Build roadmap

| Step | Status | Description |
|------|--------|-------------|
| 1 | ✅ **Done** | Fullscreen window, space background, 12 tiles that launch programs |
| 2 | ⏳ | 2 × 6 grid, pages, scroll, dots |
| 3 | ⏳ | Save to JSON, file picker, drag-and-drop, icon extraction |
| 4 | ⏳ | System tray, global hotkey, single instance, hide-after-launch |
| 5 | ⏳ | Edit mode: rename, reorder, delete, export/import |
| 6 | ⏳ | Settings, start-with-Windows, installer packaging |
