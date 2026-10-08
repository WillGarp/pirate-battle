# Architecture

## Runtime boundaries

- React owns the menu, options, results, HUD, and accessible interface.
- `GameSimulation` owns mutable match state and advances in fixed 1/60-second steps. It has no React or PixiJS dependency.
- PixiJS renders the arena and simulation entities. React receives HUD snapshots periodically rather than on every frame.
- `GameScreen` maps keyboard, touch, visibility, and focus events to simulation input and lifecycle.

## Simulation

The simulation receives a cloned `GameConfig` and a seed. Fixed steps handle movement, spawning, AI, collisions, cooldowns, projectiles, score, and effects. Directional input is normalized so diagonal movement does not increase speed. Arena edges and island circles are checked before movement is applied.

The first two enemy spawns guarantee one Chaser and one Shooter. Later spawns use a seeded PRNG and the configured distribution. Player projectiles award a point only when an enemy is destroyed. Chaser contact damages the player and removes the Chaser without awarding a point.

## Persistence and APIs

Options and the last result use versioned local-storage keys. A completed match is saved locally before the network mutation starts. The outbox retains failed submissions for retry and tracks registered match IDs to avoid duplicate submission.

Axios handles HTTP calls. TanStack Query owns query caching, retries, pagination keys, cancellation signals, and invalidation. Ranking queries include the complete game configuration in their cache key; history queries include player and page.

MSW provides the ranking and history API in development and production builds. Its fixtures and mock records are persisted locally. Scenarios include success, empty data, latency, reordered page delays, HTTP errors, connection failure, and timeout after persistence. Repeated POSTs return the existing record by match ID.

## Resource lifecycle

Pixi initialization is asynchronous. The effect tracks whether `Application.init()` completed so React StrictMode cleanup cannot destroy a half-initialized application. A late initialization after unmount is destroyed immediately. Ticker, keyboard, focus, visibility, touch, and custom pause listeners are removed during cleanup; simulation arrays are disposed.

## Validation and limitations

The Playwright suite covers options persistence, pause and abandon, movement and firing, broadside count/direction, ranking/history pagination and failure states, idempotent retry, mobile controls, and visual baselines for menu, paused arena, and result.

The referenced art/audio pack was absent from this checkout, so the arena uses PixiJS Graphics. The API is mocked rather than connected to a production backend. Performance targets (FPS, p95 frame time, and memory over repeated sessions) have not been measured, and no public deployment is configured.
