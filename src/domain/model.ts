import { z } from 'zod';
import { findCatalog } from './catalog';
import { openingErrors, normalizeAngle, roundMm } from './geometry';
const mm = z
  .number()
  .finite()
  .refine(
    (numberMatch) => Math.abs(numberMatch * 10 - Math.round(numberMatch * 10)) < 1e-6,
    'Use precision of 0.1 mm.',
  );
const name = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine(
    (text) =>
      !/[<>]/.test(text) && !Array.from(text).some((character) => character.charCodeAt(0) < 32),
    'Use plain text.',
  );
const colour = z.string().regex(/^#[0-9a-f]{6}$/i);
export const roomSchema = z
  .object({
    shape: z.enum(['rectangle', 'l-shape']),
    widthMm: mm.min(500).max(50000),
    depthMm: mm.min(500).max(50000),
    cutoutWidthMm: mm.min(0),
    cutoutDepthMm: mm.min(0),
    ceilingHeightMm: mm.min(1500).max(10000),
    mirrored: z.boolean(),
    quarterTurns: z.number().int().min(0).max(3),
    wallColours: z.record(z.string().max(30), colour),
    floorFinish: z.enum(['oak', 'walnut', 'stone', 'carpet']),
  })
  .strict()
  .superRefine((room, context) => {
    if (
      room.shape === 'l-shape' &&
      (room.cutoutWidthMm < 500 ||
        room.cutoutDepthMm < 500 ||
        room.widthMm - room.cutoutWidthMm < 500 ||
        room.depthMm - room.cutoutDepthMm < 500)
    )
      context.addIssue({
        code: 'custom',
        message: 'Each L-shape leg and cutout must be at least 500 mm.',
      });
  });
export const openingSchema = z
  .object({
    id: z.uuid(),
    type: z.enum(['door', 'window']),
    wallId: z.string().max(30),
    offsetMm: mm.min(0),
    widthMm: mm.positive().max(20000),
    heightMm: mm.positive().max(10000),
    sillHeightMm: mm.min(0).max(10000),
    hinge: z.enum(['left', 'right']),
    swing: z.enum(['inward', 'outward']),
  })
  .strict();
export const itemSchema = z
  .object({
    id: z.uuid(),
    catalogId: z.string().min(1).max(100),
    catalogVersion: z.number().int().positive(),
    name,
    shape: z.enum(['rectangle', 'ellipse']),
    widthMm: mm.positive().max(20000),
    depthMm: mm.positive().max(20000),
    heightMm: mm.positive().max(20000),
    xMm: mm.min(-100000).max(100000),
    yMm: mm.min(-100000).max(100000),
    rotationDeg: z.number().finite().min(0).lt(360),
    colour,
    finishId: z.enum(['neutral', 'wood', 'fabric', 'glass', 'metal']),
    status: z.enum(['owned', 'to-buy']),
    priceMinor: z.number().int().min(0).max(100000000000).nullable(),
    nonblocking: z.boolean(),
  })
  .strict()
  .superRefine((item, context) => {
    if (item.shape === 'ellipse' && item.widthMm !== item.depthMm)
      context.addIssue({ code: 'custom', message: 'Round items need equal width and depth.' });
    const catalogItem = findCatalog(item.catalogId);
    if (
      catalogItem &&
      (catalogItem.shape !== item.shape || catalogItem.nonblocking !== item.nonblocking)
    )
      context.addIssue({ code: 'custom', message: 'Footprint does not match catalog metadata.' });
  });
export const layoutSchema = z
  .object({
    id: z.uuid(),
    name,
    room: roomSchema,
    openings: z.array(openingSchema).max(20),
    items: z.array(itemSchema).max(200),
    clearanceTargetMm: mm.min(0).max(20000).nullable(),
  })
  .strict();
export const projectSchema = z
  .object({
    schemaVersion: z.literal(1),
    projectId: z.uuid(),
    name,
    displayUnits: z.enum(['metric', 'imperial']),
    currency: z.enum(['USD', 'GBP', 'EUR', 'NGN', 'JPY', 'CAD', 'AUD']),
    activeLayoutId: z.uuid(),
    layouts: z.array(layoutSchema).min(1).max(3),
  })
  .strict()
  .superRefine((project, context) => {
    if (!project.layouts.some((layout) => layout.id === project.activeLayoutId))
      context.addIssue({
        code: 'custom',
        path: ['activeLayoutId'],
        message: 'Select an existing alternative.',
      });
    const ids = [
      project.projectId,
      ...project.layouts.flatMap((layout) => [
        layout.id,
        ...layout.items.map((item) => item.id),
        ...layout.openings.map((opening) => opening.id),
      ]),
    ];
    if (new Set(ids).size !== ids.length)
      context.addIssue({ code: 'custom', message: 'Identifiers must be unique.' });
    for (const [item, layout] of project.layouts.entries())
      for (const error of openingErrors(layout.room, layout.openings))
        context.addIssue({
          code: 'custom',
          path: [
            'layouts',
            item,
            'openings',
            layout.openings.findIndex((opening) => opening.id === error.id),
          ],
          message: error.message,
        });
    if (new TextEncoder().encode(JSON.stringify(project)).byteLength > 1048576)
      context.addIssue({ code: 'custom', message: 'Project exceeds the 1 MiB limit.' });
  });
export type Room = z.infer<typeof roomSchema>;
export type Opening = z.infer<typeof openingSchema>;
export type FurnitureItem = z.infer<typeof itemSchema>;
export type Layout = z.infer<typeof layoutSchema>;
export type ProjectDocument = z.infer<typeof projectSchema>;
export interface CloudEnvelope {
  projectId: string;
  revision: number;
  updatedAt: number;
  deletedAt: number | null;
  document: ProjectDocument;
}
export const uid = () => crypto.randomUUID();
export function newProject(name = 'My room'): ProjectDocument {
  const layoutId = uid();
  return {
    schemaVersion: 1,
    projectId: uid(),
    name,
    displayUnits: 'metric',
    currency: 'USD',
    activeLayoutId: layoutId,
    layouts: [
      {
        id: layoutId,
        name: 'Layout A',
        room: {
          shape: 'rectangle',
          widthMm: 4000,
          depthMm: 5000,
          cutoutWidthMm: 1500,
          cutoutDepthMm: 2000,
          ceilingHeightMm: 2600,
          mirrored: false,
          quarterTurns: 0,
          wallColours: { north: '#e6e3d8', east: '#e6e3d8', south: '#e6e3d8', west: '#e6e3d8' },
          floorFinish: 'oak',
        },
        openings: [],
        items: [],
        clearanceTargetMm: 800,
      },
    ],
  };
}
export function newItem(catalogId: string, xMm: number, yMm: number): FurnitureItem {
  const catalogItem = findCatalog(catalogId);
  if (!catalogItem) throw new Error('Unknown catalog item.');
  return {
    id: uid(),
    catalogId: catalogItem.id,
    catalogVersion: catalogItem.version,
    name: catalogItem.name,
    shape: catalogItem.shape,
    widthMm: catalogItem.width,
    depthMm: catalogItem.depth,
    heightMm: catalogItem.height,
    xMm: roundMm(xMm),
    yMm: roundMm(yMm),
    rotationDeg: 0,
    colour: catalogItem.colour,
    finishId: catalogItem.finish,
    status: 'owned',
    priceMinor: null,
    nonblocking: catalogItem.nonblocking,
  };
}
export function cloneLayout(layout: Layout, name: string): Layout {
  return {
    ...structuredClone(layout),
    id: uid(),
    name,
    items: layout.items.map((item) => ({ ...item, id: uid() })),
    openings: layout.openings.map((opening) => ({ ...opening, id: uid() })),
  };
}
export function cloneProject(project: ProjectDocument, name = project.name): ProjectDocument {
  const layouts = project.layouts.map((layout) => cloneLayout(layout, layout.name));
  return {
    ...structuredClone(project),
    projectId: uid(),
    name,
    layouts,
    activeLayoutId:
      layouts[project.layouts.findIndex((layout) => layout.id === project.activeLayoutId)].id,
  };
}
export const currencyDigits = (currency: string) =>
  new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
    .maximumFractionDigits ?? 2;
export const money = (minor: number, currency: string) =>
  new Intl.NumberFormat('en', { style: 'currency', currency }).format(
    minor / 10 ** currencyDigits(currency),
  );
export function budget(layout: Layout) {
  const buying = layout.items.filter((item) => item.status === 'to-buy');
  return {
    totalMinor: buying.reduce((text, item) => text + (item.priceMinor ?? 0), 0),
    unpriced: buying.filter((item) => item.priceMinor === null).length,
    owned: layout.items.length - buying.length,
  };
}
export function normalizeItem(item: FurnitureItem): FurnitureItem {
  return {
    ...item,
    xMm: roundMm(item.xMm),
    yMm: roundMm(item.yMm),
    rotationDeg: normalizeAngle(item.rotationDeg),
  };
}
