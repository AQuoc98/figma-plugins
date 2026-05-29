# Figma Plugin (React)

## Release Notes

### Version 1.0

- Initial release of the Figma React plugin.
- React + TypeScript + Vite scaffolding with dual build (UI + sandbox).
- Sample "Create rectangles" command demonstrating UI ↔ sandbox messaging.
- Local development workflow documented (import manifest, watch mode, debugging).

- Inprogress
  - [ ] Define the data that the plugin needs to collect from the Figma document (e.g. bound variables).

---

A Figma plugin scaffolded with **React + TypeScript + Vite**. This document covers both how to build the plugin from scratch and how to run / test it locally inside the Figma desktop app after cloning.

---

## 1. Architecture Overview

A Figma plugin is composed of two separate runtimes that talk through `postMessage`:

| Layer | Runs in | Purpose | Tech |
|-------|---------|---------|------|
| **Main / Sandbox** (`code.ts`) | Figma's sandboxed QuickJS VM | Access the Figma scene graph (`figma.*` API) — read/create nodes | Plain TS, no DOM |
| **UI** (`ui.html` + React app) | Hidden Chromium iframe | The visible plugin window — buttons, inputs, previews | React + TS |
| **manifest.json** | — | Tells Figma where `main` and `ui` live, what API version to use | JSON |

Communication:
- UI → Main: `parent.postMessage({ pluginMessage: {...} }, '*')`
- Main → UI: `figma.ui.postMessage({...})`

---

## 2. Steps to Build the Plugin (from scratch)

### Step 1 — Prerequisites
- Node.js >= 18
- npm (or pnpm / yarn)
- [Figma desktop app](https://www.figma.com/downloads/) (the web app cannot load local plugins)

### Step 2 — Initialize the project
```bash
npm init -y
npm install --save-dev typescript vite @vitejs/plugin-react @figma/plugin-typings
npm install react react-dom
npm install --save-dev @types/react @types/react-dom
```

### Step 3 — Add the Figma `manifest.json`
```json
{
  "name": "My React Figma Plugin",
  "id": "my-react-figma-plugin",
  "api": "1.0.0",
  "main": "dist/code.js",
  "ui": "dist/index.html",
  "editorType": ["figma", "figjam"],
  "networkAccess": { "allowedDomains": ["none"] }
}
```

### Step 4 — Project layout
```
figma-plugin/
├── manifest.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── code.ts          # Sandbox / main thread
│   ├── ui/
│   │   ├── index.html   # entry HTML
│   │   ├── main.tsx     # React mount
│   │   └── App.tsx      # React component
└── dist/                # built output (referenced by manifest.json)
```

### Step 5 — Sandbox code (`src/code.ts`)
```ts
figma.showUI(__html__, { width: 320, height: 400 });

figma.ui.onmessage = (msg) => {
  if (msg.type === 'create-rect') {
    const rect = figma.createRectangle();
    rect.x = figma.viewport.center.x;
    rect.y = figma.viewport.center.y;
    rect.resize(120, 120);
    figma.currentPage.appendChild(rect);
    figma.currentPage.selection = [rect];
    figma.viewport.scrollAndZoomIntoView([rect]);
  }
  if (msg.type === 'close') figma.closePlugin();
};
```

### Step 6 — React UI (`src/ui/App.tsx`)
```tsx
import { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);
  const send = (type: string) =>
    parent.postMessage({ pluginMessage: { type } }, '*');

  return (
    <div style={{ padding: 12, fontFamily: 'Inter, sans-serif' }}>
      <h3>My Plugin</h3>
      <button onClick={() => { send('create-rect'); setCount(c => c + 1); }}>
        Create rectangle ({count})
      </button>
      <button onClick={() => send('close')}>Close</button>
    </div>
  );
}
```

### Step 7 — Build pipeline (`vite.config.ts`)
Two outputs are needed: a single-file inlined HTML for the UI, and a single JS bundle for `code.ts`.

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => {
  if (mode === 'code') {
    return {
      build: {
        emptyOutDir: false,
        lib: {
          entry: 'src/code.ts',
          formats: ['iife'],
          name: 'plugin',
          fileName: () => 'code.js',
        },
        outDir: 'dist',
      },
    };
  }
  return {
    plugins: [react(), viteSingleFile()],
    root: 'src/ui',
    build: { outDir: '../../dist', emptyOutDir: false },
  };
});
```

Install the single-file plugin: `npm i -D vite-plugin-singlefile`.

### Step 8 — npm scripts
```json
{
  "scripts": {
    "build:ui":   "vite build",
    "build:code": "vite build --mode code",
    "build":      "npm run build:ui && npm run build:code",
    "watch":      "npm run build -- --watch"
  }
}
```

### Step 9 — Load in Figma
See **Section 4** below.

---

## 3. Setup After Cloning

```bash
# 1. Clone
git clone <this-repo-url>
cd figma-plugin

