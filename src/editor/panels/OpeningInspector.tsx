import { useEditor, activeLayout } from '../../state/editor';
import { walls } from '../../domain/geometry';
import { NumberField } from '../../components/Field';
import type { Opening } from '../../domain/model';

export function OpeningInspector() {
  const state = useEditor();
  if (!state.document) return null;
  const layout = activeLayout(state.document);
  const opening = layout.openings.find((opening) => opening.id === state.selection);
  if (!opening) return null;
  const wall = walls(layout.room).find((wall) => wall.id === opening.wallId)!;
  const update = (patch: Partial<Opening>) => state.updateOpening(opening.id, patch);
  return (
    <section className="item-inspector">
      <div className="inspector-heading">
        <h3>{opening.type === 'door' ? 'Door' : 'Window'}</h3>
        <button className="text-button" onClick={() => state.select(null)}>
          Done
        </button>
      </div>
      <label className="field">
        <span>Wall</span>
        <select
          aria-label="Opening wall"
          value={opening.wallId}
          onChange={(event) => update({ wallId: event.target.value })}
        >
          {walls(layout.room).map((wall) => (
            <option key={wall.id} value={wall.id}>
              {wall.id.replaceAll('-', ' ')} wall
            </option>
          ))}
        </select>
      </label>
      <NumberField
        label="Offset from wall start"
        value={opening.offsetMm}
        units={state.document.displayUnits}
        min={0}
        max={Math.max(0, wall.length - opening.widthMm)}
        onCommit={(offsetMm) => update({ offsetMm })}
      />
      <p className="fine-print">
        The dot on the selected wall marks its start. Drag this opening along its wall to move it.
      </p>
      <div className="field-grid">
        <NumberField
          label="Opening width"
          value={opening.widthMm}
          units={state.document.displayUnits}
          min={1}
          onCommit={(widthMm) => update({ widthMm })}
        />
        <NumberField
          label="Opening height"
          value={opening.heightMm}
          units={state.document.displayUnits}
          min={1}
          onCommit={(heightMm) => update({ heightMm })}
        />
      </div>
      {opening.type === 'window' ? (
        <NumberField
          label="Sill height"
          value={opening.sillHeightMm}
          units={state.document.displayUnits}
          min={0}
          onCommit={(sillHeightMm) => update({ sillHeightMm })}
        />
      ) : (
        <div className="field-grid">
          <label className="field">
            <span>Hinge</span>
            <select
              aria-label="Door hinge"
              value={opening.hinge}
              onChange={(event) => update({ hinge: event.target.value as Opening['hinge'] })}
            >
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </label>
          <label className="field">
            <span>Swing</span>
            <select
              aria-label="Door swing"
              value={opening.swing}
              onChange={(event) => update({ swing: event.target.value as Opening['swing'] })}
            >
              <option value="inward">Inward</option>
              <option value="outward">Outward</option>
            </select>
          </label>
        </div>
      )}
      <button className="text-button danger" onClick={() => state.removeItem(opening.id)}>
        Remove {opening.type}
      </button>
    </section>
  );
}
