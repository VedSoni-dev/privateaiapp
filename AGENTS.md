# AGENTS.md

The primary architecture, command, and gotcha reference for this repo lives in
`CLAUDE.md` (root) and `README.md` — read those first. This file only adds
Cursor Cloud specific notes.

## Cursor Cloud specific instructions

This repo has three pieces: the **Expo app** (`src/`), the **Express backend**
(`server/`), and the **Cloudflare search Worker** (`worker/`). Standard commands
are in `package.json`, `worker/package.json`, and `CLAUDE.md` — don't duplicate
them, just use them. Notes below are the non-obvious bits for a headless Linux
cloud VM.

### What runs where (headless VM)

- **Dev tooling / CI parity** — all green here: `npx tsc --noEmit`, `npm run
  lint` (0 errors; ~19 pre-existing warnings are expected), `node --check
  server/index.js`, `npm test` (34 tests, the usage/entitlement/validation
  logic in `server/logic.js`). `worker/` has its own deps + `npx tsc --noEmit`.
- **Expo app** — `npx expo start --go` (Metro) runs, but there is no iOS
  simulator/device in the VM, so you can't render the UI here. To prove the app
  compiles, force a full bundle against Metro:
  `curl -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:8081/index.bundle?platform=ios&dev=true"`
  — a 200 with a multi-MB body means the whole app (incl. the lazily-`require()`d
  native modules) bundled cleanly for Expo Go.
- **Search Worker** — `cd worker && npx wrangler dev --port 8787 --ip 127.0.0.1`
  runs fully locally with NO secrets. `/health` returns `{"ok":true,"brave":false}`,
  and `POST /search` works via the DuckDuckGo fallback + `r.jina.ai` page reads,
  `wttr.in` weather, and the built-in datetime handler. Set `BRAVE_KEY`
  (`wrangler secret`, or a `.dev.vars`) only if you want the Brave path;
  it's optional for dev.

### The backend cannot run locally as-is

`server/index.js` exits immediately unless `PRIVATEMODE_API_KEY` is set, and it
spawns `/bin/privatemode-proxy`, a proprietary binary that only exists inside
the server Docker image (pulled from
`ghcr.io/edgelesssys/privatemode/privatemode-proxy` in `server/Dockerfile`). It
is a deploy-only service (Docker → Render; see `render.yaml`). For local work,
rely on `npm test` for its logic and `node --check` for syntax. To exercise the
live chat API, `npm run test:api` hits the deployed Render backend + Worker (URLs
hardcoded in `scripts/test-api.mjs`, overridable via `BACKEND_URL`/`WORKER_URL`);
the Render free tier sleeps, so the first call can cold-start for 20-30s.
