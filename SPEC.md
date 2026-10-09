# Room Planner — Technical Specification

Version: 1.0 · 8 October 2026 · Status: design specification, not implemented

Phase 1 scope update · 9 October 2026: the current frontend ships as a static browser-only app using the existing `guest` IndexedDB partition. Authentication/session requests, cloud sync and account controls are disconnected from the app entry point; `/sign-in` redirects to `/projects`. Vite needs no API proxy. The Worker, D1, auth and sync contracts below are retained for Phase 2. Device persistence, local conflict recovery, Trash and exports/import remain in scope; offline asset caching is not implemented.

## 1. Architecture decisions

Build a client-rendered React/TypeScript application with Vite. Geometry and rendering remain in the browser. A same-origin Cloudflare Worker provides authentication and project APIs. Cloudflare D1 stores accounts, sessions, and project snapshots.

| Concern           | Choice                                                  | Responsibility                                                  |
| ----------------- | ------------------------------------------------------- | --------------------------------------------------------------- |
| UI                | React, TypeScript, Vite, CSS custom properties          | Responsive app shell and accessible DOM controls                |
| Floor plan        | Konva through react-konva                               | 2D room, openings, furniture, selection, and guides             |
| 3D                | Three.js, React Three Fiber, Drei                       | Lazy-loaded room/furniture scene and orbit camera               |
| State             | Zustand + explicit command history                      | Canonical document, selection, and editor modes                 |
| Local persistence | IndexedDB through Dexie                                 | Guest/account partitions, snapshots, and pending cloud saves    |
| Validation        | Shared Zod schemas and pure geometry functions          | Browser/API/import validation                                   |
| Hosting           | Cloudflare Workers Static Assets                        | Vite output, catalog, and versioned first-party models/textures |
| API               | Cloudflare Worker with Hono                             | Same-origin /api routing and ownership enforcement              |
| Database          | Cloudflare D1 with Drizzle ORM                          | Auth tables and bounded JSON project documents                  |
| Authentication    | Better Auth, official Drizzle adapter, Email OTP plugin | Email code sign-in and database-backed sessions                 |
| Email             | Cloudflare Email Sending binding                        | Transactional sign-in codes from a verified sender domain       |
| Tests             | Vitest, Workers runtime integration tests, Playwright   | Geometry, persistence/API, and user workflows                   |

