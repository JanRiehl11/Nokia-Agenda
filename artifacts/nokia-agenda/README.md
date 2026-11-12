# Nokia Agenda

A read-only calendar for the Nokia 110 4G. The app renders small HTML pages on the server and is designed to remain usable on a 160 × 120 feature-phone display.

## Configure Replit Secrets

Add these values in **Tools → Secrets**:

- `ICS_URL` — the private HTTPS iCal URL from Google Calendar. Keep it private; the app does not send it to the browser or include it in logs.

The agenda is publicly viewable, so anyone with the app link can see its events. The calendar is not shown until `ICS_URL` is configured. Do not put the private iCal URL in a form, source file, or chat message.

## Run

The Replit workflow starts the Express server with the platform-provided `PORT`.

For a local run, provide `PORT` and `ICS_URL` as environment variables, then run:

```sh
pnpm --filter @workspace/nokia-agenda run dev
```

## Calendar behavior

- The feed refreshes on startup and every 15 minutes. The Settings page also has a manual refresh button.
- The last successful calendar remains available if a later refresh fails.
- Recurring events, all-day events, cancelled events, and UTC times are handled server-side in `Europe/Amsterdam`.
- Calendar pages are public. The manual refresh action is limited to one request per minute.
- Calendar pages are read-only; there is no create, edit, delete, or invitation functionality.

## Routes

- `/` — agenda home, today's events, and the next appointment
- `/today`, `/tomorrow`, `/upcoming` — calendar lists
- `/event/:id` — read-only event details
- `/settings` — feed status and manual refresh
- `/login` — redirects to the agenda
- `/healthz` — health check
