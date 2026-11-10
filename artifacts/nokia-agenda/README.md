# Nokia Agenda

A read-only calendar for the Nokia 110 4G. The app renders small HTML pages on the server and is designed to remain usable on a 160 × 120 feature-phone display.

## Configure Replit Secrets

Add these values in **Tools → Secrets**:

- `ICS_URL` — the private HTTPS iCal URL from Google Calendar. Keep it private; the app does not send it to the browser or include it in logs.
- `AGENDA_PIN` — the access PIN used to open the calendar.
- `SESSION_SECRET` — the app uses this to sign secure session cookies. A `SESSION_SECRET` is already available in this project.

The calendar is not shown until `ICS_URL` and `AGENDA_PIN` are configured. Do not put the private iCal URL in a form, source file, or chat message.

## Run

The Replit workflow starts the Express server with the platform-provided `PORT`.

For a local run, provide `PORT`, `SESSION_SECRET`, `ICS_URL`, and `AGENDA_PIN` as environment variables, then run:

```sh
pnpm --filter @workspace/nokia-agenda run dev
```

## Calendar behavior

- The feed refreshes on startup and every 15 minutes. The Settings page also has a manual refresh button.
- The last successful calendar remains available if a later refresh fails.
- Recurring events, all-day events, cancelled events, and UTC times are handled server-side in `Europe/Amsterdam`.
- All calendar pages and the refresh action require the PIN session. `/healthz` is the only public application endpoint and returns process health only.
- Calendar pages are read-only; there is no create, edit, delete, or invitation functionality.

## Routes

- `/` — agenda home, today's events, and the next appointment
- `/today`, `/tomorrow`, `/upcoming` — calendar lists
- `/event/:id` — read-only event details
- `/settings` — feed status and manual refresh
- `/healthz` — health check
