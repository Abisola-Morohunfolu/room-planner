import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { useEditor, activeLayout } from '../state/editor';
import { FloorPlan } from '../editor/renderers/FloorPlan';
import { getShare, ShareApiError, type PublicShare } from '../sharing/api';
import { saveSharedCopy } from '../sharing/persistence';
import { ReadOnlyDetails } from '../sharing/ReadOnlyDetails';
const Scene3D = lazy(() => import('../editor/renderers/Scene3D'));
export default function SharedPage() {
  const { shareId } = useParams();
  const navigate = useNavigate();
  const state = useEditor();
  const active = useRef(true);
  const [snapshot, setSnapshot] = useState<PublicShare | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    let session: number | undefined;
    setSnapshot(null);
    setLoadError(null);
    setUnavailable(false);
    setCopyError(null);
    // These policies apply before any viewer interactions, including a static-only SPA.
    const policies = [
      ['robots', 'noindex, nofollow'],
      ['referrer', 'no-referrer'],
    ];
    const restore = policies.map(([name, content]) => {
      const previous = window.document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
      const meta = previous ?? window.document.createElement('meta');
      const original = previous?.content;
      meta.name = name;
      meta.content = content;
      if (!previous) window.document.head.appendChild(meta);
      return () => {
        if (previous) meta.content = original!;
        else meta.remove();
      };
    });
    void getShare(shareId!, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        useEditor.getState().load(result.document, true);
        session = useEditor.getState().session;
        setSnapshot(result);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setUnavailable(error instanceof ShareApiError && error.status === 404);
        setLoadError(
          error instanceof Error
            ? error.message
            : 'The shared room could not be loaded. Try again.',
        );
      });
    return () => {
      active.current = false;
      controller.abort();
      restore.forEach((fn) => fn());
      if (session !== undefined && useEditor.getState().session === session)
        useEditor.getState().reset();
    };
  }, [shareId, attempt]);
  useEffect(() => {
    if (state.selection || state.surface) setSheetOpen(true);
  }, [state.selection, state.surface]);
  const saveCopy = async () => {
    const session = useEditor.getState().session;
    setCopying(true);
    setCopyError(null);
    try {
      const id = await saveSharedCopy(state.document!);
      if (active.current && useEditor.getState().session === session) navigate(`/plan/${id}`);
    } catch {
      setCopyError(
        'The copy could not be saved on this device. Check browser storage and try again.',
      );
    } finally {
      setCopying(false);
    }
  };
  if (loadError)
    return (
      <main className="empty-state">
        <h1>
          {unavailable
            ? 'This shared room is unavailable.'
            : 'The shared room could not be loaded.'}
        </h1>
        <p role="alert">{loadError}</p>
        {!unavailable && (
          <button className="primary" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        )}
        <Link to="/projects">Go to your rooms</Link>
      </main>
    );
  if (!snapshot || snapshot.shareId !== shareId || !state.document || !state.readOnly)
    return (
      <main className="empty-state" role="status">
        Opening shared room…
      </main>
    );
  const document = state.document,
    layout = activeLayout(document);
  return (
    <div className="editor shared-viewer">
      <header className="editor-header">
        <Link className="back-link" to="/projects" aria-label="Go to your rooms">
          <ArrowLeft size={20} />
        </Link>
        <div className="editor-title">
          <strong>{document.name}</strong>
          <span className="save-state">Shared snapshot · View only</span>
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
          <button className="primary" disabled={copying} onClick={() => void saveCopy()}>
            {copying ? 'Saving copy…' : 'Save a copy'}
          </button>
        </div>
      </header>
      <div className="editor-workspace">
        <aside className={`editor-sidebar ${sheetOpen ? 'sheet-open' : ''}`}>
          <div className="mobile-sheet-heading">
            <span>Room details</span>
            <button
              className="icon-button"
              aria-label={sheetOpen ? 'Collapse inspector' : 'Expand inspector'}
              onClick={() => setSheetOpen(!sheetOpen)}
            >
              {sheetOpen ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
            </button>
          </div>
          <div className="panel-scroll">
            <ReadOnlyDetails />
          </div>
          <div className="sidebar-footer">
            <span>{layout.items.length} pieces</span>
            <span>{document.layouts.length} alternatives</span>
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
            </div>
            <span className="snapshot-lifetime">
              Created {new Date(snapshot.createdAt).toLocaleDateString('en-GB')} · Expires{' '}
              {new Date(snapshot.expiresAt).toLocaleDateString('en-GB')}
            </span>
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
        </main>
      </div>
      {copyError && (
        <div className="error-toast" role="alert">
          {copyError}
        </div>
      )}
    </div>
  );
}
