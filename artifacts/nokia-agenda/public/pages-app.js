(() => {
  const apiBase = String(window.NOKIA_AGENDA_API_BASE || "").replace(/\/+$/, "");
  const main = document.getElementById("main-content");
  const dateLabel = document.getElementById("date-label");
  const state = {
    data: null,
    loadError: "",
    notice: "",
    refreshing: false,
  };

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  const eventHref = (id) => `#event/${encodeURIComponent(String(id ?? ""))}`;

  function currentRoute() {
    const route = window.location.hash.slice(1) || "today";
    if (route.startsWith("event/")) {
      return { key: "event", id: decodeURIComponent(route.slice("event/".length)) };
    }
    if (["today", "tomorrow", "upcoming", "settings"].includes(route)) {
      return { key: route, id: "" };
    }
    return { key: "today", id: "" };
  }

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

  function renderHome(data) {
    const next = data.nextEvent
      ? `<a class="next-event" href="${escapeHtml(eventHref(data.nextEvent.id))}">
          <span class="section-label">NEXT APPOINTMENT</span>
          <strong>${escapeHtml(data.nextEvent.allDay ? "ALL DAY" : data.nextEvent.startLabel || "TIME TBD")}</strong>
          <span>${escapeHtml(data.nextEvent.title || "Untitled event")}</span>
        </a>`
      : `<div class="next-event next-empty"><span class="section-label">NEXT APPOINTMENT</span><strong>NONE</strong><span>You are clear.</span></div>`;
    return `<section class="screen screen-home" aria-labelledby="screen-title">
      <h1 id="screen-title">TODAY</h1>
      ${next}
      <section class="event-section" aria-label="Today's events">
        <h2>ON THE AGENDA</h2>
        ${eventList(data.todayEvents, "NO EVENTS TODAY", "Your day is open.")}
      </section>
    </section>`;
  }

  function renderEventList(title, events) {
    return `<section class="screen" aria-labelledby="screen-title">
      <h1 id="screen-title">${escapeHtml(title)}</h1>
      ${eventList(events, "NO EVENTS", "There is nothing scheduled for this date.")}
    </section>`;
  }

  function renderUpcoming(groups) {
    const populated = Array.isArray(groups)
      ? groups.filter((group) => Array.isArray(group.events) && group.events.length)
      : [];
    const content = populated.length
      ? populated.map((group) => `<section class="event-section">
          <h2>${escapeHtml(group.dateLabel || "DATE NOT SET")}</h2>
          ${eventList(group.events)}
        </section>`).join("")
      : `<div class="empty-state"><strong>NOTHING UPCOMING</strong><p>Your calendar is clear.</p></div>`;
    return `<section class="screen" aria-labelledby="screen-title">
      <h1 id="screen-title">UPCOMING</h1>
      ${content}
    </section>`;
  }

  function renderEventDetail(event) {
    if (!event) {
      return `<section class="screen" aria-labelledby="screen-title">
        <h1 id="screen-title">EVENT NOT FOUND</h1>
        <p class="notice">This appointment is no longer available.</p>
        <p><a class="back-link" href="#today">BACK TO TODAY</a></p>
      </section>`;
    }
    const timing = event.allDay
      ? "ALL DAY"
      : [event.startLabel, event.endLabel].filter(Boolean).join("–");
    return `<article class="screen event-detail">
      <h1>${escapeHtml(event.title || "Untitled event")}</h1>
      <dl class="event-facts">
        <div><dt>DATE</dt><dd>${escapeHtml(event.dateLabel || "DATE NOT SET")}</dd></div>
        <div><dt>TIME</dt><dd>${escapeHtml(timing || "TIME NOT SET")}</dd></div>
        ${event.location ? `<div><dt>PLACE</dt><dd>${escapeHtml(event.location)}</dd></div>` : ""}
      </dl>
      ${event.description ? `<section class="description"><h2>DETAILS</h2><p>${escapeHtml(event.description)}</p></section>` : ""}
      <p><a class="back-link" href="#today">BACK TO AGENDA</a></p>
    </article>`;
  }

  function renderSettings(data) {
    const message = state.notice || data.errorMessage || "";
    return `<section class="screen" aria-labelledby="screen-title">
      <h1 id="screen-title">SETTINGS</h1>
      <dl class="settings-list">
        <div><dt>CALENDAR</dt><dd>${escapeHtml(data.status || "Not connected")}</dd></div>
        <div><dt>LAST UPDATED</dt><dd>${escapeHtml(data.refreshedAt || "Not yet")}</dd></div>
      </dl>
      ${message ? `<p class="notice${data.ready && !state.notice ? " notice-error" : ""}" role="status">${escapeHtml(message)}</p>` : ""}
      <form data-refresh-form>
        <button type="submit"${state.refreshing ? " disabled" : ""}>${state.refreshing ? "REFRESHING…" : "REFRESH CALENDAR"}</button>
      </form>
      <p class="screen-copy">Agenda keeps your appointments close and simple.</p>
    </section>`;
  }

  function renderUnavailable(data) {
    return `<section class="screen" aria-labelledby="screen-title">
      <h1 id="screen-title">CALENDAR UNAVAILABLE</h1>
      <p class="notice notice-error">${escapeHtml(data.errorMessage || "Calendar unavailable. Try again later.")}</p>
      <p><a href="#settings">OPEN SETTINGS</a></p>
    </section>`;
  }

  function render() {
    const route = currentRoute();
    const data = state.data;
    document.querySelectorAll("[data-nav]").forEach((link) => {
      const active = link.dataset.nav === route.key;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });

    if (state.loadError) {
      dateLabel.textContent = "";
      main.innerHTML = `<section class="screen" aria-labelledby="screen-title">
        <h1 id="screen-title">AGENDA UNAVAILABLE</h1>
        <p class="notice notice-error">${escapeHtml(state.loadError)}</p>
        <p><button type="button" data-retry>TRY AGAIN</button></p>
      </section>`;
      return;
    }
    if (!data) return;

    const selectedEvent = route.key === "event"
      ? data.events.find((event) => event.id === route.id)
      : null;
    dateLabel.textContent = selectedEvent?.dateLabel ||
      (route.key === "tomorrow" ? data.tomorrowLabel : data.todayLabel);
    if (!data.ready && route.key !== "settings") {
      main.innerHTML = renderUnavailable(data);
      return;
    }

    switch (route.key) {
      case "tomorrow":
        main.innerHTML = renderEventList("TOMORROW", data.tomorrowEvents);
        break;
      case "upcoming":
        main.innerHTML = renderUpcoming(data.upcomingGroups);
        break;
      case "settings":
        main.innerHTML = renderSettings(data);
        break;
      case "event":
        main.innerHTML = renderEventDetail(selectedEvent);
        break;
      default:
        main.innerHTML = renderHome(data);
    }
  }

  async function loadAgenda() {
    state.loadError = "";
    try {
      const response = await fetch(`${apiBase}/agenda-api/agenda`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Agenda request failed (${response.status}).`);
      state.data = await response.json();
      state.notice = "";
    } catch {
      state.loadError = "Could not connect to the calendar service. Check the connection and try again.";
    }
    render();
  }

  document.addEventListener("hashchange", render);
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-retry]")) void loadAgenda();
  });
  document.addEventListener("submit", async (event) => {
    if (!event.target.matches("[data-refresh-form]")) return;
    event.preventDefault();
    state.refreshing = true;
    state.notice = "";
    render();
    try {
      const response = await fetch(`${apiBase}/agenda-api/agenda/refresh`, {
        method: "POST",
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) {
        state.notice = result.errorMessage || "Calendar refresh failed.";
      } else {
        state.data = result;
        state.notice = result.errorMessage || "Calendar updated.";
      }
    } catch {
      state.notice = "Could not refresh the calendar. Try again later.";
    } finally {
      state.refreshing = false;
      render();
    }
  });

  void loadAgenda();
})();
