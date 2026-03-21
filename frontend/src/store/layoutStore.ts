import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import client from '../api/client';
import { useConfigStore, customStorage } from './configStore';

const triggerAutoSync = () => {
  const { jwtToken } = useConfigStore.getState();
  if (jwtToken) {
    useLayoutStore.getState().uploadLayoutToCloud().catch(err => {
      console.error('Failed to auto-sync layout to cloud', err);
    });
  }
};

export type DesktopItemType = 'app' | 'link' | 'folder';

export interface DesktopItem {
  id: string;
  type: DesktopItemType;
  title: string;
  url?: string;
  icon?: string;
  children?: DesktopItem[];
}

export interface DesktopLayout {
  pages: DesktopItem[][];
  dock: DesktopItem[];
}

interface LayoutState {
  layout: DesktopLayout;
  loading: boolean;
  error: string | null;

  // Convenience getters
  get pages(): DesktopItem[][];
  get dock(): DesktopItem[];

  // Local mutations
  setLayout: (layout: DesktopLayout) => void;
  addDesktopItem: (item: DesktopItem, pageIndex?: number, parentFolderId?: string) => void;
  removeDesktopItem: (id: string) => void;
  updateDesktopItem: (id: string, updates: Partial<DesktopItem>) => void;
  moveItemToDock: (id: string) => void;
  moveItemFromDock: (id: string) => void;
  reorderDesktopItem: (sourceId: string, targetId: string) => void;
  
  // Cloud Sync Actions
  uploadLayoutToCloud: () => Promise<void>;
  pullLayoutFromCloud: () => Promise<void>;
  mergeLayoutWithCloud: () => Promise<void>;
}

const defaultDock: DesktopItem[] = [
  { id: 'app-bookmarks', type: 'app', title: 'Bookmarks', icon: '🔖' },
];

const defaultLayout: DesktopLayout = {
  pages: [[]],
  dock: defaultDock,
};

// --- Helper: migrate old flat format to new pages+dock format ---
function migrateLayout(raw: any): DesktopLayout {
  // Already new format
  if (raw && raw.pages && Array.isArray(raw.pages)) {
    return {
      pages: raw.pages.length > 0 ? raw.pages : [[]],
      dock: Array.isArray(raw.dock) ? raw.dock : [...defaultDock],
    };
  }
  // Old format: { desktopItems: DesktopItem[] }
  if (raw && Array.isArray(raw.desktopItems)) {
    const items: DesktopItem[] = raw.desktopItems;
    const bookmarkApp = items.find(i => i.id === 'app-bookmarks');
    const desktopOnly = items.filter(i => i.id !== 'app-bookmarks');
    return {
      pages: desktopOnly.length > 0 ? [desktopOnly] : [[]],
      dock: bookmarkApp ? [bookmarkApp] : [...defaultDock],
    };
  }
  // Cloud format: { items: DesktopItem[] }
  if (raw && Array.isArray(raw.items)) {
    const items: DesktopItem[] = raw.items;
    const bookmarkApp = items.find(i => i.id === 'app-bookmarks');
    const desktopOnly = items.filter(i => i.id !== 'app-bookmarks');
    return {
      pages: desktopOnly.length > 0 ? [desktopOnly] : [[]],
      dock: bookmarkApp ? [bookmarkApp] : [...defaultDock],
    };
  }
  return { ...defaultLayout };
}

// --- Helper: recursively find & remove item ---
function removeItemFromList(list: DesktopItem[], id: string): { result: DesktopItem[]; removed: DesktopItem | null } {
  let removed: DesktopItem | null = null;
  const result = list.filter(i => {
    if (i.id === id) { removed = i; return false; }
    return true;
  }).map(i => {
    if (i.children && !removed) {
      const sub = removeItemFromList(i.children, id);
      if (sub.removed) { removed = sub.removed; return { ...i, children: sub.result }; }
    }
    return i;
  });
  return { result, removed };
}

function removeFromPages(pages: DesktopItem[][], id: string): { pages: DesktopItem[][]; removed: DesktopItem | null } {
  let removed: DesktopItem | null = null;
  const newPages = pages.map(page => {
    if (removed) return page;
    const r = removeItemFromList(page, id);
    if (r.removed) { removed = r.removed; return r.result; }
    return page;
  });
  return { pages: newPages, removed };
}

