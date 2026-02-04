# Pi Coding Agent - VSCode Extension

A VSCode extension that brings the [Pi coding agent](https://github.com/badlogic/pi-mono) into your editor. Chat with an AI assistant that can read, write, and execute code directly in your workspace.

![VSCode ^1.85.0](https://img.shields.io/badge/VSCode-%5E1.85.0-blue)
![Version](https://img.shields.io/badge/version-0.1.6-green)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow)

## Features
The extension provides 2 chat interfaces with streaming responses, markdown rendering, and syntax highlighting. The agent can read and write files, run shell commands, and browse your workspace.

Invoke it either using the command palette, or as a sidebar entry. The sidebar view lives in its own activity bar icon and provides a persistent chat panel that stays open as you navigate files. The editor tab variant (`Pi: Open Chat`) gives you a full-width chat that can be split, moved, or pinned like any other editor tab.

Sessions can be saved, resumed, and branched. A tree view lets you navigate between conversation branches. You can switch between AI models and adjust thinking levels during a session.

The status bar shows input/output token counts, cache usage, estimated cost, and context window utilization. The extension detects the current git branch and follows your VSCode light or dark theme.

## Getting Started

### Install from VSIX

```bash
npm install
npm run clean && npm run build
npm run package
code --install-extension pi-extension-*.vsix
```

Or drop the VSIX file into the extensions sidebar.

### Usage

1. Click the **Pi** icon in the activity bar to open the sidebar chat
2. Or run **Pi: Open Chat** from the command palette (`Cmd+Shift+P`) to open a chat tab
3. Type a message and press Enter to start a conversation

To resume a previous session, run **Pi: Resume Session** from the command palette and select a saved `.jsonl` session file.

By default, the resume command opens `~/.pi/agent/sessions` to pick a session.

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

Open the project and do `F5` (or `Run > Start Debugging`) to open the extension host. Open developer tools optionally, from the command palette.

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