# 2. Install dependencies
npm install

# 3. Build the plugin
npm run build
```

This produces `dist/code.js` and `dist/index.html`, both referenced by `manifest.json`.

For active development, run the watcher so files rebuild on save:
```bash
npm run watch
```

---

## 4. Testing the Plugin Locally in the Figma Desktop App

> The Figma **web** app cannot load local plugins — you must use the **desktop** app.

### 4.1 Import the plugin (first time only)
1. Open the Figma desktop app.
2. Open any file (or create a new one).
3. Menu: **Plugins → Development → Import plugin from manifest…**
   - Alternative menu path in newer builds: **Main menu (≡) → Plugins → Development → Import plugin from manifest…**
4. Select the `manifest.json` at the root of this repo.
5. The plugin now appears under **Plugins → Development → My React Figma Plugin**.

### 4.2 Run the plugin
- **Plugins → Development → My React Figma Plugin**, or
- Right-click the canvas → **Plugins → Development → My React Figma Plugin**, or
- Use the quick action shortcut: `⌘ + /` (macOS) / `Ctrl + /` (Windows), type the plugin name, press Enter.

### 4.3 Reload after code changes
Figma does **not** hot-reload plugins. After `npm run build` (or while `npm run watch` is running) you must restart the plugin window:

- Close the plugin window, then run it again, **or**
- Enable **Plugins → Development → Hot reload plugin** so Figma re-runs the plugin whenever `dist/` changes.

### 4.4 Debugging
- **UI (React) console**: right-click inside the plugin window → **Inspect**. A normal Chrome DevTools window opens — use `console.log`, breakpoints, React DevTools, etc.
- **Sandbox (`code.ts`) console**: **Plugins → Development → Open console**. `console.log` calls from `code.ts` print here.
- **Errors on load**: **Plugins → Development → Show/hide console** to inspect manifest or build errors.

### 4.5 Common issues
| Problem | Fix |
|--------|-----|
| "Couldn't find plugin file" | `npm run build` first; verify `dist/code.js` and `dist/index.html` exist and match `manifest.json` paths |
| UI is blank | Open the UI DevTools (Inspect) and check for module-loading errors — the UI HTML must be self-contained (use `vite-plugin-singlefile`) |
| Changes not visible | Toggle **Hot reload plugin**, or close & relaunch the plugin |
| `figma is not defined` in UI code | You're trying to call `figma.*` from the React side — that API only exists in `code.ts`. Use `postMessage` instead |
| Network requests blocked | Add the domain to `networkAccess.allowedDomains` in `manifest.json` |

---

## 5. Publishing (optional)
1. Bump version / polish icon & cover (128×128 and 1920×960 PNG).
2. **Plugins → Development → <plugin name> → Publish new release…**
3. Fill in description, tags, screenshots, submit for review.

---

## 6. Useful References
- Figma Plugin API: https://www.figma.com/plugin-docs/
- Manifest reference: https://www.figma.com/plugin-docs/manifest/
- Plugin samples: https://github.com/figma/plugin-samples
