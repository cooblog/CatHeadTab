import { streamText, stepCountIs } from 'ai';
import type { ModelMessage } from 'ai';
import { getAIModel } from './provider';
import { useConfigStore } from '../store/configStore';

// Import all tool groups
import * as desktopTools from './tools/desktopTools';
import * as bookmarkTools from './tools/bookmarkTools';
import * as historyTools from './tools/historyTools';
import * as settingsTools from './tools/settingsTools';
import * as trendingTools from './tools/trendingTools';

/** All locally registered tools (Skills). */
const allTools = {
  // Desktop operations
  listDesktopItems: desktopTools.listDesktopItems,
  addDesktopItem: desktopTools.addDesktopItem,
  removeDesktopItem: desktopTools.removeDesktopItem,
  createFolder: desktopTools.createFolder,
  moveItemToFolder: desktopTools.moveItemToFolder,
  renameItem: desktopTools.renameItem,
  organizeDesktop: desktopTools.organizeDesktop,
  // Bookmark operations
  searchBookmarks: bookmarkTools.searchBookmarks,
  listBookmarkFolders: bookmarkTools.listBookmarkFolders,
  getRecentBookmarks: bookmarkTools.getRecentBookmarks,
  // History operations
  searchHistory: historyTools.searchHistory,
  getRecentHistory: historyTools.getRecentHistory,
  // Settings operations
  changeWallpaper: settingsTools.changeWallpaper,
  changeLanguage: settingsTools.changeLanguage,
  getSystemInfo: settingsTools.getSystemInfo,
  // Trending / hot content
  getGithubTrending: trendingTools.getGithubTrending,
  getBilibiliHot: trendingTools.getBilibiliHot,
  getWeiboHot: trendingTools.getWeiboHot,
  getXiaohongshuHot: trendingTools.getXiaohongshuHot,
  getBBCNews: trendingTools.getBBCNews,
};

function getSystemPrompt(): string {
  const lang = useConfigStore.getState().language;
  if (lang === 'zh') {
    return `你是 CatHeadTab 的 AI 助手，帮助用户管理浏览器新标签页桌面。

你的能力：
- 查看、添加、删除、重命名桌面图标
- 创建文件夹并将图标分类整理
- 搜索用户的浏览器书签和历史记录
- 更换壁纸、切换语言等设置操作
- 获取热门资讯：GitHub Trending、Bilibili 热门、微博热搜、小红书热搜、BBC 新闻

⚠️ 严格规则（必须遵守）：
1. **绝对不能删除任何桌面项目**，除非用户明确要求删除某个具体项目。删除前必须先告知用户将要删除的内容并等待确认
2. **不要移动小组件（widget）和文件夹（folder）**，整理桌面时只移动链接（link）类型的图标
3. 整理桌面 = 只对 link 类型图标进行分类归档到文件夹，不改变 widget 和 folder 的位置

操作规范：
1. 整理桌面前，先调用 listDesktopItems 了解当前布局
2. 分析图标的 URL 和标题来判断类别，忽略 type 为 widget 和 folder 的项目
3. 使用 organizeDesktop 批量创建文件夹并移动 link 图标
4. 操作完成后简洁地告知用户结果
5. 查询热搜/热榜/新闻时，调用对应的 trending 工具获取实时数据
6. 回复使用简洁友好的中文`;
  }
  return `You are CatHeadTab's AI assistant, helping users manage their browser new tab desktop.

Your capabilities:
- View, add, delete, rename desktop icons
- Create folders and organize icons into categories
- Search user's browser bookmarks and history
- Change wallpaper, switch language, and other settings
- Fetch trending content: GitHub Trending, Bilibili Hot, Weibo Hot Search, Xiaohongshu Hot, BBC News

⚠️ Strict Rules (MUST follow):
1. **NEVER delete any desktop item** unless the user explicitly asks to delete a specific item. Always inform the user what will be deleted and wait for confirmation before proceeding
2. **NEVER move widgets or folders** — when organizing the desktop, only move "link" type icons
3. Organizing desktop = categorize link-type icons into folders only; leave widgets and folders untouched

Guidelines:
1. Before organizing, call listDesktopItems to understand the current layout
2. Analyze icon URLs and titles to determine categories; ignore items with type "widget" or "folder"
3. Use organizeDesktop to batch-create folders and move link icons
4. Report results concisely after operations
5. When asked about trending/hot topics/news, call the corresponding trending tool to get real-time data
6. Reply in clear, friendly English`;
}

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
  /** 标记该消息为错误消息，不会作为上下文发送给 LLM */
  isError?: boolean;
}

/**
 * Run the AI agent with streaming output.
 * Yields text chunks as they arrive from the LLM.
 */
export async function* runAgent(
  userMessage: string,
  history: AgentMessage[],
): AsyncGenerator<string> {
  const model = getAIModel();

  // Keep only the last 20 messages as context to avoid exceeding token limits.
  // Older messages are still saved locally but not sent to the LLM.
  const contextWindow = 20;
  const recentHistory = history
    .filter(m => !m.isError)
    .slice(-contextWindow);

  const messages: ModelMessage[] = [
    ...recentHistory.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: userMessage },
  ];

  const result = streamText({
    model,
    system: getSystemPrompt(),
    messages,
    tools: allTools as any,
    stopWhen: stepCountIs(10),
  });

  let hasOutput = false;
  try {
    for await (const chunk of result.textStream) {
      hasOutput = true;
      yield chunk;
    }
  } catch (err: any) {
    // 将 AI SDK 的错误重新抛出，确保上层能捕获
    throw err;
  }

  // 检查是否有错误（某些 SDK 版本在流结束后才能获取错误）
  try {
    // 等待完成以触发可能的延迟错误
    await result.response;
  } catch (err: any) {
    if (!hasOutput) {
      throw err;
    }
  }
}
