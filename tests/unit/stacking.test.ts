import { beforeEach, describe, expect, it } from 'vitest';
import {
  newItem,
  newProject,
  projectSchema,
  cloneLayout,
  uid,
  type FurnitureItem,
} from '../../src/domain/model';
import {
  fitsOn,
  footprint,
  furnitureGap,
  itemElevation,
  nearestGap,
  planItems,
  pointInPolygon,
  toThreeTransform,
  warnings,
} from '../../src/domain/geometry';
import { supportAtPosition } from '../../src/domain/stacking';
import { activeLayout, useEditor } from '../../src/state/editor';
import { importPlan, serializePlan } from '../../src/export/planFile';
import { exportCsv } from '../../src/export/csv';
import { buildFurnitureParts } from '../../src/editor/renderers/furnitureParts';

function fixture() {
  const document = newProject();
  const console = newItem('tv-console', 2000, 2500);
  const tv: FurnitureItem = { ...newItem('television', 2000, 2500), supportedById: console.id };
  document.layouts[0].items = [tv, console];
  return { document, console, tv, layout: document.layouts[0] };
}
beforeEach(() => useEditor.getState().load(newProject()));

describe('stacking', () => {
  it('loads older documents on the floor with no support', () => {
    const document = newProject();
    const { elevationMm: _e, supportedById: _s, ...legacy } = newItem('television', 2000, 2500);
    expect(
      projectSchema.parse({ ...document, layouts: [{ ...document.layouts[0], items: [legacy] }] })
        .layouts[0].items[0],
    ).toMatchObject({ elevationMm: 0, supportedById: null });
  });
  it('raises a television onto its console and draws it above its support', () => {
    const { layout, tv, console } = fixture();
    expect(itemElevation(tv, layout.items)).toBe(550);
    expect(toThreeTransform(tv, layout.items).position[1]).toBeCloseTo(0.95);
    expect(planItems(layout.items).map((item) => item.id)).toEqual([console.id, tv.id]);
    expect(warnings(layout)).toEqual([]);
    expect(nearestGap(tv, layout)?.label).not.toContain(console.name);
    tv.supportedById = null;
    expect(warnings(layout).some((warning) => warning.message.includes('overlaps'))).toBe(true);
  });
  it('recognizes fitting surfaces, prevents stacking on descendants, and respects rotation', () => {
    const { layout, tv, console } = fixture();
    expect(supportAtPosition(tv, layout.items)?.id).toBe(console.id);
    expect(supportAtPosition(console, layout.items)).toBeUndefined();
    expect(fitsOn({ ...tv, rotationDeg: 90 }, console)).toBe(false);
    expect(supportAtPosition({ ...tv, xMm: 1000 }, layout.items)).toBeUndefined();
    expect(supportAtPosition(newItem('sofa-l-left', 2000, 2500), layout.items)).toBeUndefined();
  });
  it('moves and rotates nested stacks as one undoable edit and follows height changes', () => {
    const { document, console, tv } = fixture();
    const small = {
      ...newItem('custom-box', 2150, 2500),
      widthMm: 100,
      depthMm: 100,
      heightMm: 50,
      supportedById: tv.id,
    };
    document.layouts[0].items.push(small);
    useEditor.getState().load(document);
    const state = useEditor.getState();
    expect(
      state.updateItem(console.id, { xMm: 1500, yMm: 1500, rotationDeg: 90, heightMm: 700 }),
    ).toBe(true);
    let items = activeLayout(useEditor.getState().document!).items;
    expect(items.find((item) => item.id === tv.id)).toMatchObject({
      xMm: 1500,
      yMm: 1500,
      rotationDeg: 90,
    });
    expect(items.find((item) => item.id === small.id)).toMatchObject({
      xMm: 1500,
      yMm: 1650,
      rotationDeg: 90,
    });
    expect(
      itemElevation(
        items.find((item) => item.id === small.id)!,
        items,
      ),
    ).toBe(1500);
    state.undo();
    items = activeLayout(useEditor.getState().document!).items;
    expect(items.find((item) => item.id === small.id)?.xMm).toBe(2150);
    state.redo();
    expect(
      activeLayout(useEditor.getState().document!).items.find((item) => item.id === tv.id)?.xMm,
    ).toBe(1500);
  });
  it('centres on a support, rejects oversized pieces, and returns to the floor when dragged away', () => {
    const { document, console, tv } = fixture();
    tv.supportedById = null;
    tv.xMm = 500;
    useEditor.getState().load(document);
    const state = useEditor.getState();
    expect(state.stackItem(tv.id, console.id)).toBe(true);
    expect(activeLayout(useEditor.getState().document!).items[0]).toMatchObject({
      xMm: 2000,
      yMm: 2500,
      supportedById: console.id,
    });
    expect(state.stackItem(console.id, tv.id)).toBe(false);
    expect(state.moveItem(tv.id, 500, 500)).toBe(true);
    expect(activeLayout(useEditor.getState().document!).items[0]).toMatchObject({
      supportedById: null,
      elevationMm: 0,
    });
    expect(state.moveItem(tv.id, 2000, 2500)).toBe(true);
    expect(activeLayout(useEditor.getState().document!).items[0].supportedById).toBe(console.id);
    expect(state.stackItem(tv.id, null)).toBe(true);
    expect(activeLayout(useEditor.getState().document!).items[0].supportedById).toBeNull();
    expect(state.stackItem(console.id, tv.id)).toBe(false);
    state.updateItem(tv.id, { elevationMm: 900 });
    state.moveItem(tv.id, 1000, 1000);
    expect(activeLayout(useEditor.getState().document!).items[0].elevationMm).toBe(900);
  });
  it('detaches children on support deletion and restores the full stack on undo', () => {
    const { document, tv, console } = fixture();
    useEditor.getState().load(document);
    const state = useEditor.getState();
    state.removeItem(console.id);
    expect(activeLayout(useEditor.getState().document!).items[0]).toMatchObject({
      supportedById: null,
      elevationMm: 0,
    });
    state.undo();
    expect(
      activeLayout(useEditor.getState().document!).items.find((item) => item.id === tv.id)
        ?.supportedById,
    ).toBe(console.id);
  });
  it('rejects dangling supports, stacking cycles and rug supports', () => {
    const { document, console, tv } = fixture();
    tv.supportedById = uid();
    expect(projectSchema.safeParse(document).success).toBe(false);
    tv.supportedById = console.id;
    console.supportedById = tv.id;
    expect(projectSchema.safeParse(document).success).toBe(false);
    console.supportedById = null;
    const rug = newItem('rug-rect', 2000, 2500);
    document.layouts[0].items.push(rug);
    tv.supportedById = rug.id;
    expect(projectSchema.safeParse(document).success).toBe(false);
  });
  it('remaps supports on alternative copies and plan-file import, and exports elevations', () => {
    const { document, layout, console } = fixture();
    for (const copy of [cloneLayout(layout, 'B'), importPlan(serializePlan(document)).layouts[0]]) {
      expect(copy.items[0].supportedById).toBe(copy.items[1].id);
      expect(copy.items[0].supportedById).not.toBe(console.id);
      expect(itemElevation(copy.items[0], copy.items)).toBe(550);
    }
    expect(exportCsv(document)).toContain('"550","TV console"');
  });
  it('warns about overhangs, ceilings and real collisions at elevated levels', () => {
    const { layout, tv } = fixture();
    tv.widthMm = 1800;
    expect(warnings(layout).some((warning) => warning.message.includes('extends beyond'))).toBe(
      true,
    );
    tv.widthMm = 1230;
    tv.heightMm = 2100;
    expect(warnings(layout).some((warning) => warning.message.includes('above the ceiling'))).toBe(
      true,
    );
    layout.items.push(newItem('wardrobe', 2000, 2500));
    expect(warnings(layout).some((warning) => warning.message.includes('overlaps'))).toBe(true);
  });
});

