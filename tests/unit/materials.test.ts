import { it, expect } from 'vitest';
import { catalog } from '../../src/domain/catalog';
import { newItem } from '../../src/domain/model';
import { buildFurnitureParts } from '../../src/editor/renderers/furnitureParts';
it('keeps all first-party furniture parts within their measured bounds', () => {
  expect(catalog).toHaveLength(50);
  for (const entry of catalog) {
    const item = newItem(entry.id, 0, 0),
      parts = buildFurnitureParts(item);
    for (const part of parts)
      for (const [axis, dimension] of [item.widthMm, item.heightMm, item.depthMm].entries())
        expect(
          Math.abs(part.position[axis]) + part.size[axis] / 2,
          `${entry.id} axis ${axis}`,
        ).toBeLessThanOrEqual(dimension / 2000 + 0.00001);
  }
});
it('uses the saved colour for tables and chairs and adds model detail', () => {
  for (const catalogId of ['dining-rect', 'coffee-round', 'dining-chair', 'sofa-3']) {
    const item = { ...newItem(catalogId, 0, 0), colour: '#994422' },
      parts = buildFurnitureParts(item);
    expect(parts.some((part) => part.colour === item.colour)).toBe(true);
    expect(parts.length).toBeGreaterThan(2);
  }
});
it('falls back to saved-size primitive geometry for unavailable catalog versions', () => {
  const item = { ...newItem('sofa-3', 0, 0), catalogVersion: 99 };
  expect(buildFurnitureParts(item)).toEqual([
    {
      size: [2.2, 0.82, 0.9],
      position: [0, 0, 0],
      colour: item.colour,
      texture: 'fabric',
      round: false,
    },
  ]);
});
it('keeps appliance, console and glass-table detail inside resized footprints', () => {
  const additions = catalog.slice(30);
  for (const entry of additions) {
    for (const factor of [0.1, 1, 3]) {
      const initial = newItem(entry.id, 0, 0);
      const item = {
        ...initial,
        widthMm: initial.widthMm * factor,
        depthMm: initial.depthMm * factor,
        heightMm: initial.heightMm * factor,
      };
      const parts = buildFurnitureParts(item);
      expect(parts.length, entry.id).toBeGreaterThan(2);
      for (const part of parts) {
        for (const [axis, dimension] of [item.widthMm, item.heightMm, item.depthMm].entries()) {
          expect(part.size[axis], entry.id).toBeGreaterThan(0);
          expect(
            Math.abs(part.position[axis]) + part.size[axis] / 2,
            `${entry.id} axis ${axis} scale ${factor}`,
          ).toBeLessThanOrEqual(dimension / 2000 + 0.00001);
        }
      }
    }
  }
});
it('renders glass tops with opaque metal supports and honours finish edits', () => {
  for (const entry of catalog.filter((entry) => entry.finish === 'glass')) {
    const item = newItem(entry.id, 0, 0);
    expect(buildFurnitureParts(item)[0].material).toBe('glass');
    expect(
      buildFurnitureParts(item)
        .slice(1)
        .every((part) => part.material === 'metal' && !part.texture),
    ).toBe(true);
    expect(
      buildFurnitureParts({ ...item, finishId: 'wood' }).every(
        (part) => !part.material && part.texture === 'wood',
      ),
    ).toBe(true);
  }
});
