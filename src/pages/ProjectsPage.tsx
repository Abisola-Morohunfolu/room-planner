import { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Upload, Trash2, Copy, ArrowUpRight, Undo2 } from 'lucide-react';
import { Brand } from '../components/Brand';
import { CreateProjectDialog } from '../components/CreateProjectDialog';
import { PlanPreview } from '../components/PlanPreview';
import {
  database,
  listProjects,
  makeRecord,
  cleanTrash,
  duplicateProject,
  type StoredProject,
} from '../persistence/database';
import { useSync } from '../sync/SyncContext';
import { GuestUploadDialog } from '../sync/GuestUploadDialog';
import { useAccount } from '../auth/AccountContext';
import { activeLayout } from '../state/editor';
import { importPlan, downloadPlan } from '../export/planFile';
export default function ProjectsPage() {
  const { partition, email } = useAccount(),
    [uploading, setUploading] = useState(false),
    engine = useSync(),
    [records, setRecords] = useState<StoredProject[]>([]),
    [trash, setTrash] = useState(false),
    [creating, setCreating] = useState(false),
    [error, setError] = useState<string | null>(null),
    file = useRef<HTMLInputElement>(null),
    navigate = useNavigate();
  const refresh = useCallback(async () => {
    try {
      await cleanTrash();
      if (engine && navigator.onLine) {
        try {
          await engine.refresh(trash);
        } catch {
          setError('Online backup is unavailable. Your device copies are shown below.');
        }
      }
      setRecords(await listProjects(partition, trash));
    } catch {
      setError('Device storage is unavailable. Check your browser storage settings.');
    }
  }, [partition, trash, engine]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const remove = async (record: StoredProject) => {
    try {
      await database.projects.update(record.key, {
        deletedAt: trash ? null : Date.now(),
        generation: record.generation + 1,
      });
      if (engine) engine.schedule(record.key);
      await refresh();
    } catch {
      setError('The project could not be updated. Download a plan file to preserve it.');
    }
  };
  const importFile = async (selected: File) => {
    try {
      const document = importPlan(await selected.text());
      await database.projects.add(makeRecord(document, partition));
      navigate(`/plan/${document.projectId}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The file could not be imported.');
    }
  };
  return (
    <div className="projects-page">
      <header className="site-header">
        <Brand />
        <nav>
          <Link to="/sign-in">{email ? 'Account' : 'Back up online'}</Link>
          <button className="small-primary" onClick={() => setCreating(true)}>
            <Plus size={17} />
            New room
          </button>
        </nav>
      </header>
      <main className="projects-main">
        <div className="projects-heading">
          <div>
            <h1>{trash ? 'A change of plans.' : 'Rooms with possibility.'}</h1>
            <p>
              {trash
                ? 'Restore a room within 30 days.'
                : email
                  ? 'Your account’s plans on this device.'
                  : 'Saved in this browser, on this device.'}
            </p>
          </div>
          <button onClick={() => file.current?.click()}>
            <Upload size={17} />
            Import a plan
          </button>
          <input
            ref={file}
            type="file"
            accept=".roomplan.json,.json,application/json"
            hidden
            onChange={(event) => {
              const selected = event.target.files?.[0];
              if (selected) void importFile(selected);
              event.target.value = '';
            }}
          />
        </div>
        {email && <button onClick={() => setUploading(true)}>Back up selected device rooms</button>}
        <div className="project-tabs">
          <button aria-pressed={!trash} onClick={() => setTrash(false)}>
            Your rooms
          </button>
          <button aria-pressed={trash} onClick={() => setTrash(true)}>
            <Trash2 size={15} />
            Trash
          </button>
        </div>
        {error && (
          <p role="alert" className="error-banner">
            {error}
          </p>
        )}
        <div className="project-grid">
          {records.map((record) => (
            <article key={record.key} className="project-card">
              <button
                className="project-preview"
                disabled={trash}
                onClick={() => navigate(`/plan/${record.document.projectId}`)}
              >
                <PlanPreview layout={activeLayout(record.document)} />
              </button>
              <div className="project-card-content">
                <h2>{record.document.name}</h2>
                <p>
                  {record.document.layouts.length}{' '}
                  {record.document.layouts.length === 1 ? 'alternative' : 'alternatives'} ·{' '}
                  {new Date(record.updatedAt).toLocaleDateString('en-GB')}
                </p>
                <div className="button-row">
                  {!trash && (
                    <button
                      className="text-button"
                      onClick={() => navigate(`/plan/${record.document.projectId}`)}
                    >
                      Open room <ArrowUpRight size={15} />
                    </button>
                  )}
                  <button
                    className="icon-button"
                    aria-label={trash ? 'Restore project' : 'Move project to Trash'}
                    onClick={() => void remove(record)}
                  >
                    {trash ? <Undo2 size={17} /> : <Trash2 size={17} />}
                  </button>
                  {!trash && (
                    <button
                      className="icon-button"
                      aria-label="Duplicate project"
                      onClick={() =>
                        void duplicateProject(record)
                          .then(refresh)
                          .catch(() => setError('Project could not be duplicated.'))
                      }
                    >
                      <Copy size={17} />
                    </button>
                  )}
                  <button className="text-button" onClick={() => downloadPlan(record.document)}>
                    Plan file
                  </button>
                </div>
              </div>
            </article>
          ))}
          {!trash && (
            <button className="new-project-card" onClick={() => setCreating(true)}>
              <Plus size={28} />
              <strong>A fresh perspective.</strong>
              <span>Start a new room</span>
            </button>
          )}
        </div>
        {trash && records.length === 0 && (
          <div className="empty-state">
            <h2>Nothing in Trash.</h2>
            <p>Your rooms are right where you left them.</p>
          </div>
        )}
      </main>
      {uploading && (
        <GuestUploadDialog onClose={() => setUploading(false)} onUploaded={() => void refresh()} />
      )}
      {creating && <CreateProjectDialog onClose={() => setCreating(false)} />}
    </div>
  );
}
