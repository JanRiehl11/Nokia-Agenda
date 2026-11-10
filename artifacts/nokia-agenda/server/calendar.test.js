import assert from "node:assert/strict";
import { test } from "node:test";
import { getCalendarStatus, getCalendarSnapshot } from "./calendar.js";
import { renderEventList, renderSettings } from "./views.js";

function dateKey(offsetDays) {
  const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}

function calendarFeed() {
  const start = dateKey(3);
  const nextDay = dateKey(4);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Agenda Regression Test//EN",
    "BEGIN:VEVENT",
    "UID:cached-appointment@example.test",
    "DTSTAMP:20260101T000000Z",
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${nextDay}`,
    "SUMMARY:Cached appointment",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

test("a failed refresh keeps successful events available and reports cached events in Settings", async () => {
  const previousUrl = process.env.ICS_URL;
  const previousFetch = globalThis.fetch;
  let fetchCount = 0;
  process.env.ICS_URL = "https://calendar.example.test/private.ics";
  globalThis.fetch = async () => {
    fetchCount += 1;
    if (fetchCount === 1) {
      const content = calendarFeed();
      return {
        ok: true,
        headers: { get: () => null },
        text: async () => content,
      };
    }
    return {
      ok: false,
      status: 503,
      headers: { get: () => null },
      text: async () => "",
    };
  };

  try {
    const successfulSnapshot = await getCalendarSnapshot({ force: true });
    assert.equal(successfulSnapshot.events.length, 1);
    assert.equal(successfulSnapshot.events[0].title, "Cached appointment");
    assert.equal(successfulSnapshot.errorCode, null);

    const failedSnapshot = await getCalendarSnapshot({ force: true });
    assert.equal(failedSnapshot.errorCode, "unavailable");
    assert.deepEqual(failedSnapshot.events, successfulSnapshot.events);
    assert.equal(failedSnapshot.lastSuccessAt, successfulSnapshot.lastSuccessAt);
    const cachedAgenda = renderEventList({
      title: "Upcoming",
      events: failedSnapshot.events,
    });
    assert.match(cachedAgenda, /Cached appointment/);

    const status = getCalendarStatus(failedSnapshot);
    assert.equal(status, "Unavailable — showing cached events");
    const settings = renderSettings({
      status,
      refreshedAt: "10/11/26, 12:00",
      error: "Calendar unavailable. Check the feed URL and internet connection.",
    });
    assert.match(settings, /Unavailable — showing cached events/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.ICS_URL;
    else process.env.ICS_URL = previousUrl;
  }
});
