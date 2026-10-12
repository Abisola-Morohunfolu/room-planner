import { itemElevation } from '../domain/geometry';
import { findCatalog } from '../domain/catalog';
import { currencyDigits, type ProjectDocument } from '../domain/model';
import { activeLayout } from '../state/editor';
export function csvCell(value: string | number) {
  let text = String(value);
  if (/^\s*[=+\-@\t\r]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
}
export function exportCsv(document: ProjectDocument) {
  const layout = activeLayout(document),
    imperial = document.displayUnits === 'imperial',
    divisor = imperial ? 25.4 : 1;
  const rows: [...(string | number)[]][] = [
    [
      'Alternative',
      'Item name',
      'Category',
      'Width',
      'Depth',
      'Height',
      'Units',
      'Rotation',
      'Owned / to-buy',
      'Price',
      'Currency',
      'Height above floor',
      'Placed on',
    ],
    ...layout.items.map((item) => [
      layout.name,
      item.name,
      findCatalog(item.catalogId)?.category ?? 'Custom',
      Number((item.widthMm / divisor).toFixed(3)),
      Number((item.depthMm / divisor).toFixed(3)),
      Number((item.heightMm / divisor).toFixed(3)),
      imperial ? 'in' : 'mm',
      item.rotationDeg,
      item.status,
      item.priceMinor === null
        ? ''
        : (item.priceMinor / 10 ** currencyDigits(document.currency)).toFixed(
            currencyDigits(document.currency),
          ),
      document.currency,
      Number((itemElevation(item, layout.items) / divisor).toFixed(3)),
      layout.items.find((piece) => piece.id === item.supportedById)?.name ?? 'Floor',
    ]),
  ];
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