describe('L-shaped couches', () => {
  it('leaves the open corner usable for either chaise side and at rotated angles', () => {
    for (const side of ['left', 'right']) {
      const couch = newItem(`sofa-l-${side}`, 2000, 2500);
      expect(footprint(couch)).toHaveLength(6);
      const offset = side === 'left' ? 600 : -600;
      for (const rotation of [0, 45, 90, 180, 270]) {
        couch.rotationDeg = rotation;
        const angle = (rotation * Math.PI) / 180;
        const table = {
          ...newItem(
            'side-table',
            2000 + offset * Math.cos(angle) - 450 * Math.sin(angle),
            2500 + offset * Math.sin(angle) + 450 * Math.cos(angle),
          ),
          rotationDeg: rotation,
        };
        expect(furnitureGap(couch, table)).toBeGreaterThan(0);
        expect(pointInPolygon({ x: table.xMm, y: table.yMm }, footprint(couch))).toBe(false);
        const layout = newProject().layouts[0];
        layout.room.widthMm = 6000;
        layout.room.depthMm = 6000;
        layout.items = [couch, table];
        expect(warnings(layout).filter((warning) => warning.message.includes('overlaps'))).toEqual(
          [],
        );
        table.xMm = couch.xMm;
        table.yMm = couch.yMm - 400;
        if (rotation === 0) expect(furnitureGap(couch, table)).toBeLessThan(0);
      }
    }
  });
  it('builds mirrored chaise geometry without occupying the open corner', () => {
    for (const side of ['left', 'right']) {
      const item = newItem(`sofa-l-${side}`, 0, 0);
      const parts = buildFurnitureParts(item);
      expect(parts.length).toBeGreaterThan(10);
      const emptyX = side === 'left' ? 0.6 : -0.6;
      expect(
        parts.some(
          (part) =>
            Math.abs(part.position[0] - emptyX) < part.size[0] / 2 &&
            Math.abs(part.position[2] - 0.45) < part.size[2] / 2,
        ),
      ).toBe(false);
    }
  });
});
