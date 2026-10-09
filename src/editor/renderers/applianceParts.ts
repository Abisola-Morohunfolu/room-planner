import type { FurnitureItem } from '../../domain/model';
import type { FurniturePart } from './furnitureParts';

export function buildApplianceParts(item: FurnitureItem): FurniturePart[] {
  const w = item.widthMm / 1000,
    h = item.heightMm / 1000,
    d = item.depthMm / 1000;
  const parts: FurniturePart[] = [];
  // Fractions are relative to the saved bounding box, including when resized.
  const add = (
    size: FurniturePart['size'],
    position: FurniturePart['position'],
    colour = item.colour,
    options: Partial<FurniturePart> = {},
  ) =>
    parts.push({
      size: [size[0] * w, size[1] * h, size[2] * d],
      position: [position[0] * w, position[1] * h, position[2] * d],
      colour,
      material: item.finishId === 'glass' || item.finishId === 'metal' ? item.finishId : undefined,
      texture:
        item.finishId === 'wood' ? 'wood' : item.finishId === 'fabric' ? 'fabric' : undefined,
      ...options,
    });
  const dark = '#28363c',
    metal = { material: 'metal', texture: undefined } as const,
    screen = { material: 'screen', texture: undefined } as const;
  const grille = (count: number, low: number, high: number, span = 0.7) => {
    for (let i = 0; i < count; i++)
      add([span, 0.012, 0.014], [0, low + ((high - low) * i) / (count - 1), 0.493], dark, screen);
  };
  if (item.catalogId === 'television') {
    add([1, 0.87, 0.16], [0, 0.065, -0.1], item.colour, { radius: 0.015 });
    add([0.94, 0.8, 0.012], [0, 0.065, -0.014], '#172931', screen);
    for (const side of [-1, 1]) {
      add([0.045, 0.13, 0.12], [side * 0.31, -0.435, -0.1], item.colour, metal);
      add([0.22, 0.025, 1], [side * 0.31, -0.4875, 0], item.colour, metal);
    }
  } else if (item.catalogId === 'soundbar') {
    add([1, 1, 1], [0, 0, 0], item.colour, { radius: 0.018 });
    grille(5, -0.3, 0.3, 0.92);
  } else if (item.catalogId === 'tower-fan') {
    add([1, 0.04, 1], [0, -0.48, 0], item.colour, { round: true });
    add([0.48, 0.9, 0.48], [0, 0.05, 0], item.colour, { round: true });
    for (let i = 0; i < 3; i++) add([0.03, 0.7, 0.015], [(i - 1) * 0.1, 0.02, 0.215], dark, screen);
    add([0.12, 0.02, 0.12], [0, 0.49, 0], '#859fa6', { round: true, ...screen });
  } else if (item.catalogId === 'water-dispenser') {
    add([0.94, 0.72, 0.94], [0, -0.14, 0], item.colour, { radius: 0.018 });
    add([0.64, 0.28, 0.64], [0, 0.36, 0], '#7db8cb', {
      round: true,
      material: 'glass',
      texture: undefined,
    });
    add([0.65, 0.19, 0.02], [0, 0.02, 0.475], dark, screen);
    for (const side of [-1, 1])
      add(
        [0.08, 0.035, 0.055],
        [side * 0.16, 0.07, 0.4725],
        side < 0 ? '#507e9d' : '#af6255',
        metal,
      );
    add([0.66, 0.015, 0.08], [0, -0.085, 0.46], dark, metal);
  } else {
    const bodyHeight =
      item.catalogId === 'cooker' ? 0.965 : item.catalogId === 'chest-freezer' ? 0.95 : 1;
    add([1, bodyHeight, 0.94], [0, (bodyHeight - 1) / 2, -0.03], item.colour, { radius: 0.012 });
    if (['refrigerator', 'fridge-double'].includes(item.catalogId)) {
      if (item.catalogId === 'fridge-double') {
        for (const side of [-1, 1]) {
          add([0.485, 0.98, 0.055], [side * 0.25, 0, 0.4725]);
          add([0.025, 0.36, 0.025], [side * 0.045, 0.06, 0.4875], dark, metal);
        }
      } else {
        add([0.98, 0.65, 0.055], [0, 0.165, 0.4725]);
        add([0.98, 0.31, 0.055], [0, -0.335, 0.4725]);
        for (const y of [0.11, -0.27]) add([0.03, 0.17, 0.025], [-0.36, y, 0.4875], dark, metal);
      }
    } else if (item.catalogId === 'chest-freezer') {
      add([0.98, 0.05, 1], [0, 0.475, 0]);
      add([0.24, 0.025, 0.06], [0, 0.39, 0.47], dark, metal);
      grille(5, -0.36, -0.22, 0.22);
    } else if (['washing-machine', 'tumble-dryer'].includes(item.catalogId)) {
      add([0.98, 0.98, 0.04], [0, 0, 0.46]);
      add([0.9, 0.1, 0.015], [0, 0.39, 0.4925], dark, screen);
      // Front-facing cylinders use a world-space bounding box.
      const diameter = Math.min(w * 0.65, h * 0.51);
      for (const [factor, z, paint, material] of [
        [1, 0.486, '#7c8e94', 'metal'],
        [0.8, 0.491, '#243d48', 'glass'],
      ] as const)
        parts.push({
          size: [diameter * factor, diameter * factor, d * 0.018],
          position: [0, -h * 0.055, d * z],
          colour: paint,
          disc: true,
          material,
        });
    } else if (item.catalogId === 'cooker') {
      add([1, 0.035, 1], [0, 0.4825, 0], dark, metal);
      for (const x of [-0.26, 0.26])
        for (const z of [-0.26, 0.26])
          add([0.3, 0.018, 0.3], [x, 0.491, z], '#111d22', { round: true, ...metal });
      add([0.86, 0.55, 0.018], [0, -0.115, 0.49], '#1b3038', screen);
      add([0.72, 0.025, 0.025], [0, 0.215, 0.4875], '#89999d', metal);
      for (const x of [-0.3, -0.1, 0.1, 0.3])
        add([0.045, (0.045 * w) / h, 0.02], [x, 0.36, 0.49], dark, { disc: true, ...metal });
    } else if (item.catalogId === 'microwave') {
      add([0.71, 0.78, 0.018], [-0.1, 0, 0.49], dark, screen);
      add([0.035, 0.53, 0.025], [0.29, 0, 0.4875], '#839699', metal);
      add([0.12, 0.18, 0.02], [0.4, 0.22, 0.49], '#203f46', screen);
      for (const y of [-0.02, -0.22])
        add([0.065, (0.065 * w) / h, 0.02], [0.4, y, 0.49], '#85989c', { disc: true, ...metal });
    } else if (item.catalogId === 'dishwasher') {
      add([0.98, 0.86, 0.06], [0, -0.06, 0.47]);
      add([0.92, 0.1, 0.015], [0, 0.4, 0.4925], dark, screen);
      add([0.7, 0.025, 0.025], [0, 0.26, 0.4875], '#839699', metal);
    } else if (item.catalogId === 'portable-ac') {
      grille(9, 0.08, 0.35);
      add([0.28, 0.08, 0.014], [0, -0.12, 0.493], '#27434b', screen);
      for (const side of [-1, 1])
        for (const end of [-1, 1])
          add([0.09, 0.06, 0.09], [side * 0.4, -0.47, end * 0.38], dark, metal);
    }
  }
  return parts;
}
