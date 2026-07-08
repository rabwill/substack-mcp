# substack-mcp

Remote MCP server that provides tools to read a Substack user's notes and recent activity when given a public profile name.

## Features

- `get_user_notes`: Fetch recent notes for a profile slug (for example, `on` or `@on`)
- `get_user_activity`: Fetch recent posts and notes, merged and sorted by date

## Requirements

- Node.js 18+
- A valid `substack.sid` cookie value (used as `SUBSTACK_TOKEN`)
- A reachable HTTP host/port for the MCP endpoint

## Disclaimer

This project accesses Substack data using authentication cookies and is intended only for accounts and content you are authorized to access. Make sure your use complies with Substack's terms, applicable privacy rules, and any consent requirements for the data you retrieve.

The server may use AI-assisted processing when returning or summarizing results. AI-generated output can be incomplete, inaccurate, or stale, so verify important information before relying on it.

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
