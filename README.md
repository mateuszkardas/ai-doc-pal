# ai-doc-pal 📚🤖

Index your markdown documentation and expose it via MCP for AI agents (GitHub Copilot, Cursor, Claude).

## Why?

AI agents work great with popular frameworks but struggle with your custom libraries and internal docs. ai-doc-pal creates a vector database from your markdown and exposes it via MCP.

## Install

```bash
npm install -g ai-doc-pal

# For local embeddings (recommended)
brew install ollama
ollama pull nomic-embed-text
```

## Quick Start

```bash
# Index your docs
cd /path/to/your/docs
ai-doc-pal init --description "My library documentation"

# Check setup
ai-doc-pal doctor
```

## Configure AI Agent

**VS Code** (`settings.json`):
```json
{
  "mcp.servers": {
    "my-docs": { "command": "ai-doc-pal", "args": ["serve", "my-docs"] }
  }
}
```

**Cursor** (`~/.cursor/mcp.json`):
```json
{
  "servers": {
    "my-docs": { "command": "ai-doc-pal", "args": ["serve", "my-docs"] }
  }
}
```

## Commands

| Command | Description |
|---------|-------------|
| `init` | Initialize documentation index |
| `update` | Update embeddings for changed files |
| `serve <name>` | Start MCP server |
| `list` | List all indexed bases |
| `remove <name>` | Remove a base |
| `doctor` | Check system setup |
| `config` | Manage configuration |

### Examples

```bash
# Init with description
ai-doc-pal init --description "React hooks for custom UI"

# Use OpenAI instead of Ollama
ai-doc-pal init --provider openai

# Force re-embed all files
ai-doc-pal update --force

# Set config
ai-doc-pal config --set defaultProvider=openai
ai-doc-pal config --set myproject.description="Updated description"
```

## Providers

- **ollama** (default) - Local, free. Requires [Ollama](https://ollama.ai)
- **openai** - Cloud. Set `OPENAI_API_KEY` env var
- **compatible** - Any OpenAI-compatible endpoint

## MCP Tools

The server exposes:
- `search_docs` - Semantic search through documentation
- `read_file` - Read full document content  
- `list_files` - List all indexed files

## Data Storage

```
~/.ai-doc-pal/
├── config.json
├── my-docs/
│   └── db.sqlite
└── another-project/
    └── db.sqlite
```

## License

MIT
