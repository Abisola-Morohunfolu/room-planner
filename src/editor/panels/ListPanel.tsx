import { useState } from 'react';
import { useEditor, activeLayout } from '../../state/editor';
import { budget, money, type ProjectDocument } from '../../domain/model';
import { formatLength } from '../../domain/units';
import { Dialog } from '../../components/Dialog';
export function ListPanel() {
  const { document, selection, select, command } = useEditor();
  const [pendingCurrency, setPendingCurrency] = useState<ProjectDocument['currency'] | null>(null);
  if (!document) return null;
  const layout = activeLayout(document),
    estimate = budget(layout);
  const currencyChange = (currency: ProjectDocument['currency']) => {
    if (
      layout.items.some((item) => item.priceMinor !== null) ||
      document.layouts.some((layout) => layout.items.some((item) => item.priceMinor !== null))
    )
      setPendingCurrency(currency);
    else
      command('Set currency', (document) => {
        document.currency = currency;
      });
  };
  return (
    <>
      <div className="panel-heading">
        <h2>Before you buy.</h2>
        <p>Your measurements and purchase estimate.</p>
      </div>
      <div className="budget-block">
        <span>Priced purchases</span>
        <strong>{money(estimate.totalMinor, document.currency)}</strong>
        <small>
          {estimate.unpriced} to-buy {estimate.unpriced === 1 ? 'item has' : 'items have'} no price
          · {estimate.owned} owned
        </small>
      </div>
      <label className="field">
        <span>Currency</span>
        <select
          value={document.currency}
          onChange={(event) => currencyChange(event.target.value as ProjectDocument['currency'])}
        >
          {['USD', 'GBP', 'EUR', 'NGN', 'JPY', 'CAD', 'AUD'].map((currency) => (
            <option key={currency}>{currency}</option>
          ))}
        </select>
      </label>
      <div className="item-list">
        {layout.items.map((item) => (
          <button
            key={item.id}
            className={selection === item.id ? 'is-active' : ''}
            onClick={() => select(item.id)}
          >
            <span className="item-dot" style={{ background: item.colour }} />
            <span>
              <strong>{item.name}</strong>
              <small>
                {formatLength(item.widthMm, document.displayUnits, true)} ×{' '}
                {formatLength(item.depthMm, document.displayUnits, true)} ×{' '}
                {formatLength(item.heightMm, document.displayUnits, true)}
              </small>
            </span>
            <span className="item-price">
              {item.status === 'owned'
                ? 'Owned'
                : item.priceMinor === null
                  ? 'Unpriced'
                  : money(item.priceMinor, document.currency)}
            </span>
          </button>
        ))}
      </div>
      {layout.items.length === 0 && (
        <p className="muted">Your room is a blank canvas. Add a piece from Furniture.</p>
      )}
      {pendingCurrency && (
        <Dialog title="Relabel currency?" onClose={() => setPendingCurrency(null)}>
          <p>
            Existing prices will be relabelled from {document.currency} to {pendingCurrency}. No
            exchange-rate conversion will be made.
          </p>
          <div className="button-row">
            <button onClick={() => setPendingCurrency(null)}>Cancel</button>
            <button
              className="primary"
              onClick={() => {
                command('Relabel currency', (document) => {
                  const oldDigits = currencyDigitsFor(document.currency),
                    newDigits = currencyDigitsFor(pendingCurrency);
                  for (const layout of document.layouts)
                    for (const item of layout.items)
                      if (item.priceMinor !== null)
                        item.priceMinor = Math.round(
                          (item.priceMinor / 10 ** oldDigits) * 10 ** newDigits,
                        );
                  document.currency = pendingCurrency;
                });
                setPendingCurrency(null);
              }}
            >
              Relabel prices
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
function currencyDigitsFor(currency: string) {
  return (
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}
