import { useEffect, useRef, useState } from 'react';
import { Dialog } from '../components/Dialog';
import type { ProjectDocument } from '../domain/model';
import { database, type StoredShare } from '../persistence/database';
import { createManagedShare, revokeManagedShare } from './persistence';
export function ShareDialog({
  document,
  getDocument,
  allowCreate = true,
  onClose,
}: {
  document?: ProjectDocument;
  getDocument?: () => ProjectDocument;
  allowCreate?: boolean;
  onClose: () => void;
}) {
  const [records, setRecords] = useState<StoredShare[]>([]);
  const [unsaved, setUnsaved] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const urlInput = useRef<HTMLInputElement>(null);
  const projectId = document?.projectId;
  useEffect(() => {
    let cancelled = false;
    const query = projectId
      ? database.shares.where('projectId').equals(projectId).toArray()
      : database.shares.toArray();
    void query
      .then((links) => {
        if (!cancelled) setRecords(links.sort((a, b) => b.createdAt - a.createdAt));
      })
      .catch(() => {
        if (!cancelled)
          setError('Device link storage is unavailable. Check your browser storage settings.');
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);
  useEffect(() => {
    if (fallback) {
      urlInput.current?.focus();
      urlInput.current?.select();
    }
  }, [fallback]);
  const create = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await createManagedShare(getDocument?.() ?? document!);
      setRecords((links) => [result.record, ...links]);
      if (!result.saved) {
        setUnsaved((ids) => [...ids, result.record.shareId]);
        setError(
          'Link created, but its management credentials could not be saved on this device. Keep this dialog open to retry saving or stop sharing now. After closing it, early revocation may be unavailable; the link still expires in 30 days.',
        );
      } else setNotice('Link created. Later edits to this room won’t change it.');
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'The link could not be created. Your room has not changed.',
      );
    } finally {
      setBusy(false);
    }
  };
  const copy = async (record: StoredShare) => {
    setNotice(null);
    try {
      await navigator.clipboard.writeText(record.url);
      setNotice('Link copied.');
    } catch {
      setFallback(record.url);
      setNotice('Clipboard unavailable. Select and copy the link below.');
    }
  };
  const stop = async (record: StoredShare) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await revokeManagedShare(record);
      setRecords((links) =>
        links.map((link) => (link.shareId === record.shareId ? result.record : link)),
      );
      setUnsaved((ids) => ids.filter((id) => id !== record.shareId));
      setNotice(
        'Sharing stopped. Already downloaded or saved copies remain available to their recipients.',
      );
      if (!result.saved)
        setError(
          'Sharing stopped on the server, but this device could not save the updated status.',
        );
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Sharing could not be stopped. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const retryStorage = async (record: StoredShare) => {
    setBusy(true);
    try {
      await database.shares.put(record);
      setUnsaved((ids) => ids.filter((id) => id !== record.shareId));
      setError(null);
      setNotice('Management credentials saved on this device.');
    } catch {
      setError(
        'Management credentials still could not be saved. Check your browser storage settings or stop sharing now.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={document ? `Share ${document.name}` : 'Shared links on this device'}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {document && allowCreate && (
        <>
          <p>
            Anyone with the link can view and save a copy of all alternatives, furniture, finishes,
            dimensions and prices. Each link captures this room as it is now and expires after 30
            days.
          </p>
          <button className="primary" disabled={busy} onClick={() => void create()}>
            {busy ? 'Please wait…' : 'Create link'}
          </button>
        </>
      )}
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {fallback && (
        <label className="field">
          <span>Link to copy</span>
          <input
            ref={urlInput}
            readOnly
            value={fallback}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
      <ul className="shared-links">
        {records.map((record) => {
          const ended = record.revokedAt !== null || record.expiresAt <= Date.now();
          return (
            <li key={record.shareId}>
              {!document && <strong>{record.projectName}</strong>}
              <label className="field">
                <span>Public link</span>
                <input
                  aria-label="Public link"
                  readOnly
                  value={record.url}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
              <p className="fine-print">
                {record.revokedAt
                  ? 'Sharing stopped'
                  : `Expires ${new Date(record.expiresAt).toLocaleString('en-GB')}`}
                {unsaved.includes(record.shareId) ? ' · Management not saved' : ''}
              </p>
              <div className="button-row">
                <button disabled={busy || ended} onClick={() => void copy(record)}>
                  Copy link
                </button>
                <button
                  className="danger"
                  disabled={busy || ended}
                  onClick={() => void stop(record)}
                >
                  Stop sharing
                </button>
                {unsaved.includes(record.shareId) && (
                  <button disabled={busy} onClick={() => void retryStorage(record)}>
                    Save management access
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {!records.length && (
        <p className="muted">No links saved on this device{document ? ' for this room' : ''}.</p>
      )}
      <p className="fine-print">
        Moving a room to Trash or deleting it does not stop sharing. Clearing browser storage
        removes this device’s early-revocation access. Stopping sharing prevents future retrieval;
        it cannot remove copies already saved.
      </p>
    </Dialog>
  );
}
