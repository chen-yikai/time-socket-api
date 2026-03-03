import { Elysia, t, status } from "elysia";
import { swagger } from "@elysiajs/swagger";

type Countdown = {
  id: string;
  title: string;
  targetTime: string;
  createdAt: string;
};

const countdowns = new Map<string, Countdown>();
const subscribers = new Set<{ send: (data: string) => void }>();

function broadcast(event: string, payload: unknown) {
  const message = JSON.stringify({ event, payload });
  for (const ws of subscribers) {
    ws.send(message);
  }
}

const app = new Elysia()
  .use(
    swagger({
      path: "/api/docs",
      documentation: {
        info: {
          title: "Realtime Countdown API",
          version: "1.0.0",
          description:
            "A realtime countdown API built with Elysia and Bun. Manage countdowns via REST and receive live updates via WebSocket.",
        },
        tags: [
          { name: "Countdown", description: "CRUD operations for countdowns" },
          { name: "WebSocket", description: "Realtime WebSocket connection" },
        ],
      },
    })
  )
  .get(
    "/countdowns",
    () => Array.from(countdowns.values()),
    {
      detail: {
        tags: ["Countdown"],
        summary: "List all countdowns",
        description: "Returns a list of all existing countdowns.",
      },
    }
  )
  .get(
    "/countdowns/:id",
    ({ params: { id } }) => {
      const item = countdowns.get(id);
      if (!item) return status(404, { message: "Countdown not found" });
      return item;
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        tags: ["Countdown"],
        summary: "Get a countdown by ID",
        description: "Returns a single countdown by its unique ID.",
      },
    }
  )
  .post(
    "/countdowns",
    ({ body }) => {
      const id = crypto.randomUUID();
      const countdown: Countdown = {
        id,
        title: body.title,
        targetTime: body.targetTime,
        createdAt: new Date().toISOString(),
      };
      countdowns.set(id, countdown);
      broadcast("created", countdown);
      return countdown;
    },
    {
      body: t.Object({
        title: t.String({ minLength: 1, description: "Title of the countdown" }),
        targetTime: t.String({
          format: "date-time",
          description: "ISO 8601 target date-time string (e.g. 2026-12-31T23:59:59Z)",
        }),
      }),
      detail: {
        tags: ["Countdown"],
        summary: "Create a countdown",
        description:
          "Creates a new countdown with a title and target time. Broadcasts a `created` event to all connected WebSocket clients.",
      },
    }
  )
  .patch(
    "/countdowns/:id",
    ({ params: { id }, body }) => {
      const existing = countdowns.get(id);
      if (!existing) return status(404, { message: "Countdown not found" });
      const updated: Countdown = {
        ...existing,
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.targetTime !== undefined ? { targetTime: body.targetTime } : {}),
      };
      countdowns.set(id, updated);
      broadcast("updated", updated);
      return updated;
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        title: t.Optional(t.String({ minLength: 1, description: "New title" })),
        targetTime: t.Optional(
          t.String({ format: "date-time", description: "New ISO 8601 target date-time string" })
        ),
      }),
      detail: {
        tags: ["Countdown"],
        summary: "Update a countdown",
        description:
          "Updates an existing countdown's title and/or targetTime. Broadcasts an `updated` event to all connected WebSocket clients.",
      },
    }
  )
  .delete(
    "/countdowns/:id",
    ({ params: { id } }) => {
      if (!countdowns.has(id)) return status(404, { message: "Countdown not found" });
      countdowns.delete(id);
      broadcast("deleted", { id });
      return { message: "Countdown deleted" };
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        tags: ["Countdown"],
        summary: "Delete a countdown",
        description:
          "Deletes a countdown by ID. Broadcasts a `deleted` event to all connected WebSocket clients.",
      },
    }
  )
  .ws("/ws", {
    open(ws) {
      subscribers.add(ws);
      ws.send(
        JSON.stringify({
          event: "connected",
          payload: { countdowns: Array.from(countdowns.values()) },
        })
      );
    },
    close(ws) {
      subscribers.delete(ws);
    },
    message(ws, message) {
      ws.send(JSON.stringify({ event: "pong", payload: message }));
    },
  })
  .listen(3000);

console.log(`🦊 Realtime Countdown API running at http://localhost:${app.server?.port}`);
console.log(`📖 API docs available at http://localhost:${app.server?.port}/api/docs`);
