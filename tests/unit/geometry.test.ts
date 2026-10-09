import { describe, it, expect } from 'vitest';
import {
  newProject,
  newItem,
  projectSchema,
  uid,
  budget,
  cloneLayout,
} from '../../src/domain/model';
import {
  roomPolygon,
  walls,
  contained,
  convexGap,
  footprint,
  openingErrors,
  doorSector,
  warnings,
  toThreeTransform,
  snapPosition,
  polygonDistance,
  openingOffsetAtPoint,
} from '../../src/domain/geometry';
import { formatLength, parseLength } from '../../src/domain/units';
describe('canonical geometry', () => {
  it('preserves semantic walls across mirrored and rotated L shapes', () => {
    const r = { ...newProject().layouts[0].room, shape: 'l-shape' as const };
    for (const mirrored of [false, true])
      for (let quarterTurns = 0; quarterTurns < 4; quarterTurns++) {
        const room = { ...r, mirrored, quarterTurns };
        expect(roomPolygon(room)).toHaveLength(6);
        expect(walls(room).map((w) => w.id)).toEqual([
          'north',
          'inner-vertical',
          'inner-horizontal',
          'east',
          'south',
          'west',
        ]);
        expect(walls(room).every((w) => w.length >= 500)).toBe(true);
      }
  });
  it('detects furniture in the cutout and rotated boundary crossings', () => {
    const r = { ...newProject().layouts[0].room, shape: 'l-shape' as const };
    expect(contained(newItem('side-table', 3500, 500), r)).toBe(false);
    expect(contained(newItem('side-table', 700, 700), r)).toBe(true);
    expect(contained({ ...newItem('sofa-3', 500, 500), rotationDeg: 45 }, r)).toBe(false);
  });
  it('distinguishes overlap, touch and a diagonal positive gap', () => {
    const a = newItem('custom-box', 1000, 1000),
      b = { ...a, id: uid(), xMm: 1600 };
    expect(convexGap(footprint(a), footprint(b))).toBe(0);
    expect(convexGap(footprint(a), footprint({ ...b, xMm: 1400 }))).toBe(-200);
    expect(polygonDistance(footprint(a), footprint({ ...b, xMm: 1800, yMm: 1800 }))).toBeCloseTo(
      Math.sqrt(80000),
    );
  });
  it('blocks overlapping and vertically invalid openings', () => {
    const room = newProject().layouts[0].room;
    const o = {
      id: uid(),
      type: 'window' as const,
      wallId: 'north',
      offsetMm: 100,
      widthMm: 1000,
      heightMm: 1000,
      sillHeightMm: 1000,
      hinge: 'left' as const,
      swing: 'inward' as const,
    };
    expect(openingErrors(room, [o])).toEqual([]);
    expect(openingErrors(room, [o, { ...o, id: uid(), offsetMm: 500 }])).toHaveLength(2);
    expect(openingErrors({ ...room, ceilingHeightMm: 1800 }, [o])).toHaveLength(1);
  });
  it('computes interior door sectors and exempts rugs from collision', () => {
    const l = newProject().layouts[0];
    l.openings = [
      {
        id: uid(),
        type: 'door',
        wallId: 'north',
        offsetMm: 100,
        widthMm: 900,
        heightMm: 2100,
        sillHeightMm: 0,
        hinge: 'left',
        swing: 'inward',
      },
    ];
    l.items = [newItem('side-table', 500, 400), newItem('rug-rect', 2000, 2500)];
    expect(doorSector(l.room, l.openings[0])).toHaveLength(34);
    expect(warnings(l).some((w) => w.message.includes('door swing'))).toBe(true);
    l.items = [newItem('rug-rect', 2000, 2500), newItem('sofa-2', 2000, 2500)];
    expect(warnings(l)).toEqual([]);
  });
  it('maps clockwise floor rotation to negative Y rotation in metres', () => {
    const i = { ...newItem('custom-box', 1000, 2000), rotationDeg: 90 };
    expect(toThreeTransform(i)).toEqual({
      position: [1, 0.3, 2],
      rotation: [0, -Math.PI / 2, 0],
      size: [0.6, 0.6, 0.6],
    });
  });
  it('snaps canonical position without changing size', () => {
    const i = newItem('custom-box', 1000, 1000),
      r = newProject().layouts[0].room;
    expect(snapPosition(i, 1044, 1477, r, true, false, 10)).toEqual({ x: 1000, y: 1500 });
    expect(snapPosition(i, 320, 1200, r, false, true, 10)).toEqual({ x: 300, y: 1200 });
  });
  it('round trips metric and imperial at the UI precision boundary', () => {
    expect(parseLength('4.5 m', 'metric')).toBe(4500);
    expect(parseLength('450 cm', 'metric')).toBe(4500);
    expect(parseLength('4′ 6″', 'imperial')).toBe(1371.6);
    expect(parseLength(formatLength(1371.6, 'imperial'), 'imperial')).toBe(1371.6);
    expect(parseLength('NaN', 'metric')).toBeNull();
  });
});
describe('document validation and alternatives', () => {
  it('rejects invalid geometry, nonfinite numbers, duplicate IDs and extra ownership', () => {
    const p = newProject();
    expect(projectSchema.safeParse(p).success).toBe(true);
    expect(projectSchema.safeParse({ ...p, ownerId: 'forged' }).success).toBe(false);
    expect(
      projectSchema.safeParse({
        ...p,
        layouts: [{ ...p.layouts[0], room: { ...p.layouts[0].room, widthMm: Infinity } }],
      }).success,
    ).toBe(false);
    expect(projectSchema.safeParse({ ...p, layouts: [p.layouts[0], p.layouts[0]] }).success).toBe(
      false,
    );
  });
  it('duplicates independent complete alternatives with fresh IDs', () => {
    const l = newProject().layouts[0];
    l.items = [newItem('sofa-2', 2000, 2500)];
    const other = cloneLayout(l, 'Layout B');
    other.items[0].xMm = 3000;
    other.room.widthMm = 6000;
    expect(l.items[0].xMm).toBe(2000);
    expect(l.room.widthMm).toBe(4000);
    expect(other.items[0].id).not.toBe(l.items[0].id);
  });
  it('counts zero as priced and excludes owned prices', () => {
    const l = newProject().layouts[0];
    l.items = [
      { ...newItem('side-table', 500, 500), status: 'to-buy', priceMinor: 0 },
      { ...newItem('side-table', 1000, 1000), status: 'to-buy', priceMinor: null },
      { ...newItem('sofa-2', 2000, 2000), status: 'owned', priceMinor: 120000 },
    ];
    expect(budget(l)).toEqual({ totalMinor: 0, unpriced: 1, owned: 1 });
  });
});

it('projects opening centres along every mirrored and rotated L-shape wall and clamps at ends', () => {
  const base = { ...newProject().layouts[0].room, shape: 'l-shape' as const };
  for (const mirrored of [false, true])
    for (let quarterTurns = 0; quarterTurns < 4; quarterTurns++) {
      for (const wall of walls({ ...base, mirrored, quarterTurns })) {
        const midpoint = { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 };
        expect(openingOffsetAtPoint(wall, midpoint, 400)).toBe((wall.length - 400) / 2);
        expect(openingOffsetAtPoint(wall, wall.a, 400)).toBe(0);
        expect(openingOffsetAtPoint(wall, wall.b, 400)).toBe(wall.length - 400);
      }
    }
});
