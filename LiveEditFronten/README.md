# LiveEdit frontend

The LiveEdit frontend is a React 19 application written in TypeScript and served
locally with Vite. It provides the landing page, editor, projects, workflow, and
account interfaces, and sends application API requests to the Flask backend in
[`LiveEditBackend`](../LiveEditBackend/).

## Prerequisites

- Node.js 18 or newer and npm.
- The backend running at `http://localhost:5000` for API-backed features.
- Logto application settings for sign-in. The local example file contains the
  development tenant values; use your own values when configuring another
  tenant.

## Setup

From the repository root:

```bash
cd LiveEditFronten
npm install
```

Copy the example environment file to `.env.local`:

```powershell
Copy-Item .env.local.example .env.local
```

On macOS or Linux, use `cp .env.local.example .env.local` instead.

Then start Vite:

```bash
npm run dev
```

Vite serves the frontend at `http://localhost:3000`. The local environment file
is read when Vite starts; restart the dev server after changing it.

### Environment variables

Copy `.env.local.example` to `.env.local` and configure these values:

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | Flask API base URL. Defaults to `http://localhost:5000` in development. `VITE_BACKEND_URL`, if set, takes precedence. |
| `VITE_LOGTO_ENDPOINT` | Logto tenant endpoint used by the frontend for sign-in. |
| `VITE_LOGTO_APP_ID` | Logto application ID for this frontend. Set it with the endpoint to enable the Logto provider. |
| `VITE_PAYSTACK_PUBLIC_KEY` | Public-key placeholder in the example environment file. The current frontend does not read this variable; do not put a Paystack secret key here. |

Values prefixed with `VITE_` are included in the browser bundle and must not
contain secrets. The frontend's API requests use Logto ID tokens; configure
matching Logto settings in the backend as described in the
[root full-stack README](../README.md).

## npm scripts

Run these commands from `LiveEditFronten/`:

| Script | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server on port 3000. |
| `npm run build` | Build the production frontend into `dist/`. |
| `npm run preview` | Serve the production build locally for preview. Run `npm run build` first. |
| `npm run e2e` | Run the Playwright browser smoke tests. Playwright Chromium must be installed with `npx playwright install chromium`. |

## Frontend structure

| Path | Contents |
| --- | --- |
| `components/` | Screens and reusable UI for the landing page, editor, projects, media, workflow, and account flows. |
| `services/` | Frontend API clients for the Flask backend and AI-related flows. |
| `hooks/` | Reusable React hooks, including subscription data access. |
| `context/` | Shared React state providers such as theme and toast state. |
| `utils/` | Shared utility functions. |
| `types.ts` | Shared frontend TypeScript data types. |
| `e2e/` | Playwright smoke tests and the test-only Logto mock. |

For the full-stack architecture, backend setup, configuration, and deployment
instructions, see the [root README](../README.md).
