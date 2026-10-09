import { useEditor, activeLayout } from '../../state/editor';
import { type Room } from '../../domain/model';
import { openingErrors } from '../../domain/geometry';
import { NumberField, TextField } from '../../components/Field';
export function RoomPanel() {
  const { document, command, setOpeningPlacement, select } = useEditor();
  if (!document) return null;
  const layout = activeLayout(document),
    room = layout.room;
  const updateRoom = (patch: Partial<Room>) =>
    command('Edit room', (_document, layout) => {
      layout.room = { ...layout.room, ...patch };
    });
  const shapeChange = (shape: Room['shape']) => {
    const candidate = { ...room, shape },
      invalid = openingErrors(candidate, layout.openings);
    if (invalid.length) {
      useEditor.setState({
        error: `Changing shape affects ${new Set(invalid.map((error) => error.id)).size} opening(s). Move or remove those openings first.`,
      });
      return;
    }
    updateRoom({ shape });
  };
  return (
    <>
      <div className="panel-heading">
        <h2>A room of your own.</h2>
        <p>Use the inside measurements of your room.</p>
      </div>
      <TextField
        label="Project name"
        value={document.name}
        onCommit={(name) =>
          command('Rename project', (document) => {
            document.name = name;
          })
        }
      />
      <div className="segmented">
        <button aria-pressed={room.shape === 'rectangle'} onClick={() => shapeChange('rectangle')}>
          Rectangle
        </button>
        <button aria-pressed={room.shape === 'l-shape'} onClick={() => shapeChange('l-shape')}>
          L-shape
        </button>
      </div>
      <div className="field-grid">
        <NumberField
          label="Room width"
          value={room.widthMm}
          units={document.displayUnits}
          min={500}
          max={50000}
          onCommit={(widthMm) => updateRoom({ widthMm })}
        />
        <NumberField
          label="Room depth"
          value={room.depthMm}
          units={document.displayUnits}
          min={500}
          max={50000}
          onCommit={(depthMm) => updateRoom({ depthMm })}
        />
      </div>
      <NumberField
        label="Ceiling height"
        value={room.ceilingHeightMm}
        units={document.displayUnits}
        min={1500}
        max={10000}
        onCommit={(ceilingHeightMm) => updateRoom({ ceilingHeightMm })}
      />
      {room.shape === 'l-shape' && (
        <>
          <div className="field-grid">
            <NumberField
              label="Cutout width"
              value={room.cutoutWidthMm}
              units={document.displayUnits}
              min={500}
              onCommit={(cutoutWidthMm) => updateRoom({ cutoutWidthMm })}
            />
            <NumberField
              label="Cutout depth"
              value={room.cutoutDepthMm}
              units={document.displayUnits}
              min={500}
              onCommit={(cutoutDepthMm) => updateRoom({ cutoutDepthMm })}
            />
          </div>
          <div className="button-row">
            <button onClick={() => updateRoom({ mirrored: !room.mirrored })}>Mirror room</button>
            <button onClick={() => updateRoom({ quarterTurns: (room.quarterTurns + 1) % 4 })}>
              Turn room 90°
            </button>
          </div>
        </>
      )}
      <label className="field">
        <span>Measurements</span>
        <select
          value={document.displayUnits}
          onChange={(event) =>
            command('Change display units', (document) => {
              document.displayUnits = event.target.value as 'metric' | 'imperial';
            })
          }
        >
          <option value="metric">Metric · mm / m</option>
          <option value="imperial">Imperial · feet / inches</option>
        </select>
      </label>
      <div className="section-rule" />
      <h3>Doors & windows</h3>
      <div className="button-row">
        <button onClick={() => setOpeningPlacement('door')}>+ Door</button>
        <button onClick={() => setOpeningPlacement('window')}>+ Window</button>
      </div>
      {layout.openings.length === 0 && (
        <p className="muted">Add openings to see how furniture fits around them.</p>
      )}
      <p className="fine-print">Choose a wall and position, or tap a wall on the plan.</p>
      <div className="opening-list">
        {layout.openings.map((opening) => (
          <button key={opening.id} onClick={() => select(opening.id)}>
            <span>
              {opening.type === 'door' ? 'Door' : 'Window'} · {opening.wallId.replaceAll('-', ' ')}
            </span>
            <span>Edit</span>
          </button>
        ))}
      </div>
      <div className="section-rule" />
      <h3>Measured clearance</h3>
      <label className="check">
        <input
          type="checkbox"
          checked={layout.clearanceTargetMm !== null}
          onChange={(event) =>
            command('Set clearance target', (_document, layout) => {
              layout.clearanceTargetMm = event.target.checked ? 800 : null;
            })
          }
        />
        Highlight gaps below a target
      </label>
      {layout.clearanceTargetMm !== null && (
        <NumberField
          label="Clearance target"
          value={layout.clearanceTargetMm}
          units={document.displayUnits}
          min={0}
          max={20000}
          onCommit={(clearanceTargetMm) =>
            command('Set clearance target', (_document, layout) => {
              layout.clearanceTargetMm = clearanceTargetMm;
            })
          }
        />
      )}
      <p className="fine-print">
        Gaps compare nearby objects. They don’t measure a walking route through the room.
      </p>
    </>
  );
}
