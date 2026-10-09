import { beforeEach, it, expect } from 'vitest';
import { useEditor, activeLayout } from '../../src/state/editor';
import { newProject, newItem } from '../../src/domain/model';
beforeEach(() => {
  const document = newProject();
  document.layouts[0].items = [newItem('sofa-2', 2000, 2500)];
  useEditor.getState().load(document);
});
it('retains 100 commands, invalidates redo, and leaves invalid edits unapplied', () => {
  const state = useEditor.getState(),
    id = state.document!.layouts[0].items[0].id;
  for (let index = 0; index < 110; index++) state.updateItem(id, { xMm: 2200 + index });
  expect(useEditor.getState().history).toHaveLength(100);
  state.undo();
  expect(useEditor.getState().future).toHaveLength(1);
  state.updateItem(id, { xMm: 2300 });
  expect(useEditor.getState().future).toHaveLength(0);
  const valid = useEditor.getState().document;
  expect(state.updateItem(id, { widthMm: -1 })).toBe(false);
  expect(useEditor.getState().document).toBe(valid);
});
it('keeps alternatives independent and undo targets the edited alternative', () => {
  const state = useEditor.getState(),
    original = state.document!.activeLayoutId;
  state.duplicateLayout();
  const duplicate = activeLayout(useEditor.getState().document!);
  state.updateItem(duplicate.items[0].id, { xMm: 1000 });
  state.switchLayout(original);
  state.undo();
  expect(useEditor.getState().document!.activeLayoutId).toBe(duplicate.id);
  expect(activeLayout(useEditor.getState().document!).items[0].xMm).toBe(2000);
  state.redo();
  expect(activeLayout(useEditor.getState().document!).items[0].xMm).toBe(1000);
});

it('adds exactly one opening to the chosen wall, validates overlaps, and supports undo', () => {
  const state = useEditor.getState();
  state.setOpeningPlacement('door');
  expect(activeLayout(useEditor.getState().document!).openings).toHaveLength(0);
  expect(state.addOpening('door', 'east', 700)).toBe(true);
  let openings = activeLayout(useEditor.getState().document!).openings;
  expect(openings).toHaveLength(1);
  expect(openings[0]).toMatchObject({ type: 'door', wallId: 'east', offsetMm: 700 });
  expect(useEditor.getState().selection).toBe(openings[0].id);
  expect(useEditor.getState().openingPlacement).toBeNull();
  expect(state.addOpening('window', 'east', 800)).toBe(false);
  expect(activeLayout(useEditor.getState().document!).openings).toHaveLength(1);
  expect(state.addOpening('window', 'west', 1200)).toBe(true);
  openings = activeLayout(useEditor.getState().document!).openings;
  expect(openings).toHaveLength(2);
  const id = openings[1].id;
  expect(state.updateOpening(id, { offsetMm: 1800 })).toBe(true);
  expect(state.updateOpening(id, { offsetMm: 50000 })).toBe(false);
  expect(activeLayout(useEditor.getState().document!).openings[1].offsetMm).toBe(1800);
  state.removeItem(id);
  expect(activeLayout(useEditor.getState().document!).openings).toHaveLength(1);
  state.undo();
  expect(activeLayout(useEditor.getState().document!).openings).toHaveLength(2);
});
it('keeps placement modes exclusive and clears transient targets when loading or switching layouts', () => {
  const state = useEditor.getState();
  state.selectSurface('east');
  state.setOpeningPlacement('window');
  expect(useEditor.getState().surface).toBe('east');
  state.setPlacement('armchair');
  expect(useEditor.getState().openingPlacement).toBeNull();
  expect(useEditor.getState().surface).toBeNull();
  state.setOpeningPlacement('door');
  expect(useEditor.getState().placement).toBeNull();
  state.duplicateLayout();
  state.switchLayout(useEditor.getState().document!.layouts[0].id);
  expect(useEditor.getState().openingPlacement).toBeNull();
  state.setPlacement('armchair');
  state.load(newProject());
  expect(useEditor.getState().placement).toBeNull();
});
it('normalizes quarter turns and left rotations without losing undo history', () => {
  const state = useEditor.getState();
  const id = activeLayout(state.document!).items[0].id;
  state.updateItem(id, { rotationDeg: -15 });
  expect(activeLayout(useEditor.getState().document!).items[0].rotationDeg).toBe(345);
  state.updateItem(id, { rotationDeg: 435 });
  expect(activeLayout(useEditor.getState().document!).items[0].rotationDeg).toBe(75);
  state.undo();
  expect(activeLayout(useEditor.getState().document!).items[0].rotationDeg).toBe(345);
});

it('cancels a placement without clearing its successful selection or changing the active panel', () => {
  const state = useEditor.getState();
  state.setPanel('furniture');
  state.setOpeningPlacement(null);
  expect(useEditor.getState().panel).toBe('furniture');
  state.setPlacement('dining-chair');
  const id = activeLayout(useEditor.getState().document!).items[0].id;
  state.select(id);
  state.setPlacement(null);
  expect(useEditor.getState().selection).toBe(id);
});
