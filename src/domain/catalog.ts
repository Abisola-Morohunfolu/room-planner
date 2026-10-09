export type Category =
  | 'Seating'
  | 'Tables'
  | 'Desks'
  | 'Beds'
  | 'Storage'
  | 'Appliances'
  | 'Rugs'
  | 'Lighting'
  | 'Fixtures'
  | 'Custom';
export type FurnitureFinish = 'neutral' | 'wood' | 'fabric' | 'glass' | 'metal';
export interface CatalogItem {
  id: string;
  version: number;
  name: string;
  category: Category;
  width: number;
  depth: number;
  height: number;
  shape: 'rectangle' | 'ellipse';
  colour: string;
  model: string;
  finish: FurnitureFinish;
  nonblocking: boolean;
  license: string;
  source: string;
}
const entries: [string, string, Category, number, number, number, string?, string?][] = [
  ['sofa-2', 'Two-seat sofa', 'Seating', 1800, 850, 800],
  ['sofa-3', 'Three-seat sofa', 'Seating', 2200, 900, 820],
  ['armchair', 'Lounge armchair', 'Seating', 850, 850, 800],
  ['dining-chair', 'Dining chair', 'Seating', 480, 520, 850],
  ['stool', 'Round stool', 'Seating', 400, 400, 450, 'ellipse'],
  ['bench', 'Timber bench', 'Seating', 1400, 400, 450],
  ['coffee-rect', 'Oak coffee table', 'Tables', 1100, 600, 400],
  ['coffee-round', 'Round coffee table', 'Tables', 800, 800, 400, 'ellipse'],
  ['side-table', 'Side table', 'Tables', 450, 450, 500],
  ['dining-rect', 'Dining table', 'Tables', 1600, 900, 750],
  ['dining-round', 'Round dining table', 'Tables', 1100, 1100, 750, 'ellipse'],
  ['desk', 'Writing desk', 'Desks', 1200, 600, 750],
  ['standing-desk', 'Standing desk', 'Desks', 1400, 700, 1050],
  ['office-chair', 'Office chair', 'Seating', 650, 650, 1050],
  ['bed-single', 'Single bed', 'Beds', 900, 2000, 600],
  ['bed-double', 'Double bed', 'Beds', 1400, 2000, 600],
  ['bed-king', 'King bed', 'Beds', 1800, 2000, 650],
  ['bedside', 'Bedside table', 'Storage', 450, 400, 550],
  ['wardrobe', 'Wardrobe', 'Storage', 1800, 600, 2200],
  ['dresser', 'Dresser', 'Storage', 1200, 500, 800],
  ['bookcase', 'Bookcase', 'Storage', 800, 300, 1800],
  ['low-cabinet', 'Low cabinet', 'Storage', 1400, 400, 700],
  ['media-unit', 'Media unit', 'Storage', 1800, 400, 500],
  ['shelf-open', 'Open shelving', 'Storage', 900, 350, 1800],
  ['shelf-wide', 'Wide shelving', 'Storage', 1600, 400, 1500],
  ['counter', 'Shop counter', 'Fixtures', 1800, 600, 1000],
  ['plinth', 'Display plinth', 'Fixtures', 600, 600, 900],
  ['rug-rect', 'Woven rug', 'Rugs', 2400, 1600, 10],
  ['rug-round', 'Round rug', 'Rugs', 1800, 1800, 10, 'ellipse'],
  ['floor-lamp', 'Floor lamp', 'Lighting', 350, 350, 1600, 'ellipse'],
  ['tv-console', 'TV console', 'Storage', 1600, 400, 550],
  ['tv-console-wide', 'Wide TV console', 'Storage', 2200, 450, 600],
  ['television', 'Television with stand', 'Appliances', 1230, 300, 800],
  ['soundbar', 'Soundbar', 'Appliances', 900, 100, 80],
  ['refrigerator', 'Fridge freezer', 'Appliances', 600, 650, 1850],
  ['fridge-double', 'Double-door refrigerator', 'Appliances', 900, 700, 1800],
  ['chest-freezer', 'Chest freezer', 'Appliances', 1100, 650, 850],
  ['washing-machine', 'Washing machine', 'Appliances', 600, 600, 850],
  ['tumble-dryer', 'Tumble dryer', 'Appliances', 600, 600, 850],
  ['dishwasher', 'Dishwasher', 'Appliances', 600, 600, 850],
  ['cooker', 'Cooker with oven', 'Appliances', 600, 600, 900],
  ['microwave', 'Microwave', 'Appliances', 500, 400, 300],
  ['portable-ac', 'Portable air conditioner', 'Appliances', 450, 400, 750],
  ['tower-fan', 'Tower fan', 'Appliances', 300, 300, 1000, 'ellipse'],
  ['water-dispenser', 'Water dispenser', 'Appliances', 350, 350, 1200],
  ['glass-coffee-rect', 'Glass coffee table', 'Tables', 1100, 600, 400],
  ['glass-coffee-round', 'Round glass coffee table', 'Tables', 800, 800, 400, 'ellipse'],
  ['glass-side-table', 'Glass side table', 'Tables', 450, 450, 500],
  ['glass-dining-rect', 'Glass dining table', 'Tables', 1600, 900, 750],
  ['glass-dining-round', 'Round glass dining table', 'Tables', 1100, 1100, 750, 'ellipse'],
];
export const catalog: CatalogItem[] = entries.map(
  ([catalogId, name, category, width, depth, height, shape]) => ({
    id: catalogId,
    version: 1,
    name,
    category,
    width,
    depth,
    height,
    shape: shape === 'ellipse' ? 'ellipse' : 'rectangle',
    colour: catalogId.startsWith('glass-')
      ? '#bad9d5'
      : category === 'Appliances'
        ? ['television', 'soundbar', 'tower-fan'].includes(catalogId)
          ? '#303b40'
          : '#d8dedd'
        : category === 'Seating'
          ? '#819386'
          : category === 'Rugs'
            ? '#c7b89b'
            : category === 'Beds'
              ? '#dfd8c8'
              : '#b18c65',
    model: catalogId,
    finish: catalogId.startsWith('glass-')
      ? 'glass'
      : category === 'Appliances'
        ? 'metal'
        : category === 'Seating'
          ? 'fabric'
          : 'wood',
    nonblocking: category === 'Rugs',
    license: 'CC0-1.0',
    source: 'First-party procedural geometry, Room Planner',
  }),
);
export const customCatalog: CatalogItem[] = ['box', 'cylinder'].map((kind) => ({
  id: `custom-${kind}`,
  version: 1,
  name: kind === 'box' ? 'Custom box' : 'Custom cylinder',
  category: 'Custom',
  width: 600,
  depth: 600,
  height: 600,
  shape: kind === 'box' ? 'rectangle' : 'ellipse',
  colour: '#9cafa4',
  model: kind,
  finish: 'wood',
  nonblocking: false,
  license: 'CC0-1.0',
  source: 'First-party primitive',
}));
export const findCatalog = (catalogId: string) =>
  [...catalog, ...customCatalog].find((catalogItem) => catalogItem.id === catalogId);
