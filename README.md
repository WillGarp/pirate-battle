# Pirate Battle

Pirate Battle is a browser-based naval shooter built with React, TypeScript, and PixiJS. It includes a single-player game loop, configurable match options, local result storage, and mock ranking and match-history APIs.

## Requirements

- Node.js 22.12 or newer
- npm

## Getting started

```sh
npm ci
npm run dev
```

MSW is enabled by default and serves the mock ranking and match-history APIs. Set `VITE_ENABLE_MOCKS=false` only when intentionally testing without the mock service worker.

## Scripts

```sh
npm run dev          # Start the Vite development server
npm run build        # Type-check and create a production build
npm run preview      # Serve the production build locally
npm run lint         # Run ESLint
npm run typecheck    # Run TypeScript checks
npm run test:e2e     # Run Playwright end-to-end tests
```

Install the Playwright Chromium browser once if needed:

```sh
npx playwright install chromium
```

The Playwright HTML report is written to `playwright-report/`; failure traces and test artifacts are written to `test-results/`.

## Controls

- `W`, `A`, `S`, `D` or arrow keys: move in eight directions
- `Space`: fire the bow cannon
- `J`: fire the port (left) broadside
- `K`: fire the starboard (right) broadside
- `Escape`: pause or resume
- Touch devices: directional pad and firing buttons

Movement is normalized diagonally. Each broadside fires three parallel projectiles; the port and starboard weapons have independent cooldowns.

## Options and match records

Options persist in local storage. Match duration can be set from 60 to 180 seconds, and enemy spawn interval from 1 to 10 seconds. Each match uses a snapshot of the selected configuration.

Completed matches are saved locally before submission. Failed submissions remain in a retryable outbox. The mock API uses match IDs for idempotent registration.

The menu's **Network scenario** selector can exercise success, empty responses, latency, reordered page delays, HTTP failures, connection failure, and timeout after server-side persistence. Ranking and history are paginated; ranking compares matches played with the same complete configuration.

## Project structure

- `src/game/core`: deterministic, fixed-step game simulation
- `src/game/rendering`: PixiJS arena and entity rendering
- `src/screens`: game screen and browser input lifecycle
- `src/api`, `src/queries`, `src/mocks`: typed API, TanStack Query, and MSW
- `src/storage`: local options, results, and pending-match outbox
- `tests/e2e`: desktop/mobile Playwright flows and visual baselines

See [ARCHITECTURE.md](./ARCHITECTURE.md) for design details and known limitations.

## Known limitations

- The referenced art and audio pack was not present in this checkout; current visuals use PixiJS Graphics.
- Ranking and history are simulated by MSW in the browser, not backed by a production service.
- Performance targets have not been validated with a recorded FPS, p95 frame-time, or memory profile.
- A public deployment URL has not been configured.
