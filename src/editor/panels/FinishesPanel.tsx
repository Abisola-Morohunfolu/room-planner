import { useEditor, activeLayout } from '../../state/editor';
import { walls } from '../../domain/geometry';
import { floorColours } from '../../domain/finishes';
export function FinishesPanel() {
  const { document, command } = useEditor();
  if (!document) return null;
  const room = activeLayout(document).room;
  return (
    <>
      <div className="panel-heading">
        <h2>A little atmosphere.</h2>
        <p>Try warm timber, soft neutrals, or a touch of colour.</p>
      </div>
      <h3>Floor finish</h3>
      <div className="finish-grid">
        {Object.entries(floorColours).map(([finish, colour]) => (
          <button
            key={finish}
            className={room.floorFinish === finish ? 'is-active' : ''}
            onClick={() =>
              command('Change floor finish', (_document, layout) => {
                layout.room.floorFinish = finish as typeof room.floorFinish;
              })
            }
          >
            <span style={{ background: colour }} />
            {finish}
          </button>
        ))}
      </div>
      <div className="section-rule" />
      <h3>Wall colours</h3>
      {walls(room).map((wall) => (
        <label className="colour-field" key={wall.id}>
          <span>{wall.id.replaceAll('-', ' ')}</span>
          <input
            aria-label={`${wall.id} wall colour`}
            type="color"
            value={room.wallColours[wall.id] ?? '#e6e3d8'}
            onChange={(event) =>
              command('Change wall colour', (_document, layout) => {
                layout.room.wallColours[wall.id] = event.target.value;
              })
            }
          />
        </label>
      ))}
      <p className="fine-print">
        Colour previews are illustrative. Finishes don’t change measurements.
      </p>
    </>
  );
}
