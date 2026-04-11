import { create } from 'zustand';
import type { TaskFilterState } from '@/types/tasks';

interface TaskStore {
  filters: TaskFilterState;
  selectedTaskId: string | null;
  isCreateOpen: boolean;
  pendingQueue: Array<{ action: string; payload: Record<string, unknown> }>;
  setSearch: (search: string) => void;
  setPriority: (priority: TaskFilterState['priority']) => void;
  setStatus: (status: TaskFilterState['status']) => void;
  setBucket: (bucket: TaskFilterState['bucket']) => void;
  setAssigned: (assigned: TaskFilterState['assigned']) => void;
  selectTask: (taskId: string | null) => void;
  setCreateOpen: (open: boolean) => void;
  enqueue: (action: string, payload: Record<string, unknown>) => void;
  clearQueue: () => void;
}

const DEFAULT_FILTERS: TaskFilterState = {
  search: '',
  priority: 'all',
  status: 'all',
  bucket: 'all',
  assigned: 'me',
};

const readQueue = () => {
  try {
    const raw = localStorage.getItem('task_module_queue_v1');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveQueue = (queue: Array<{ action: string; payload: Record<string, unknown> }>) => {
  localStorage.setItem('task_module_queue_v1', JSON.stringify(queue));
};

export const useTaskStore = create<TaskStore>((set) => ({
  filters: DEFAULT_FILTERS,
  selectedTaskId: null,
  isCreateOpen: false,
  pendingQueue: readQueue(),
  setSearch: (search) => set((state) => ({ filters: { ...state.filters, search } })),
  setPriority: (priority) => set((state) => ({ filters: { ...state.filters, priority } })),
  setStatus: (status) => set((state) => ({ filters: { ...state.filters, status } })),
  setBucket: (bucket) => set((state) => ({ filters: { ...state.filters, bucket } })),
  setAssigned: (assigned) => set((state) => ({ filters: { ...state.filters, assigned } })),
  selectTask: (selectedTaskId) => set({ selectedTaskId }),
  setCreateOpen: (isCreateOpen) => set({ isCreateOpen }),
  enqueue: (action, payload) =>
    set((state) => {
      const queue = [...state.pendingQueue, { action, payload }];
      saveQueue(queue);
      return { pendingQueue: queue };
    }),
  clearQueue: () =>
    set(() => {
      saveQueue([]);
      return { pendingQueue: [] };
    }),
}));
