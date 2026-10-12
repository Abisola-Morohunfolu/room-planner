import { findCatalog } from './catalog';
import { fitsOn, isDescendant, itemElevation, normalizeAngle, roundMm } from './geometry';
import type { FurnitureItem } from './model';

/** Automatic placement uses flat surfaces; the inspector also allows other solid supports. */
export function supportAtPosition(
  item: FurnitureItem,
  items: FurnitureItem[],
): FurnitureItem | undefined {
  if (item.nonblocking) return undefined;
  const current = items.find((piece) => piece.id === item.supportedById);
  if (current && !current.nonblocking && fitsOn(item, current)) return current;
  return items
    .filter((support) => {
      const category = findCatalog(support.catalogId)?.category;
      const flat =
        ['Tables', 'Desks', 'Fixtures', 'Custom'].includes(category ?? '') ||
        [
          'bedside',
          'dresser',
          'low-cabinet',
          'media-unit',
          'tv-console',
          'tv-console-wide',
          'washing-machine',
        ].includes(support.catalogId);
      return (
        flat &&
        support.id !== item.id &&
        !support.nonblocking &&
        !isDescendant(support, item.id, items) &&
        fitsOn(item, support)
      );
    })
    .sort((a, b) => itemElevation(b, items) + b.heightMm - itemElevation(a, items) - a.heightMm)[0];
}

/** Move every descendant rigidly with its support; heights are derived from the support chain. */
export function moveStack(
  items: FurnitureItem[],
  before: FurnitureItem,
  after: FurnitureItem,
): void {
  const radians = ((after.rotationDeg - before.rotationDeg) * Math.PI) / 180;
  const descendants = items.filter((item) => isDescendant(item, before.id, items));
  for (const item of descendants) {
    const x = item.xMm - before.xMm,
      y = item.yMm - before.yMm;
    item.xMm = roundMm(after.xMm + x * Math.cos(radians) - y * Math.sin(radians));
    item.yMm = roundMm(after.yMm + x * Math.sin(radians) + y * Math.cos(radians));
    item.rotationDeg = normalizeAngle(item.rotationDeg + after.rotationDeg - before.rotationDeg);
  }
}
