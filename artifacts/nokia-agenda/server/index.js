import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import cookieSession from "cookie-session";
import express from "express";
import {
  formatLastRefresh,
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
  renderLogin,
  renderSettings,
  renderSetup,
  renderUpcoming,
} from "./views.js";

const app = express();
const port = Number(process.env.PORT);
const sessionSecret = process.env.SESSION_SECRET;
const pin = process.env.AGENDA_PIN;
const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const publicDirectory = path.join(currentDirectory, "../public");
const attemptsByAddress = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;

if (!Number.isInteger(port) || port <= 0) {
  throw new Error("A valid PORT environment variable is required.");
}

if (!sessionSecret) {
  throw new Error("SESSION_SECRET must be configured in Replit Secrets.");
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
app.use(express.urlencoded({ extended: false, limit: "1kb" }));
app.use(
  cookieSession({
    name: "nokia-agenda",
    keys: [sessionSecret],
    maxAge: 8 * 60 * 60 * 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  }),
);
app.use(express.static(publicDirectory, { index: false, fallthrough: true, maxAge: "1h" }));

app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

function hasConfiguration() {
  return Boolean(process.env.ICS_URL && pin);
}

function loginAttemptState(address) {
  const now = Date.now();
  const current = attemptsByAddress.get(address);
  if (!current || current.expiresAt <= now) {
    const next = { count: 0, expiresAt: now + LOGIN_WINDOW_MS };
    attemptsByAddress.set(address, next);
    return next;
  }
  return current;
}

function safeComparePin(candidate, expected) {
  const candidateBytes = Buffer.from(String(candidate ?? ""), "utf8");
  const expectedBytes = Buffer.from(String(expected ?? ""), "utf8");
  const length = Math.max(candidateBytes.length, expectedBytes.length, 1);
  const paddedCandidate = Buffer.alloc(length);
  const paddedExpected = Buffer.alloc(length);
  candidateBytes.copy(paddedCandidate);
  expectedBytes.copy(paddedExpected);
  const matches = timingSafeEqual(paddedCandidate, paddedExpected);
  return matches && candidateBytes.length === expectedBytes.length;
}

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

function requireAgenda(req, res, next) {
  if (!hasConfiguration()) {
    res.status(200).send(renderSetup());
    return;
  }
  if (!req.session?.authenticated) {
    res.redirect("/login");
    return;
  }
  next();
}

app.get("/login", (_req, res) => {
  if (!hasConfiguration()) {
    res.status(200).send(renderSetup());
    return;
  }
  res.send(renderLogin({ error: "" }));
});

app.post("/login", (req, res) => {
  if (!hasConfiguration()) {
    res.status(200).send(renderSetup());
    return;
  }

  const address = req.ip || "unknown";
  const attempt = loginAttemptState(address);
  if (attempt.count >= LOGIN_MAX_ATTEMPTS) {
    res.status(429).send(renderLogin({ error: "Too many attempts. Try again in 15 minutes." }));
    return;
  }

  if (!safeComparePin(req.body?.code, pin)) {
    attempt.count += 1;
    if (attemptsByAddress.size > 1000) {
      for (const [key, value] of attemptsByAddress) {
        if (value.expiresAt <= Date.now()) attemptsByAddress.delete(key);
      }
    }
    res.status(401).send(renderLogin({ error: "The access code is not correct." }));
    return;
  }

  attemptsByAddress.delete(address);
  req.session = { authenticated: true };
  res.redirect("/today");
});

app.use(requireAgenda);

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
    : "";
  const status = snapshot.lastSuccessAt
    ? snapshot.errorCode
      ? "Unavailable — showing cached calendar"
      : "Connected"
    : snapshot.errorCode === "loading"
      ? "Connecting"
      : snapshot.errorCode
      ? "Unavailable"
      : "Not yet refreshed";
  res.send(
    renderSettings({
      status,
      refreshedAt: formatLastRefresh(snapshot.lastSuccessAt),
      error: manualRefreshError || (snapshot.errorCode ? getSafeCalendarMessage(snapshot.errorCode) : ""),
    }),
  );
});

app.post("/settings/refresh", async (_req, res) => {
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
