# Room Planner — Product Requirements

Version: 1.0 · 8 October 2026 · Status: ready for implementation planning

## 1. Product intent

**See how it fits before you move or buy it.**

Help people confidently arrange a room using measurements they can understand. A user should be able to enter their room dimensions, add an existing sofa, try a dining table, inspect the remaining space, and save an alternative without learning CAD.

The core journey is **define your space → arrange in 2D → explore in 3D → save and export**. The 3D view clarifies proportions and appearance; the dimensioned floor plan supports precise placement.

### Audience and jobs

| Audience                            | Job                                                      | Desired result                                           |
| ----------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| Movers and people furnishing a home | Check existing and proposed furniture against a new room | A layout and measurements to use before moving or buying |
| People rearranging their home       | Compare arrangements without moving heavy furniture      | Two or three credible alternatives                       |
| Home-office users                   | Fit a desk, storage, and seating into a room             | A workable arrangement and purchase estimate             |
| Small office/shop operators         | Arrange generic desks, shelving, counters, and seating   | A simple single-space plan                               |

Residential use is the primary design and usability target. Office and shop use share the same generic tools; specialized retail operations are outside v1.

### Success criteria

Initial validation targets are hypotheses, not measured outcomes:

- At least 8 of 10 first-time usability participants complete the core living-room task without assistance.
- Median completion time is at most 10 minutes, excluding the time required to physically measure the room.
- Participants can identify which dimensions and gaps were measured and distinguish missing prices from zero-cost items.
- No silent loss of committed edits in the specified reload, offline, conflict, and export/import tests.
- Meet the 50-item mobile performance fixture defined in the spec.

In beta, track anonymous aggregate room creation, first placement, 3D entry, alternative creation, export completion, save failures, and sync conflicts. Do not collect room dimensions, plan contents, furniture names, or email addresses in product events. Measure completion funnels by device class; these events must never block editing.

## 2. Release scope

V1 is an English-language free beta delivered as a browser application. Full room and furniture editing is required on desktop, tablet, and phone.

Every requirement below is required for v1 unless explicitly marked deferred.

| ID    | Capability               | Acceptance criteria                                                                                                                                                                                                        |
| ----- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RP-01 | Define one room          | Create a rectangle or L-shape with editable interior dimensions, ceiling height, name, and measurement units. Invalid dimensions receive field-level feedback without corrupting the last valid room.                      |
| RP-02 | Doors and windows        | Add, move, resize, and remove wall-bound openings. Doors show hinge side and inward/outward swing; windows have sill height. Openings appear in both views and cannot extend beyond their wall.                            |
| RP-03 | Useful furniture library | Search/filter a launch catalog of at least 30 generic items across seating, tables, beds, storage, desks, rugs, floor lighting, and shop fixtures. Add a custom rectangular or cylindrical item using measured dimensions. |
| RP-04 | Accurate item properties | Edit name, width, depth, height, rotation, colour, finish, owned/to-buy status, and optional price. Numeric edits and dragging produce the same document state.                                                            |
| RP-05 | Floor-plan editing       | Add, select, drag, rotate, duplicate, and delete furniture. Provide grid and wall snapping, zoom, pan, fit-to-room, and a visible item list. Essential actions work without a keyboard.                                    |
| RP-06 | Measurements and fit     | Display room/item dimensions and measured gaps. Show advisory out-of-room, furniture-overlap, and door-swing warnings. Let users choose a target clearance to highlight smaller measured gaps.                             |
| RP-07 | Undo/redo                | Undo and redo room, opening, item, finish, and alternative edits. A completed drag is one action. Camera movement is not an undo step.                                                                                     |
| RP-08 | 3D exploration           | Orbit and zoom around the room, select furniture, edit properties, and return to the same layout in 2D. Use cutaway walls to keep the interior visible. Direct 3D dragging and first-person navigation are deferred.       |
| RP-09 | Colours and finishes     | Apply wall colours, a floor finish, and supported furniture finishes. Different finishes do not change physical dimensions. Provide neutral, wood, and fabric choices with coherent 2D/3D representation.                  |
| RP-10 | Alternatives             | Create, rename, duplicate, compare, and delete up to three named alternatives, keeping at least one. Alternatives are independent full snapshots, including room geometry, furniture, and finishes.                        |
| RP-11 | Purchase list            | Show each placed item's dimensions, status, and optional price. Sum only priced to-buy items and count unpriced to-buy items separately. Compare estimates between alternatives without combining their totals.            |
| RP-12 | Guest saving             | Start without an account. Autosave committed edits on the device, reopen saved projects, and download a restorable plan file. Clearly label device-only storage.                                                           |
| RP-13 | Optional accounts        | Sign in using an emailed one-time code. Offer upload of selected guest projects. Signed-in users can reopen projects on another device; expired sessions or network failures retain local work.                            |
| RP-14 | Exports and import       | Export dimensioned floor-plan PDF, current-view PNG, furniture/budget CSV, and a restorable project file containing all alternatives. Import creates a new project and never overwrites an existing plan.                  |
| RP-15 | Mobile and accessibility | Complete the same planning workflow using touch. Provide numeric alternatives to gestures, labelled controls, keyboard access on desktop, visible focus, and readable measurement labels.                                  |
| RP-16 | Recovery and management  | Rename projects, move projects to Trash, restore them within 30 days, and surface save/sync errors with recovery actions. Conflicting edits are preserved as a separate project copy.                                      |

