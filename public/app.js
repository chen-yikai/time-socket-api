const apiBase = "/api";
const listEl = document.getElementById("countdowns");
const formEl = document.getElementById("create-form");
const statusEl = document.getElementById("status");

let countdowns = [];
const timerSockets = new Map();
let eventsSocket = null;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "tomato" : "inherit";
}

function toIsoFromLocal(value) {
  return new Date(value).toISOString();
}

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function formatTimer(parts) {
  return `${parts.year}y ${parts.day}d ${parts.hour}h ${parts.minute}m ${parts.second}s`;
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.message ?? "Request failed";
    throw new Error(message);
  }
  return data;
}

function connectEventSocket() {
  if (eventsSocket && eventsSocket.readyState === WebSocket.OPEN) return;

  const protocol = location.protocol === "https:" ? "wss" : "ws";
  eventsSocket = new WebSocket(`${protocol}://${location.host}/ws/realtime`);

  eventsSocket.onmessage = () => {
    refreshCountdowns().catch((error) => {
      setStatus(error.message, true);
    });
  };
}

function closeOrphanSockets(activeIds) {
  for (const [id, socket] of timerSockets.entries()) {
    if (!activeIds.has(id)) {
      socket.close();
      timerSockets.delete(id);
    }
  }
}

function connectTimerSocket(id) {
  if (timerSockets.has(id)) return;

  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(
    `${protocol}://${location.host}/ws/countdowns/${id}`
  );

  socket.onmessage = (event) => {
    const timerEl = document.getElementById(`timer-${id}`);
    if (!timerEl) return;
    try {
      const payload = JSON.parse(event.data);
      if (payload.error) {
        timerEl.textContent = payload.error;
        return;
      }
      timerEl.textContent = formatTimer(payload);
    } catch {
      timerEl.textContent = "Invalid timer payload";
    }
  };

  socket.onclose = () => {
    timerSockets.delete(id);
  };

  timerSockets.set(id, socket);
}

function renderCountdowns() {
  if (countdowns.length === 0) {
    listEl.innerHTML = "<p>No countdowns yet.</p>";
    closeOrphanSockets(new Set());
    return;
  }

  listEl.innerHTML = "";
  const ids = new Set();

  for (const countdown of countdowns) {
    ids.add(countdown.id);

    const card = document.createElement("article");
    card.className = "card";

    const top = document.createElement("div");
    top.className = "row";

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = countdown.title;

    const actions = document.createElement("div");
    actions.className = "actions";

    const editBtn = document.createElement("button");
    editBtn.textContent = "Edit";
    editBtn.type = "button";
    editBtn.addEventListener("click", () => editCountdown(countdown));

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.type = "button";
    deleteBtn.addEventListener("click", () => removeCountdown(countdown.id));

    actions.append(editBtn, deleteBtn);
    top.append(title, actions);

    const timer = document.createElement("div");
    timer.className = "time";
    timer.id = `timer-${countdown.id}`;
    timer.textContent = timerSockets.has(countdown.id) ? timer.textContent : "Connecting...";

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `Target: ${formatDate(countdown.targetTime)} • Created: ${formatDate(countdown.createdAt)}`;

    card.append(top, timer, meta);
    listEl.append(card);

    connectTimerSocket(countdown.id);
  }

  closeOrphanSockets(ids);
}

async function refreshCountdowns() {
  countdowns = await request("/countdowns");
  renderCountdowns();
}

async function createCountdown(event) {
  event.preventDefault();

  const formData = new FormData(formEl);
  const title = String(formData.get("title") ?? "").trim();
  const targetInput = String(formData.get("targetTime") ?? "");

  if (!title || !targetInput) {
    setStatus("Title and target time are required", true);
    return;
  }

  try {
    await request("/countdowns", {
      method: "POST",
      body: JSON.stringify({
        title,
        targetTime: toIsoFromLocal(targetInput),
      }),
    });
    formEl.reset();
    setStatus("Countdown created");
    await refreshCountdowns();
  } catch (error) {
    setStatus(error.message, true);
  }
}

function toLocalDateTimeValue(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

async function editCountdown(countdown) {
  const dialog = document.createElement("dialog");
  dialog.innerHTML = `
    <form method="dialog" class="form">
      <h3>Edit Countdown</h3>
      <label>
        Title
        <input type="text" name="title" value="${countdown.title.replace(/"/g, '&quot;')}" required minlength="1" />
      </label>
      <label>
        Target Time
        <input type="datetime-local" name="targetTime" value="${toLocalDateTimeValue(countdown.targetTime)}" required />
      </label>
      <div class="actions">
        <button type="submit">Save</button>
        <button type="button" class="cancel">Cancel</button>
      </div>
    </form>
  `;
  document.body.append(dialog);
  dialog.showModal();

  dialog.querySelector(".cancel").addEventListener("click", () => dialog.close());

  dialog.addEventListener("close", async () => {
    dialog.remove();
    if (dialog.returnValue !== "submit") return;

    const form = dialog.querySelector("form");
    const formData = new FormData(form);
    const nextTitle = String(formData.get("title") ?? "").trim();
    const nextTargetInput = String(formData.get("targetTime") ?? "");

    if (!nextTitle || !nextTargetInput) return;

    try {
      await request(`/countdowns/${countdown.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: nextTitle,
          targetTime: toIsoFromLocal(nextTargetInput),
        }),
      });
      setStatus("Countdown updated");
      await refreshCountdowns();
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  dialog.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    dialog.close("submit");
  });
}

async function removeCountdown(id) {
  const confirmed = confirm("Delete this countdown?");
  if (!confirmed) return;

  try {
    await request(`/countdowns/${id}`, { method: "DELETE" });
    setStatus("Countdown deleted");
    await refreshCountdowns();
  } catch (error) {
    setStatus(error.message, true);
  }
}

formEl.addEventListener("submit", createCountdown);

connectEventSocket();
refreshCountdowns().catch((error) => {
  setStatus(error.message, true);
});
