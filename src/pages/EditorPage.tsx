import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Undo2,
  Redo2,
  Download,
  Square,
  Armchair,
  Palette,
  List,
  ChevronUp,
  ChevronDown,
  Check,
  AlertTriangle,
  Plus,
  Columns2,
} from 'lucide-react';
import { useEditor, activeLayout, type Panel } from '../state/editor';
import { database, projectKey } from '../persistence/database';
import { useSync } from '../sync/SyncContext';
import type { SyncStatus } from '../sync/engine';
import { connectAutosave } from '../persistence/autosave';
import { useAccount } from '../auth/AccountContext';
import { FloorPlan } from '../editor/renderers/FloorPlan';
import { RoomPanel } from '../editor/panels/RoomPanel';
import { FurniturePanel } from '../editor/panels/FurniturePanel';
import { FinishesPanel } from '../editor/panels/FinishesPanel';
import { ListPanel } from '../editor/panels/ListPanel';
import { ItemInspector } from '../editor/panels/ItemInspector';
import { OpeningInspector } from '../editor/panels/OpeningInspector';
import { SurfaceInspector } from '../editor/panels/SurfaceInspector';
import { ExportDialog } from '../editor/ExportDialog';
import { CompareDialog } from '../editor/CompareDialog';
import { warnings, roomArea } from '../domain/geometry';
import { findCatalog } from '../domain/catalog';
import { PlacementControls } from '../editor/PlacementControls';
import { downloadPlan } from '../export/planFile';
const Scene3D = lazy(() => import('../editor/renderers/Scene3D'));
const panels: { id: Panel; label: string; icon: typeof Square }[] = [
  { id: 'room', label: 'Room', icon: Square },
  { id: 'furniture', label: 'Furniture', icon: Armchair },
  { id: 'finishes', label: 'Finishes', icon: Palette },
  { id: 'list', label: 'List', icon: List },
];
export default function EditorPage() {
  const { projectId } = useParams(),
    account = useAccount(),
    state = useEditor(),
    engine = useSync(),
    [syncStatus, setSyncStatus] = useState<SyncStatus>('idle'),
    [loaded, setLoaded] = useState(false),
    [loadError, setLoadError] = useState<string | null>(null),
    [recoveryId, setRecoveryId] = useState<string | null>(null),
    [exporting, setExporting] = useState(false),
    [comparing, setComparing] = useState(false),
    [sheetOpen, setSheetOpen] = useState(false),
    [showWarnings, setShowWarnings] = useState(false);
  const saver = useRef<ReturnType<typeof connectAutosave> | null>(null);
  useEffect(() => {
    if (account.pending) return;
    let cancelled = false;
    setLoaded(false);
    setLoadError(null);
    setRecoveryId(null);
    void database.projects
      .get(projectKey(account.partition, projectId!))
      .then(async (record) => {
        record ??= await database.projects.get(projectKey('guest', projectId!));
        if (cancelled) return;
        if (!record || record.deletedAt) {
          setLoadError('This room is unavailable or in Trash.');
          return;
        }
        useEditor.getState().load(record.document);
        useEditor.setState({ generation: record.generation });
        saver.current = connectAutosave(record.partition, () => {
          if (record.partition !== 'guest') engine?.schedule(record.key);
        });
        if (record.partition !== 'guest') engine?.schedule(record.key);
        setLoaded(true);
      })
      .catch(() => setLoadError('Device storage is unavailable.'));
    return () => {
      cancelled = true;
      const current = saver.current;
      if (current) {
        void current.flush().finally(() => current.dispose());
        saver.current = null;
      }
    };
  }, [projectId, account.partition, account.pending, state.load, engine]);

  useEffect(() => {
    if (!engine) return;
    return engine.subscribe((event) => {
      void (async () => {
        if (event.key !== projectKey(account.partition, projectId!)) return;
        setSyncStatus(event.status);
        if (event.recoveryId) {
          setRecoveryId(event.recoveryId);
          if (!event.document)
            setLoadError('The online original was deleted. Your edits are safe.');
        }
        if (event.document) {
          if (useEditor.getState().saveState === 'saving') await saver.current?.flush();
          useEditor.getState().load(event.document);
        }
        if (event.message) useEditor.setState({ error: event.message });
      })();
    });
  }, [engine, account.partition, projectId]);
  useEffect(() => {
    if (state.selection || state.surface || state.openingPlacement) {
      setSheetOpen(true);
      window.document.querySelector('.panel-scroll')?.scrollTo({ top: 0 });
    }
  }, [state.selection, state.surface, state.openingPlacement]);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLTextAreaElement ||
        window.document.querySelector('dialog[open]')
      )
        return;
      const state = useEditor.getState();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) state.redo();
        else state.undo();
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && state.selection) {
        event.preventDefault();
        state.removeItem(state.selection);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && state.selection) {
        event.preventDefault();
        state.duplicateItem(state.selection);
      }
      if (event.key === 'Escape') {
        state.select(null);
        state.setPlacement(null);
        state.selectSurface(null);
        state.setOpeningPlacement(null);
      }
      if (
        event.key.toLowerCase() === 'r' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        state.selection &&
        state.document
      ) {
        const item = activeLayout(state.document).items.find((item) => item.id === state.selection);
        if (item) {
          event.preventDefault();
          state.updateItem(item.id, {
            rotationDeg: item.rotationDeg + (event.shiftKey ? -15 : 15),
          });
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);
  if (loadError)
    return (
      <div className="empty-state">
        <h1>{loadError}</h1>
        {recoveryId && <Link to={`/plan/${recoveryId}`}>Open your recovered copy</Link>}
        <Link to="/projects">Back to your rooms</Link>
      </div>
    );
  if (!loaded || !state.document)
    return (
      <div className="empty-state" role="status">
        Opening your room…
      </div>
    );
  const document = state.document,
    layout = activeLayout(document),
    fitWarnings = warnings(layout),
    missingAssets = layout.items.some(
      (item) =>
        !findCatalog(item.catalogId) ||
        findCatalog(item.catalogId)?.version !== item.catalogVersion,
    );
  return (
    <div className="editor">
      <header className="editor-header">
        <Link
          className="back-link"
          to="/projects"
          onClick={() => void saver.current?.flush()}
          aria-label="Back to your rooms"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="editor-title">
          <strong>{document.name}</strong>
          <span
            className={`save-state ${state.saveState === 'error' ? 'is-error' : ''}`}
            role="status"
          >
            {state.saveState === 'saved' ? (
              <Check size={12} />
            ) : state.saveState === 'error' ? (
              <AlertTriangle size={12} />
            ) : null}
            {state.saveState === 'saved'
              ? syncStatus === 'backed-up'
                ? 'Backed up online'
                : syncStatus === 'syncing'
                  ? 'Syncing online…'
                  : syncStatus === 'session-expired' || syncStatus === 'attention'
                    ? 'Needs attention'
                    : 'Saved on this device'
              : state.saveState === 'saving'
                ? 'Saving on this device…'
                : 'Needs attention'}
          </span>
        </div>
        <div className="view-switch segmented">
          <button aria-pressed={state.view === '2d'} onClick={() => state.setView('2d')}>
            Floor plan
          </button>
          <button aria-pressed={state.view === '3d'} onClick={() => state.setView('3d')}>
            3D view
          </button>
        </div>
        <div className="header-actions">
          <Link className="backup-link" to={`/sign-in?returnTo=/plan/${projectId}`}>
            Back up online
          </Link>
          <button
            className="primary export-button"
            aria-label="Export plan"
            onClick={() => setExporting(true)}
          >
            <Download size={16} />
            <span>Export</span>
          </button>
        </div>
      </header>
      <div className="editor-workspace">
        <aside className={`editor-sidebar ${sheetOpen ? 'sheet-open' : ''}`}>
          <div className="mobile-sheet-heading">
            <span>
              {state.selection
                ? 'Selection controls'
                : state.surface
                  ? 'Surface controls'
                  : panels.find((panel) => panel.id === state.panel)?.label}
            </span>
            <button
              className="icon-button"
              aria-label={sheetOpen ? 'Collapse inspector' : 'Expand inspector'}
              onClick={() => setSheetOpen(!sheetOpen)}
            >
              {sheetOpen ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
            </button>
          </div>
          <nav className="panel-tabs">
            {panels.map((panel) => (
              <button
                key={panel.id}
                aria-pressed={state.panel === panel.id}
                onClick={() => {
                  state.setPanel(panel.id);
                  state.select(null);
                  state.selectSurface(null);
                  state.setPlacement(null);
                  state.setOpeningPlacement(null);
                  setSheetOpen(true);
                }}
              >
                <panel.icon size={19} />
                <span>{panel.label}</span>
              </button>
            ))}
          </nav>
          <div className="panel-scroll">
            <PlacementControls />
            {state.selection && <ItemInspector />}
            {state.selection && <OpeningInspector />}
            {!state.openingPlacement && <SurfaceInspector />}
            {!state.selection &&
              !state.surface &&
              !state.openingPlacement &&
              (state.panel === 'room' ? (
                <RoomPanel />
              ) : state.panel === 'furniture' ? (
                <FurniturePanel />
              ) : state.panel === 'finishes' ? (
                <FinishesPanel />
              ) : (
                <ListPanel />
              ))}
          </div>
          <div className="sidebar-footer">
            <span>{roomArea(layout.room).toFixed(1)} m²</span>
            <span>{layout.items.length} / 200 pieces</span>
          </div>
        </aside>
        <main className="scene-area">
          <div className="scene-topbar">
            <div className="alternative-controls">
              <select
                aria-label="Active alternative"
                value={document.activeLayoutId}
                onChange={(event) => state.switchLayout(event.target.value)}
              >
                {document.layouts.map((layout) => (
                  <option value={layout.id} key={layout.id}>
                    {layout.name}
                  </option>
                ))}
              </select>
              <button
                className="icon-button"
                aria-label="Duplicate alternative"
                onClick={state.duplicateLayout}
              >
                <Plus size={16} />
              </button>
              <button
                className="compare-button"
                aria-label="Compare alternatives"
                onClick={() => setComparing(true)}
              >
                <Columns2 size={16} />
                <span>Compare</span>
              </button>
            </div>
            <div className="history-controls">
              <button
                className="icon-button"
                aria-label="Undo"
                disabled={!state.history.length}
                onClick={state.undo}
              >
                <Undo2 size={18} />
              </button>
              <button
                className="icon-button"
                aria-label="Redo"
                disabled={!state.future.length}
                onClick={state.redo}
              >
                <Redo2 size={18} />
              </button>
            </div>
          </div>
          {state.view === '2d' ? (
            <FloorPlan />
          ) : (
            <Suspense
              fallback={
                <div className="empty-state" role="status">
                  Preparing your 3D room…
                </div>
              }
            >
              <Scene3D />
            </Suspense>
          )}
          {fitWarnings.length > 0 && (
            <div className="warning-stack">
              <button onClick={() => setShowWarnings(!showWarnings)}>
                <AlertTriangle size={16} />
                {fitWarnings.length} fit {fitWarnings.length === 1 ? 'note' : 'notes'}
                <ChevronDown size={14} />
              </button>
              {showWarnings && (
                <ul>
                  {fitWarnings.map((warning, index) => (
                    <li key={index}>
                      <button
                        onClick={() => {
                          state.select(warning.itemId);
                          setSheetOpen(true);
                        }}
                      >
                        {warning.message}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {missingAssets && (
            <p className="asset-notice">
              Some saved assets are unavailable. Their saved dimensions are shown with primitive
              geometry.
            </p>
          )}
        </main>
      </div>
      {state.error && (
        <div className="error-toast" role="alert">
          <span>{state.error}</span>
          {recoveryId && <Link to={`/plan/${recoveryId}`}>Open recovered copy</Link>}
          {state.saveState === 'error' && (
            <button onClick={() => downloadPlan(document)}>Download plan file</button>
          )}
          <button onClick={state.clearError}>Dismiss</button>
        </div>
      )}
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
      {comparing && <CompareDialog onClose={() => setComparing(false)} />}
    </div>
  );
}