function updateItemInList(list: DesktopItem[], id: string, updates: Partial<DesktopItem>): DesktopItem[] {
  return list.map(i => {
    if (i.id === id) return { ...i, ...updates };
    if (i.children) return { ...i, children: updateItemInList(i.children, id, updates) };
    return i;
  });
}

function addToFolder(list: DesktopItem[], folderId: string, item: DesktopItem): DesktopItem[] {
  return list.map(i => {
    if (i.id === folderId && i.type === 'folder') {
      return { ...i, children: [...(i.children || []), item] };
    }
    if (i.children) return { ...i, children: addToFolder(i.children, folderId, item) };
    return i;
  });
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      layout: defaultLayout,
      loading: false,
      error: null,

      get pages() { return get().layout.pages; },
      get dock() { return get().layout.dock; },

      setLayout: (layout) => set({ layout }),

      addDesktopItem: (item, pageIndex, parentFolderId) => {
        const layout = { ...get().layout, pages: get().layout.pages.map(p => [...p]), dock: [...get().layout.dock] };
        if (parentFolderId) {
          // Add into a folder (search all pages + dock)
          layout.pages = layout.pages.map(page => addToFolder(page, parentFolderId, item));
          layout.dock = addToFolder(layout.dock, parentFolderId, item);
        } else {
          const pi = pageIndex ?? layout.pages.length - 1;
          while (layout.pages.length <= pi) layout.pages.push([]);
          layout.pages[pi] = [...layout.pages[pi], item];
        }
        set({ layout });
        triggerAutoSync();
      },

      removeDesktopItem: (id) => {
        const layout = { ...get().layout };
        // Remove from pages
        const pr = removeFromPages(layout.pages, id);
        layout.pages = pr.pages;
        // Also try dock
        if (!pr.removed) {
          const dr = removeItemFromList(layout.dock, id);
          layout.dock = dr.result;
        }
        // Clean empty trailing pages (keep at least 1)
        while (layout.pages.length > 1 && layout.pages[layout.pages.length - 1].length === 0) {
          layout.pages.pop();
        }
        set({ layout });
        triggerAutoSync();
      },

      updateDesktopItem: (id, updates) => {
        const layout = { ...get().layout };
        layout.pages = layout.pages.map(page => updateItemInList(page, id, updates));
        layout.dock = updateItemInList(layout.dock, id, updates);
        set({ layout });
        triggerAutoSync();
      },

      moveItemToDock: (id) => {
        const layout = { ...get().layout };
        const pr = removeFromPages(layout.pages, id);
        if (pr.removed) {
          layout.pages = pr.pages;
          layout.dock = [...layout.dock, pr.removed];
        }
        // Clean empty trailing pages
        while (layout.pages.length > 1 && layout.pages[layout.pages.length - 1].length === 0) {
          layout.pages.pop();
        }
        set({ layout });
        triggerAutoSync();
      },

      reorderDesktopItem: (sourceId, targetId) => {
        if (sourceId === targetId) return;
        const layout = { ...get().layout };
        let sourceItem: DesktopItem | null = null;
        
        const pr = removeFromPages(layout.pages, sourceId);
        if (pr.removed) {
          layout.pages = pr.pages;
          sourceItem = pr.removed;
        } else {
          const dr = removeItemFromList(layout.dock, sourceId);
          if (dr.removed) {
            layout.dock = dr.result;
            sourceItem = dr.removed;
          }
        }
        if (!sourceItem) return;

        let targetType: 'page' | 'dock' | null = null;
        let pIndex = -1;
        let idx = -1;

        for (let p = 0; p < layout.pages.length; p++) {
          const i = layout.pages[p].findIndex(item => item.id === targetId);
          if (i >= 0) { targetType = 'page'; pIndex = p; idx = i; break; }
        }
        if (!targetType) {
          const i = layout.dock.findIndex(item => item.id === targetId);
          if (i >= 0) { targetType = 'dock'; idx = i; }
        }

        if (targetType === 'page') {
          layout.pages[pIndex] = [
            ...layout.pages[pIndex].slice(0, idx),
            sourceItem,
            ...layout.pages[pIndex].slice(idx)
          ];
        } else if (targetType === 'dock') {
          layout.dock = [
            ...layout.dock.slice(0, idx),
            sourceItem,
            ...layout.dock.slice(idx)
          ];
        } else {
          const lastPage = layout.pages.length - 1;
          layout.pages[lastPage] = [...layout.pages[lastPage], sourceItem];
        }

        set({ layout });
        triggerAutoSync();
      },



      moveItemFromDock: (id) => {
        const layout = { ...get().layout };
        const dr = removeItemFromList(layout.dock, id);
        if (dr.removed) {
          layout.dock = dr.result;
          // Add to last page
          const lastPage = layout.pages.length - 1;
          layout.pages[lastPage] = [...layout.pages[lastPage], dr.removed];
        }
        set({ layout });
        triggerAutoSync();
      },

      uploadLayoutToCloud: async () => {
        set({ loading: true, error: null });
        try {
          const { layout } = get();
          await client.put('/api/v1/layout', { pages: layout.pages, dock: layout.dock });
          
          const { backgroundImage } = useConfigStore.getState();
          await client.put('/api/v1/user/preferences', { backgroundImage });
          
          set({ loading: false });
        } catch (err: any) {
          set({ error: err.message || 'Upload failed', loading: false });
          throw err;
        }
      },

      pullLayoutFromCloud: async () => {
        set({ loading: true, error: null });
        try {
          const res = await client.get('/api/v1/layout');
          const cloudData = res.data.layout;
          const migrated = migrateLayout(cloudData);
          set({ layout: migrated });

          const prefsRes = await client.get('/api/v1/user/preferences');
          const bg = prefsRes.data.preferences?.backgroundImage;
          if (bg) {
            useConfigStore.getState().setBackgroundImage(bg);
          }

          set({ loading: false });
        } catch (err: any) {
          set({ error: err.message || 'Pull failed', loading: false });
          throw err;
        }
      },

      mergeLayoutWithCloud: async () => {
        set({ loading: true, error: null });
        try {
          const res = await client.get('/api/v1/layout');
          const cloudLayout = migrateLayout(res.data.layout);
          const localLayout = get().layout;
          
          // Gather all cloud item IDs
          const allCloudIds = new Set<string>();
          const collectIds = (items: DesktopItem[]) => {
            for (const i of items) {
              allCloudIds.add(i.id);
              if (i.children) collectIds(i.children);
            }
          };
          cloudLayout.pages.forEach(p => collectIds(p));
          collectIds(cloudLayout.dock);

          // Append local-only items to cloud's last page
          const localOnlyItems: DesktopItem[] = [];
          const findLocalOnly = (items: DesktopItem[]) => {
            for (const i of items) {
              if (!allCloudIds.has(i.id)) localOnlyItems.push(i);
            }
          };
          localLayout.pages.forEach(p => findLocalOnly(p));
          findLocalOnly(localLayout.dock);

          const merged: DesktopLayout = {
            pages: [...cloudLayout.pages],
            dock: [...cloudLayout.dock],
          };
          if (localOnlyItems.length > 0) {
            const lastIdx = merged.pages.length - 1;
            merged.pages[lastIdx] = [...merged.pages[lastIdx], ...localOnlyItems];
          }

          set({ layout: merged });
          await client.put('/api/v1/layout', { pages: merged.pages, dock: merged.dock });
          
          set({ loading: false });
        } catch (err: any) {
          set({ error: err.message || 'Merge failed', loading: false });
          throw err;
        }
      }
    }),
    {
      name: 'catheadtab-layout-storage',
      storage: createJSONStorage(() => customStorage),
      // Migrate persisted state on load
      migrate: (persisted: any) => {
        if (persisted && persisted.layout && persisted.layout.pages) {
          return persisted; // Already new format
        }
        // Old format had desktopItems at top level
        if (persisted && persisted.desktopItems) {
          return {
            ...persisted,
            layout: migrateLayout(persisted),
          };
        }
        return persisted;
      },
      version: 2,
    }
  )
);

// Backwards-compatible convenience: desktopItems = all pages flattened
// This is used in search and elsewhere
export function getAllDesktopItems(layout: DesktopLayout): DesktopItem[] {
  return [...layout.pages.flat(), ...layout.dock];
}
