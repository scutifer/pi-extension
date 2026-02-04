# Pi Coding Agent - VSCode Extension

A VSCode extension that brings the [Pi coding agent](https://github.com/mariozechner/pi-coding-agent) into your editor. Chat with an AI assistant that can read, write, and execute code directly in your workspace.

![VSCode ^1.85.0](https://img.shields.io/badge/VSCode-%5E1.85.0-blue)
![Version](https://img.shields.io/badge/version-0.1.6-green)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow)

## Features

- **Interactive chat** -- streaming responses with markdown rendering and syntax highlighting
- **Tool execution** -- the agent can read/write files, run shell commands, and browse your workspace
- **Session management** -- save, resume, and branch conversation sessions
- **Session tree navigation** -- explore and switch between conversation branches
- **Multi-model support** -- switch between AI models and configure thinking levels at runtime
- **Token and cost tracking** -- real-time counters for input/output tokens, cache usage, and estimated cost
- **Context window monitoring** -- see how much of the model's context capacity is in use
- **Git awareness** -- auto-detects the current branch in your workspace
- **Theme support** -- follows your VSCode light/dark theme

## Getting Started

### Install from VSIX

```bash
npm install
npm run build
npm run package
code --install-extension pi-extension-*.vsix
```

### Usage

1. Click the **Pi** icon in the activity bar to open the sidebar chat
2. Or run **Pi: Open Chat** from the command palette (`Cmd+Shift+P`) to open a chat tab
3. Type a message and press Enter to start a conversation

To resume a previous session, run **Pi: Resume Session** from the command palette and select a saved `.jsonl` session file.

## Commands

| Command | Description |
|---------|-------------|
| `Pi: Open Chat` | Open a new chat session in an editor tab |
| `Pi: Resume Session` | Load and resume a saved session file |

## Settings (in-session)

The settings dialog (accessible from the chat UI) lets you configure:

- **Model** -- choose from available models grouped by provider
- **Thinking level** -- off, minimal, low, medium, high, or xhigh
- **View settings** -- toggle visibility of thinking blocks and tool call bodies

## Development

```bash
npm install          # Install dependencies
npm run build        # Build the extension
npm run watch        # Rebuild on changes
npm run package      # Package as .vsix
```

The build produces two bundles via esbuild:

- `dist/extension.cjs` -- extension host (Node.js, CommonJS)
- `dist/webview.js` -- chat UI (browser, IIFE)

## Architecture

```
VSCode Extension Host (Node.js)
       |  postMessage
VSCode Webview (React)
       |  event stream
Pi Agent SDK (@mariozechner/pi-coding-agent)
```

The extension host manages the agent session and forwards events to a React-based webview over `postMessage`. The webview renders the chat interface, tool calls, and session controls using a `useReducer` state machine.

## License

[MIT](LICENSE)
