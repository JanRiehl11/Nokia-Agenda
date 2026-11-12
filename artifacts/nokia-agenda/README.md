# Nokia Agenda

A public, read-only calendar for the Nokia 110 4G. The compact interface is designed to remain usable on a 160 × 120 feature-phone display. GitHub Pages hosts the static interface, while the Replit server keeps the private iCal feed URL and returns calendar data through a read-only API.

## Configure Replit Secrets

Add these values in **Tools → Secrets**:

- `ICS_URL` — the private HTTPS iCal URL from Google Calendar. Keep it private; the app does not send it to the browser or include it in logs.

The agenda is publicly viewable, so anyone with the app link can see its events. The calendar is not shown until `ICS_URL` is configured. Do not put the private iCal URL in GitHub, a form, source file, or chat message.

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
- The static Pages interface reads calendar data from the Replit API; it never receives the private iCal URL.

## Routes

- `/` — agenda home, today's events, and the next appointment
- `/today`, `/tomorrow`, `/upcoming` — calendar lists
- `/event/:id` — read-only event details
- `/settings` — feed status and manual refresh
- `/login` — redirects to the agenda
- `/healthz` — health check
- `/agenda-api/agenda` — public JSON data for the visible agenda
- `/agenda-api/agenda/refresh` — public manual refresh, limited to one request per minute

## GitHub Pages

The repository includes a GitHub Actions workflow that publishes `artifacts/nokia-agenda/public` whenever that folder changes on `main`.

1. In the GitHub repository, open **Settings → Pages** and set the source to **GitHub Actions**.
2. Push or sync this project to the repository's `main` branch. The workflow will deploy the static site.
3. Publish the updated Replit backend so `/agenda-api/agenda` is available at the configured Replit app URL.

The expected Pages address for this repository is `https://janriehl11.github.io/Nokia-Agenda/`. The Pages API origin is allowed by default. If you use a custom domain, set `AGENDA_ALLOWED_ORIGINS` on the Replit server to that site's origin (for example, `https://agenda.example.com`).
