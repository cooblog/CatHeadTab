import { streamText, stepCountIs } from 'ai';
import type { ModelMessage } from 'ai';
import { getAIModel } from './provider';
import { useConfigStore } from '../store/configStore';

// Import all tool groups
import * as desktopTools from './tools/desktopTools';
import * as bookmarkTools from './tools/bookmarkTools';
import * as historyTools from './tools/historyTools';
import * as settingsTools from './tools/settingsTools';

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

操作规范：
1. 整理桌面前，先调用 listDesktopItems 了解当前布局
2. 分析图标的 URL 和标题来判断类别
3. 使用 organizeDesktop 批量创建文件夹并移动图标
4. 操作完成后简洁地告知用户结果
5. 回复使用简洁友好的中文`;
  }
  return `You are CatHeadTab's AI assistant, helping users manage their browser new tab desktop.

Your capabilities:
- View, add, delete, rename desktop icons
- Create folders and organize icons into categories
- Search user's browser bookmarks and history
- Change wallpaper, switch language, and other settings

Guidelines:
1. Before organizing, call listDesktopItems to understand the current layout
2. Analyze icon URLs and titles to determine categories
3. Use organizeDesktop to batch-create folders and move items
4. Report results concisely after operations
5. Reply in clear, friendly English`;
}

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
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
  const recentHistory = history.slice(-contextWindow);

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

  for await (const chunk of result.textStream) {
    yield chunk;
  }
}
