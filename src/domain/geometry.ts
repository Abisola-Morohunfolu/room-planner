import type { FurnitureItem, Room, Opening, Layout } from './model';
export interface Point {
  x: number;
  y: number;
}
export interface Wall {
  id: string;
  a: Point;
  b: Point;
  length: number;
  inward: Point;
}
export const roundMm = (millimetres: number) => Math.round(millimetres * 10) / 10;
export const normalizeAngle = (degrees: number) => ((degrees % 360) + 360) % 360;
export const distance = (firstPoint: Point, secondPoint: Point) =>
  Math.hypot(firstPoint.x - secondPoint.x, firstPoint.y - secondPoint.y);
/** Project a plan point onto a wall, treating the point as the opening centre. */
export function openingOffsetAtPoint(wall: Wall, point: Point, widthMm: number): number {
  const along =
    ((point.x - wall.a.x) * (wall.b.x - wall.a.x) + (point.y - wall.a.y) * (wall.b.y - wall.a.y)) /
    wall.length;
  return roundMm(Math.max(0, Math.min(wall.length - widthMm, along - widthMm / 2)));
}
export function roomPolygon(room: Room): Point[] {
  const {
    widthMm: widthMm,
    depthMm: depthMm,
    cutoutWidthMm: cutoutWidthMm,
    cutoutDepthMm: cutoutDepthMm,
  } = room;
  let points =
    room.shape === 'rectangle'
      ? [
          { x: 0, y: 0 },
          { x: widthMm, y: 0 },
          { x: widthMm, y: depthMm },
          { x: 0, y: depthMm },
        ]
      : [
          { x: 0, y: 0 },
          { x: widthMm - cutoutWidthMm, y: 0 },
          { x: widthMm - cutoutWidthMm, y: cutoutDepthMm },
          { x: widthMm, y: cutoutDepthMm },
          { x: widthMm, y: depthMm },
          { x: 0, y: depthMm },
        ];
  if (room.mirrored) points = points.map((point) => ({ x: widthMm - point.x, y: point.y }));
  const turns = room.quarterTurns;
  for (let turnIndex = 0; turnIndex < turns; turnIndex++)
    points = points.map((point) => ({ x: -point.y, y: point.x }));
  const minX = Math.min(...points.map((point) => point.x)),
    minY = Math.min(...points.map((point) => point.y));
  return points.map((point) => ({ x: roundMm(point.x - minX), y: roundMm(point.y - minY) }));
}
export function walls(room: Room): Wall[] {
  const polygon = roomPolygon(room),
    wallIds =
      room.shape === 'rectangle'
        ? ['north', 'east', 'south', 'west']
        : ['north', 'inner-vertical', 'inner-horizontal', 'east', 'south', 'west'];
  const area = polygon.reduce(
    (areaTotal, point, wallIndex) =>
      areaTotal +
      point.x * polygon[(wallIndex + 1) % polygon.length].y -
      polygon[(wallIndex + 1) % polygon.length].x * point.y,
    0,
  );
  return polygon.map((startPoint, wallIndex) => {
    const endPoint = polygon[(wallIndex + 1) % polygon.length],
      length = distance(startPoint, endPoint),
      windingDirection = area > 0 ? 1 : -1;
    return {
      id: wallIds[wallIndex],
      a: startPoint,
      b: endPoint,
      length,
      inward: {
        x: (-(endPoint.y - startPoint.y) / length) * windingDirection,
        y: ((endPoint.x - startPoint.x) / length) * windingDirection,
      },
    };
  });
}
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (
    let edgeIndex = 0, previousEdgeIndex = polygon.length - 1;
    edgeIndex < polygon.length;
    previousEdgeIndex = edgeIndex++
  ) {
    const edgeStart = polygon[previousEdgeIndex],
      edgeEnd = polygon[edgeIndex];
    if (pointSegmentDistance(point, edgeStart, edgeEnd) < 0.01) return true;
    if (
      edgeStart.y > point.y !== edgeEnd.y > point.y &&
      point.x <
        ((edgeEnd.x - edgeStart.x) * (point.y - edgeStart.y)) / (edgeEnd.y - edgeStart.y) +
          edgeStart.x
    )
      inside = !inside;
  }
  return inside;
}
/** Local plan outline; the chaise occupies 36% of the width and the back seats 52% of the depth. */
export function localFootprint(
  item: Pick<FurnitureItem, 'shape' | 'widthMm' | 'depthMm' | 'catalogId'>,
): Point[] {
  const w = item.widthMm,
    d = item.depthMm;
  if (item.shape === 'ellipse')
    return Array.from({ length: 64 }, (_, i) => ({
      x: (Math.cos((i * 2 * Math.PI) / 64) * w) / 2,
      y: (Math.sin((i * 2 * Math.PI) / 64) * d) / 2,
    }));
  if (item.shape === 'l-shape') {
    const points = [
      { x: -w / 2, y: -d / 2 },
      { x: w / 2, y: -d / 2 },
      { x: w / 2, y: d * 0.02 },
      { x: -w * 0.14, y: d * 0.02 },
      { x: -w * 0.14, y: d / 2 },
      { x: -w / 2, y: d / 2 },
    ];
    return item.catalogId.endsWith('-right')
      ? points.map((p) => ({ x: -p.x, y: p.y })).reverse()
      : points;
  }
  return [
    { x: -w / 2, y: -d / 2 },
    { x: w / 2, y: -d / 2 },
    { x: w / 2, y: d / 2 },
    { x: -w / 2, y: d / 2 },
  ];
}
function transformPoints(item: FurnitureItem, points: Point[]): Point[] {
  const radians = (item.rotationDeg * Math.PI) / 180;
  return points.map((p) => ({
    x: item.xMm + p.x * Math.cos(radians) - p.y * Math.sin(radians),
    y: item.yMm + p.x * Math.sin(radians) + p.y * Math.cos(radians),
  }));
}
export function footprint(item: FurnitureItem): Point[] {
  return transformPoints(item, localFootprint(item));
}
/** Convex pieces keep collision and clearance checks accurate in the couch's open corner. */
export function footprintParts(item: FurnitureItem): Point[][] {
  if (item.shape !== 'l-shape') return [footprint(item)];
  const w = item.widthMm,
    d = item.depthMm,
    side = item.catalogId.endsWith('-right') ? -1 : 1;
  return [
    [
      { x: -w / 2, y: -d / 2 },
      { x: w / 2, y: -d / 2 },
      { x: w / 2, y: d * 0.02 },
      { x: -w / 2, y: d * 0.02 },
    ],
    [
      { x: -w / 2, y: d * 0.02 },
      { x: -w * 0.14, y: d * 0.02 },
      { x: -w * 0.14, y: d / 2 },
      { x: -w / 2, y: d / 2 },
    ].map((p) => ({ x: p.x * side, y: p.y })),
  ].map((points) => transformPoints(item, points));
}
export function furnitureGap(first: FurnitureItem, second: FurnitureItem): number {
  return Math.min(
    ...footprintParts(first).flatMap((a) =>
      footprintParts(second).map((b) => polygonDistance(a, b)),
    ),
  );
}
export function itemElevation(item: FurnitureItem, items: FurnitureItem[] = []): number {
  let elevation = item.elevationMm ?? 0;
  const visited = new Set([item.id]);
  let supportId = item.supportedById;
  while (supportId && !visited.has(supportId)) {
    visited.add(supportId);
    const support = items.find((piece) => piece.id === supportId);
    if (!support) break;
    elevation += support.heightMm + (support.elevationMm ?? 0);
    supportId = support.supportedById;
  }
  return roundMm(elevation);
}
export function heightsOverlap(
  first: FurnitureItem,
  second: FurnitureItem,
  items: FurnitureItem[],
): boolean {
  const a = itemElevation(first, items),
    b = itemElevation(second, items);
  return Math.min(a + first.heightMm, b + second.heightMm) - Math.max(a, b) > 0.1;
}
export function planItems(items: FurnitureItem[]): FurnitureItem[] {
  return [...items].sort(
    (a, b) =>
      Number(b.nonblocking) - Number(a.nonblocking) ||
      itemElevation(a, items) - itemElevation(b, items),
  );
}
export function isDescendant(
  item: FurnitureItem,
  ancestorId: string,
  items: FurnitureItem[],
): boolean {
  const seen = new Set<string>();
  let id = item.supportedById;
  while (id && !seen.has(id)) {
    if (id === ancestorId) return true;
    seen.add(id);
    id = items.find((piece) => piece.id === id)?.supportedById ?? null;
  }
  return false;
}
export function fitsOn(item: FurnitureItem, support: FurnitureItem): boolean {
  const outline = footprint(item),
    surface = footprint(support);
  return (
    outline.every((p) => pointInPolygon(p, surface)) &&
    !outline.some((a, i) =>
      surface.some((b, j) =>
        segmentsCross(a, outline[(i + 1) % outline.length], b, surface[(j + 1) % surface.length]),
      ),
    )
  );
}
const cross = (startPoint: Point, endPoint: Point, testPoint: Point) =>
  (endPoint.x - startPoint.x) * (testPoint.y - startPoint.y) -
  (endPoint.y - startPoint.y) * (testPoint.x - startPoint.x);