Workers Static Assets supports hosting assets alongside Worker logic. Use Worker-first routing for `/api/*`; API errors must never fall through to SPA HTML. See [Cloudflare Static Assets](https://developers.cloudflare.com/workers/static-assets/).

D1 is SQLite-based. Use Drizzle's D1 driver with the official Better Auth Drizzle adapter configured for SQLite. Generate the auth schema from the pinned Better Auth configuration and check it into migrations. Do not add a third-party Cloudflare auth wrapper. See [Drizzle D1](https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1) and [Better Auth adapter](https://better-auth.com/docs/adapters/drizzle).

No Supabase or PostgreSQL dependency remains. Authorization is implemented in the Worker. No R2, KV, Durable Objects, or queues are needed for the agreed v1: first-party assets are static, exports are produced locally, and saves use revision checks. Revisit R2 if uploaded assets or server-stored exports are introduced.

Choose stable mutually compatible package versions during scaffolding, pin them and the lockfile, and record the Workers compatibility date. Match React and React Three Fiber majors using the [official compatibility guidance](https://r3f.docs.pmnd.rs/getting-started/introduction). Run the feasibility gate before depending on an adapter/runtime combination.

## 2. App surfaces and state

Routes: `/` landing; `/projects` device/cloud project list and Trash; `/plan/:projectId` editor; `/sign-in` email-code flow with a validated local return path. Account controls live in a header menu.

The editor has Room, Furniture, Finishes, and List panels; a Floor plan / 3D switch; Undo/Redo; alternatives selector/compare; and export. Desktop uses a sidebar; mobile uses a bottom sheet. The item list and numeric inspector provide DOM-based alternatives to canvas interactions.

Separate persistent document state from selection, camera, panel, hover, and drag-preview state. Each edit command validates a candidate document, applies once on completion, marks it dirty, and records an inverse or previous snapshot. Retain 100 history entries per open project; do not persist history across reload. A new edit clears redo. Switching views or alternatives does not clear history; each history entry identifies its target alternative.

During a drag, render transient transforms without repeatedly saving. Commit on pointer-up; cancel on Escape or pointer cancellation. Commands include item transforms/properties, room changes, opening changes, finishes, and alternative management. Numeric controls commit on Enter or blur only when valid. Camera operations are not document commands.

On phone: one finger moves an already-selected item, otherwise pans empty space; two fingers pan/zoom; selection handles rotate with a numeric alternative. Catalog selection enters explicit tap-to-place mode. In 3D, gestures control the camera, tapping selects, and the inspector edits properties. No furniture drag in 3D.

## 3. Canonical document and units

Define these shared contracts before renderer-specific structures:

| Type                 | Required content                                                                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ProjectDocument      | schemaVersion, projectId, name, displayUnits, currency, activeLayoutId, layouts                                                                            |
| Layout               | id, name, room, openings, items, clearanceTargetMm or null                                                                                                 |
| Room                 | rectangle/L-shape parameters, ceilingHeightMm, stable wall identifiers, per-wall colours, floor finish                                                     |
| Opening              | id, type, wallId, offsetMm, widthMm, heightMm; sillHeightMm for windows; hinge and swing for doors                                                         |
| FurnitureItem        | id, catalogId or custom shape, catalogVersion, name, widthMm, depthMm, heightMm, xMm, yMm, rotationDeg, colour, finishId, owned/to-buy, priceMinor or null |
| CatalogItem          | stable id/version, category, display name, default dimensions, footprint type, model reference, permitted finish slots, license/source metadata            |
| CloudProjectEnvelope | projectId, revision, updatedAt, deletedAt, document                                                                                                        |

Identifiers are UUIDs. Server ownership, revisions, deletion state, and timestamps are not trusted from imported document metadata. Snapshot units are millimetres; store finite values to 0.1 mm precision, with display rounding only at the UI boundary. Angles normalize to [0, 360). Currency values use integer minor units and the selected currency's fraction digits.

Use a local 2D origin at the bounding box's upper-left interior corner: +x right, +y down. Map into 3D as X=x/1000, Y=height/1000, Z=y/1000. Item position is its footprint centre. Clockwise floor-plan rotation maps to negative rotation around the 3D Y axis. All renderer conversions live in tested adapters.

Bounds: room extents 500–50,000 mm; ceiling 1,500–10,000 mm; positive item dimensions up to 20,000 mm; at most 200 items, 20 openings, and three layouts. Names are trimmed, 1–100 characters. No arbitrary executable content, external model URLs, embedded binary assets, or HTML in plan files. Bound serialized project JSON to 1 MiB, leaving margin below D1's current 2 MB row/string limit. See [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

## 4. Geometry and measurement behavior

Rectangle parameters are interior width/depth. L-shapes use outer width/depth and an upper-right rectangular cutout with independently editable width/depth; offer mirror/quarter-turn controls as explicit room edits. Require each remaining leg to be at least 500 mm. Generate a simple ordered polygon and stable semantic wall IDs from the template; do not save renderer mesh coordinates as authoritative geometry.

Wall-bound openings use an offset measured along their wall from its canonical start. Doors start at floor level and have an inward/outward 90-degree swing arc. Windows use sill height. Reject openings that overlap on the same wall or exceed its horizontal/vertical bounds. If a room edit invalidates an opening, block that edit with the affected opening highlighted until the user moves/removes it. Furniture that becomes out of bounds stays in place with a warning. Shape changes explicitly preview which openings will need removal; never silently delete them.

Use rectangles and ellipses for catalog/custom footprints. Round items use equal width/depth; nonuniform scaling of designated rectangular generic models is allowed. Catalog bounds are checked against declared dimensions so visual meshes cannot imply a different fit.

Snapping defaults: 100 mm grid, 15-degree rotation steps, and wall alignment within 8 screen pixels. Provide visible toggles and precise unsnapped numeric entry; keyboard users may temporarily bypass snapping with Alt. Snapping is calculated in canonical coordinates after converting screen tolerance. Do not automatically push other furniture away.

For warnings, compute polygon containment, footprint intersections, and furniture intersection with the interior door-swing sector. Rugs are explicitly nonblocking and do not cause furniture-overlap warnings. Decorative overlapping footprints remain allowed. Warnings are derived state, not persisted judgments.

Show room edge dimensions and selected-item width/depth. Compute the selected item's nearest edge-to-wall/item gap, label the two measured objects, and offer a point-to-point ruler. Compare actual gaps with the optional clearance target (default 800 mm). Do not treat nearest-gap checks as whole-room circulation/pathfinding. Dimension overlays must distinguish negative overlap from a zero gap.

Room shell geometry, opening cutouts, and furniture transforms derive from the same document for both renderers. Rebuild affected geometry only. Use simple materials, baked texture detail where useful, limited shadows, and camera-facing wall cutaways. Wall thickness is rendered outward from the measured interior footprint. Colours/finishes never modify item dimensions.

## 5. Alternatives, catalog, and budgets

Each alternative is an independent room-and-items snapshot. Duplicate assigns new layout/item/opening IDs while preserving values. Keep at least one alternative; creating a fourth prompts the user to remove one or duplicate the whole project. Compare uses static previews, not three concurrent 3D canvases. Show separate item counts, priced purchase totals, and unpriced counts.

Launch with 30 generic entries: sofas (2), armchair, dining chair, stool, bench, coffee tables (2), side table, dining tables (2), desk, standing desk, office chair, beds (3), bedside table, wardrobe, dresser, bookcase, low cabinet, media unit, shelving units (2), counter, display plinth, rugs (2), and floor lamp. Add custom box and cylinder tools separately. Models must be first-party or permissively licensed, with attribution captured. Catalog metadata and assets are immutable/versioned; saved dimensions and finishes remain authoritative if a catalog default later changes. Missing models render correctly sized primitives.

An item is one placed unit. Sum non-null prices for to-buy items only; show owned items without counting their price in purchase totals. A price of zero is a known amount; null means unknown. Budgets are derived rather than separately saved. Currency changes with any prices require explicit relabelling confirmation; do not imply conversion.

## 6. Local persistence and cloud synchronization

IndexedDB stores document snapshots, local edit generations, last acknowledged cloud revision, pending mutation ID, deletion state, and account partition. Partitions are `guest` or the authenticated user ID. Request persistent browser storage when appropriate, but never promise it will be granted. Handle unavailable storage/quota exhaustion with a visible unsaved state and immediate plan-file export action.

Persist committed edits with a 300 ms debounce and a 1-second maximum wait during successive discrete edits. Camera state may be saved separately but cannot delay document persistence. Show “Saved on this device” only after the IndexedDB transaction completes. Do not rely on unload network requests.

Cloud sync starts after 2 seconds of document inactivity, with a 10-second maximum interval during continued committed editing. Serialize writes per project. Capture the local generation sent; a response only acknowledges that generation, leaving subsequent edits dirty. Retry transient failures with exponential backoff (1, 2, 4, 8, 16, then 30 seconds with jitter), pausing offline. Never retry validation or authorization failures as if they were connectivity failures.

The Worker assigns the owner from the session. Upload of a selected guest plan creates a new owner-scoped cloud project; after acknowledgment the client stores the mapping so a retry does not duplicate it. Keep the guest original until upload succeeds and disclose that account copies now belong to the signed-in user.

Use one project row containing the bounded document; this makes a snapshot write and revision increment atomic without multi-row application transactions. Update with `WHERE id = ? AND owner_id = ? AND revision = ? AND deleted_at IS NULL`, returning the new revision. An unowned/missing project is 404; a revision mismatch for an owned project is 409. No last-write-wins overwrite.

For ambiguous network outcomes, persist a mutation UUID before sending. Store the last accepted mutation UUID and a server-computed payload hash with the project. An immediate retry with the same UUID/hash receives the accepted result. Reusing it with different content is rejected. If another device has since updated the project, return conflict; preserving a duplicate is preferable to losing local work. At most one in-flight write per project per client.

On 409, retain the entire local version as a separate “Recovered copy — date/time” project and reload the cloud original. Create the recovery copy once using a stable saved UUID, queue its upload, and offer both projects in the UI. If the server original was deleted, keep the local recovery copy without restoring the original silently.

Use BroadcastChannel to notify same-browser tabs about revision changes; the same conflict rules still apply. Keep D1 read replication disabled for v1 so ownership, session, and save checks use the primary. Review D1 Sessions semantics before enabling replicas later.

Account sign-out revokes the session and removes that account's local cached projects after pending changes are synchronized or the user explicitly chooses discard. Offer export or cancel if edits remain unsynced. Do not move account data into the guest partition. Expired sessions lock cloud sync and retain pending edits for the same user to resume after reauthentication.

Project deletion is soft deletion with a revision increment and a 30-day restore window. The list defaults to active projects. A daily Worker scheduled handler purges expired tombstones in bounded indexed batches; retries are idempotent. Offline stale editors cannot resurrect purged projects through an update request. Guest Trash follows the same retention policy and cleans up when the app opens.

## 7. Database and API contracts

Better Auth owns its generated user/session/account/verification tables and any configured persistent rate-limit table. Application code must not hand-roll or directly mint session records. Use one generated Drizzle migration history for auth and application schema; apply reviewed SQL through Wrangler D1 migrations. Never migrate during an HTTP request.

Application table `projects`: id (primary key), owner_id (auth user foreign key), name, document_json, revision (integer), schema_version, last_mutation_id, last_mutation_hash, created_at, updated_at, deleted_at. Index owner_id/deleted_at/updated_at/id for list pagination and deleted_at for expiry cleanup. All queries bind values and filter ownership. Name in the row and document name update in the same statement.

| Route                                              | Contract                                                                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/api/auth/*`                                      | Better Auth handler; use its React client for email OTP, session lookup, and sign-out                                                            |
| `GET /api/projects?state=active\|trash&cursor=...` | Owner-scoped metadata list, 20 per page, stable updated_at/id ordering; no document bodies                                                       |
| `POST /api/projects`                               | `{projectId, mutationId, document}`; owner comes from session; creates revision 1; identical creation retry returns the existing matching result |
| `GET /api/projects/:id`                            | Owner-scoped envelope and document; missing/unowned 404                                                                                          |
| `PUT /api/projects/:id`                            | `{baseRevision, mutationId, document}`; atomic conditional snapshot update; returns acknowledged revision/timestamp                              |
| `DELETE /api/projects/:id`                         | `{baseRevision, mutationId}`; conditional soft delete; returns deletion state and revision                                                       |
| `POST /api/projects/:id/restore`                   | `{baseRevision, mutationId}`; restore within retention period; otherwise 410 for an owned known-expired tombstone, or 404 after purge            |

Application errors use `{error: {code, message, fieldErrors?}, requestId}`. Codes cover unauthenticated (401), missing/unowned (404), conflict (409), invalid document (422), oversized body (413), throttled (429), and temporarily unavailable (503). Auth routes retain Better Auth's own protocol; do not force them into this envelope.

Validate all documents on the server, including template geometry, numeric finiteness, unique IDs, opening rules, catalog references/approved fallback shapes, size/count bounds, and schema version. The document project ID must equal the route or creation ID, and activeLayoutId must identify one of its layouts. The read/list endpoints require a valid session. Authenticated requests must not be publicly cached. Client-supplied owner IDs are never accepted.

## 8. Better Auth and email delivery

Use the official Email OTP plugin for passwordless sign-in and signup. Default to six-digit codes, 5-minute expiry, no more than five verification attempts per issued code, and hashed OTP storage. Reject replay of a consumed code. Validate the exact plugin settings and concurrent verification behavior against pinned versions during the runtime gate. See [Better Auth Email OTP](https://better-auth.com/docs/plugins/email-otp).

Construct the auth service from the current Worker's environment bindings; never retain one environment's database or secrets in mutable global state. Mount it at `/api/auth/*`. Configure the canonical base URL and exact trusted origins for each environment; use secure HttpOnly same-origin session cookies with SameSite protection. Use the library's origin/CSRF checks and persistent rate limiting, not isolate-local counters. Disable session cookie caching initially so revocation is checked against D1. Set seven-day sessions with daily activity refresh and test expiry/sign-out behavior.

Production authentication email uses Cloudflare Email Sending through an `EMAIL` binding. Keep a narrow `sendSignInCode(email, code)` adapter to isolate delivery from auth. The sender domain must be verified before launch. Never log codes, cookies, tokens, or full addresses. Return an actionable resend/error state when delivery fails, without claiming a code was delivered.

Cloudflare Email Sending is currently beta and available on Workers Paid; Email Routing's verified-destination forwarding is not a substitute for emailing arbitrary app users. Confirm account eligibility and sender setup before the cloud-auth milestone. If beta access is unavailable, use [Resend on Workers](https://resend.com/docs/send-with-cloudflare-workers) as the documented fallback through the same adapter; this changes only delivery, not authentication or storage. No email account/domain is provisioned by this documentation task. See [Cloudflare Email Service](https://developers.cloudflare.com/email-service/).

V1 auth is email OTP only. Social login, passkeys, password flows, and organizations are deferred. Account-to-project isolation must be tested at the HTTP boundary using two real test sessions. Application ownership checks apply independently of Better Auth's authentication success.

## 9. Export/import contract

- **PDF:** Active alternative; A4 landscape by default, with a US Letter option. Fit the plan without clipping, show a scale bar and explicit dimensions, then paginate the item measurement/purchase list. Use vector floor-plan geometry and pdf-lib; embed licensed fonts. Label the alternative, units, currency, and export date. Do not imply printed scale remains exact if a viewer rescales the page.
- **PNG:** Active 2D or current 3D view, without editor chrome. Render on demand at up to a 2,048-pixel long edge with the scene aspect ratio. Never keep a large persistent GPU buffer solely for export. If 3D rendering is unavailable, offer 2D export explicitly.
- **CSV:** Active alternative, one row per item. Fields: alternative, item name, category, width, depth, height, units, rotation, owned/to-buy, price, currency. Empty price means unknown. Quote correctly and neutralize spreadsheet formula prefixes in user-entered text. Include summary information in the export UI and PDF, not fake furniture rows.
- **Plan file:** UTF-8 `.roomplan.json` envelope containing format identifier, schema version, export timestamp, and document. Contains all alternatives but no user IDs, sessions, cloud revisions, or embedded assets.

Generate exports in the browser from the same normalized document and catalog. Import validates before changing state, checks the 1 MiB document bound, rejects unknown future schema versions with an explanation, and creates fresh project/layout/item/opening IDs. Implement version migrations when a second schema version exists; do not invent migrations for v1. Unknown catalog versions fall back to saved primitive geometry and dimensions, with a visible asset notice.

## 10. Performance, accessibility, and limits

Support current and previous major releases of Chrome, Edge, Firefox, Safari, iOS Safari, and Android Chrome at release. Test phone portrait and landscape at 360 CSS pixels and above. WebGL failure must not prevent 2D editing, saving, or non-3D exports.

Use one active renderer, dispose inactive GPU resources, load 3D only on first entry, and lazy-load visible catalog assets. Cap mobile device-pixel ratio at 1.5 initially; use demand-driven rendering while idle. Export and comparison should not start hidden animation loops. Track compressed initial editor JavaScript separately from deferred 3D/catalog downloads; target ≤500 KB for the initial editor route, excluding catalog/model assets.

Performance fixture: 5 m × 4 m room, 50 furniture items, 4 openings, 3 alternatives. Validate on a physical iPhone 12/Safari and Pixel 6a/Chrome, with browser versions recorded. Targets: usable floor-plan editor within 3 seconds on a cold 10 Mbps/50 ms connection; selected item visibly follows input within 100 ms at the 95th percentile; at least 30 fps during 3D orbit after assets load; no unbounded memory growth after 20 2D/3D switches. These are release targets requiring measurement, not claims about the current documents.

Provide labelled buttons, visible focus, keyboard-operable dialogs, reduced-motion behavior, 44 px touch targets, sufficient contrast, and text equivalents for save/warning states. The item list and numeric room/item inspector must support the full data-editing flow without manipulating canvas handles. Announce selection and save failures without announcing every drag frame.

## 11. Test and release plan

| Suite             | Required scenarios                                                                                                                                                                          | PRD trace          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Geometry/unit     | Rectangle/L polygons, mirrored/rotated L-shapes, wall IDs, opening bounds, door sectors, rotated footprints, rug exception, snapping, 2D↔3D transforms, metric/imperial round trips         | RP-01–06, RP-08–09 |
| State/unit        | Drag coalescing, cancel, 100-step history, redo invalidation, room resize, alternative independence, budget/null/zero/currency behavior                                                     | RP-04–07, RP-10–11 |
| Import/export     | Valid round trip, future version, oversized/invalid/nonfinite inputs, unknown assets, CSV quoting/formula strings, multipage PDF, phone PNG memory bounds                                   | RP-14              |
| Local integration | Autosave acknowledgment, reload, IndexedDB failure, guest/account separation, offline edits, two tabs, Trash expiry                                                                         | RP-12, RP-16       |
| Workers/D1        | Real runtime auth adapter, OTP expiry/replay/concurrent attempts, logout, rate limits, migrations on clean and upgraded DB, every endpoint with two users, forged owner IDs, invalid inputs | RP-13, RP-16       |
| Sync integration  | Concurrent CAS writes, timeout after server commit, identical/different mutation retry, edits while saving, offline recovery, deleted originals, one-time guest upload, conflict-copy retry | RP-12–13, RP-16    |
| Browser E2E       | Full living-room journey with mouse, keyboard, and touch; independent alternative edit; reload; 3D fallback; budget; all exports/import                                                     | RP-01–16           |
| Manual release    | Physical mobile performance fixture, visual PDF checks, screen-reader/numeric-control workflow, sender-domain delivery, backup restore rehearsal                                            | RP-08, RP-13–16    |

Use Vitest for pure logic, Cloudflare's Workers test environment for D1/Worker integration, and Playwright for browser flows. Fake the email sender in automated tests; a controlled delivery check is a separate staging task. Screenshots and benchmark results are implementation artifacts, not fabricated at specification time.

Implementation milestones:

1. **Runtime and model gate:** Scaffold pnpm/Vite/Worker development, generate pinned auth schema, verify OTP/session flow on local D1, exercise compare-and-swap writes, and validate geometry conversions. Resolve compatibility failures before expanding UI work.
2. **Local planner:** Room templates/openings, launch catalog, precise 2D editing, measurements, command history, and durable device saves.
3. **3D and alternatives:** Shared transforms, materials, cutaways, mobile camera interaction, independent alternatives, and comparison.
4. **Purchase/export flow:** Budget calculations, PDF/PNG/CSV/plan files, import validation, and recovery on export failure.
5. **Cloud accounts:** Email delivery, guest upload, owner-scoped API, sync/conflict copies, sign-out recovery, and Trash.
6. **Beta gate:** Physical device performance, accessibility/usability sessions, cross-browser checks, restore rehearsal, and operational readiness.

Maintain separate local, staging, and production D1 databases, secrets, and email settings. Preview builds must not write production data. Store secrets in Worker bindings; never include them in Vite public environment variables. Apply additive reviewed migrations before compatible code deployment and rehearse recovery using D1 backup/Time Travel capabilities. Code rollback alone does not roll back data.

Monitor Worker errors, API latency, failed saves, auth/email failures, D1 storage and rows read/written, and sync-conflict rate. Log request IDs and event categories without document contents or authentication secrets. Start with a single D1 database; review workload and growth before its published limit is approached. Indexed owner/project queries and debounced document saves are the initial cost controls. Refer to live [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and [limits](https://developers.cloudflare.com/d1/platform/limits/) before provisioning; do not promise zero hosting cost.

## 12. Remaining deployment inputs

No unresolved product or architecture choice blocks starting implementation. Deployment will require a Cloudflare account, a verified sender domain, a production hostname, configured secrets, and confirmation of Email Sending eligibility. These are environment inputs, not services created or purchased by this specification.

The approved scope is documentation only. No code, infrastructure, emails, or public deployment are included in the current project setup.
