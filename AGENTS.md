# AGENTS.md — Pi VSCode Extension

## What This Is

A VSCode extension that provides a chat UI for [pi](https://github.com/mariozechner/pi-coding-agent), an AI coding agent (similar to Claude Code). It lets you start new sessions, resume saved sessions, and interact with pi entirely from within VSCode.

## Architecture

```
src/
├── extension.ts          # VSCode extension entry point. Registers commands: pi.openChat, pi.resumeSession
├── panel.ts              # PiPanel — manages WebviewPanel lifecycle, bridges webview ↔ PiSession
├── viewProvider.ts       # PiViewProvider — sidebar webview view (activity bar). Lazy-inits session on first getState.
├── session.ts            # PiSession — wraps @mariozechner/pi-coding-agent's AgentSession
└── webview/
    ├── index.tsx          # React mount point
    ├── App.tsx            # Root component. useReducer state machine for chat messages + session state.
    │                      # Also contains session tree flattening logic (flattenSessionTree)
    ├── types.ts           # Shared types for webview↔extension messaging (WebviewToExtension, ExtensionToWebview, etc.)
    ├── Message.tsx        # Renders user/assistant/system messages
    ├── Markdown.tsx       # Markdown renderer using `marked` + highlight.js
    ├── ToolCall.tsx       # Tool call display (read/write/edit/bash/etc.) with per-tool rendering
    ├── StatusBar.tsx      # Bottom bar: folder, git branch, model, tokens, cost, context %
    ├── Settings.tsx       # Modal dialog for model/thinking level/view settings
    ├── TreeDialog.tsx     # Session tree navigator (branch/navigate history)
    └── styles.css         # All CSS. Dark/light theme via prefers-color-scheme. CSS custom properties.
```

## Build System

- **esbuild** via `esbuild.mjs`
- Two bundles:
  1. `dist/extension.cjs` — Node/CJS for VSCode extension host. Externals: `vscode`, `@mariozechner/clipboard-*`
  2. `dist/webview.js` — Browser/IIFE for webview. CSS loaded as text strings (`.css` → `text` loader), injected at runtime via `<style>` tag.
- Commands: `npm run build`, `npm run watch`

## Sidebar vs Editor Tab

There are two ways to open the chat UI, both rendering the same React webview:

1. **Sidebar** (`viewProvider.ts` → `PiViewProvider`): Registered as a `WebviewViewProvider` on the `pi.chatView` view in the `pi-chat` activity bar container. The session is lazy-initialized — `PiSession.init()` is only called on the first `getState` message from the webview, not on `resolveWebviewView`. The sidebar view persists across file navigation.
2. **Editor tab** (`panel.ts` → `PiPanel`): Opens a `WebviewPanel` as an editor tab via the `pi.openChat` command. Each tab gets its own `PiSession`. Also used by `pi.resumeSession` to load a saved `.jsonl` session file.

Both use the same message protocol (`WebviewToExtension` / `ExtensionToWebview` in `types.ts`) and the same HTML/CSP template with a nonce'd script tag.

## Key Patterns

- **Messaging**: Webview ↔ extension host communicate via `postMessage`. Types in `types.ts` (`WebviewToExtension`, `ExtensionToWebview`).
- **State**: `App.tsx` uses `useReducer` with an `AppState` containing messages array, session state, and tree data. Events from the agent session are dispatched as actions.
- **CSS**: Single `styles.css` file imported as a string and injected into `<head>`. Uses CSS custom properties for theming. No CSS modules or preprocessors.
- **No routing**: Single-page app, dialogs are overlays toggled by state.

## Pi Agent Docs

- Main README: `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/README.md`
- Detailed docs: `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/` (extensions, themes, skills, SDK, etc.)
- Examples: `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/examples/`

## Dependencies

- `@mariozechner/pi-coding-agent` — the agent SDK (AgentSession, SessionManager, etc.)
- `react` / `react-dom` 19 — webview UI
- `marked` — Markdown → HTML
- `highlight.js` — syntax highlighting in code blocks
- `esbuild` — bundler

## Tips for AI Agents

- To add UI features, edit files in `src/webview/`. CSS goes in `styles.css`.
- The webview has no network access (CSP: `default-src 'none'`). Images must be `data:` URIs.
- After editing, run `npm run build` to rebuild. The extension reloads in VSCode automatically if using `--watch`.
- `tsconfig.json` is not present; esbuild handles TS/TSX directly.
- The `.vsix` package is built separately (not in build scripts).
