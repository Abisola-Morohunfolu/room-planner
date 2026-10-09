import { useEffect, useState } from 'react';
import { Dialog } from '../components/Dialog';
import { listProjects, type StoredProject } from '../persistence/database';
import { useAccount } from '../auth/AccountContext';
import { useSync } from './SyncContext';
import { uploadGuestProject } from './engine';
export function GuestUploadDialog({
  onClose,
  onUploaded,
}: {
  onClose: () => void;
  onUploaded: () => void;
}) {
  const { partition } = useAccount(),
    engine = useSync(),
    [guests, setGuests] = useState<StoredProject[]>([]),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void listProjects('guest')
      .then(setGuests)
      .catch(() => setError('Device plans could not be read.'));
  }, []);
  const upload = async () => {
    if (!engine) return;
    setBusy(true);
    setError(null);
    try {
      for (const guest of guests.filter((guest) => selected.has(guest.key)))
        await uploadGuestProject(guest, partition, engine);
      onUploaded();
      onClose();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Upload failed. The original device plans remain available.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title="Choose rooms to back up." onClose={onClose}>
      <p>
        Only the rooms you select will be copied to your account. Account copies belong to the
        signed-in user. Device originals stay in this browser.
      </p>
      {guests.map((guest) => (
        <label className="check" key={guest.key}>
          <input
            type="checkbox"
            checked={selected.has(guest.key)}
            onChange={(event) =>
              setSelected((previous) => {
                const next = new Set(previous);
                if (event.target.checked) next.add(guest.key);
                else next.delete(guest.key);
                return next;
              })
            }
          />
          {guest.document.name}
          {guest.uploadMappings?.[partition] ? ' (previously copied)' : ''}
        </label>
      ))}
      {guests.length === 0 && <p>No device plans to upload.</p>}
      <button
        className="primary full-width"
        disabled={busy || selected.size === 0}
        onClick={() => void upload()}
      >
        {busy ? 'Backing up…' : `Back up ${selected.size} selected rooms`}
      </button>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </Dialog>
  );
}