function segmentsCross(firstStart: Point, firstEnd: Point, secondStart: Point, secondEnd: Point) {
  return (
    cross(firstStart, firstEnd, secondStart) * cross(firstStart, firstEnd, secondEnd) < -0.001 &&
    cross(secondStart, secondEnd, firstStart) * cross(secondStart, secondEnd, firstEnd) < -0.001
  );
}
export function contained(item: FurnitureItem, room: Room): boolean {
  const itemFootprint = footprint(item),
    roomBoundary = roomPolygon(room);
  return (
    itemFootprint.every((point) => pointInPolygon(point, roomBoundary)) &&
    !itemFootprint.some((itemEdgeStart, itemEdgeIndex) =>
      roomBoundary.some((wallStart, wallIndex) =>
        segmentsCross(
          itemEdgeStart,
          itemFootprint[(itemEdgeIndex + 1) % itemFootprint.length],
          wallStart,
          roomBoundary[(wallIndex + 1) % roomBoundary.length],
        ),
      ),
    )
  );
}
/** Signed minimum separating-axis gap: negative means penetration, zero means touch. Convex footprints only. */
export function convexGap(firstPolygon: Point[], secondPolygon: Point[]): number {
  let best = -Infinity;
  for (const polygon of [firstPolygon, secondPolygon])
    for (let edgeIndex = 0; edgeIndex < polygon.length; edgeIndex++) {
      const edgeStart = polygon[edgeIndex],
        edgeEnd = polygon[(edgeIndex + 1) % polygon.length],
        edgeLength = distance(edgeStart, edgeEnd),
        axis = {
          x: -(edgeEnd.y - edgeStart.y) / edgeLength,
          y: (edgeEnd.x - edgeStart.x) / edgeLength,
        };
      const firstProjections = firstPolygon.map((point) => point.x * axis.x + point.y * axis.y),
        secondProjections = secondPolygon.map((point) => point.x * axis.x + point.y * axis.y);
      best = Math.max(
        best,
        Math.min(...secondProjections) - Math.max(...firstProjections),
        Math.min(...firstProjections) - Math.max(...secondProjections),
      );
    }
  return best;
}
export function pointSegmentDistance(point: Point, startPoint: Point, endPoint: Point): number {
  const deltaX = endPoint.x - startPoint.x,
    deltaY = endPoint.y - startPoint.y,
    projectionFraction = Math.max(
      0,
      Math.min(
        1,
        ((point.x - startPoint.x) * deltaX + (point.y - startPoint.y) * deltaY) /
          (deltaX * deltaX + deltaY * deltaY || 1),
      ),
    );
  return distance(point, {
    x: startPoint.x + projectionFraction * deltaX,
    y: startPoint.y + projectionFraction * deltaY,
  });
}
export function polygonDistance(firstPolygon: Point[], secondPolygon: Point[]): number {
  const gap = convexGap(firstPolygon, secondPolygon);
  if (gap <= 0) return gap;
  return Math.min(
    ...firstPolygon.flatMap((point) =>
      secondPolygon.map((edgeStart, edgeIndex) =>
        pointSegmentDistance(
          point,
          edgeStart,
          secondPolygon[(edgeIndex + 1) % secondPolygon.length],
        ),
      ),
    ),
    ...secondPolygon.flatMap((point) =>
      firstPolygon.map((edgeStart, edgeIndex) =>
        pointSegmentDistance(point, edgeStart, firstPolygon[(edgeIndex + 1) % firstPolygon.length]),
      ),
    ),
  );
}
export function openingErrors(room: Room, openings: Opening[]): { id: string; message: string }[] {
  const errors: { id: string; message: string }[] = [];
  for (const opening of openings) {
    const wall = walls(room).find((wall) => wall.id === opening.wallId);
    if (!wall || opening.offsetMm + opening.widthMm > (wall?.length ?? 0) + 0.01)
      errors.push({ id: opening.id, message: 'Opening extends beyond its wall.' });
    if (
      opening.heightMm + (opening.type === 'window' ? opening.sillHeightMm : 0) >
      room.ceilingHeightMm
    )
      errors.push({ id: opening.id, message: 'Opening extends above the ceiling.' });
    if (
      openings.some(
        (other) =>
          other.id !== opening.id &&
          other.wallId === opening.wallId &&
          other.offsetMm < opening.offsetMm + opening.widthMm &&
          other.offsetMm + other.widthMm > opening.offsetMm,
      )
    )
      errors.push({ id: opening.id, message: 'Openings overlap on this wall.' });
  }
  return errors;
}
export function doorSector(room: Room, opening: Opening): Point[] {
  const wall = walls(room).find((wall) => wall.id === opening.wallId);
  if (!wall || opening.type !== 'door') return [];
  const wallDirection = {
    x: (wall.b.x - wall.a.x) / wall.length,
    y: (wall.b.y - wall.a.y) / wall.length,
  };
  const hingeOffset = opening.offsetMm + (opening.hinge === 'right' ? opening.widthMm : 0),
    hingePosition = {
      x: wall.a.x + wallDirection.x * hingeOffset,
      y: wall.a.y + wallDirection.y * hingeOffset,
    },
    hingeDirection = opening.hinge === 'right' ? -1 : 1,
    swingDirection = opening.swing === 'inward' ? 1 : -1;
  return [
    hingePosition,
    ...Array.from({ length: 33 }, (_, sampleIndex) => {
      const angle = ((sampleIndex / 32) * Math.PI) / 2;
      return {
        x:
          hingePosition.x +
          opening.widthMm *
            (wallDirection.x * hingeDirection * Math.cos(angle) +
              wall.inward.x * swingDirection * Math.sin(angle)),
        y:
          hingePosition.y +
          opening.widthMm *
            (wallDirection.y * hingeDirection * Math.cos(angle) +
              wall.inward.y * swingDirection * Math.sin(angle)),
      };
    }),
  ];
}
export function warnings(layout: Layout): { itemId: string; message: string }[] {
  const result: { itemId: string; message: string }[] = [];
  for (const item of layout.items) {
    if (!contained(item, layout.room))
      result.push({ itemId: item.id, message: `${item.name} extends outside the room.` });
    if (itemElevation(item, layout.items) + item.heightMm > layout.room.ceilingHeightMm)
      result.push({ itemId: item.id, message: `${item.name} extends above the ceiling.` });
    const support = layout.items.find((piece) => piece.id === item.supportedById);
    if (support && !fitsOn(item, support))
      result.push({ itemId: item.id, message: `${item.name} extends beyond ${support.name}.` });
    if (item.nonblocking) continue;
    for (const other of layout.items)
      if (
        other.id > item.id &&
        !other.nonblocking &&
        heightsOverlap(item, other, layout.items) &&
        furnitureGap(item, other) < -0.1
      )
        result.push({ itemId: item.id, message: `${item.name} overlaps ${other.name}.` });
    for (const opening of layout.openings)
      if (
        opening.type === 'door' &&
        opening.swing === 'inward' &&
        itemElevation(item, layout.items) < opening.heightMm &&
        footprintParts(item).some(
          (part) => convexGap(part, doorSector(layout.room, opening)) < -0.1,
        )
      )
        result.push({ itemId: item.id, message: `${item.name} obstructs a door swing.` });
  }
  return result;
}
export function nearestGap(
  item: FurnitureItem,
  layout: Layout,
): { gap: number; label: string } | null {
  const itemFootprint = footprint(item),
    roomWalls = walls(layout.room);
  const candidates = roomWalls.map((wall) => ({
    gap: contained(item, layout.room)
      ? Math.min(...itemFootprint.map((point) => pointSegmentDistance(point, wall.a, wall.b)))
      : -Math.min(
          ...itemFootprint
            .filter((point) => !pointInPolygon(point, roomPolygon(layout.room)))
            .map((point) => pointSegmentDistance(point, wall.a, wall.b)),
        ),
    label: `${item.name} → ${wall.id} wall`,
  }));
  if (!item.nonblocking)
    for (const other of layout.items)
      if (other.id !== item.id && !other.nonblocking && heightsOverlap(item, other, layout.items))
        candidates.push({
          gap: furnitureGap(item, other),
          label: `${item.name} → ${other.name}`,
        });
  return candidates.sort((a, b) => a.gap - b.gap)[0] ?? null;
}
export function snapPosition(
  item: FurnitureItem,
  x: number,
  y: number,
  room: Room,
  grid: boolean,
  wallSnap: boolean,
  mmPerPixel: number,
): Point {
  let snappedPosition = {
    x: grid ? Math.round(x / 100) * 100 : roundMm(x),
    y: grid ? Math.round(y / 100) * 100 : roundMm(y),
  };
  if (wallSnap)
    for (const wall of walls(room)) {
      const previewFootprint = footprint({
          ...item,
          xMm: snappedPosition.x,
          yMm: snappedPosition.y,
        }),
        gaps = previewFootprint.map(
          (corner) => (corner.x - wall.a.x) * wall.inward.x + (corner.y - wall.a.y) * wall.inward.y,
        ),
        gap = Math.min(...gaps);
      if (Math.abs(gap) < 8 * mmPerPixel)
        snappedPosition = {
          x: snappedPosition.x - wall.inward.x * gap,
          y: snappedPosition.y - wall.inward.y * gap,
        };
    }
  return { x: roundMm(snappedPosition.x), y: roundMm(snappedPosition.y) };
}
export const toThreeTransform = (item: FurnitureItem, items: FurnitureItem[] = []) => ({
  position: [
    item.xMm / 1000,
    itemElevation(item, items) / 1000 + item.heightMm / 2000,
    item.yMm / 1000,
  ] as [number, number, number],
  rotation: [0, (-item.rotationDeg * Math.PI) / 180, 0] as [number, number, number],
  size: [item.widthMm / 1000, item.heightMm / 1000, item.depthMm / 1000] as [
    number,
    number,
    number,
  ],
});
export const roomArea = (room: Room) => {
  const polygon = roomPolygon(room);
  return (
    Math.abs(
      polygon.reduce(
        (areaTotal, point, pointIndex) =>
          areaTotal +
          point.x * polygon[(pointIndex + 1) % polygon.length].y -
          polygon[(pointIndex + 1) % polygon.length].x * point.y,
        0,
      ),
    ) /
    2 /
    1e6
  );
};
