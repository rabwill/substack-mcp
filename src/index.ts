import "dotenv/config";

import { createServer } from "node:http";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { SubstackClient } from "substack-api";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 500;

type DateRange = {
  start: Date;
  end: Date;
};

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "substack-mcp",
    version: "1.0.0",
  });

function getClient(): SubstackClient {
  const token = process.env.SUBSTACK_TOKEN;

  if (!token) {
    throw new Error("Missing SUBSTACK_TOKEN environment variable (substack.sid cookie value).");
  }

  return new SubstackClient({
    token,
    publicationUrl: "substack.com",
  });
}

function normalizeSlug(input: string): string {
  return input.trim().replace(/^@/, "").toLowerCase();
}

function clampLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}

function createDateRange(startDate?: string, endDate?: string): DateRange | undefined {
  if (!startDate && !endDate) {
    return undefined;
  }

  if (!startDate || !endDate) {
    throw new Error("Both startDate and endDate are required when filtering by date.");
  }

  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    throw new Error("Date range must use valid ISO dates and endDate must be after startDate.");
  }

  return { start, end };
}

function filterByDateRange<T>(items: T[], dateRange: DateRange | undefined, getDate: (item: T) => Date | string): T[] {
  if (!dateRange) {
    return items;
  }

  return items.filter((item) => {
    const date = getDate(item);
    const timestamp = date instanceof Date ? date : new Date(date);
    return !Number.isNaN(timestamp.getTime()) && timestamp >= dateRange.start && timestamp < dateRange.end;
  });
}

async function collectAsync<T>(iterable: AsyncIterable<T>, limit: number): Promise<T[]> {
  const results: T[] = [];
  for await (const item of iterable) {
    results.push(item);
    if (results.length >= limit) {
      break;
    }
  }
  return results;
}

server.registerTool(
  "get_user_notes",
  {
    title: "Get User Notes",
    description: "Fetch recent notes for a Substack profile by public slug/handle.",
    inputSchema: {
      profile: z.string().min(1).describe("Public profile slug, with or without @ (example: @on or on)."),
      limit: z.number().int().positive().max(MAX_LIMIT).optional().describe("Maximum number of notes to return (default: 10, max: 1000)."),
      startDate: z.iso.date().optional().describe("Inclusive UTC start date in YYYY-MM-DD format."),
      endDate: z.iso.date().optional().describe("Exclusive UTC end date in YYYY-MM-DD format. For one day, use the following date."),
    },
  },
  async ({ profile, limit, startDate, endDate }) => {
    try {
      const client = getClient();
      const slug = normalizeSlug(profile);
      const boundedLimit = clampLimit(limit);
      const dateRange = createDateRange(startDate, endDate);

      const targetProfile = await client.profileForSlug(slug);
      const fetchedNotes = await collectAsync(targetProfile.notes({ limit: dateRange ? MAX_LIMIT : boundedLimit }), dateRange ? MAX_LIMIT : boundedLimit);
      const notes = filterByDateRange(fetchedNotes, dateRange, (note) => note.publishedAt).slice(0, boundedLimit);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                profile: {
                  id: targetProfile.id,
                  name: targetProfile.name,
                  slug: targetProfile.slug,
                  handle: targetProfile.handle,
                  url: targetProfile.url,
                  bio: targetProfile.bio ?? null,
                },
                count: notes.length,
                notes: notes.map((note) => ({
                  id: note.id,
                  publishedAt: note.publishedAt,
                  likesCount: note.likesCount,
                  body: note.body,
                  author: note.author,
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to fetch user notes: ${message}`,
          },
        ],
        isError: true,
      };
    }
  },
);

server.registerTool(
  "get_user_activity",
  {
    title: "Get User Activity",
    description: "Fetch recent Substack activity (posts and notes) for a profile by public slug/handle.",
    inputSchema: {
      profile: z.string().min(1).describe("Public profile slug, with or without @ (example: @on or on)."),
      limit: z.number().int().positive().max(MAX_LIMIT).optional().describe("Maximum number of posts and notes each (default: 10, max: 1000)."),
      startDate: z.iso.date().optional().describe("Inclusive UTC start date in YYYY-MM-DD format."),
      endDate: z.iso.date().optional().describe("Exclusive UTC end date in YYYY-MM-DD format. For one day, use the following date."),
    },
  },
  async ({ profile, limit, startDate, endDate }) => {
    try {
      const client = getClient();
      const slug = normalizeSlug(profile);
      const boundedLimit = clampLimit(limit);
      const dateRange = createDateRange(startDate, endDate);

      const targetProfile = await client.profileForSlug(slug);
      const fetchLimit = dateRange ? MAX_LIMIT : boundedLimit;
      const [fetchedNotes, fetchedPosts] = await Promise.all([
        collectAsync(targetProfile.notes({ limit: fetchLimit }), fetchLimit),
        collectAsync(targetProfile.posts({ limit: fetchLimit }), fetchLimit),
      ]);
      const notes = filterByDateRange(fetchedNotes, dateRange, (note) => note.publishedAt).slice(0, boundedLimit);
      const posts = filterByDateRange(fetchedPosts, dateRange, (post) => post.publishedAt).slice(0, boundedLimit);

      const activity = [
        ...notes.map((note) => ({
          type: "note" as const,
          id: String(note.id),
          date: note.publishedAt,
          summary: note.body,
          likesCount: note.likesCount,
        })),
        ...posts.map((post) => ({
          type: "post" as const,
          id: String(post.id),
          date: post.publishedAt,
          summary: post.title,
          likesCount: post.likesCount,
          subtitle: post.subtitle,
        })),
      ].sort((a, b) => +new Date(b.date) - +new Date(a.date));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                profile: {
                  id: targetProfile.id,
                  name: targetProfile.name,
                  slug: targetProfile.slug,
                  handle: targetProfile.handle,
                  url: targetProfile.url,
                  bio: targetProfile.bio ?? null,
                },
                counts: {
                  posts: posts.length,
                  notes: notes.length,
                  totalActivityItems: activity.length,
                },
                activity,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to fetch user activity: ${message}`,
          },
        ],
        isError: true,
      };
    }
  },
);

  return server;
}

const port = Number(process.env.PORT ?? "3000");
const host = process.env.HOST ?? "0.0.0.0";

const httpServer = createServer(async (req, res) => {
  if (!req.url) {
    res.statusCode = 400;
    res.end("Missing request URL");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? `${host}:${port}`}`);

  if (url.pathname === "/healthz") {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (url.pathname !== "/mcp") {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }

  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  await transport.handleRequest(req, res);
});

httpServer.listen(port, host, () => {
  console.log(`Substack MCP server listening on http://${host}:${port}/mcp`);
});
