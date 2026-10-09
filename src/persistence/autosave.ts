import { useEditor } from '../state/editor';
import { saveSnapshot, database, projectKey, LocalConflictError } from './database';
export function connectAutosave(partition: string, onCommitted?: () => void) {
  let debounce: ReturnType<typeof setTimeout> | undefined,
    deadline: ReturnType<typeof setTimeout> | undefined;
  let queue = Promise.resolve(),
    disposed = false,
    paused = false,
    expectedGeneration = useEditor.getState().generation;
  const connectedProjectId = useEditor.getState().document?.projectId;
  const channel =
    typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel(`room-planner:${partition}`)
      : null;
  async function persist() {
    clearTimeout(debounce);
    clearTimeout(deadline);
    deadline = undefined;
    const state = useEditor.getState();
    if (!state.document || state.document.projectId !== connectedProjectId || paused) return;
    const snapshot = structuredClone(state.document),
      generation = state.generation;
    queue = queue.then(async () => {
      try {
        if (paused) return;
        await saveSnapshot(snapshot, partition, generation, expectedGeneration);
        expectedGeneration = generation;
        if (!disposed && useEditor.getState().generation === generation)
          useEditor.setState({ saveState: 'saved' });
        channel?.postMessage({ projectId: snapshot.projectId, generation });
        onCommitted?.();
      } catch (error) {
        if (error instanceof LocalConflictError) paused = true;
        if (!disposed)
          useEditor.setState({
            saveState: 'error',
            error:
              error instanceof LocalConflictError
                ? error.message
                : 'Device storage is unavailable or full. Download a plan file now to keep your work.',
          });
      }
    });
    await queue;
  }
  const unsubscribe = useEditor.subscribe((state, previous) => {
    if (!state.document || state.document.projectId !== connectedProjectId) return;
    if (state.generation !== previous.generation && state.saveState === 'saved') {
      expectedGeneration = state.generation;
      paused = false;
      clearTimeout(debounce);
      clearTimeout(deadline);
      deadline = undefined;
      return;
    }
    if (state.generation === previous.generation) return;
    clearTimeout(debounce);
    debounce = setTimeout(() => void persist(), 300);
    deadline ??= setTimeout(() => void persist(), 1000);
  });
  if (channel)
    channel.onmessage = async (event) => {
      const state = useEditor.getState();
      if (event.data.projectId !== state.document?.projectId) return;
      const other = await database.projects.get(projectKey(partition, event.data.projectId));
      if (!other) return;
      if (state.saveState === 'saved' && other.generation > state.generation) {
        state.load(other.document);
        useEditor.setState({ generation: other.generation });
        expectedGeneration = other.generation;
      } else if (state.saveState === 'saving') {
        useEditor.setState({
          error:
            'This plan is open in another tab. Download a plan file before continuing to preserve your version.',
        });
      }
    };
  return {
    flush: persist,
    dispose: () => {
      disposed = true;
      unsubscribe();
      clearTimeout(debounce);
      clearTimeout(deadline);
      channel?.close();
    },
  };
}
