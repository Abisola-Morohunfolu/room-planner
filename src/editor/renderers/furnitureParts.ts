import { Color } from 'three';
import type { FurnitureItem } from '../../domain/model';
import { findCatalog } from '../../domain/catalog';
import type { TextureKind } from './materials';
export interface FurniturePart {
  size: [number, number, number];
  position: [number, number, number];
  colour: string;
  round?: boolean;
  radius?: number;
  texture?: TextureKind;
}
export function buildFurnitureParts(item: FurnitureItem): FurniturePart[] {
  const width = item.widthMm / 1000,
    height = item.heightMm / 1000,
    depth = item.depthMm / 1000,
    parts: FurniturePart[] = [],
    colour = item.colour;
  const lightColour = '#' + new Color(colour).offsetHSL(0, -0.03, 0.08).getHexString(),
    darkColour = '#' + new Color(colour).offsetHSL(0, 0, -0.1).getHexString();
  const texture: TextureKind | undefined = item.nonblocking
    ? 'rug'
    : item.finishId === 'wood'
      ? 'wood'
      : item.finishId === 'fabric'
        ? 'fabric'
        : undefined;
  if (findCatalog(item.catalogId)?.version !== item.catalogVersion)
    return [
      {
        size: [width, height, depth],
        position: [0, 0, 0],
        colour,
        texture,
        round: item.shape === 'ellipse',
      },
    ];
  const add = (
    size: FurniturePart['size'],
    position: FurniturePart['position'],
    paint = colour,
    options: Partial<FurniturePart> = {},
  ) => parts.push({ size, position, colour: paint, texture, ...options });
  const sofa = item.catalogId.startsWith('sofa') || item.catalogId === 'armchair',
    bed = item.catalogId.startsWith('bed-'),
    chair = item.catalogId.includes('chair'),
    table =
      item.catalogId.includes('table') ||
      item.catalogId.startsWith('coffee-') ||
      (item.catalogId.startsWith('dining-') && !chair) ||
      item.catalogId.includes('desk') ||
      item.catalogId === 'bench' ||
      item.catalogId === 'stool',
    shelf = ['bookcase', 'shelf-open', 'shelf-wide'].includes(item.catalogId),
    storage = ['wardrobe', 'dresser', 'low-cabinet', 'media-unit'].includes(item.catalogId);
  if (sofa) {
    add([width, height * 0.22, depth], [0, -height * 0.23, 0], darkColour, { radius: 0.04 });
    add([width * 0.92, height * 0.64, depth * 0.16], [0, height * 0.18, -depth * 0.42], colour, {
      radius: 0.055,
    });
    for (const side of [-1, 1])
      add(
        [width * 0.075, height * 0.54, depth * 0.9],
        [side * width * 0.4625, -height * 0.02, 0],
        colour,
        { radius: 0.04 },
      );
    const seatCount = item.catalogId === 'sofa-3' ? 3 : item.catalogId === 'armchair' ? 1 : 2;
    for (let index = 0; index < seatCount; index++) {
      const seatWidth = (width * 0.83) / seatCount,
        xPosition = (index - (seatCount - 1) / 2) * seatWidth;
      add(
        [seatWidth * 0.96, height * 0.15, depth * 0.71],
        [xPosition, -height * 0.045, depth * 0.045],
        lightColour,
        { radius: 0.04 },
      );
      add(
        [seatWidth * 0.96, height * 0.35, depth * 0.13],
        [xPosition, height * 0.21, -depth * 0.29],
        colour,
        { radius: 0.045 },
      );
    }
    for (const side of [-1, 1])
      for (const end of [-1, 1])
        add(
          [width * 0.035, height * 0.16, depth * 0.055],
          [side * width * 0.41, -height * 0.42, end * depth * 0.36],
          '#876f54',
          { round: true, texture: 'wood' },
        );
    if (width > 1.2)
      for (const side of [-1, 1])
        add(
          [width * 0.12, height * 0.3, depth * 0.13],
          [side * width * 0.3, height * 0.18, -depth * 0.2],
          lightColour,
          { radius: 0.04, texture: 'fabric' },
        );
  } else if (bed) {
    add([width, height * 0.28, depth], [0, -height * 0.31, 0], '#a48b69', {
      radius: 0.025,
      texture: 'wood',
    });
    add([width * 0.98, height * 0.24, depth * 0.97], [0, -height * 0.05, 0], colour, {
      radius: 0.04,
      texture: 'fabric',
    });
    add([width, height * 0.6, depth * 0.065], [0, height * 0.2, -depth * 0.4675], darkColour, {
      radius: 0.02,
    });
    for (const side of [-1, 1])
      add(
        [width * 0.41, height * 0.14, depth * 0.17],
        [side * width * 0.23, height * 0.12, -depth * 0.29],
        '#f1ede5',
        { radius: 0.05, texture: 'fabric' },
      );
    add(
      [width * 0.98, height * 0.03, depth * 0.24],
      [0, height * 0.085, depth * 0.34],
      darkColour,
      { radius: 0.01, texture: 'fabric' },
    );
  } else if (table) {
    const top = Math.min(0.075, height * 0.15);
    add([width, top, depth], [0, (height - top) / 2, 0], colour, {
      round: item.shape === 'ellipse',
      radius: 0.014,
    });
    const legHeight = height - top;
    if (item.shape === 'ellipse') {
      add([width * 0.13, legHeight, depth * 0.13], [0, -top / 2, 0], darkColour, { round: true });
      add([width * 0.5, 0.025, depth * 0.5], [0, -height / 2 + 0.0125, 0], darkColour, {
        round: true,
      });
    } else
      for (const horizontalSide of [-1, 1])
        for (const verticalSide of [-1, 1])
          add(
            [Math.min(0.055, width * 0.09), legHeight, Math.min(0.055, depth * 0.09)],
            [horizontalSide * width * 0.4, -top / 2, verticalSide * depth * 0.37],
            darkColour,
            { radius: 0.012 },
          );
  } else if (chair) {
    add([width, height * 0.1, depth * 0.92], [0, -height * 0.015, 0], colour, {
      radius: 0.045,
      texture: item.finishId === 'wood' ? 'wood' : 'fabric',
    });
    add([width, height * 0.42, depth * 0.11], [0, height * 0.29, -depth * 0.435], colour, {
      radius: 0.035,
    });
    for (const horizontalSide of [-1, 1])
      for (const verticalSide of [-1, 1])
        add(
          [width * 0.08, height * 0.435, depth * 0.08],
          [horizontalSide * width * 0.38, -height * 0.2825, verticalSide * depth * 0.37],
          darkColour,
          { radius: 0.008, texture: 'wood' },
        );
  } else if (shelf) {
    const thickness = Math.min(0.035, width * 0.08);
    for (const side of [-1, 1])
      add([thickness, height, depth], [(side * (width - thickness)) / 2, 0, 0]);
    add([width, height, thickness], [0, 0, -(depth - thickness) / 2]);
    for (let index = 0; index <= 4; index++)
      add(
        [width, thickness, depth],
        [0, -height / 2 + thickness / 2 + ((height - thickness) * index) / 4, 0],
      );
  } else if (storage) {
    add([width, height, depth], [0, 0, 0], colour, { radius: 0.014 });
    for (let index = 1; index < 4; index++)
      add(
        [width * 0.93, 0.007, 0.01],
        [0, -height / 2 + (height * index) / 4, depth / 2 - 0.005],
        darkColour,
      );
    for (let index = 0; index < 3; index++)
      add(
        [width * 0.12, 0.012, 0.015],
        [0, -height / 2 + (height * (index + 0.5)) / 3, depth / 2 - 0.0075],
        '#746b55',
      );
  } else if (item.catalogId === 'floor-lamp') {
    add([width, 0.025, depth], [0, -height / 2 + 0.0125, 0], darkColour, {
      round: true,
      texture: undefined,
    });
    add([width * 0.055, height * 0.78, depth * 0.055], [0, -height * 0.095, 0], '#85734f', {
      round: true,
      texture: undefined,
    });
    add([width, height * 0.22, depth], [0, height * 0.39, 0], colour, {
      round: true,
      texture: 'fabric',
    });
  } else
    add([width, height, depth], [0, 0, 0], colour, {
      round: item.shape === 'ellipse',
      radius: item.nonblocking ? 0 : 0.01,
    });
  return parts;
}
