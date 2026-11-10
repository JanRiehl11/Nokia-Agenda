# Nokia Agenda

A private, read-only, server-rendered calendar for the Nokia 110 4G feature phone.

## Run & Operate

- `pnpm --filter @workspace/nokia-agenda run dev` — run the calendar web app
- `pnpm --filter @workspace/nokia-agenda run typecheck` — check the app's server files
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- Required Replit Secrets: `ICS_URL`, `AGENDA_PIN`, `SESSION_SECRET`
- The app reads `PORT` from its Replit workflow/deployment.

## Stack

- pnpm workspaces and Node.js 24
- Nokia Agenda: Express, `node-ical`, `cookie-session`, server-rendered HTML, and lightweight CSS
- The Nokia Agenda does not use React, a browser-side app framework, or a database.
- The shared API server and database libraries are separate from the calendar app.

## Where things live

- `artifacts/nokia-agenda/server/index.js` — protected Express routes and session handling
- `artifacts/nokia-agenda/server/calendar.js` — iCal fetching, parsing, recurring-event expansion, and server cache
- `artifacts/nokia-agenda/server/views.js` — escaped server-rendered pages
- `artifacts/nokia-agenda/public/agenda.css` — feature-phone responsive styles
- `artifacts/nokia-agenda/README.md` — setup and run instructions

## Architecture decisions

- Calendar pages are rendered on the server to keep client payload and memory use low.
- The app reads a private iCal feed directly; the feed URL and access PIN must remain in Replit Secrets.
- A successful calendar refresh is cached in memory for 15 minutes; refresh failures preserve the last successful in-process cache.
- Only the health endpoint is public; calendar pages require a PIN-backed signed session cookie.

## Product

The app shows today's and tomorrow's appointments, a seven-day agenda, event details, and calendar connection status. It is strictly read-only.

## User preferences

- Target the Nokia 110 4G (2024), S30+, including a 160 × 120 display and physical navigation.
- Keep the UI black and white, lightweight, responsive, and free of animations, gradients, external fonts, and images.
- Do not create, edit, delete, or invite calendar events.

## Gotchas

- Without both `ICS_URL` and `AGENDA_PIN`, the app shows setup instructions and exposes no calendar data.
- Never put the private iCal URL in source, client HTML, logs, or chat.
- Replit Secrets changes may require restarting the web workflow before the app reads new values.

## Pointers

- See `artifacts/nokia-agenda/README.md` for setup details.
- See the `pnpm-workspace` skill for workspace structure and package details.
