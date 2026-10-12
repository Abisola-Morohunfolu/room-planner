# Room Planner

**See how it fits before you move or buy it.**

A device-first room planner with precise 2D editing, detailed 3D previews, per-piece and wall colours, three independent alternatives, purchase estimates, device saves, portable exports and optional hosted snapshot links. Accounts and cloud synchronization are deferred to Phase 2; their implementation is retained outside the Phase 1 frontend bundle.

## Run locally

Use Node 24 and pnpm 10.28.2, as pinned in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open [Room Planner](http://127.0.0.1:5173). Phase 1 needs no Worker, database migration, auth secret, or email sender. It makes no account or project API requests. Browser storage must be enabled. Use **Export → Restorable plan file** or **Plan file** in Your rooms for an independent backup or to transfer a room between devices; clearing browser storage removes device copies. Existing device plans use the same IndexedDB database and partition.

For a production preview, run `pnpm build` followed by `pnpm preview`. Deploy the `dist` directory to a static host with SPA fallback to `index.html` for `/projects`, `/plan/*` and `/share/*`. A static-only host supports device planning but cannot create or retrieve hosted snapshots without the same-origin API described below. Browser-only describes processing and storage; a fresh load still needs the hosted assets. Offline reload caching is not implemented.

## Verify

```sh
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
```

The browser tests start Vite automatically or reuse an existing Vite server; no API server is needed. Set `PLAYWRIGHT_BASE_URL` to test a separately hosted build. `pnpm check` runs formatting, ESLint, strict TypeScript, domain/persistence/sync/export unit tests, and a production build. Browser tests cover desktop and a 360 px touch viewport, operation with API requests blocked, all exports/import, colour persistence, independent alternatives, Trash, WebGL fallback, repeated renderer switches and automated accessibility checks. Screenshots are saved under `docs/screenshots`; failure traces remain in ignored `test-results`. `pnpm check:cloud` additionally runs sharing and retained Phase 2 Workers/D1 integration tests.

## Use the planner

1. Create a rectangular or L-shaped room; enter interior measurements, doors and windows. Choose a wall and offset for each opening, or tap its exact position on a wall. Metric and imperial input are supported.
2. Choose furniture, place it on the floor or use **Place in centre**, then edit precise dimensions/position. Dragging snaps to the 100 mm grid or nearby walls; toggles control snapping, and Alt temporarily bypasses it. Escape cancels a drag or placement.
3. Click a wall, opening, piece or the floor directly on the 2D plan to edit it. Right-click any part for quick actions, including adding doors, windows or furniture at that spot, editing, rotating, duplicating and removing elements. Drag an opening along its wall. Turn furniture using its round drag handle, the left/right 15° and 90° buttons, or R / Shift + R. Select a piece to change colour, material, status and price. **Finishes** sets the floor and individual wall colours. Both views read the same document.
   Place smaller items on consoles and tables by dropping them onto a fitting surface or choosing **Place on** in the item inspector. Stacked items follow their support when it moves or turns. Choose **Floor** to unstack, or set **Height above floor** for a custom elevation. Fit notes account for vertical separation and the couch’s open corner.
4. Switch to **3D view** to orbit, zoom and inspect furniture. Wall cutaways reveal the interior. **Save this view as PNG** exports the current camera.
5. Duplicate alternatives and compare them. Each copy has independent furniture, openings, finishes and prices. Undo/redo remembers up to 100 committed commands.
6. Export a dimensioned PDF, clean floor-plan PNG, furniture CSV or restorable plan file. The plan file includes every alternative; import creates fresh identifiers.

Fit notes report bounds, collisions, door swings and nearby gaps. They do not certify a walking route. Colours are previews; dimensions are authoritative.

## Code organization

- `src/domain`: catalog, validated documents, geometry, units and finishes.
- `src/state` / `src/persistence`: commands, history, transactional device saves and local conflict recovery.
- `src/editor`: panels, numeric placement, comparison/export dialogs, separate Konva and Three renderers/materials.
- `src/export`: PDF, image, CSV and plan-file adapters.
- `src/auth` / `src/sync`: device defaults plus deferred Phase 2 account providers, persistent mutation queue, retry/recovery and selected guest uploads.
- `src/sharing`: sharing dialog, API contracts, device management records and read-only inspection.
- `worker`: public snapshot API/storage boundary plus gated Phase 2 auth and owner-scoped project APIs.
- `migrations`: additive SQLite/D1 migrations for auth, projects and shared snapshots.

The 52 generic furniture and appliance models and procedural textures are first-party geometry, labelled CC0 in the catalog. The catalog includes left- and right-chaise L-shaped couches, TV consoles, televisions, kitchen and laundry appliances, and glass coffee, side and dining tables. Glass and metal finishes can be edited and are saved with the plan. UI fonts are locally bundled under their package licenses. PDF exports embed Noto Sans; its SIL Open Font License is included at `public/fonts/OFL.txt`. The landing image is an actual exported room from the application.

## Hosted snapshot sharing

Choose **Share** beside Export or on a room card, then **Create link**. No account is needed. Each immutable snapshot includes all alternatives, furniture, stacking relationships, finishes, dimensions, prices, units and currency, including committed edits still waiting for device autosave. Later edits do not change an existing link. New links create new snapshots and expire 30 days after server creation. Creation is attempted once with no automatic retries; a lost response can leave a snapshot that expires normally.

Recipients open `/share/:shareId`, inspect the 2D plan or lazy-loaded 3D view, switch alternatives and inspect details. Viewing does not save a device room or start autosave/sync. **Save a copy** creates an independent editable guest/device room, remaps identifiers and stacking relationships, and navigates only after IndexedDB confirms the save.

**Shared links** in Your rooms lists this browser’s management records, including links for rooms in Trash or permanently removed rooms. **Stop sharing** requires the secret saved on the creating device and reports success after server confirmation. Room deletion does not revoke links. Clearing browser storage loses management access; links still expire normally. Revocation prevents future retrieval, but cannot remove copies already downloaded or saved. If creation succeeds but local management storage fails, the dialog shows that explicitly and lets you retry saving credentials or stop sharing while it remains open. The public URL contains no management secret. Clipboard failure leaves a selectable URL.

To run hosted sharing locally (no account secret or email sender required):

```sh
pnpm build
pnpm db:migrate
pnpm dev:api
# In another terminal:
pnpm dev
```

Vite proxies `/api` to `http://127.0.0.1:8787`; open the app at `http://127.0.0.1:5173`, matching the configured `APP_ORIGIN`. Device planning continues if that API is down. Local links refer to your local computer and are not publicly hosted. The separate sharing suite starts Vite, the Worker and migrations automatically, and uses `.wrangler/sharing-tests` so ordinary local D1 data is preserved:

```sh
pnpm check:cloud
pnpm test:e2e
pnpm test:sharing
```

The sharing suite covers separate creator/recipient contexts, immutable alternatives, read-only pointer/keyboard/context-menu guards, 2D/3D and WebGL fallback, copies/edit/reload, clipboard fallback, upload/offline/storage/revocation failures and route transitions. Runtime tests cover unauthenticated creation/retrieval, tokens, expiry, bounded validation, cleanup, origin rejection, the cloud gate and throttling. The migration `migrations/0001_short_lilandra.sql` adds only `shared_snapshots` and its expiry index. The backend storage module isolates D1 SQL from API/viewer contracts.

Deploy sharing as a same-origin Worker + Static Assets application. `/api/*` and `/share/*` run the Worker first; shared page responses set `no-store`, `noindex, nofollow` and `no-referrer`, and API responses use `no-store`. The viewer also applies robots/referrer metadata on SPA navigation. The Worker validates `Origin` on mutations, uses cryptographic public IDs and management tokens, stores only SHA-256 token hashes, and compares fixed-size digests in constant time. There is no public list or snapshot update endpoint. Anonymous creation uses the [Workers rate-limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) configured for 10 requests/minute/IP (per Cloudflare location; it is not an exact global quota). A 429 response includes `Retry-After: 60`. Expired snapshots are unavailable immediately; the daily scheduled handler deletes at most 100 expired rows per run through the indexed expiry column. Monitor the backlog and increase cleanup frequency/batch budget if volume requires it.

No external deployment was performed. The checked-in D1 ID remains a local placeholder. Before production, create separate real staging/production D1 bindings, review/apply the additive migration, set the matching HTTPS `APP_ORIGIN`, retain `ENABLE_CLOUD=false`, choose a rate-limit namespace unique within the account, and build Static Assets. Staging must pass create/view/copy/revoke smoke tests and verify shared-page headers. Existing structured error logs and traces are enabled; sharing logs emit creation/revocation/cleanup events without documents, URLs or management tokens. Monitor 429/503 responses, creation/API failures and cleanup/backlog before promoting. Hosted sharing on a static-only host is unavailable until a same-origin backend is configured.

## Phase 2: accounts and cloud backup

The Phase 1 entry point does not mount the cloud account/sync providers or load the sign-in page. Account and online-backup controls are removed; old `/sign-in` links redirect to Your rooms. The Worker, schema, migrations, auth client, and sync implementation remain available for Phase 2. Previously cached account data is preserved in its separate partition and is not exposed as device-only data.

To work on the deferred API, copy `.dev.vars.example` to `.dev.vars`, set a random `BETTER_AUTH_SECRET` of at least 32 characters, then run `pnpm db:migrate` and `pnpm dev:api`. Reconnect `AccountProvider` from `src/auth/CloudAccountProvider.tsx` and `SyncProvider` from `src/sync/CloudSyncProvider.tsx`, the sign-in route and account controls when implementing Phase 2. Set `ENABLE_CLOUD=true` explicitly; the default sharing deployment disables account/config/project cloud endpoints. The Vite `/api` proxy is already configured. Never add secrets to Vite environment variables or commit `.dev.vars`.

Runtime auth tests use an injected sender for controlled test addresses without sending messages. Account caches are partitioned by user; device rooms are copied only after explicit selection. The retained sign-out flow checks pending changes and offers plan-file downloads, explicit discard, or cancellation.

For Phase 2 deployment, create separate staging/production D1 databases, replace the placeholder local database ID and set a matching HTTPS `APP_ORIGIN`. Set a fresh secret via Wrangler, apply reviewed migrations, build Static Assets, and configure a verified sender. Use `EMAIL_PROVIDER=cloudflare` with the `EMAIL` binding, or `resend` with `RESEND_API_KEY`. The Cloudflare binding follows the [official Workers Email Sending API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/). No remote account or service has been configured by this build.

A daily Worker schedule removes server Trash older than 30 days in Phase 2; Phase 1 cleans device Trash locally. Before enabling accounts, verify domain delivery, HTTPS cookies, monitoring and D1 restore/rollback procedures. Physical mobile performance verification applies to both phases.

## Product and audit evidence

- [PRD.md](PRD.md): intended behavior and acceptance criteria.
- [SPEC.md](SPEC.md): architecture and contracts; its original documentation-only status was superseded by the build request.
- [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md): completed work, verification and remaining release gates.
- [docs/UI-AUDIT.md](docs/UI-AUDIT.md): Impeccable audit and corrective changes.

Canonical folder: `/Users/mac/Documents/projects/room-planner`.
