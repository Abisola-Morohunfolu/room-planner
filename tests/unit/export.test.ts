import { it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { newProject, newItem, uid } from '../../src/domain/model';
import { serializePlan, importPlan } from '../../src/export/planFile';
import { exportCsv, csvCell } from '../../src/export/csv';
import { exportPdf } from '../../src/export/pdf';
it('round trips all alternatives without identities or cloud metadata', () => {
  const project = newProject();
  project.layouts[0].items = [newItem('desk', 1000, 1000)];
  const restored = importPlan(serializePlan(project));
  expect(restored.projectId).not.toBe(project.projectId);
  expect(restored.layouts[0].id).not.toBe(project.layouts[0].id);
  expect(restored.layouts[0].items[0].id).not.toBe(project.layouts[0].items[0].id);
  expect(restored.layouts[0].items[0].widthMm).toBe(1200);
  expect(serializePlan(project)).not.toContain('ownerId');
  expect(() => importPlan(JSON.stringify({ format: 'room-planner', schemaVersion: 2 }))).toThrow(
    'unsupported schema',
  );
  expect(() => importPlan('x'.repeat(1200001))).toThrow('too large');
});
it('quotes CSV and neutralizes formulas while preserving null and zero prices', () => {
  const project = newProject();
  project.layouts[0].items = [
    { ...newItem('desk', 1000, 1000), name: '=SUM(1,2)', status: 'to-buy', priceMinor: null },
    { ...newItem('desk', 2000, 2000), priceMinor: 0 },
  ];
  expect(csvCell('He said "hello"')).toBe('"He said ""hello"""');
  expect(exportCsv(project)).toContain('"\'=SUM(1,2)"');
  expect(exportCsv(project)).toContain('"","USD"');
  expect(exportCsv(project)).toContain('"0.00","USD"');
});
it('paginates the vector measurement list for 200 items and both paper sizes', async () => {
  const project = newProject('Export fixture');
  project.layouts[0].items = Array.from({ length: 200 }, () => ({
    ...newItem('desk', 1000, 1000),
    id: uid(),
  }));
  for (const paper of ['a4', 'letter'] as const) {
    const fontBytes = await readFile('public/fonts/NotoSans-Regular.ttf');
    const bytes = await exportPdf(project, paper, fontBytes),
      pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(8);
    expect(pdf.getPage(0).getWidth()).toBeGreaterThan(pdf.getPage(0).getHeight());
  }
});
