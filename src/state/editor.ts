import { create } from 'zustand';
import {
  projectSchema,
  cloneLayout,
  uid,
  normalizeItem,
  type ProjectDocument,
  type FurnitureItem,
  type Layout,
  type Opening,
} from '../domain/model';
import { roundMm } from '../domain/geometry';
export type Panel = 'room' | 'furniture' | 'finishes' | 'list';
interface HistoryEntry {
  before: ProjectDocument;
  after: ProjectDocument;
  layoutId: string;
  label: string;
}
interface EditorState {
  document: ProjectDocument | null;
  selection: string | null;
  surface: string | null;
  openingPlacement: Opening['type'] | null;
  panel: Panel;
  view: '2d' | '3d';
  placement: string | null;
  generation: number;
  history: HistoryEntry[];
  future: HistoryEntry[];
  error: string | null;
  saveState: 'saving' | 'saved' | 'error';
  load: (document: ProjectDocument) => void;
  select: (id: string | null) => void;
  selectSurface: (surface: string | null) => void;
  setOpeningPlacement: (type: Opening['type'] | null) => void;
  addOpening: (type: Opening['type'], wallId: string, offsetMm: number) => boolean;
  updateOpening: (id: string, patch: Partial<Opening>) => boolean;
  setPanel: (panel: Panel) => void;
  setView: (view: '2d' | '3d') => void;
  setPlacement: (id: string | null) => void;
  clearError: () => void;
  command: (label: string, edit: (document: ProjectDocument, layout: Layout) => void) => boolean;
  updateItem: (id: string, patch: Partial<FurnitureItem>) => boolean;
  removeItem: (id: string) => void;
  duplicateItem: (id: string) => void;
  undo: () => void;
  redo: () => void;
  switchLayout: (id: string) => void;
  duplicateLayout: () => void;
  deleteLayout: (id: string) => void;
}
export const useEditor = create<EditorState>((set, get) => ({
  document: null,
  selection: null,
  surface: null,
  openingPlacement: null,
  panel: 'room',
  view: '2d',
  placement: null,
  generation: 0,
  history: [],
  future: [],
  error: null,
  saveState: 'saved',
  load: (document) =>
    set({
      document: projectSchema.parse(document),
      selection: null,
      surface: null,
      placement: null,
      openingPlacement: null,
      generation: 0,
      history: [],
      future: [],
      error: null,
      saveState: 'saved',
    }),
  select: (selection) => set({ selection, surface: null }),
  selectSurface: (surface) => set({ surface, selection: null }),
  setOpeningPlacement: (openingPlacement) =>
    set(
      openingPlacement
        ? { openingPlacement, placement: null, selection: null, view: '2d', panel: 'room' }
        : { openingPlacement: null },
    ),
  addOpening: (type, wallId, offsetMm) => {
    const opening: Opening = {
      id: uid(),
      type,
      wallId,
      offsetMm: roundMm(offsetMm),
      widthMm: 900,
      heightMm: type === 'door' ? 2100 : 1000,
      sillHeightMm: type === 'window' ? 900 : 0,
      hinge: 'left',
      swing: 'inward',
    };
    const added = get().command(`Add ${type}`, (_document, layout) => {
      layout.openings.push(opening);
    });
    if (added) set({ selection: opening.id, surface: null, openingPlacement: null });
    return added;
  },
  updateOpening: (id, patch) =>
    get().command('Edit opening', (_document, layout) => {
      const opening = layout.openings.find((opening) => opening.id === id);
      if (opening) Object.assign(opening, patch);
    }),
  setPanel: (panel) => set({ panel }),
  setView: (view) => set({ view, placement: null, openingPlacement: null }),
  setPlacement: (placement) =>
    set(
      placement
        ? { placement, openingPlacement: null, selection: null, surface: null, view: '2d' }
        : { placement: null },
    ),
  clearError: () => set({ error: null }),
  command: (label, edit) => {
    const state = get();
    if (!state.document) return false;
    const candidate = structuredClone(state.document),
      layout = candidate.layouts.find((layout) => layout.id === candidate.activeLayoutId)!;
    try {
      edit(candidate, layout);
      const parsed = projectSchema.safeParse(candidate);
      if (!parsed.success) {
        set({ error: parsed.error.issues.map((issue) => issue.message).join(' ') });
        return false;
      }
      if (JSON.stringify(candidate) === JSON.stringify(state.document)) return true;
      const entry = {
        before: structuredClone(state.document),
        after: structuredClone(parsed.data),
        layoutId: layout.id,
        label,
      };
      set({
        document: parsed.data,
        history: [...state.history, entry].slice(-100),
        future: [],
        generation: state.generation + 1,
        saveState: 'saving',
        error: null,
      });
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'This edit could not be applied.' });
      return false;
    }
  },
  updateItem: (id, patch) =>
    get().command('Edit furniture', (_document, layout) => {
      layout.items = layout.items.map((item) =>
        item.id === id ? normalizeItem({ ...item, ...patch }) : item,
      );
    }),
  removeItem: (id) => {
    get().command('Delete element', (_document, layout) => {
      layout.items = layout.items.filter((item) => item.id !== id);
      layout.openings = layout.openings.filter((opening) => opening.id !== id);
    });
    set({ selection: null });
  },
  duplicateItem: (id) => {
    let selection: string | null = null;
    get().command('Duplicate furniture', (_document, layout) => {
      const source = layout.items.find((item) => item.id === id);
      if (source) {
        selection = uid();
        layout.items.push({
          ...source,
          id: selection,
          xMm: source.xMm + 100,
          yMm: source.yMm + 100,
        });
      }
    });
    set({ selection });
  },
  undo: () => {
    const state = get(),
      entry = state.history.at(-1);
    if (!entry) return;
    const document = structuredClone(entry.before);
    document.activeLayoutId = document.layouts.some((layout) => layout.id === entry.layoutId)
      ? entry.layoutId
      : document.activeLayoutId;
    set({
      document,
      history: state.history.slice(0, -1),
      future: [...state.future, entry],
      generation: state.generation + 1,
      saveState: 'saving',
      selection: null,
      surface: null,
      placement: null,
      openingPlacement: null,
      error: null,
    });
  },
  redo: () => {
    const state = get(),
      entry = state.future.at(-1);
    if (!entry) return;
    const document = structuredClone(entry.after);
    document.activeLayoutId = document.layouts.some((layout) => layout.id === entry.layoutId)
      ? entry.layoutId
      : document.activeLayoutId;
    set({
      document,
      history: [...state.history, entry],
      future: state.future.slice(0, -1),
      generation: state.generation + 1,
      saveState: 'saving',
      selection: null,
      surface: null,
      placement: null,
      openingPlacement: null,
      error: null,
    });
  },
  switchLayout: (id) => {
    const document = get().document;
    if (!document?.layouts.some((layout) => layout.id === id)) return;
    set({
      document: { ...document, activeLayoutId: id },
      selection: null,
      placement: null,
      surface: null,
      openingPlacement: null,
      generation: get().generation + 1,
      saveState: 'saving',
    });
  },
  duplicateLayout: () => {
    const copied = get().command('Duplicate alternative', (document, layout) => {
      if (document.layouts.length === 3)
        throw new Error(
          'You can keep three alternatives. Remove one or duplicate the project first.',
        );
      const duplicate = cloneLayout(
        layout,
        `Layout ${String.fromCharCode(65 + document.layouts.length)}`,
      );
      document.layouts.push(duplicate);
      document.activeLayoutId = duplicate.id;
    });
    if (copied) set({ selection: null, surface: null, placement: null, openingPlacement: null });
  },
  deleteLayout: (id) => {
    const removed = get().command('Delete alternative', (document) => {
      if (document.layouts.length === 1) throw new Error('Keep at least one alternative.');
      document.layouts = document.layouts.filter((layout) => layout.id !== id);
      if (document.activeLayoutId === id) document.activeLayoutId = document.layouts[0].id;
    });
    if (removed) set({ selection: null, surface: null, placement: null, openingPlacement: null });
  },
}));
export const activeLayout = (document: ProjectDocument) =>
  document.layouts.find((layout) => layout.id === document.activeLayoutId)!;
