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

export const removeDesktopItem = defineTool<{ id: string }>({
  description: 'Remove a desktop item by its ID.',
  schema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
  execute: async ({ id }) => {
    useLayoutStore.getState().removeDesktopItem(id);
    return { success: true, message: `Removed ${id}.` };
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
  description: 'Move a desktop item into an existing folder.',
  schema: { type: 'object', required: ['itemId', 'folderId'], properties: { itemId: { type: 'string' }, folderId: { type: 'string' } } },
  execute: async ({ itemId, folderId }) => {
    useLayoutStore.getState().moveItemToFolder(itemId, folderId);
    return { success: true, message: `Moved ${itemId} into ${folderId}.` };
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
  description: 'Batch-organize desktop icons into categorized folders. Call listDesktopItems first.',
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
    let foldersCreated = 0, itemsMoved = 0;
    for (const cat of categories) {
      if (!cat.itemIds.length) continue;
      const folderId = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      store.addDesktopItem({ id: folderId, type: 'folder', title: cat.folderName, children: [] });
      foldersCreated++;
      for (const id of cat.itemIds) { store.moveItemToFolder(id, folderId); itemsMoved++; }
    }
    return { success: true, foldersCreated, itemsMoved, message: `Created ${foldersCreated} folder(s), organized ${itemsMoved} item(s).` };
  },
});
