import { useState } from 'react';
import { Dialog } from '../components/Dialog';
import { PlanPreview } from '../components/PlanPreview';
import { useEditor } from '../state/editor';
import { budget, money } from '../domain/model';
import { TextField } from '../components/Field';
export function CompareDialog({ onClose }: { onClose: () => void }) {
  const { document, command, switchLayout, deleteLayout } = useEditor();
  const [previewId, setPreviewId] = useState(document?.activeLayoutId);
  if (!document) return null;
  return (
    <Dialog title="A few ways to feel at home." onClose={onClose}>
      <label className="field comparison-picker">
        <span>Preview alternative</span>
        <select value={previewId} onChange={(event) => setPreviewId(event.target.value)}>
          {document.layouts.map((layout) => (
            <option key={layout.id} value={layout.id}>
              {layout.name}
            </option>
          ))}
        </select>
      </label>
      <div className="compare-grid">
        {document.layouts.map((layout) => {
          const estimate = budget(layout);
          return (
            <article key={layout.id} className={previewId === layout.id ? 'preview-active' : ''}>
              <PlanPreview layout={layout} />
              <TextField
                label="Alternative name"
                value={layout.name}
                onCommit={(name) =>
                  command('Rename alternative', (document) => {
                    document.layouts.find((candidate) => candidate.id === layout.id)!.name = name;
                  })
                }
              />
              <p>
                {layout.items.length} pieces · {money(estimate.totalMinor, document.currency)}
              </p>
              <small>{estimate.unpriced} unpriced to-buy items</small>
              <div className="button-row">
                <button
                  className="primary"
                  onClick={() => {
                    switchLayout(layout.id);
                    onClose();
                  }}
                >
                  Edit this layout
                </button>
                <button
                  disabled={document.layouts.length === 1}
                  className="text-button danger"
                  onClick={() => deleteLayout(layout.id)}
                >
                  Remove
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <p className="fine-print">
        Each alternative has its own room, furniture, finishes, and purchase list.
      </p>
    </Dialog>
  );
}
