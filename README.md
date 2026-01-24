<p align="center">
  <img src="assets/agentdock-banner.svg" alt="AgentDock" width="400" />
</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-24.x-green.svg" alt="Node.js" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.9-blue.svg" alt="TypeScript" /></a>
</p>

<p align="center">
  A Web UI for operating Claude Code and other AI agent CLIs from your browser.<br />
  Manage multiple sessions, stream outputs in real-time, and control tool permissions.
</p>

## Features

- **Multiple Session Management** - Create, switch, and manage multiple Claude sessions simultaneously
- **Real-time Streaming** - Live output streaming from Claude CLI with structured event display
- **Permission Control** - Interactive UI for approving/denying tool executions with configurable modes
- **Browser Automation** - Real-time browser screencast with interactive controls (clicks, keyboard, navigation)
- **Rich UI Components** - Visual diff viewer, question prompts, todo lists, and usage monitoring
- **Slack Integration** - Optional Slack Bot for channel-based Claude operations
- **Container Support** - Run Claude in isolated Podman containers

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 24.x |
| Language | TypeScript |
| Frontend | React 19 + Vite + Tailwind CSS v4 |
| Backend | Hono + WebSocket |
| Testing | Vitest + Playwright |
| Monorepo | pnpm workspaces |

## Documentation

- [DESIGN.md](DESIGN.md) - Architecture and design decisions
- [CLAUDE.md](CLAUDE.md) - Development guidelines
- [docs/slack-integration.md](docs/slack-integration.md) - Slack Bot setup

## License

MIT License - see [LICENSE](LICENSE) for details.
