import { defineTool } from './schema';
import { useConfigStore } from '../../store/configStore';

/** Shared helper: fetch trending data from backend API. */
async function fetchTrending(endpoint: string): Promise<{ data: any[]; error?: string }> {
  const serverUrl = useConfigStore.getState().getEffectiveServerUrl();
  if (!serverUrl) {
    return { data: [], error: 'Server URL not configured.' };
  }
  try {
    const resp = await fetch(`${serverUrl}/api/v1/trending/${endpoint}`);
    if (!resp.ok) {
      return { data: [], error: `HTTP ${resp.status}` };
    }
    const json = await resp.json();
    return { data: json.data || [] };
  } catch (e) {
    return { data: [], error: String(e) };
  }
}

export const getGithubTrending = defineTool<{ limit?: number }>({
  description: 'Get GitHub trending repositories today. Returns repo name, description, language, stars, and today\'s new stars.',
  schema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Max number of repos to return (default 10, max 25).' },
    },
  },
  execute: async ({ limit = 10 }) => {
    const { data, error } = await fetchTrending('github');
    if (error) return { results: [], error };
    const capped = Math.min(Math.max(limit, 1), 25);
    return {
      results: data.slice(0, capped).map((r: any) => ({
        name: r.fullName,
        description: r.description,
        language: r.language,
        stars: r.stars,
        todayStars: r.todayStars,
        url: r.url,
      })),
      total: data.length,
    };
  },
});

export const getBilibiliHot = defineTool<{ limit?: number }>({
  description: 'Get Bilibili (哔哩哔哩) popular/hot videos. Returns video title, uploader, view count, and duration.',
  schema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Max number of videos to return (default 10, max 20).' },
    },
  },
  execute: async ({ limit = 10 }) => {
    const { data, error } = await fetchTrending('bilibili');
    if (error) return { results: [], error };
    const capped = Math.min(Math.max(limit, 1), 20);
    return {
      results: data.slice(0, capped).map((v: any) => ({
        title: v.title,
        owner: v.owner,
        views: v.view,
        duration: v.duration,
        url: v.url,
      })),
      total: data.length,
    };
  },
});

export const getWeiboHot = defineTool<{ limit?: number }>({
  description: 'Get Weibo (微博) hot search trending topics. Returns topic title, heat number, tag, and rank.',
  schema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Max number of topics to return (default 10, max 50).' },
    },
  },
  execute: async ({ limit = 10 }) => {
    const { data, error } = await fetchTrending('weibo');
    if (error) return { results: [], error };
    const capped = Math.min(Math.max(limit, 1), 50);
    return {
      results: data.slice(0, capped).map((item: any) => ({
        rank: item.rank,
        title: item.title,
        hotNum: item.hotNum,
        tag: item.tag,
        url: item.url,
      })),
      total: data.length,
    };
  },
});

export const getXiaohongshuHot = defineTool<{ limit?: number }>({
  description: 'Get Xiaohongshu (小红书) hot search trending topics. Returns topic title, score, and rank.',
  schema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Max number of topics to return (default 10, max 30).' },
    },
  },
  execute: async ({ limit = 10 }) => {
    const { data, error } = await fetchTrending('xiaohongshu');
    if (error) return { results: [], error };
    const capped = Math.min(Math.max(limit, 1), 30);
    return {
      results: data.slice(0, capped).map((item: any) => ({
        rank: item.rank,
        title: item.title,
        score: item.score,
        url: item.url,
      })),
      total: data.length,
    };
  },
});

export const getBBCNews = defineTool<{ limit?: number }>({
  description: 'Get BBC News headlines. Returns news title, description, section, and link.',
  schema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Max number of news items to return (default 10, max 30).' },
    },
  },
  execute: async ({ limit = 10 }) => {
    const { data, error } = await fetchTrending('bbc');
    if (error) return { results: [], error };
    const capped = Math.min(Math.max(limit, 1), 30);
    return {
      results: data.slice(0, capped).map((item: any) => ({
        rank: item.rank,
        title: item.title,
        description: item.description,
        section: item.section,
        url: item.url,
      })),
      total: data.length,
    };
  },
});
