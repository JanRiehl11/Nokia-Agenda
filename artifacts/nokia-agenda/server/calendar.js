import { createHash } from "node:crypto";
import ical from "node-ical";

const TIME_ZONE = "Europe/Amsterdam";
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const MAX_FEED_BYTES = 2 * 1024 * 1024;
const FEED_TIMEOUT_MS = 12_000;

let refreshPromise;
let calendar = {
  events: [],
  lastSuccessAt: null,
  lastAttemptAt: null,
  errorCode: null,
};

const datePartsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function zonedDateKey(date) {
  const parts = Object.fromEntries(
    datePartsFormatter.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dateLabel(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function addDays(dateKey, amount) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function safeErrorCode(error) {
  if (error?.agendaCode) return error.agendaCode;
  if (error?.name === "TimeoutError" || error?.name === "AbortError") return "timeout";
  if (error?.name === "TypeError") return "network";
  return "invalid-calendar";
}

function validateFeedUrl() {
  const value = process.env.ICS_URL;
  if (!value) {
    const error = new Error("Calendar feed is not configured");
    error.agendaCode = "not-configured";
    throw error;
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    const error = new Error("Calendar feed URL is invalid");
    error.agendaCode = "invalid-url";
    throw error;
  }

  if (url.protocol !== "https:" || url.username || url.password) {
    const error = new Error("Calendar feed URL is invalid");
    error.agendaCode = "invalid-url";
    throw error;
  }

  return url;
}

function eventStatusIsCancelled(event) {
  return String(event?.status ?? "").toUpperCase() === "CANCELLED";
}

function createOccurrence(source, start, end, allDay, summary) {
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) return null;

  const safeEnd = end instanceof Date && !Number.isNaN(end.getTime()) ? end : start;
  const uid = String(source?.uid ?? source?.id ?? summary ?? "event");
  const occurrenceKey = `${uid}:${start.toISOString()}`;
  const id = createHash("sha256").update(occurrenceKey).digest("hex").slice(0, 20);
  const startLabel = allDay ? "" : timeFormatter.format(start);
  const endLabel = allDay || safeEnd.getTime() <= start.getTime() ? "" : timeFormatter.format(safeEnd);

  return {
    id,
    title: String(summary || source?.summary || "Untitled event"),
    start: start.toISOString(),
    end: safeEnd.toISOString(),
    startDateKey: zonedDateKey(start),
    endDateKey: zonedDateKey(new Date(Math.max(start.getTime(), safeEnd.getTime() - 1))),
    startLabel,
    endLabel,
    allDay: Boolean(allDay),
    location: String(source?.location ?? ""),
    description: String(source?.description ?? ""),
  };
}

function parseEvents(parsed, from, to) {
  const result = [];

  for (const event of Object.values(parsed)) {
    if (event?.type !== "VEVENT" || eventStatusIsCancelled(event)) continue;

    if (event.rrule) {
      let instances;
      try {
        instances = ical.expandRecurringEvent(event, {
          from,
          to,
          includeOverrides: true,
          excludeExdates: true,
          expandOngoing: true,
          maxIterations: 20_000,
        });
      } catch {
        throw Object.assign(new Error("Calendar recurrence could not be expanded"), {
          agendaCode: "invalid-calendar",
        });
      }

      for (const instance of instances) {
        const source = instance.event ?? event;
        if (eventStatusIsCancelled(source)) continue;
        const occurrence = createOccurrence(
          source,
          instance.start,
          instance.end,
          instance.isFullDay,
          instance.summary,
        );
        if (occurrence) result.push(occurrence);
      }
      continue;
    }

    const occurrence = createOccurrence(
      event,
      event.start,
      event.end,
      event.datetype === "date" || Boolean(event.start?.dateOnly),
      event.summary,
    );
    if (
      occurrence &&
      new Date(occurrence.end).getTime() >= from.getTime() &&
      new Date(occurrence.start).getTime() <= to.getTime()
    ) {
      result.push(occurrence);
    }
  }

  result.sort((a, b) => a.start.localeCompare(b.start));
  return result;
}

export async function refreshCalendar() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    calendar = {
      ...calendar,
      lastAttemptAt: new Date().toISOString(),
      errorCode: calendar.lastSuccessAt ? calendar.errorCode : "loading",
    };

    try {
      const url = validateFeedUrl();
      const response = await fetch(url, {
        headers: { accept: "text/calendar, text/plain;q=0.9, */*;q=0.1" },
        redirect: "error",
        signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
      });

      if (!response.ok) {
        const error = new Error("Calendar feed request failed");
        error.agendaCode = "unavailable";
        throw error;
      }

      const contentLength = Number(response.headers.get("content-length") ?? 0);
      if (contentLength > MAX_FEED_BYTES) {
        const error = new Error("Calendar feed is too large");
        error.agendaCode = "invalid-calendar";
        throw error;
      }

      const content = await response.text();
      if (Buffer.byteLength(content, "utf8") > MAX_FEED_BYTES) {
        const error = new Error("Calendar feed is too large");
        error.agendaCode = "invalid-calendar";
        throw error;
      }

      let parsed;
      try {
        parsed = await ical.async.parseICS(content);
      } catch {
        const error = new Error("Calendar feed could not be parsed");
        error.agendaCode = "invalid-calendar";
        throw error;
      }

      const from = new Date(Date.now() - 36 * 60 * 60 * 1000);
      const to = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000);
      const events = parseEvents(parsed, from, to);

      calendar = {
        events,
        lastSuccessAt: new Date().toISOString(),
        lastAttemptAt: calendar.lastAttemptAt,
        errorCode: null,
      };
      return { ok: true, count: events.length };
    } catch (error) {
      calendar = { ...calendar, errorCode: safeErrorCode(error) };
      return { ok: false, errorCode: calendar.errorCode, hasCache: calendar.lastSuccessAt !== null };
    } finally {
      refreshPromise = undefined;
    }
  })();

  return refreshPromise;
}

