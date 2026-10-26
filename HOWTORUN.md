# How to Run Orbit Launcher

## Prerequisites

- [Node.js](https://nodejs.org) — v18 or newer
- npm (comes with Node.js)

---

## First-time setup

Open a terminal in the `orbit-launcher` folder and run:

```bash
npm install
```

This downloads Electron and all dependencies (~300 MB, one-time only).

---

## Start the app

```bash
npm start
```

The launcher opens fullscreen immediately.

---

## Controls

| Action | Input |
|--------|-------|
| Launch a program | Click its tile |
| Minimize launcher | **Esc** or launch any tile |
| Next page | Mouse wheel ↓ · Arrow Down · Page Down |
| Previous page | Mouse wheel ↑ · Arrow Up · Page Up |
| Jump to page | Click a dot on the right edge |

---

## Close / Quit

- **Minimize** — press Esc or click a tile (launcher stays in the taskbar)
- **Quit** — click the taskbar icon to restore it, then press **Alt + F4**

> A system-tray icon with a Quit option is coming in a later build step.

---

## Build an installer (optional)

```bash
npm run build
```

Produces a Windows NSIS installer in the `dist/` folder.  
Double-click the `.exe` to install it like any normal program.

---

## Troubleshooting

**"Not found · click to set path" on a tile**  
The app couldn't find that program at its default install location.  
Until the edit UI is ready, open this file and correct the `path` field, then restart:

```
%APPDATA%\orbit-launcher\tiles.json
```

**Blank screen / app won't start**  
Make sure `npm install` completed without errors and that Node.js v18+ is installed:

```bash
node --version
npm --version
```

**Electron binary missing**  
Run these two commands, then try `npm start` again:

```bash
npm install-scripts approve electron
npm install
```
