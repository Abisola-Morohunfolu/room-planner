import { useState } from 'react';
import { Search, ArrowUpRight } from 'lucide-react';
import { catalog, customCatalog, type CatalogItem } from '../../domain/catalog';
import { useEditor } from '../../state/editor';
import { formatLength } from '../../domain/units';
export function FurnitureThumbnail({ item }: { item: CatalogItem }) {
  const scale = 62 / Math.max(item.width, item.depth);
  const width = item.width * scale,
    depth = item.depth * scale;
  return (
    <svg viewBox="0 0 120 80" aria-hidden="true">
      <g transform={`translate(${60 - width / 2} ${40 - depth / 2})`}>
        {item.shape === 'ellipse' ? (
          <ellipse
            cx={width / 2}
            cy={depth / 2}
            rx={width / 2}
            ry={depth / 2}
            fill={item.colour}
            stroke="#716a5e"
          />
        ) : (
          <rect
            width={width}
            height={depth}
            rx={item.category === 'Seating' ? 5 : 1}
            fill={item.colour}
            stroke="#716a5e"
          />
        )}
        {item.category === 'Seating' && (
          <path
            d={`M4 ${depth * 0.3} H${width - 4} M${width / 2} ${depth * 0.3} V${depth - 4}`}
            stroke="#ffffff"
            opacity="0.5"
          />
        )}
        {item.category === 'Beds' && (
          <rect
            x="4"
            y="4"
            width={Math.max(1, width - 8)}
            height={depth * 0.2}
            rx="2"
            fill="#f5f3ec"
          />
        )}
      </g>
    </svg>
  );
}

export function FurniturePanel() {
  const [search, setSearch] = useState(''),
    [category, setCategory] = useState('All');
  const { setPlacement, placement, document } = useEditor();
  const filtered = catalog.filter(
    (item) =>
      (category === 'All' || item.category === category) &&
      item.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="panel-heading">
        <h2>Find its place.</h2>
        <p>Generic pieces. Your exact measurements.</p>
      </div>
      <label className="search-field">
        <Search size={16} />
        <input
          aria-label="Search furniture"
          placeholder="Search furniture…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <label className="field">
        <span>Category</span>
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          {['All', ...new Set(catalog.map((item) => item.category))].map((category) => (
            <option key={category}>{category}</option>
          ))}
        </select>
      </label>
      <div className="catalog-grid">
        {filtered.map((item) => (
          <button
            key={item.id}
            className={`catalog-item ${placement === item.id ? 'is-active' : ''}`}
            onClick={() => setPlacement(placement === item.id ? null : item.id)}
            aria-label={`Place ${item.name}`}
          >
            <FurnitureThumbnail item={item} />
            <span>{item.name}</span>
            <small>
              {formatLength(item.width, document?.displayUnits ?? 'metric', true)} ×{' '}
              {formatLength(item.depth, document?.displayUnits ?? 'metric', true)}
            </small>
            <ArrowUpRight size={14} />
          </button>
        ))}
      </div>
      {!filtered.length && <p className="muted">No pieces match your search.</p>}
      <div className="section-rule" />
      <h3>Made to measure</h3>
      <p className="muted">Use a simple shape for a piece you already have.</p>
      <div className="button-row">
        {customCatalog.map((item) => (
          <button key={item.id} onClick={() => setPlacement(item.id)}>
            + {item.name}
          </button>
        ))}
      </div>
      <p className="fine-print">
        Choose a piece, then tap the floor plan to place it. All dimensions can be edited.
      </p>
    </>
  );
}
