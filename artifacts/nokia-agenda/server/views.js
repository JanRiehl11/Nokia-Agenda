const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const eventHref = (id) => `/event/${encodeURIComponent(String(id ?? ""))}`;

const navItems = [
  ["today", "/today", "TODAY"],
  ["tomorrow", "/tomorrow", "TOMORROW"],
  ["upcoming", "/upcoming", "UPCOMING"],
  ["settings", "/settings", "SETTINGS"],
];

function eventRow(event) {
  const time = event.allDay
    ? "ALL DAY"
    : [event.startLabel, event.endLabel].filter(Boolean).join("–");
  return `<li class="event-row">
    <a class="event-link" href="${escapeHtml(eventHref(event.id))}">
      <span class="event-time">${escapeHtml(time || "TIME TBD")}</span>
      <span class="event-title">${escapeHtml(event.title || "Untitled event")}</span>
      ${event.location ? `<span class="event-location">${escapeHtml(event.location)}</span>` : ""}
    </a>
  </li>`;
}

function eventList(events, emptyTitle = "NO EVENTS", emptyMessage = "Nothing is scheduled here.") {
  if (!Array.isArray(events) || events.length === 0) {
    return `<div class="empty-state"><strong>${escapeHtml(emptyTitle)}</strong><p>${escapeHtml(emptyMessage)}</p></div>`;
  }
  return `<ul class="event-list">${events.map(eventRow).join("")}</ul>`;
}

export function renderDocument({ title, dateLabel, active, body }) {
  const safeTitle = escapeHtml(title || "Agenda");
  const navigation = navItems
    .map(
      ([key, href, label]) =>
        `<a href="${href}"${active === key ? ' class="active" aria-current="page"' : ""}>${label}</a>`,
    )
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#000000">
  <title>${safeTitle}</title>
  <link rel="stylesheet" href="/agenda.css">
</head>
<body>
  <div class="device">
    <header class="topline">
      <a class="brand" href="/today" aria-label="Agenda home">AGENDA</a>
      ${dateLabel ? `<span class="date-label">${escapeHtml(dateLabel)}</span>` : ""}
    </header>
    <nav class="main-nav" aria-label="Agenda navigation">${navigation}</nav>
    <main id="main-content">${body || ""}</main>
    <footer class="bottomline"><a href="/today">BACK</a><span>SELECT</span></footer>
  </div>
</body>
</html>`;
}

export function renderSetup() {
  const body = `<section class="screen" aria-labelledby="screen-title">
    <h1 id="screen-title">SET UP AGENDA</h1>
    <p class="screen-copy">Add ICS_URL in Replit Secrets to connect this calendar.</p>
    <p class="screen-copy">The private calendar address is never entered on this page.</p>
  </section>`;
  return renderDocument({ title: "Setup — Agenda", active: "settings", body });
}

export function renderHome({ dateLabel, nextEvent, todayEvents }) {
  const next = nextEvent
    ? `<a class="next-event" href="${escapeHtml(eventHref(nextEvent.id))}">
        <span class="section-label">NEXT APPOINTMENT</span>
        <strong>${escapeHtml(nextEvent.allDay ? "ALL DAY" : nextEvent.startLabel || "TIME TBD")}</strong>
        <span>${escapeHtml(nextEvent.title || "Untitled event")}</span>
      </a>`
    : `<div class="next-event next-empty"><span class="section-label">NEXT APPOINTMENT</span><strong>NONE</strong><span>You are clear.</span></div>`;
  const body = `<section class="screen screen-home" aria-labelledby="screen-title">
    <h1 id="screen-title">TODAY</h1>
    ${next}
    <section class="event-section" aria-label="Today's events">
      <h2>ON THE AGENDA</h2>
      ${eventList(todayEvents, "NO EVENTS TODAY", "Your day is open.")}
    </section>
  </section>`;
  return renderDocument({ title: "Today — Agenda", dateLabel, active: "today", body });
}

export function renderEventList({ title, dateLabel, events }) {
  const heading = title || "EVENTS";
  const body = `<section class="screen" aria-labelledby="screen-title">
    <h1 id="screen-title">${escapeHtml(heading)}</h1>
    ${eventList(events, "NO EVENTS", "There is nothing scheduled for this date.")}
  </section>`;
  const active = /tomorrow/i.test(heading) ? "tomorrow" : "today";
  return renderDocument({ title: `${heading} — Agenda`, dateLabel, active, body });
}

export function renderUpcoming({ groups }) {
  const populated = Array.isArray(groups) ? groups.filter((group) => Array.isArray(group.events) && group.events.length) : [];
  const content = populated.length
    ? populated
        .map(
          (group) => `<section class="event-section">
            <h2>${escapeHtml(group.dateLabel || "DATE NOT SET")}</h2>
            ${eventList(group.events)}
          </section>`,
        )
        .join("")
    : `<div class="empty-state"><strong>NOTHING UPCOMING</strong><p>Your calendar is clear.</p></div>`;
  const body = `<section class="screen" aria-labelledby="screen-title">
    <h1 id="screen-title">UPCOMING</h1>
    ${content}
  </section>`;
  return renderDocument({ title: "Upcoming — Agenda", active: "upcoming", body });
}

export function renderEventDetail({ event }) {
  if (!event) {
    const body = `<section class="screen" aria-labelledby="screen-title">
      <h1 id="screen-title">EVENT NOT FOUND</h1>
      <p class="notice">This appointment is no longer available.</p>
      <p><a class="back-link" href="/today">BACK TO TODAY</a></p>
    </section>`;
    return renderDocument({ title: "Event not found — Agenda", active: "", body });
  }
  const timing = event.allDay
    ? "ALL DAY"
    : [event.startLabel, event.endLabel].filter(Boolean).join("–");
  const body = `<article class="screen event-detail">
    <h1>${escapeHtml(event.title || "Untitled event")}</h1>
    <dl class="event-facts">
      <div><dt>DATE</dt><dd>${escapeHtml(event.dateLabel || "DATE NOT SET")}</dd></div>
      <div><dt>TIME</dt><dd>${escapeHtml(timing || "TIME NOT SET")}</dd></div>
      ${event.location ? `<div><dt>PLACE</dt><dd>${escapeHtml(event.location)}</dd></div>` : ""}
    </dl>
    ${event.description ? `<section class="description"><h2>DETAILS</h2><p>${escapeHtml(event.description)}</p></section>` : ""}
    <p><a class="back-link" href="/today">BACK TO AGENDA</a></p>
  </article>`;
  return renderDocument({ title: `${event.title || "Event"} — Agenda`, dateLabel: event.dateLabel, active: "", body });
}

export function renderSettings({ status, refreshedAt, error }) {
  const body = `<section class="screen" aria-labelledby="screen-title">
    <h1 id="screen-title">SETTINGS</h1>
    <dl class="settings-list">
      <div><dt>CALENDAR</dt><dd>${escapeHtml(status || "Not connected")}</dd></div>
      <div><dt>LAST UPDATED</dt><dd>${escapeHtml(refreshedAt || "Not yet")}</dd></div>
    </dl>
    ${error ? `<p class="notice notice-error" role="alert">${escapeHtml(error)}</p>` : ""}
    <form method="post" action="/settings/refresh">
      <button type="submit">REFRESH CALENDAR</button>
    </form>
    <p class="screen-copy">Agenda keeps your appointments close and simple.</p>
  </section>`;
  return renderDocument({ title: "Settings — Agenda", active: "settings", body });
}
