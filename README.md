# Room Planner

**See how it fits before you move or buy it.**

A working local room planner with precise 2D editing, detailed 3D previews, per-piece and wall colours, three independent alternatives, purchase estimates, device saves and portable exports. The account API and synchronization are implemented and tested locally; deployment and real email delivery are deferred.

## Run locally

Use Node 24 and pnpm 10.28.2, as pinned in `package.json`.

```sh
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
```

Set a random `BETTER_AUTH_SECRET` of at least 32 characters in `.dev.vars`. Keep `EMAIL_PROVIDER` disabled in `wrangler.jsonc` for local-only use. Never add secrets to Vite environment variables or commit `.dev.vars`.

```sh
pnpm db:migrate
pnpm dev:api
```

In another terminal:

```sh
pnpm dev
```

Open [Room Planner](http://127.0.0.1:5173). The Worker API runs on port 8787; Vite proxies `/api` to it. Guest planning requires no account. Browser storage must be enabled. Use **Export → Restorable plan file** for an independent backup; clearing browser storage removes device copies.

## Verify

```sh
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
```

The browser tests use the running local servers. `pnpm check` runs formatting, ESLint, strict TypeScript, domain/persistence/sync/export tests, actual Workers/D1 integration tests, and a production build. Browser tests cover desktop and a 360 px touch viewport, all exports/import, colour persistence, independent alternatives, Trash, WebGL fallback, repeated renderer switches and automated accessibility checks. Screenshots are saved under `docs/screenshots`; failure traces remain in ignored `test-results`.

## Use the planner

1. Create a rectangular or L-shaped room; enter interior measurements, doors and windows. Choose a wall and offset for each opening, or tap its exact position on a wall. Metric and imperial input are supported.
2. Choose furniture, place it on the floor or use **Place in centre**, then edit precise dimensions/position. Dragging snaps to the 100 mm grid or nearby walls; toggles control snapping, and Alt temporarily bypasses it. Escape cancels a drag or placement.
3. Click a wall, opening, piece or the floor directly on the 2D plan to edit it. Right-click any part for quick actions, including adding doors, windows or furniture at that spot, editing, rotating, duplicating and removing elements. Drag an opening along its wall. Turn furniture using its round drag handle, the left/right 15° and 90° buttons, or R / Shift + R. Select a piece to change colour, material, status and price. **Finishes** sets the floor and individual wall colours. Both views read the same document.
4. Switch to **3D view** to orbit, zoom and inspect furniture. Wall cutaways reveal the interior. **Save this view as PNG** exports the current camera.
5. Duplicate alternatives and compare them. Each copy has independent furniture, openings, finishes and prices. Undo/redo remembers up to 100 committed commands.
6. Export a dimensioned PDF, clean floor-plan PNG, furniture CSV or restorable plan file. The plan file includes every alternative; import creates fresh identifiers.

Fit notes report bounds, collisions, door swings and nearby gaps. They do not certify a walking route. Colours are previews; dimensions are authoritative.

## Code organization

- `src/domain`: catalog, validated documents, geometry, units and finishes.
- `src/state` / `src/persistence`: commands, history, transactional device saves and local conflict recovery.
- `src/editor`: panels, numeric placement, comparison/export dialogs, separate Konva and Three renderers/materials.
- `src/export`: PDF, image, CSV and plan-file adapters.
- `src/auth` / `src/sync`: account context, persistent mutation queue, retry/recovery and selected guest uploads.
- `worker`: official Better Auth configuration/generated schema, email adapter and owner-scoped Hono API.
- `migrations`: one additive SQL history for auth and application tables.

The 30 generic furniture models and procedural textures are first-party geometry, labelled CC0 in the catalog. UI fonts are locally bundled under their package licenses. PDF exports embed Noto Sans; its SIL Open Font License is included at `public/fonts/OFL.txt`. The landing image is an actual exported room from the application.

## Accounts and later deployment

Local email delivery is disabled and the UI says so. Runtime auth tests use an injected sender for controlled test addresses, exercising the official OTP plugin without sending messages. Account caches are partitioned by user; guest rooms are copied only after explicit selection. Sign-out checks pending changes and offers plan-file downloads, explicit discard, or cancellation.

For deployment, create separate staging/production D1 databases, replace the placeholder local database ID and set a matching HTTPS `APP_ORIGIN`. Set a fresh secret via Wrangler, apply reviewed migrations, build Static Assets, and configure a verified sender. Use `EMAIL_PROVIDER=cloudflare` with the `EMAIL` binding, or `resend` with `RESEND_API_KEY`. The Cloudflare binding follows the [official Workers Email Sending API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/). No remote account or service has been configured by this build.

A daily Worker schedule removes server Trash older than 30 days. Before launch, verify domain delivery, HTTPS cookies, monitoring, D1 restore/rollback procedures and the physical mobile performance fixture. These external release gates are not substitutes for the local tests.

## Product and audit evidence

- [PRD.md](PRD.md): intended behavior and acceptance criteria.
- [SPEC.md](SPEC.md): architecture and contracts; its original documentation-only status was superseded by the build request.
- [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md): completed work, verification and remaining release gates.
- [docs/UI-AUDIT.md](docs/UI-AUDIT.md): Impeccable audit and corrective changes.

Canonical folder: `/Users/mac/Documents/projects/room-planner`.
