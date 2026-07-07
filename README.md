# substack-mcp

Remote MCP server that provides tools to read a Substack user's notes and recent activity when given a public profile name.

## Features

- `get_user_notes`: Fetch recent notes for a profile slug (for example, `on` or `@on`)
- `get_user_activity`: Fetch recent posts and notes, merged and sorted by date

## Requirements

- Node.js 18+
- A valid `substack.sid` cookie value (used as `SUBSTACK_TOKEN`)
- A reachable HTTP host/port for the MCP endpoint

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your environment file:

   ```bash
   cp .env.example .env
   ```

3. Set `SUBSTACK_TOKEN` in `.env`.
4. Optionally set `HOST` and `PORT` in `.env`.

## Run

Development mode:

```bash
npm run dev
```

Build and run:

```bash
npm run build
npm start
```

The server listens on `http://0.0.0.0:3000/mcp` by default and exposes a health check at `/healthz`.

## MCP Configuration Example

Add this remote MCP endpoint to your client config:

```json
{
  "mcpServers": {
    "substack": {
      "url": "http://your-host:3000/mcp"
    }
  }
}
```

## Tool Inputs

- `profile` (string): Public profile slug, with or without `@`
- `limit` (number, optional): Maximum items to return (default `10`, max `50`)
