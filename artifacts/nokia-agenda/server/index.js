import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import {
  formatLastRefresh,
  getCalendarStatus,
  getCalendarSnapshot,
  getDateLabel,
  getEventById,
  getEventsForDay,
  getNextEvent,
  getSafeCalendarMessage,
  getTodayKey,
  getUpcomingGroups,
  startCalendarRefreshLoop,
} from "./calendar.js";
import {
  renderDocument,
  renderEventDetail,
  renderEventList,
  renderHome,
  renderSettings,
  renderSetup,
  renderUpcoming,
} from "./views.js";

const app = express();
const port = Number(process.env.PORT);
const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const publicDirectory = path.join(currentDirectory, "../public");
const MANUAL_REFRESH_COOLDOWN_MS = 60 * 1000;
let lastManualRefreshAt = 0;

if (!Number.isInteger(port) || port <= 0) {
  throw new Error("A valid PORT environment variable is required.");
}

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'none'; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  });
  next();
});
app.use(express.static(publicDirectory, { index: false, fallthrough: true, maxAge: "1h" }));

app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

function unavailablePage(snapshot, dateKey) {
  const message = getSafeCalendarMessage(snapshot.errorCode);
  const body = `<section class="screen" aria-labelledby="screen-title">
    <h1 id="screen-title">CALENDAR UNAVAILABLE</h1>
    <p class="notice notice-error">${message}</p>
    <p>Open SETTINGS to check the connection.</p>
  </section>`;
  return renderDocument({
    title: "Calendar unavailable — Agenda",
    dateLabel: getDateLabel(dateKey),
    active: "today",
    body,
  });
}

function requireCalendarConfiguration(_req, res, next) {
  if (!process.env.ICS_URL) {
    res.status(200).send(renderSetup());
    return;
  }
  next();
}

app.use(requireCalendarConfiguration);

app.get("/login", (_req, res) => {
  res.redirect("/today");
});

app.get("/", async (_req, res) => {
  const snapshot = await getCalendarSnapshot();
  const todayKey = getTodayKey();
  if (!snapshot.lastSuccessAt) {
    res.status(200).send(unavailablePage(snapshot, todayKey));
    return;
  }
  const todayEvents = getEventsForDay(snapshot.events, todayKey);
  const nextEvent = getNextEvent(snapshot.events);
  res.send(renderHome({ dateLabel: getDateLabel(todayKey), nextEvent, todayEvents }));
});

app.get("/today", async (_req, res) => {
  const snapshot = await getCalendarSnapshot();
  const todayKey = getTodayKey();
  if (!snapshot.lastSuccessAt) {
    res.status(200).send(unavailablePage(snapshot, todayKey));
    return;
  }
  res.send(
    renderEventList({
      title: "Today",
      dateLabel: getDateLabel(todayKey),
      events: getEventsForDay(snapshot.events, todayKey),
    }),
  );
});

app.get("/tomorrow", async (_req, res) => {
  const snapshot = await getCalendarSnapshot();
  const todayKey = getTodayKey();
  if (!snapshot.lastSuccessAt) {
    res.status(200).send(unavailablePage(snapshot, todayKey));
    return;
  }
  const tomorrowKey = dateKeyOffset(todayKey, 1);
  const tomorrowEvents = getEventsForDay(snapshot.events, tomorrowKey);
  res.send(
    renderEventList({
      title: "Tomorrow",
      dateLabel: getDateLabel(tomorrowKey),
      events: tomorrowEvents,
    }),
  );
});

app.get("/upcoming", async (_req, res) => {
  const snapshot = await getCalendarSnapshot();
  const todayKey = getTodayKey();
  if (!snapshot.lastSuccessAt) {
    res.status(200).send(unavailablePage(snapshot, todayKey));
    return;
  }
  res.send(
    renderUpcoming({
      groups: getUpcomingGroups(snapshot.events, todayKey, 7),
    }),
  );
});

app.get("/event/:id", async (req, res) => {
  const snapshot = await getCalendarSnapshot();
  if (!snapshot.lastSuccessAt) {
    res.status(200).send(unavailablePage(snapshot, getTodayKey()));
    return;
  }
  const event = getEventById(snapshot.events, req.params.id);
  res.status(event ? 200 : 404).send(renderEventDetail({ event }));
});

app.get("/settings", async (req, res) => {
  const snapshot = await getCalendarSnapshot();
  const manualRefreshError = req.query.refresh === "failed"
    ? getSafeCalendarMessage(snapshot.errorCode || "unavailable")
    : req.query.refresh === "throttled"
      ? "Please wait a minute before refreshing again."
    : "";
  const status = getCalendarStatus(snapshot);
  res.send(
    renderSettings({
      status,
      refreshedAt: formatLastRefresh(snapshot.lastSuccessAt),
      error: manualRefreshError || (snapshot.errorCode ? getSafeCalendarMessage(snapshot.errorCode) : ""),
    }),
  );
});

app.post("/settings/refresh", async (_req, res) => {
  if (Date.now() - lastManualRefreshAt < MANUAL_REFRESH_COOLDOWN_MS) {
    res.redirect("/settings?refresh=throttled");
    return;
  }
  lastManualRefreshAt = Date.now();
  const result = await getCalendarSnapshot({ force: true });
  res.redirect(result.errorCode ? "/settings?refresh=failed" : "/settings");
});

app.use((_req, res) => {
  res.status(404).send(
    renderDocument({
      title: "Page not found — Agenda",
      active: "",
      body: '<section class="screen"><h1>PAGE NOT FOUND</h1><p><a href="/today">BACK TO TODAY</a></p></section>',
    }),
  );
});

startCalendarRefreshLoop();
app.listen(port, "0.0.0.0");

function dateKeyOffset(dateKey, amount) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
