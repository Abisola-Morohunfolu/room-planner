import { useState } from 'react';
import { Dialog } from '../components/Dialog';
import { useEditor, activeLayout } from '../state/editor';
import { budget, money } from '../domain/model';
import { downloadBlob, downloadPlan, safeFilename } from '../export/planFile';
import { exportCsv } from '../export/csv';
export function ExportDialog({ onClose }: { onClose: () => void }) {
  const { document, view } = useEditor();
  const [paper, setPaper] = useState<'a4' | 'letter'>('a4'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  if (!document) return null;
  const layout = activeLayout(document),
    estimate = budget(layout);
  const run = async (format: 'pdf' | 'png' | 'csv' | 'plan') => {
    setBusy(true);
    setError(null);
    try {
      const filename = `${safeFilename(document.name)}-${safeFilename(layout.name)}`;
      if (format === 'plan') downloadPlan(document);
      if (format === 'csv')
        downloadBlob(
          new Blob([exportCsv(document)], { type: 'text/csv;charset=utf-8' }),
          filename + '.csv',
        );
      if (format === 'png') {
        const { exportPng } = await import('../export/planDrawing');
        downloadBlob(await exportPng(layout, document.displayUnits), filename + '.png');
      }
      if (format === 'pdf') {
        const { exportPdf } = await import('../export/pdf');
        const bytes = await exportPdf(document, paper);
        downloadBlob(
          new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
          filename + '.pdf',
        );
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Export failed. Your plan is still available.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title="Take your plan with you." onClose={onClose}>
      <p>
        {layout.name} · {document.displayUnits} · {layout.items.length} pieces
      </p>
      <p className="muted">
        {money(estimate.totalMinor, document.currency)} priced purchases · {estimate.unpriced}{' '}
        unpriced
      </p>
      <label className="field">
        <span>PDF paper</span>
        <select value={paper} onChange={(event) => setPaper(event.target.value as 'a4' | 'letter')}>
          <option value="a4">A4 landscape</option>
          <option value="letter">US Letter landscape</option>
        </select>
      </label>
      <div className="export-options">
        <button disabled={busy} onClick={() => void run('pdf')}>
          <strong>Dimensioned PDF</strong>
          <small>Vector plan, measurements & purchase list</small>
        </button>
        <button disabled={busy} onClick={() => void run('png')}>
          <strong>Floor-plan PNG</strong>
          <small>Clean 2D image, up to 2,048 px</small>
        </button>
        <button disabled={busy} onClick={() => void run('csv')}>
          <strong>Furniture CSV</strong>
          <small>Dimensions, status & prices</small>
        </button>
        <button disabled={busy} onClick={() => void run('plan')}>
          <strong>Restorable plan file</strong>
          <small>All alternatives, ready to import</small>
        </button>
      </div>
      {view === '3d' && (
        <p className="fine-print">
          To capture your current 3D camera, use “Save this view as PNG” below the scene.
        </p>
      )}
      {busy && <p role="status">Preparing your export…</p>}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </Dialog>
  );
}
