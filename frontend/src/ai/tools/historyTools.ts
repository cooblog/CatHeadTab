import { defineTool } from './schema';

export const searchHistory = defineTool<{ query: string; maxResults?: number; startDaysAgo?: number }>({
  description: 'Search browser history by keyword.',
  schema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, maxResults: { type: 'number' }, startDaysAgo: { type: 'number' } } },
  execute: async ({ query, maxResults = 20, startDaysAgo = 30 }) => {
    if (typeof chrome === 'undefined' || !chrome.history) return { results: [], message: 'Not in extension.' };
    const startTime = Date.now() - startDaysAgo * 24 * 60 * 60 * 1000;
    return new Promise(r => chrome.history.search({ text: query, maxResults, startTime }, res => r({ results: res.map(h => ({ title: h.title || 'Untitled', url: h.url, visitCount: h.visitCount, lastVisitTime: h.lastVisitTime })) })));
  },
});

export const getRecentHistory = defineTool<{ count?: number }>({
  description: 'Get recently visited web pages.',
  schema: { type: 'object', properties: { count: { type: 'number' } } },
  execute: async ({ count = 20 }) => {
    if (typeof chrome === 'undefined' || !chrome.history) return { results: [], message: 'Not in extension.' };
    return new Promise(r => chrome.history.search({ text: '', maxResults: count, startTime: 0 }, res => r({ results: res.map(h => ({ title: h.title || 'Untitled', url: h.url, visitCount: h.visitCount, lastVisitTime: h.lastVisitTime })) })));
  },
});
