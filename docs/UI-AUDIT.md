# Impeccable UI audit

9 October 2026. Scope: landing, project list, editor, exports, and sign-in. This is a technical/code audit with responsive browser observation, not a WCAG certification or physical-device performance result.

Implementation integrity: coherent room-specific palette, scene-first editor, shared numeric inspector, independent alternatives. Initial implementation needs hardening before beta.

| Dimension                | Initial score / 4 | Evidence                                                                                                                        |
| ------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Accessibility            | 2                 | Labelled forms, focus rings and numeric editing exist. Several low-contrast captions and icon buttons without accessible names. |
| Performance              | 3                 | Production build separates 3D and PDF. Initial editor modules total about 273 KB gzip. No physical-device measurements yet.     |
| Responsive design        | 2                 | Mobile sheet overlays the fitted room; small tool targets and invisible collapsed-sheet focus targets.                          |
| Theming                  | 2                 | Basic CSS tokens exist; secondary text and surface values are repeated. Dark mode is outside the requested v1 scope.            |
| Implementation integrity | 3                 | Original product geometry and workflow; oversized generated heading labels and decorative section labels need removal.          |
| Total                    | 12 / 20           | Significant accessibility/responsive fixes needed.                                                                              |

## Findings

- **P1 — Bottom sheet obscures the mobile room.** `src/styles.css`, editor workspace. The room fits against the full viewport while the expanded inspector covers its lower half. Adapt the scene's available height to the sheet. Verify at 360 px portrait and landscape.
- **P1 — Secondary copy fails contrast.** `src/styles.css`, muted/save/caption colours. Darken secondary text to at least 4.5:1 against its actual background and increase essential editor labels. Suggested action: Impeccable harden/typeset.
- **P1 — Essential placement needs a canvas tap.** `FurniturePanel` / `FloorPlan`. Add a DOM “Place in centre” action so keyboard users can complete item creation before numeric editing. Suggested action: Impeccable harden.
- **P1 — Icon-only buttons lack names.** `EditorPage`, mobile Export and Compare. Add explicit accessible names; preserve visible desktop labels. Suggested action: Impeccable harden.
- **P2 — Small touch targets and collapsed-sheet focus.** Scene toolbar and mobile sheet. Use 44 px targets; hide collapsed inspector content from focus and accessibility. Suggested action: Impeccable adapt.
- **P2 — Decorative eyebrow labels compete with task content.** Panel/landing headings. Remove kickers, retain meaningful room-area and item-count data. Suggested action: Impeccable distill.
- **P2 — Initial hero is a shaded SVG picture.** `LandingPage`. Replace with a real screenshot of the furnished product scene, preserving product truth. Suggested action: Impeccable polish.
- **P2 — External font request.** `styles.css`. Self-host licensed fonts for deterministic rendering and fewer external dependencies. Suggested action: Impeccable optimize.

Positive evidence: one active renderer; deferred 3D/export bundles; real catalogue dimensions; item list and numeric inspector; accessible native dialog focus; consistent focus treatment; visible storage/recovery language; reduced-motion preference.

## Correction and verification

The correction pass addressed every listed implementation finding: the mobile scene reserves inspector space; narrow-view 3D camera framing adapts to its aspect ratio; essential numeric placement works through DOM controls; mobile controls use 44 px targets; collapsed panel content leaves the focus order; secondary text contrast was darkened; dialogs have accessible names; headings no longer have decorative kickers; licensed fonts are self-hosted; and the landing hero uses an actual furnished-room export. Comparison uses one labelled alternative picker on phones. Colours are shared across the editor, preview and export adapters.

Desktop and 360 px touch-viewport browser journeys passed. Automated axe scans on the landing, editor, export dialog, project list and sign-in reported no violations for the selected WCAG A/AA rule set. Manual visual observation confirmed the room, inspector, colours and responsive controls. Screenshots are in `docs/screenshots`.

The one requested manual Impeccable detector run is retained in `impeccable-detector.json`. It found one warning: an animated sheet height. The height transition was removed, and the design hook subsequently recorded no findings for the edited stylesheet. There was no repeated manual detector loop.

| Dimension                | Final score / 4 | Evidence                                                                                                                                            |
| ------------------------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accessibility            | 3               | Automated rule checks pass; essential editing has labelled numeric alternatives. Human screen-reader testing remains.                               |
| Performance              | 3               | Initial editor JavaScript is about 276 KB gzip; 3D and PDF are deferred; 20 renderer switches pass. Physical device performance remains unmeasured. |
| Responsive design        | 3               | 360 px workflow passes, sheet reserves scene space and 3D framing adapts. Broader device/browser matrix remains.                                    |
| Theming                  | 3               | Shared colours, material textures, locally hosted fonts, focus/caret/selection and reduced motion are coherent.                                     |
| Implementation integrity | 4               | Original, dimension-preserving furniture geometry and real product imagery; one shared document drives both views.                                  |
| Total                    | 16 / 20         | Local build is usable and verified; external beta gates remain.                                                                                     |

Remaining release checks: physical mobile performance, human screen-reader and usability sessions, and the release browser matrix. Automated checks do not establish full WCAG conformance.
