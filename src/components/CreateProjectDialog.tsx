import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog } from './Dialog';
import { NumberField, TextField } from './Field';
import { newProject, projectSchema, type Room } from '../domain/model';
import { database, makeRecord } from '../persistence/database';
import { useAccount } from '../auth/AccountContext';
export function CreateProjectDialog({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState(() => newProject()),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const { partition } = useAccount(),
    navigate = useNavigate();
  const room = draft.layouts[0].room;
  const updateRoom = (patch: Partial<Room>) =>
    setDraft({ ...draft, layouts: [{ ...draft.layouts[0], room: { ...room, ...patch } }] });
  const create = async () => {
    const valid = projectSchema.safeParse(draft);
    if (!valid.success) {
      setError(valid.error.issues.map((issue) => issue.message).join(' '));
      return;
    }
    setBusy(true);
    try {
      await database.projects.add(makeRecord(valid.data, partition));
      void navigator.storage?.persist?.();
      navigate(`/plan/${draft.projectId}`);
    } catch {
      setError('Device storage is unavailable. Enable browser storage to create a saved plan.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title="Let’s meet your room." onClose={onClose}>
      <p>Inside measurements are all you need. You can change these any time.</p>
      <TextField
        label="Room name"
        value={draft.name}
        onCommit={(name) => setDraft({ ...draft, name })}
      />
      <div className="segmented">
        <button
          aria-pressed={room.shape === 'rectangle'}
          onClick={() => updateRoom({ shape: 'rectangle' })}
        >
          Rectangle
        </button>
        <button
          aria-pressed={room.shape === 'l-shape'}
          onClick={() => updateRoom({ shape: 'l-shape' })}
        >
          L-shape
        </button>
      </div>
      <label className="field">
        <span>Units</span>
        <select
          value={draft.displayUnits}
          onChange={(event) =>
            setDraft({ ...draft, displayUnits: event.target.value as typeof draft.displayUnits })
          }
        >
          <option value="metric">Metric</option>
          <option value="imperial">Feet & inches</option>
        </select>
      </label>
      <div className="field-grid">
        <NumberField
          label="Room width"
          value={room.widthMm}
          units={draft.displayUnits}
          min={500}
          max={50000}
          onCommit={(widthMm) => updateRoom({ widthMm })}
        />
        <NumberField
          label="Room depth"
          value={room.depthMm}
          units={draft.displayUnits}
          min={500}
          max={50000}
          onCommit={(depthMm) => updateRoom({ depthMm })}
        />
      </div>
      <NumberField
        label="Ceiling height"
        value={room.ceilingHeightMm}
        units={draft.displayUnits}
        min={1500}
        max={10000}
        onCommit={(ceilingHeightMm) => updateRoom({ ceilingHeightMm })}
      />
      {room.shape === 'l-shape' && (
        <div className="field-grid">
          <NumberField
            label="Cutout width"
            value={room.cutoutWidthMm}
            units={draft.displayUnits}
            min={500}
            onCommit={(cutoutWidthMm) => updateRoom({ cutoutWidthMm })}
          />
          <NumberField
            label="Cutout depth"
            value={room.cutoutDepthMm}
            units={draft.displayUnits}
            min={500}
            onCommit={(cutoutDepthMm) => updateRoom({ cutoutDepthMm })}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <button className="primary full-width" disabled={busy} onClick={() => void create()}>
        {busy ? 'Creating…' : 'Start planning →'}
      </button>
      <p className="fine-print">
        {partition === 'guest'
          ? 'Saved on this device. No account needed.'
          : 'This plan belongs to your signed-in account.'}
      </p>
    </Dialog>
  );
}
