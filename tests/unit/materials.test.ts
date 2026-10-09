import { it, expect } from 'vitest';
import { catalog } from '../../src/domain/catalog';
import { newItem } from '../../src/domain/model';
import { buildFurnitureParts } from '../../src/editor/renderers/furnitureParts';
it('keeps all first-party furniture parts within their measured bounds', () => {
  expect(catalog).toHaveLength(30);
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
