import { defineTool } from './schema';

export const searchBookmarks = defineTool<{ query: string; maxResults?: number }>({
  description: 'Search browser bookmarks by keyword.',
  schema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, maxResults: { type: 'number' } } },
  execute: async ({ query, maxResults = 20 }) => {
    if (typeof chrome === 'undefined' || !chrome.bookmarks) return { results: [], message: 'Not in extension.' };
    return new Promise(r => chrome.bookmarks.search(query, res => r({ results: res.slice(0, maxResults).map(b => ({ id: b.id, title: b.title, url: b.url })), total: res.length })));
  },
});

export const listBookmarkFolders = defineTool<Record<string, never>>({
  description: 'List bookmark folder structure.',
  schema: { type: 'object', properties: {} },
  execute: async () => {
    if (typeof chrome === 'undefined' || !chrome.bookmarks) return { folders: [], message: 'Not in extension.' };
    return new Promise(r => chrome.bookmarks.getTree(tree => {
      const ex = (nodes: chrome.bookmarks.BookmarkTreeNode[], d = 0): any[] => {
        const f: any[] = [];
        for (const n of nodes) { if (!n.url && n.title) { f.push({ id: n.id, title: n.title, depth: d, count: n.children?.filter(c => c.url)?.length ?? 0 }); if (n.children) f.push(...ex(n.children, d + 1)); } }
        return f;
      };
      r({ folders: ex(tree[0]?.children || []) });
    }));
  },
});

export const getRecentBookmarks = defineTool<{ count?: number }>({
  description: 'Get recently added bookmarks.',
  schema: { type: 'object', properties: { count: { type: 'number' } } },
  execute: async ({ count = 20 }) => {
    if (typeof chrome === 'undefined' || !chrome.bookmarks) return { results: [], message: 'Not in extension.' };
    return new Promise(r => chrome.bookmarks.getRecent(count, res => r({ results: res.map(b => ({ id: b.id, title: b.title, url: b.url })) })));
  },
});