export function startCalendarRefreshLoop() {
  void refreshCalendar();
  const timer = setInterval(() => void refreshCalendar(), REFRESH_INTERVAL_MS);
  timer.unref();
}

export async function getCalendarSnapshot({ force = false } = {}) {
  const configured = Boolean(process.env.ICS_URL);
  if (!configured) {
    return {
      configured: false,
      events: calendar.events,
      lastSuccessAt: calendar.lastSuccessAt,
      errorCode: "not-configured",
    };
  }

  const due =
    !calendar.lastSuccessAt ||
    Date.now() - new Date(calendar.lastSuccessAt).getTime() >= REFRESH_INTERVAL_MS;

  if (force) {
    await refreshCalendar();
  } else if (due) {
    void refreshCalendar();
  }

  return {
    configured: true,
    events: calendar.events,
    lastSuccessAt: calendar.lastSuccessAt,
    errorCode: calendar.errorCode,
  };
}

export function getTodayKey(now = new Date()) {
  return zonedDateKey(now);
}

export function getDateLabel(dateKey) {
  return dateLabel(dateKey);
}

export function getEventsForDay(events, dateKey) {
  return events
    .filter((event) => event.startDateKey <= dateKey && event.endDateKey >= dateKey)
    .map((event) => ({ ...event, dateLabel: dateLabel(dateKey) }));
}

export function getUpcomingGroups(events, firstDateKey, dayCount = 7) {
  const groups = [];
  for (let offset = 0; offset < dayCount; offset += 1) {
    const key = addDays(firstDateKey, offset);
    const dayEvents = getEventsForDay(events, key);
    if (dayEvents.length) groups.push({ dateLabel: dateLabel(key), events: dayEvents });
  }
  return groups;
}

export function getNextEvent(events, now = new Date()) {
  const timestamp = now.getTime();
  const event = events.find((item) => {
    const start = new Date(item.start).getTime();
    const end = new Date(item.end).getTime();
    return item.allDay ? end > timestamp : start >= timestamp;
  });
  return event ?? null;
}

export function getEventById(events, id) {
  return events.find((event) => event.id === id) ?? null;
}

export function getSafeCalendarMessage(errorCode) {
  switch (errorCode) {
    case "not-configured":
      return "Calendar not connected. Add ICS_URL in Replit Secrets.";
    case "loading":
      return "Calendar is loading. Try again in a moment.";
    case "invalid-url":
      return "Invalid iCal URL. Use the private HTTPS feed URL in Replit Secrets.";
    case "network":
    case "timeout":
    case "unavailable":
      return "Calendar unavailable. Check the feed URL and internet connection.";
    case "invalid-calendar":
      return "Calendar unavailable. The iCal feed is invalid or could not be read.";
    default:
      return "";
  }
}

export function getCalendarStatus(snapshot) {
  if (snapshot.lastSuccessAt) {
    return snapshot.errorCode ? "Unavailable — showing cached events" : "Connected";
  }
  if (snapshot.errorCode === "loading") return "Connecting";
  return snapshot.errorCode ? "Unavailable" : "Not yet refreshed";
}

export function formatLastRefresh(dateString) {
  if (!dateString) return "Not yet";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Not yet";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
