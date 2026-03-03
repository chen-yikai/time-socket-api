import { Elysia, t, status } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { staticPlugin } from "@elysiajs/static";

type Countdown = {
  id: string;
  title: string;
  targetTime: string;
  createdAt: string;
};

type CountdownParts = {
  year: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const countdowns = new Map<string, Countdown>();
const subscribers = new Set<{ send: (data: string) => void }>();

function broadcast(event: string, payload: unknown) {
  const message = JSON.stringify({ event, payload });
  for (const ws of subscribers) {
    ws.send(message);
  }
}

function getCountdownParts(targetTime: string): CountdownParts {
  const now = Date.now();
  const target = new Date(targetTime).getTime();

  if (Number.isNaN(target) || target <= now) {
    return { year: 0, day: 0, hour: 0, minute: 0, second: 0 };
  }

  let remainingSeconds = Math.floor((target - now) / 1000);
  const secondsInYear = 365 * 24 * 60 * 60;
  const secondsInDay = 24 * 60 * 60;
  const secondsInHour = 60 * 60;
  const secondsInMinute = 60;

  const year = Math.floor(remainingSeconds / secondsInYear);
  remainingSeconds %= secondsInYear;

  const day = Math.floor(remainingSeconds / secondsInDay);
  remainingSeconds %= secondsInDay;

  const hour = Math.floor(remainingSeconds / secondsInHour);
  remainingSeconds %= secondsInHour;

  const minute = Math.floor(remainingSeconds / secondsInMinute);
  const second = remainingSeconds % secondsInMinute;

  return { year, day, hour, minute, second };
}

const api = new Elysia({ prefix: "/api" })
  .use(
    swagger({
      path: "/docs",
      provider: "swagger-ui",
      documentation: {
        info: {
          title: "Realtime Countdown API",
          version: "1.0.0",
          description: "A realtime countdown API",
        },
        tags: [
          { name: "Countdown", description: "CRUD operations for countdowns" },
        ],
      },
    })
  )
  .get("/countdowns", () => Array.from(countdowns.values()), {
    detail: {
      tags: ["Countdown"],
      summary: "List all countdowns",
      description: "Returns a list of all existing countdowns.",
    },
  })
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
        title: t.String({
          minLength: 1,
          description: "Title of the countdown",
        }),
        targetTime: t.String({
          format: "date-time",
          description:
            "ISO 8601 target date-time string (e.g. 2026-12-31T23:59:59Z)",
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
        ...(body.targetTime !== undefined
          ? { targetTime: body.targetTime }
          : {}),
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
          t.String({
            format: "date-time",
            description: "New ISO 8601 target date-time string",
          })
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
      if (!countdowns.has(id))
        return status(404, { message: "Countdown not found" });
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
  );

const socket = new Elysia({ prefix: "/ws", detail: { hide: true } })
  .ws("/realtime", {
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
  .ws("/countdowns/:id", {
    params: t.Object({ id: t.String() }),
    open(ws) {
      const id = ws.data.params.id;
      const countdown = countdowns.get(id);

      if (!countdown) {
        ws.send(JSON.stringify({ error: "Countdown not found" }));
        ws.close();
        return;
      }

      const targetTimestamp = new Date(countdown.targetTime).getTime();
      if (Number.isNaN(targetTimestamp)) {
        ws.send(JSON.stringify({ error: "Invalid targetTime" }));
        ws.close();
        return;
      }

      let timer: ReturnType<typeof setInterval> | null = null;

      const sendTick = () => {
        const parts = getCountdownParts(countdown.targetTime);
        ws.send(JSON.stringify(parts));

        if (
          parts.year === 0 &&
          parts.day === 0 &&
          parts.hour === 0 &&
          parts.minute === 0 &&
          parts.second === 0
        ) {
          if (timer) clearInterval(timer);
          ws.close();
        }
      };

      sendTick();
      timer = setInterval(sendTick, 1000);
      (ws.data as { timer?: ReturnType<typeof setInterval> }).timer = timer;
    },
    close(ws) {
      const timer = (ws.data as { timer?: ReturnType<typeof setInterval> })
        .timer;
      if (timer) {
        clearInterval(timer);
      }
    },
  });
const app = new Elysia()
  .use(api)
  .use(socket)
  .use(staticPlugin({ assets: "public", prefix: "/" }))
  .get("/", () => Bun.file("public/index.html"))
  .listen(process.env.PORT ? Number(process.env.PORT) : 3000);

console.log(
  `Live countdown socket running at http://localhost:${app.server?.port}/ws/countdowns/:id`
);
console.log(
  `Realtime data available at http://localhost:${app.server?.port}/ws/realtime`
);
console.log(`Frontend available at http://localhost:${app.server?.port}`);
console.log(
  `API docs available at http://localhost:${app.server?.port}/api/docs`
);
