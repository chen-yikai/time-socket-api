# time-socket-api

A realtime countdown API built with [Elysia](https://elysiajs.com/) and [Bun](https://bun.sh/), featuring WebSocket support for live updates.

## Features

- **CRUD** – Create, read, update, and delete countdowns.
- **Realtime** – All connected WebSocket clients receive instant `created`, `updated`, and `deleted` events.
- **API Docs** – Interactive Swagger UI included.

## Data Model

| Field       | Type   | Description                          |
| ----------- | ------ | ------------------------------------ |
| `id`        | string | Auto-generated UUID                  |
| `title`     | string | Human-readable label for the countdown |
| `targetTime`| string | ISO 8601 date-time (e.g. `2026-12-31T23:59:59Z`) |
| `createdAt` | string | ISO 8601 creation timestamp          |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) ≥ 1.0

### Install dependencies

```bash
bun install
```

### Run the server

```bash
bun run start        # production
bun run dev          # watch mode
```

The server starts on **http://localhost:3000**.  
Swagger UI is available at **http://localhost:3000/swagger**.

## REST API

| Method | Endpoint            | Description                |
| ------ | ------------------- | -------------------------- |
| GET    | `/countdowns`       | List all countdowns        |
| GET    | `/countdowns/:id`   | Get a single countdown     |
| POST   | `/countdowns`       | Create a new countdown     |
| PATCH  | `/countdowns/:id`   | Update a countdown         |
| DELETE | `/countdowns/:id`   | Delete a countdown         |

### Create a countdown

```bash
curl -X POST http://localhost:3000/countdowns \
  -H "Content-Type: application/json" \
  -d '{"title": "New Year", "targetTime": "2027-01-01T00:00:00Z"}'
```

### Update a countdown

```bash
curl -X PATCH http://localhost:3000/countdowns/<id> \
  -H "Content-Type: application/json" \
  -d '{"title": "Updated Title"}'
```

### Delete a countdown

```bash
curl -X DELETE http://localhost:3000/countdowns/<id>
```

## WebSocket

Connect to `ws://localhost:3000/ws`.

On connection you immediately receive a `connected` event with all current countdowns:

```json
{
  "event": "connected",
  "payload": { "countdowns": [...] }
}
```

Subsequent events are broadcast to every connected client whenever the REST API mutates data:

| Event     | Payload                      |
| --------- | ---------------------------- |
| `created` | Full countdown object        |
| `updated` | Updated countdown object     |
| `deleted` | `{ "id": "<countdown-id>" }` |

### Example (wscat)

```bash
npx wscat -c ws://localhost:3000/ws
```
