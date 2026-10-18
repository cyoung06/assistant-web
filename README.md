# assistant-web

Web client for the personal assistant: calendar (week/month), item list, item editor, quick add.
React + TypeScript (Vite), TanStack Query, FullCalendar 6, plain CSS Modules. Installable as a web app later (PWA).

## Run locally

Start the API first (`./gradlew bootTestRun` in `../api`), then:

```sh
npm install
npm run dev        # http://localhost:5173, proxies /api to :8080
```

## Scripts

| | |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Typecheck and production build into `dist/` |
| `npm test` | Unit tests (calendar ↔ item mapping), run in Asia/Seoul |
| `npm run api:types` | Regenerate `src/api/schema.d.ts` from `../api/openapi.json` |

## Sign-in

Set `VITE_GOOGLE_CLIENT_ID` (see `.env.example`) to require Google sign-in; the ID token is sent to the
API as a bearer token. Without it, no token is sent, which matches the API's local dev mode.

## Layout

- `src/api`: generated types, fetch client, React Query hooks
- `src/lib`: date helpers and the calendar mapping (pure, tested)
- `src/components`: quick add, item panel/form, tag picker and manager
- `src/pages`: calendar and items pages
