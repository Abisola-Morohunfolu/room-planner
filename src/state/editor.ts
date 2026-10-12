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
import { fitsOn, isDescendant, roundMm } from '../domain/geometry';
import { moveStack, supportAtPosition } from '../domain/stacking';
export type Panel = 'room' | 'furniture' | 'finishes' | 'list';
interface HistoryEntry {
  before: ProjectDocument;
  after: ProjectDocument;
  layoutId: string;
  label: string;
}
interface EditorState {
  document: ProjectDocument | null;
  readOnly: boolean;
  session: number;
  reset: () => void;
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
  load: (document: ProjectDocument, readOnly?: boolean) => void;
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
  stackItem: (id: string, supportId: string | null) => boolean;
  moveItem: (id: string, xMm: number, yMm: number) => boolean;
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
  readOnly: false,
  session: 0,
  reset: () =>
    set({
      document: null,
      readOnly: false,
      session: get().session + 1,
      selection: null,
      surface: null,
      placement: null,
      openingPlacement: null,
      history: [],
      future: [],
    }),
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
  load: (document, readOnly = false) =>
    set({
      document: projectSchema.parse(document),
      readOnly,
      session: get().session + 1,
      view: '2d',
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
      openingPlacement && !get().readOnly
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
      placement && !get().readOnly
        ? { placement, openingPlacement: null, selection: null, surface: null, view: '2d' }
        : { placement: null },
    ),
  clearError: () => set({ error: null }),
  command: (label, edit) => {
    const state = get();
    if (state.readOnly || !state.document) return false;
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
      const item = layout.items.find((piece) => piece.id === id);
      if (!item) return;
      const before = { ...item };
      Object.assign(item, normalizeItem({ ...item, ...patch }));
      const support = layout.items.find((piece) => piece.id === item.supportedById);
      if (
        support &&
        (patch.xMm !== undefined || patch.yMm !== undefined) &&
        !fitsOn(item, support)
      ) {
        item.supportedById = null;
        item.elevationMm = 0;
      }
      moveStack(layout.items, before, item);
    }),
  stackItem: (id, supportId) =>
    get().command('Stack furniture', (_document, layout) => {
      const item = layout.items.find((piece) => piece.id === id);
      if (!item) return;
      const before = { ...item };
      if (supportId) {
        const support = layout.items.find((piece) => piece.id === supportId);
        if (
          !support ||
          support.id === id ||
          support.nonblocking ||
          item.nonblocking ||
          isDescendant(support, id, layout.items)
        )
          throw new Error('Choose another solid piece to support this item.');
        const candidate = {
          ...item,
          xMm: support.xMm,
          yMm: support.yMm,
          rotationDeg: support.rotationDeg,
        };
        if (!fitsOn(candidate, support))
          throw new Error(
            'This piece is too large for that surface. Resize it or choose a larger support.',
          );
        Object.assign(item, candidate);
      }
      item.supportedById = supportId;
      item.elevationMm = 0;
      moveStack(layout.items, before, item);
    }),
  moveItem: (id, xMm, yMm) => {
    const layout = get().document && activeLayout(get().document!);
    const item = layout?.items.find((piece) => piece.id === id);
    if (!item || !layout) return false;
    const candidate = normalizeItem({ ...item, xMm, yMm });
    const support = supportAtPosition(candidate, layout.items);
    return get().updateItem(id, {
      xMm: candidate.xMm,
      yMm: candidate.yMm,
      supportedById: support?.id ?? null,
      elevationMm: support || item.supportedById ? 0 : item.elevationMm,
    });
  },
  removeItem: (id) => {
    if (get().readOnly) return;
    get().command('Delete element', (_document, layout) => {
      for (const item of layout.items)
        if (item.supportedById === id) {
          item.supportedById = null;
          item.elevationMm = 0;
        }
      layout.items = layout.items.filter((item) => item.id !== id);
      layout.openings = layout.openings.filter((opening) => opening.id !== id);
    });
    set({ selection: null });
  },
  duplicateItem: (id) => {
    if (get().readOnly) return;
    let selection: string | null = null;
    get().command('Duplicate furniture', (_document, layout) => {
      const source = layout.items.find((item) => item.id === id);
      if (source) {
        selection = uid();
        const copy = {
          ...source,
          id: selection,
          xMm: source.xMm + 100,
          yMm: source.yMm + 100,
        };
        const support = layout.items.find((item) => item.id === copy.supportedById);
        if (support && !fitsOn(copy, support)) {
          copy.supportedById = null;
          copy.elevationMm = 0;
        }
        layout.items.push(copy);
      }
    });
    set({ selection });
  },
  undo: () => {
    const state = get(),
      entry = state.history.at(-1);
    if (state.readOnly || !entry) return;
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
    if (state.readOnly || !entry) return;
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
      ...(get().readOnly ? {} : { generation: get().generation + 1, saveState: 'saving' as const }),
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