### Deferred

Whole homes, multiple connected rooms, outdoor plans, arbitrary wall drawing, angled/curved walls, split levels, direct 3D placement, walkthroughs, AR/scanning, AI suggestions, product scraping, live retailer prices, public sharing, multiplayer collaboration, native mobile apps, subscriptions, and professional construction documentation.

## 3. Core workflows

### First plan

1. Landing page presents the promise and a direct “Plan your room” action. An optional furnished example demonstrates the interface.
2. Choose rectangle or L-shape, measurement units, dimensions, and ceiling height.
3. Enter the floor plan. Add doors/windows from a Room panel and place furniture from a searchable catalog.
4. Select an item to change dimensions or finishes. Measurement guides appear around the selection; a measurement tool supports point-to-point checks.
5. Switch to 3D, inspect the arrangement, and adjust properties if needed.
6. The plan saves automatically on the device. “Back up online” offers optional sign-in without interrupting planning.

### Compare before buying

Duplicate Layout A into Layout B, move or replace furniture in B, and compare previews and purchase estimates. On desktop show alternatives side by side; on phones use labelled tabs and a consistent camera/zoom framing. The user can return to either alternative for editing. Deleting an alternative is undoable.

### Save across devices

Enter an email, receive a code, and complete sign-in. Choose which local projects to upload. Do not silently attach every plan on a shared device to the signed-in account. A second device loads the latest cloud revision. Concurrent changes produce a preserved conflict copy with a clear explanation.

### Export for action

The export panel identifies the active alternative and selected units. The user selects PDF, PNG, CSV, or plan file. A PDF combines a dimensioned plan with an item measurement list; CSV includes the active alternative's items and purchase status. A plan file includes all alternatives and supports continued editing later.

## 4. Experience direction

Use the [reference planner](https://wedding.wawasensei.dev/plan) for the spacious scene, collapsible inspector, warm ivory background, muted green controls, and restrained typography. The [reference landing page](https://wedding.wawasensei.dev/) demonstrates immersive presentation; this product should prioritize a direct entry into planning.

Desktop uses a large canvas, compact editing sidebar, persistent Floor plan / 3D switch, and visible save state. Inspector sections are Room, Furniture, Finishes, and List. Keep Undo, Redo, zoom, and selection actions easy to find.

Phones use a compact top bar, scene viewport, bottom toolbar, and collapsible inspector sheet. Tapping a catalog item enters placement mode with a preview; tapping the room places it. Provide numeric position, size, and rotation controls as precise alternatives to dragging. Touch targets are at least 44 CSS pixels. Sheets respect safe areas and the on-screen keyboard.

Saving language distinguishes “Saved on this device,” “Syncing,” “Backed up online,” and “Needs attention.” Missing WebGL leaves the full 2D workflow available. Asset loading failures use correctly sized placeholder geometry.

Clearance highlights indicate measured distances relative to a user-selected target. They do not infer a navigable path through the entire room. Colour and material previews are illustrative, not retail swatch matching.

## 5. Product defaults and boundaries

- Working name: Room Planner. Branding can change without changing scope.
- Room dimensions are interior measurements; wall thickness is a visual treatment in v1.
- Start with a 4 m × 5 m rectangle and 2.6 m ceiling, clearly editable before planning.
- Default measurement display is metric; users can switch to feet/inches without changing geometry.
- Default clearance target is 800 mm and remains editable or removable. This is a product comparison setting.
- At most 200 furniture items and 20 openings per alternative; the performance release fixture uses 50 furniture items.
- One project currency, explicitly confirmed when prices are first used; suggest USD until changed. No currency conversion. Changing currency with prices present requires confirmation that amounts will be relabelled, not converted.
- Prices are per placed item. Duplicating an item copies its price and purchase status. Taxes, delivery fees, and discount calculations are deferred.
- Full editing does not require an account. Cross-device access does.
- No dedicated offline installation/cache guarantee in v1. An already loaded editor continues working when connectivity drops; local saves survive reload once the app can load again.
- Cloud project data is private to its account. Device-only data can be read by someone with access to the same browser profile.

## 6. Delivery and validation

Ship in milestones: runtime feasibility; local geometry/editor; 3D and alternatives; exports and purchasing; authentication/cloud sync; mobile/accessibility/performance hardening. These are implementation milestones, not separately promised public releases.

Validate with a living-room fixture containing a sofa, dining table, chairs, rug, window, and inward-opening door. Include a deliberately narrow gap and obstructed door swing. A participant should identify the issues, adjust the layout, make an alternative, and export measurements.

The technical spec supplies the automated tests, browser matrix, failure scenarios, and release checks that trace to RP-01 through RP-16. Usability testing and actual rendering/device validation are required; document review alone does not establish product readiness.
