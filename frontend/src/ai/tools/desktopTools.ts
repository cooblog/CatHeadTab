import { defineTool } from './schema';
import { useLayoutStore } from '../../store/layoutStore';
import type { DesktopItem } from '../../store/layoutStore';

export const listDesktopItems = defineTool<{ pageIndex?: number }>({
  description: 'List all icons, folders, and widgets on the desktop.',
  schema: { type: 'object', properties: { pageIndex: { type: 'number', description: 'Page index (0-based).' } } },
  execute: async ({ pageIndex }) => {
    const { layout } = useLayoutStore.getState();
    const fmt = (item: DesktopItem) => ({
      id: item.id, type: item.type, title: item.title, url: item.url || undefined,
      widgetType: item.widgetType || undefined, childCount: item.children?.length ?? 0,
      children: item.children?.map(c => ({ id: c.id, title: c.title, url: c.url })),
    });
    const pages = pageIndex !== undefined ? [layout.pages[pageIndex]].filter(Boolean) : layout.pages;
    return {
      totalPages: layout.pages.length,
      pages: pages.map((page, i) => ({ pageIndex: pageIndex ?? i, items: page.map(fmt) })),
      dock: layout.dock.map(fmt),
    };
  },
});

export const addDesktopItem = defineTool<{ title: string; url: string; pageIndex?: number }>({
  description: 'Add a new website shortcut icon to the desktop.',
  schema: {
    type: 'object', required: ['title', 'url'],
    properties: { title: { type: 'string' }, url: { type: 'string' }, pageIndex: { type: 'number' } },
  },
  execute: async ({ title, url, pageIndex }) => {
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    const newItem: DesktopItem = { id: `link-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, type: 'link', title, url: fullUrl, icon: '' };
    const dup = useLayoutStore.getState().addDesktopItem(newItem, pageIndex);
    if (dup) return { success: false, message: `"${dup.title}" already exists.` };
    return { success: true, message: `Added "${title}".` };
  },
});

export const removeDesktopItem = defineTool<{ id: string; confirmed?: boolean }>({
  description: 'Remove a desktop item by its ID. Must set confirmed=true to actually delete. First call without confirmed to get item info, then ask user for confirmation.',
  schema: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, confirmed: { type: 'boolean', description: 'Set to true only after user explicitly confirms deletion.' } } },
  execute: async ({ id, confirmed }) => {
    const { layout } = useLayoutStore.getState();
    // 查找 item 信息
    const allItems = [...layout.pages.flat(), ...layout.dock];
    const item = allItems.find(i => i.id === id);
    if (!item) return { success: false, message: `Item ${id} not found.` };

    if (!confirmed) {
      return {
        success: false,
        needsConfirmation: true,
        message: `Found "${item.title}" (type: ${item.type}). Please ask the user to confirm before deleting.`,
        item: { id: item.id, type: item.type, title: item.title },
      };
    }

    useLayoutStore.getState().saveSnapshot();
    useLayoutStore.getState().removeDesktopItem(id);
    return { success: true, message: `Removed "${item.title}".` };
  },
});

export const createFolder = defineTool<{ name: string; pageIndex?: number }>({
  description: 'Create a new empty folder on the desktop.',
  schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, pageIndex: { type: 'number' } } },
  execute: async ({ name, pageIndex }) => {
    const folder: DesktopItem = { id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, type: 'folder', title: name, children: [] };
    useLayoutStore.getState().addDesktopItem(folder, pageIndex);
    return { success: true, folderId: folder.id, message: `Created "${name}".` };
  },
});

export const moveItemToFolder = defineTool<{ itemId: string; folderId: string }>({
  description: 'Move a desktop link item into an existing folder. Cannot move widgets or folders.',
  schema: { type: 'object', required: ['itemId', 'folderId'], properties: { itemId: { type: 'string' }, folderId: { type: 'string' } } },
  execute: async ({ itemId, folderId }) => {
    const { layout } = useLayoutStore.getState();
    const allItems = [...layout.pages.flat(), ...layout.dock];
    const item = allItems.find(i => i.id === itemId);
    if (!item) return { success: false, message: `Item ${itemId} not found.` };
    if (item.type === 'widget') return { success: false, message: `Cannot move widget "${item.title}" into a folder. Widgets must stay on the desktop.` };
    if (item.type === 'folder') return { success: false, message: `Cannot move folder "${item.title}" into another folder.` };
    useLayoutStore.getState().moveItemToFolder(itemId, folderId);
    return { success: true, message: `Moved "${item.title}" into folder.` };
  },
});

export const renameItem = defineTool<{ id: string; newTitle: string }>({
  description: 'Rename a desktop item.',
  schema: { type: 'object', required: ['id', 'newTitle'], properties: { id: { type: 'string' }, newTitle: { type: 'string' } } },
  execute: async ({ id, newTitle }) => {
    useLayoutStore.getState().updateDesktopItem(id, { title: newTitle });
    return { success: true, message: `Renamed to "${newTitle}".` };
  },
});

export const organizeDesktop = defineTool<{ categories: Array<{ folderName: string; itemIds: string[] }> }>({
  description: 'Batch-organize desktop link icons into categorized folders. Only moves "link" type items. Widgets and existing folders are never moved. Call listDesktopItems first.',
  schema: {
    type: 'object', required: ['categories'],
    properties: {
      categories: {
        type: 'array', items: {
          type: 'object', required: ['folderName', 'itemIds'],
          properties: { folderName: { type: 'string' }, itemIds: { type: 'array', items: { type: 'string' } } },
        },
      },
    },
  },
  execute: async ({ categories }) => {
    const store = useLayoutStore.getState();
    // 批量操作前保存快照，支持回滚
    store.saveSnapshot();
    const allItems = [...store.layout.pages.flat(), ...store.layout.dock];
    let foldersCreated = 0, itemsMoved = 0, skipped = 0;
    for (const cat of categories) {
      if (!cat.itemIds.length) continue;
      // 过滤掉 widget 和 folder 类型，只移动 link
      const validIds = cat.itemIds.filter(id => {
        const item = allItems.find(i => i.id === id);
        if (!item || item.type === 'widget' || item.type === 'folder') {
          skipped++;
          return false;
        }
        return true;
      });
      if (!validIds.length) continue;
      const folderId = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      store.addDesktopItem({ id: folderId, type: 'folder', title: cat.folderName, children: [] });
      foldersCreated++;
      for (const id of validIds) { store.moveItemToFolder(id, folderId); itemsMoved++; }
    }
    return {
      success: true, foldersCreated, itemsMoved, skipped,
      message: `Created ${foldersCreated} folder(s), organized ${itemsMoved} item(s).${skipped > 0 ? ` Skipped ${skipped} widget(s)/folder(s).` : ''}`,
    };
  },
});
