import { PDFDocument, rgb, type PDFPage } from 'pdf-lib';
import { activeLayout } from '../state/editor';
import { budget, money, type ProjectDocument } from '../domain/model';
import { roomPolygon, footprint, doorSector, walls } from '../domain/geometry';
import { floorColours } from '../domain/finishes';
import { formatLength } from '../domain/units';
import fontkit from '@pdf-lib/fontkit';
const fontUrl = '/fonts/NotoSans-Regular.ttf';
export async function exportPdf(
  document: ProjectDocument,
  paper: 'a4' | 'letter' = 'a4',
  fontBytes?: Uint8Array,
) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const embeddedBytes = fontBytes ?? new Uint8Array(await (await fetch(fontUrl)).arrayBuffer());
  const font = await pdf.embedFont(embeddedBytes, { subset: true }),
    bold = font,
    layout = activeLayout(document),
    size: [number, number] = paper === 'a4' ? [841.89, 595.28] : [792, 612],
    polygon = roomPolygon(layout.room),
    width = Math.max(...polygon.map((point) => point.x)),
    depth = Math.max(...polygon.map((point) => point.y));
  const pdfColour = (hex: string) => {
    const channels = hex.match(/\w\w/g)!.map((channel) => parseInt(channel, 16) / 255);
    return rgb(channels[0], channels[1], channels[2]);
  };
  const fitText = (text: string, maximumWidth: number, size: number) => {
    if (font.widthOfTextAtSize(text, size) <= maximumWidth) return text;
    const characters = Array.from(text);
    while (
      characters.length &&
      font.widthOfTextAtSize(characters.join('') + '…', size) > maximumWidth
    )
      characters.pop();
    return characters.join('') + '…';
  };
  const title = (page: PDFPage, text: string) => {
    page.drawText(fitText(text, size[0] - 72, 18), {
      x: 36,
      y: size[1] - 42,
      size: 18,
      font: bold,
      color: rgb(0.2, 0.32, 0.24),
    });
    page.drawText(
      String(
        `${layout.name} | ${document.displayUnits} | ${document.currency} | ${new Date().toLocaleDateString('en-GB')}`,
      ),
      { x: 36, y: size[1] - 63, size: 10, font },
    );
  };
  const page = pdf.addPage(size);
  title(page, document.name);
  const scale = Math.min((size[0] - 170) / width, (size[1] - 190) / depth),
    offsetX = (size[0] - width * scale) / 2,
    offsetY = 90 + depth * scale;
  const path = (points: { x: number; y: number }[]) =>
    points
      .map((point, index) => `${index ? 'L' : 'M'} ${point.x * scale} ${point.y * scale}`)
      .join(' ') + ' Z';
  page.drawSvgPath(path(polygon), {
    x: offsetX,
    y: offsetY,
    color: pdfColour(floorColours[layout.room.floorFinish]),
    borderColor: rgb(0.32, 0.4, 0.32),
    borderWidth: 2,
  });
  for (const wall of walls(layout.room))
    page.drawLine({
      start: {
        x: offsetX + (wall.a.x - wall.inward.x * 55) * scale,
        y: offsetY - (wall.a.y - wall.inward.y * 55) * scale,
      },
      end: {
        x: offsetX + (wall.b.x - wall.inward.x * 55) * scale,
        y: offsetY - (wall.b.y - wall.inward.y * 55) * scale,
      },
      thickness: 110 * scale,
      color: pdfColour(layout.room.wallColours[wall.id] ?? '#e6e3d8'),
    });
  for (const item of [...layout.items].sort(
    (left, right) => Number(right.nonblocking) - Number(left.nonblocking),
  )) {
    const colour = item.colour.match(/\w\w/g)!.map((channel) => parseInt(channel, 16) / 255);
    page.drawSvgPath(path(footprint(item)), {
      x: offsetX,
      y: offsetY,
      color: rgb(colour[0], colour[1], colour[2]),
      borderColor: rgb(0.4, 0.4, 0.35),
      borderWidth: 0.5,
    });
  }
  for (const opening of layout.openings) {
    if (opening.type === 'door')
      page.drawSvgPath(path(doorSector(layout.room, opening)), {
        x: offsetX,
        y: offsetY,
        borderColor: rgb(0.4, 0.5, 0.4),
        borderWidth: 0.5,
      });
    const wall = walls(layout.room).find((wall) => wall.id === opening.wallId)!;
    const unit = { x: (wall.b.x - wall.a.x) / wall.length, y: (wall.b.y - wall.a.y) / wall.length };
    page.drawLine({
      start: {
        x: offsetX + (wall.a.x + unit.x * opening.offsetMm) * scale,
        y: offsetY - (wall.a.y + unit.y * opening.offsetMm) * scale,
      },
      end: {
        x: offsetX + (wall.a.x + unit.x * (opening.offsetMm + opening.widthMm)) * scale,
        y: offsetY - (wall.a.y + unit.y * (opening.offsetMm + opening.widthMm)) * scale,
      },
      thickness: 4,
      color: opening.type === 'window' ? rgb(0.5, 0.7, 0.7) : rgb(0.93, 0.92, 0.88),
    });
  }
  for (const wall of walls(layout.room)) {
    const text = String(formatLength(wall.length, document.displayUnits, true));
    page.drawText(text, {
      x:
        offsetX +
        ((wall.a.x + wall.b.x) / 2) * scale -
        wall.inward.x * 25 -
        font.widthOfTextAtSize(text, 10) / 2,
      y: offsetY - ((wall.a.y + wall.b.y) / 2) * scale + wall.inward.y * 25,
      size: 10,
      font,
    });
  }
  const barLength = Math.min(1000, width / 4);
  page.drawLine({
    start: { x: 36, y: 48 },
    end: { x: 36 + barLength * scale, y: 48 },
    thickness: 2,
    color: rgb(0.2, 0.3, 0.2),
  });
  page.drawText(String(`${formatLength(barLength, document.displayUnits, true)} scale bar`), {
    x: 36,
    y: 32,
    size: 9,
    font,
  });
  page.drawText(
    'Dimensions are authoritative. Printed scale changes if your viewer rescales the page.',
    { x: 220, y: 32, size: 9, font },
  );
  const estimate = budget(layout);
  let listPage = pdf.addPage(size),
    cursor = size[1] - 95;
  title(listPage, 'Furniture & purchase list');
  listPage.drawText(
    String(
      `Priced purchases: ${money(estimate.totalMinor, document.currency)} | ${estimate.unpriced} unpriced to-buy | ${estimate.owned} owned`,
    ),
    { x: 36, y: cursor, size: 11, font: bold },
  );
  cursor -= 30;
  for (const item of layout.items) {
    if (cursor < 55) {
      listPage = pdf.addPage(size);
      title(listPage, 'Furniture & purchase list (continued)');
      cursor = size[1] - 100;
    }
    const dimensions = [item.widthMm, item.depthMm, item.heightMm]
      .map((value) => formatLength(value, document.displayUnits))
      .join(' x ');
    const itemName = fitText(item.name, 220, 11);
    listPage.drawText(itemName, { x: 36, y: cursor, size: 11, font: bold });
    listPage.drawText(fitText(dimensions, size[0] - 510, 10), {
      x: 270,
      y: cursor,
      size: 10,
      font,
    });
    listPage.drawText(
      String(
        `${item.status} | ${item.priceMinor === null ? 'Unknown' : money(item.priceMinor, document.currency)}`,
      ),
      { x: size[0] - 215, y: cursor, size: 10, font },
    );
    cursor -= 27;
  }
  return pdf.save();
}
