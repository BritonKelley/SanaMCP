# Sana MCP Server

MCP server for searching Sana trips and looking up trip details over stdio.

## Requirements

- Node.js 18+

## Install

### From npm (published package)

```bash
npm install -g trip-mcp-server
```

or run without global install:

```bash
npx -y trip-mcp-server
```

### From source

```bash
npm install
npm run build
node dist/index.js
```

## Configuration

1. Copy the example config:

```bash
cp config/sanamcp.local.example.json config/sanamcp.local.json
```

2. Set real values in `config/sanamcp.local.json`:
- `apiBaseUrl`
- `auth.tokenUrl`
- `auth.clientId`
- `auth.clientSecret`
- `auth.scope`

3. Optionally point to a custom config file:

```bash
export SANA_CONFIG_PATH=/absolute/path/to/sanamcp.local.json
```

If `SANA_CONFIG_PATH` is not set, default path is `config/sanamcp.local.json`.

## MCP Client Example

```json
{
  "mcpServers": {
    "sana_trip": {
      "command": "npx",
      "args": ["-y", "trip-mcp-server"],
      "env": {
        "SANA_CONFIG_PATH": "/Users/you/.config/sanamcp/sanamcp.local.json"
      }
    }
  }
}
```

## Tools

- `search_trips`
- `lookup_trip_details`
