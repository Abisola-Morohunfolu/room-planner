import { useEditor, activeLayout } from '../state/editor';
import { newItem } from '../domain/model';
import { findCatalog } from '../domain/catalog';
import { roomPolygon, contained, walls } from '../domain/geometry';
import { useState } from 'react';
import { NumberField } from '../components/Field';
import { formatLength } from '../domain/units';
function OpeningPlacementControls() {
  const state = useEditor();
  const roomWalls = walls(activeLayout(state.document!).room);
  const [chosenWall, setChosenWall] = useState(state.surface ?? roomWalls[0].id);
  const [offsetMm, setOffsetMm] = useState(100);
  const wall = roomWalls.find((wall) => wall.id === chosenWall) ?? roomWalls[0];
  const type = state.openingPlacement!;
  return (
    <section className="placement-controls">
      <h3>Place a {type}</h3>
      <p>Tap the exact spot on a wall, or choose a position below.</p>
      <label className="field">
        <span>Wall</span>
        <select
          aria-label="New opening wall"
          value={wall.id}
          onChange={(event) => {
            setChosenWall(event.target.value);
            setOffsetMm(100);
          }}
        >
          {roomWalls.map((wall) => (
            <option key={wall.id} value={wall.id}>
              {wall.id.replaceAll('-', ' ')} ·{' '}
              {formatLength(wall.length, state.document!.displayUnits)}
            </option>
          ))}
        </select>
      </label>
      <NumberField
        label="New opening offset"
        value={offsetMm}
        units={state.document!.displayUnits}
        min={0}
        max={Math.max(0, wall.length - 900)}
        onCommit={setOffsetMm}
      />
      <p className="fine-print">
        900 mm wide. Offset is measured from the wall start. You can edit all dimensions after
        placing it.
      </p>
      <div className="button-row">
        <button className="primary" onClick={() => state.addOpening(type, wall.id, offsetMm)}>
          Place {type}
        </button>
        <button onClick={() => state.setOpeningPlacement(null)}>Cancel</button>
      </div>
    </section>
  );
}
export function PlacementControls() {
  const state = useEditor();
  if (state.document && state.openingPlacement)
    return <OpeningPlacementControls key={state.openingPlacement} />;
  if (!state.document || !state.placement) return null;
  const itemName = findCatalog(state.placement)?.name ?? 'Custom piece';
  const placeInCentre = () => {
    const layout = activeLayout(state.document!),
      polygon = roomPolygon(layout.room),
      roomWidth = Math.max(...polygon.map((point) => point.x)),
      roomDepth = Math.max(...polygon.map((point) => point.y));
    const item = newItem(state.placement!, roomWidth / 2, roomDepth / 2);
    if (!contained(item, layout.room)) {
      for (const point of polygon) {
        const candidate = {
          ...item,
          xMm: (point.x + roomWidth / 2) / 2,
          yMm: (point.y + roomDepth / 2) / 2,
        };
        if (contained(candidate, layout.room)) {
          Object.assign(item, candidate);
          break;
        }
      }
    }
    if (
      state.command('Place furniture', (_document, layout) => {
        layout.items.push(item);
      })
    ) {
      state.select(item.id);
      state.setPlacement(null);
    }
  };
  return (
    <div className="placement-controls" role="status">
      <span>{itemName}: tap the room or place it in the centre.</span>
      <div className="button-row">
        <button className="primary" onClick={placeInCentre}>
          Place in centre
        </button>
        <button onClick={() => state.setPlacement(null)}>Cancel</button>
      </div>
    </div>
  );
}
