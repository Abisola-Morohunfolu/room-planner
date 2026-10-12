import { useEditor, activeLayout } from '../state/editor';
import { budget, money } from '../domain/model';
import { formatLength } from '../domain/units';
import { roomArea, itemElevation, walls } from '../domain/geometry';
export function ReadOnlyDetails() {
  const { document, selection, surface, select } = useEditor();
  if (!document) return null;
  const layout = activeLayout(document),
    estimate = budget(layout);
  const item = layout.items.find((item) => item.id === selection);
  const opening = layout.openings.find((opening) => opening.id === selection);
  const length = (mm: number) => formatLength(mm, document.displayUnits, true);
  return (
    <>
      <div className="panel-heading">
        <h2>
          {item?.name ??
            (opening
              ? opening.type === 'door'
                ? 'Door'
                : 'Window'
              : surface
                ? 'Room finishes'
                : 'Room details')}
        </h2>
        <p>
          Shared snapshot · {document.displayUnits} · {document.currency}
        </p>
      </div>
      {item && (
        <dl className="snapshot-details">
          <dt>Dimensions</dt>
          <dd>
            {length(item.widthMm)} × {length(item.depthMm)} × {length(item.heightMm)}
          </dd>
          <dt>Position</dt>
          <dd>
            {length(item.xMm)}, {length(item.yMm)}
          </dd>
          <dt>Rotation</dt>
          <dd>{item.rotationDeg}°</dd>
          <dt>Finish</dt>
          <dd>
            {item.finishId} · {item.colour}
          </dd>
          <dt>Elevation</dt>
          <dd>
            {length(itemElevation(item, layout.items))}
            {item.supportedById
              ? ` · On ${layout.items.find((piece) => piece.id === item.supportedById)?.name}`
              : ''}
          </dd>
          <dt>Price</dt>
          <dd>
            {item.priceMinor === null ? 'Unpriced' : money(item.priceMinor, document.currency)} ·{' '}
            {item.status === 'owned' ? 'Owned' : 'To buy'}
          </dd>
        </dl>
      )}
      {opening && (
        <dl className="snapshot-details">
          <dt>Wall</dt>
          <dd>{opening.wallId}</dd>
          <dt>Dimensions</dt>
          <dd>
            {length(opening.widthMm)} × {length(opening.heightMm)}
          </dd>
          <dt>Offset</dt>
          <dd>{length(opening.offsetMm)}</dd>
          <dt>Sill height</dt>
          <dd>{length(opening.sillHeightMm)}</dd>
          <dt>Hinge / swing</dt>
          <dd>
            {opening.hinge} / {opening.swing}
          </dd>
        </dl>
      )}
      <dl className="snapshot-details">
        <dt>Room area / height</dt>
        <dd>
          {roomArea(layout.room).toFixed(1)} m² / {length(layout.room.ceilingHeightMm)}
        </dd>
        <dt>Floor finish</dt>
        <dd>{layout.room.floorFinish}</dd>
        <dt>Wall colours</dt>
        <dd>
          {Object.entries(layout.room.wallColours)
            .map(([wall, colour]) => `${wall}: ${colour}`)
            .join(', ')}
        </dd>
      </dl>
      <ul className="room-measurements">
        {walls(layout.room).map((wall) => (
          <li key={wall.id}>
            {wall.id.replaceAll('-', ' ')}: {length(wall.length)}
          </li>
        ))}
      </ul>
      <div className="budget-block">
        <span>Priced purchases</span>
        <strong>{money(estimate.totalMinor, document.currency)}</strong>
        <small>
          {estimate.unpriced} unpriced to-buy items · {estimate.owned} owned
        </small>
      </div>
      <div className="item-list">
        {layout.items.map((piece) => (
          <button
            key={piece.id}
            className={selection === piece.id ? 'is-active' : ''}
            onClick={() => select(piece.id)}
          >
            <span className="item-dot" style={{ background: piece.colour }} />
            <span>
              <strong>{piece.name}</strong>
              <small>
                {length(piece.widthMm)} × {length(piece.depthMm)} × {length(piece.heightMm)}
              </small>
            </span>
            <span className="item-price">
              {piece.priceMinor === null ? 'Unpriced' : money(piece.priceMinor, document.currency)}
              {piece.status === 'owned' ? ' · Owned' : ''}
            </span>
          </button>
        ))}
      </div>
      {!layout.items.length && <p className="muted">This alternative has no furniture.</p>}
    </>
  );
}
