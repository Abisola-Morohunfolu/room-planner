import { Copy, Trash2, RotateCw, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { useEditor, activeLayout } from '../../state/editor';
import { currencyDigits, money } from '../../domain/model';
import { nearestGap, fitsOn, isDescendant, itemElevation } from '../../domain/geometry';
import { formatLength } from '../../domain/units';
import { NumberField, TextField } from '../../components/Field';
export function ItemInspector() {
  const state = useEditor();
  const [firstPrice, setFirstPrice] = useState<number | null>(null);
  const [priceCurrency, setPriceCurrency] = useState('USD');
  const document = state.document;
  if (!document) return null;
  const layout = activeLayout(document),
    item = layout.items.find((item) => item.id === state.selection);
  if (!item) return null;
  const gap = nearestGap(item, layout);
  const supports = layout.items.filter(
    (piece) =>
      piece.id !== item.id &&
      !piece.nonblocking &&
      !isDescendant(piece, item.id, layout.items) &&
      (piece.id === item.supportedById ||
        fitsOn({ ...item, xMm: piece.xMm, yMm: piece.yMm, rotationDeg: piece.rotationDeg }, piece)),
  );
  const support = layout.items.find((piece) => piece.id === item.supportedById);
  return (
    <section className="item-inspector">
      <div className="inspector-heading">
        <div>
          <h3>{item.name}</h3>
        </div>
        <button className="text-button" onClick={() => state.select(null)}>
          Done
        </button>
      </div>
      {!item.nonblocking && (
        <>
          <label className="field">
            <span>Place on</span>
            <select
              value={item.supportedById ?? ''}
              onChange={(event) => state.stackItem(item.id, event.target.value || null)}
            >
              <option value="">Floor</option>
              {supports.map((piece) => (
                <option key={piece.id} value={piece.id}>
                  {piece.name}
                </option>
              ))}
            </select>
          </label>
          <p className="fine-print">
            {support
              ? `On ${support.name} · ${formatLength(itemElevation(item, layout.items), document.displayUnits)} above floor. Moves with its support.`
              : 'Choose a surface to centre this piece on it. Only surfaces large enough are shown.'}
          </p>
          {!support && (
            <NumberField
              label="Height above floor"
              value={item.elevationMm}
              units={document.displayUnits}
              min={0}
              max={20000}
              onCommit={(elevationMm) => state.updateItem(item.id, { elevationMm })}
            />
          )}
        </>
      )}
      <div className="rotation-controls">
        <span>Turn your piece</span>
        <div className="button-row">
          <button
            aria-label="Rotate selected item left 15 degrees"
            onClick={() => state.updateItem(item.id, { rotationDeg: item.rotationDeg - 15 })}
          >
            <RotateCcw size={16} />
            15°
          </button>
          <button
            aria-label="Rotate selected item 15 degrees"
            onClick={() => state.updateItem(item.id, { rotationDeg: item.rotationDeg + 15 })}
          >
            <RotateCw size={16} />
            15°
          </button>
          <button
            aria-label="Rotate selected item 90 degrees"
            onClick={() => state.updateItem(item.id, { rotationDeg: item.rotationDeg + 90 })}
          >
            90°
          </button>
        </div>
        <p className="fine-print">
          Drag the round handle on the plan. R turns right; Shift + R turns left.
        </p>
      </div>
      <TextField
        label="Item name"
        value={item.name}
        onCommit={(name) => state.updateItem(item.id, { name })}
      />
      <div className="field-grid">
        <NumberField
          label="Item width"
          value={item.widthMm}
          units={document.displayUnits}
          min={1}
          max={20000}
          onCommit={(widthMm) =>
            state.updateItem(item.id, {
              widthMm,
              ...(item.shape === 'ellipse' ? { depthMm: widthMm } : {}),
            })
          }
        />
        <NumberField
          label="Item depth"
          value={item.depthMm}
          units={document.displayUnits}
          min={1}
          max={20000}
          onCommit={(depthMm) =>
            state.updateItem(item.id, {
              depthMm,
              ...(item.shape === 'ellipse' ? { widthMm: depthMm } : {}),
            })
          }
        />
        <NumberField
          label="Item height"
          value={item.heightMm}
          units={document.displayUnits}
          min={1}
          max={20000}
          onCommit={(heightMm) => state.updateItem(item.id, { heightMm })}
        />
        <NumberField
          label="Rotation"
          value={item.rotationDeg}
          onCommit={(rotationDeg) => state.updateItem(item.id, { rotationDeg })}
        />
        <NumberField
          label="Position X"
          value={item.xMm}
          units={document.displayUnits}
          onCommit={(xMm) => state.updateItem(item.id, { xMm })}
        />
        <NumberField
          label="Position Y"
          value={item.yMm}
          units={document.displayUnits}
          onCommit={(yMm) => state.updateItem(item.id, { yMm })}
        />
      </div>
      <div className="field-grid">
        <label className="field">
          <span>Colour</span>
          <input
            aria-label="Item colour"
            type="color"
            value={item.colour}
            onChange={(event) => state.updateItem(item.id, { colour: event.target.value })}
          />
        </label>
        <label className="field">
          <span>Finish</span>
          <select
            value={item.finishId}
            onChange={(event) =>
              state.updateItem(item.id, { finishId: event.target.value as typeof item.finishId })
            }
          >
            <option value="neutral">Neutral</option>
            <option value="wood">Wood</option>
            <option value="fabric">Fabric</option>
            <option value="glass">Glass</option>
            <option value="metal">Metal</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span>Purchase status</span>
        <select
          value={item.status}
          onChange={(event) =>
            state.updateItem(item.id, { status: event.target.value as typeof item.status })
          }
        >
          <option value="owned">Already owned</option>
          <option value="to-buy">To buy</option>
        </select>
      </label>
      <NumberField
        label={`Price (${document.currency})`}
        value={(item.priceMinor ?? 0) / 10 ** currencyDigits(document.currency)}
        min={0}
        onCommit={(price) => {
          if (
            !document.layouts.some((layout) =>
              layout.items.some((piece) => piece.priceMinor !== null),
            )
          ) {
            setPriceCurrency(document.currency);
            setFirstPrice(price);
            return true;
          }
          return state.updateItem(item.id, {
            priceMinor: Math.round(price * 10 ** currencyDigits(document.currency)),
          });
        }}
      />
      <p className="fine-print">
        {item.priceMinor === null ? 'Price unknown' : money(item.priceMinor, document.currency)} ·{' '}
        <button
          className="text-button"
          onClick={() => state.updateItem(item.id, { priceMinor: null })}
        >
          Mark unknown
        </button>
      </p>
      {gap && (
        <div
          className={`gap-readout ${layout.clearanceTargetMm !== null && gap.gap < layout.clearanceTargetMm ? 'is-warning' : ''}`}
        >
          <strong>
            {gap.gap < 0 ? 'Overlap: ' : gap.gap === 0 ? 'Touching: ' : 'Nearest gap: '}
            {formatLength(Math.abs(gap.gap), document.displayUnits)}
          </strong>
          <small>{gap.label}</small>
        </div>
      )}
      <div className="button-row">
        <button aria-label="Duplicate selected item" onClick={() => state.duplicateItem(item.id)}>
          <Copy size={16} />
          Copy
        </button>
        <button
          aria-label="Delete selected item"
          className="danger"
          onClick={() => state.removeItem(item.id)}
        >
          <Trash2 size={16} />
        </button>
      </div>
      {firstPrice !== null && (
        <Dialog title="Choose your estimate currency." onClose={() => setFirstPrice(null)}>
          <p>
            All prices in this room use one currency. Amounts aren’t converted between currencies.
          </p>
          <label className="field">
            <span>Estimate currency</span>
            <select
              value={priceCurrency}
              onChange={(event) => setPriceCurrency(event.target.value)}
            >
              {['USD', 'GBP', 'EUR', 'NGN', 'JPY', 'CAD', 'AUD'].map((currency) => (
                <option key={currency}>{currency}</option>
              ))}
            </select>
          </label>
          <button
            className="primary full-width"
            onClick={() => {
              if (
                state.command('Confirm currency and first price', (document, layout) => {
                  document.currency = priceCurrency as typeof document.currency;
                  layout.items.find((piece) => piece.id === item.id)!.priceMinor = Math.round(
                    firstPrice * 10 ** currencyDigits(priceCurrency),
                  );
                })
              )
                setFirstPrice(null);
            }}
          >
            Use {priceCurrency} for this estimate
          </button>
        </Dialog>
      )}
    </section>
  );
}
