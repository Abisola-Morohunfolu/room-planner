import { useEditor, activeLayout } from '../../state/editor';
import { walls } from '../../domain/geometry';
import { formatLength } from '../../domain/units';
import { floorColours } from '../../domain/finishes';

export function SurfaceInspector() {
  const state = useEditor();
  if (!state.document || !state.surface) return null;
  const room = activeLayout(state.document).room;
  const wall = walls(room).find((wall) => wall.id === state.surface);
  if (!wall && state.surface !== 'floor') return null;
  return (
    <section className="item-inspector">
      <div className="inspector-heading">
        <h3>{wall ? `${wall.id.replaceAll('-', ' ')} wall` : 'Floor'}</h3>
        <button className="text-button" onClick={() => state.selectSurface(null)}>
          Done
        </button>
      </div>
      {wall ? (
        <>
          <p className="muted">
            {formatLength(wall.length, state.document.displayUnits)} long · dot marks the wall start
          </p>
          <div className="button-row">
            <button onClick={() => state.setOpeningPlacement('door')}>+ Door</button>
            <button onClick={() => state.setOpeningPlacement('window')}>+ Window</button>
          </div>
          <label className="colour-field">
            <span>Wall colour</span>
            <input
              type="color"
              aria-label="Selected wall colour"
              value={room.wallColours[wall.id] ?? '#e6e3d8'}
              onChange={(event) =>
                state.command('Change wall colour', (_document, layout) => {
                  layout.room.wallColours[wall.id] = event.target.value;
                })
              }
            />
          </label>
          <button
            className="text-button"
            onClick={() => {
              state.selectSurface(null);
              state.setPanel('room');
            }}
          >
            Room dimensions
          </button>
        </>
      ) : (
        <>
          <h3>Floor finish</h3>
          <div className="finish-grid">
            {Object.entries(floorColours).map(([finish, colour]) => (
              <button
                key={finish}
                className={room.floorFinish === finish ? 'is-active' : ''}
                onClick={() =>
                  state.command('Change floor finish', (_document, layout) => {
                    layout.room.floorFinish = finish as typeof room.floorFinish;
                  })
                }
              >
                <span style={{ background: colour }} />
                {finish}
              </button>
            ))}
          </div>
          <div className="button-row">
            <button
              onClick={() => {
                state.selectSurface(null);
                state.setPanel('furniture');
              }}
            >
              + Furniture
            </button>
            <button
              onClick={() => {
                state.selectSurface(null);
                state.setPanel('room');
              }}
            >
              Room dimensions
            </button>
          </div>
        </>
      )}
    </section>
  );
}
