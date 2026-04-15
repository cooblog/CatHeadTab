import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { useConfigStore } from '../store/configStore';
import { proxyFetch } from './proxyFetch';

/**
 * AI 有两种运行模式：
 * 1. **后端模式** (Server AI)：后端配置了 AI API Key，Pro/Admin 用户通过后端代理调用 LLM（默认）
 * 2. **本地模式** (Local AI)：用户自己在设置中配置 API Key，浏览器直接调用 LLM API
 *
 * 默认优先级：后端 AI > 本地 AI（后端配了就用后端，省去用户配 Key 的麻烦）
 * 用户可在设置中手动切换为本地模式（aiPreferLocal = true）
 */

/** 检查后端是否配置了 Server-side AI */
export function isServerAIConfigured(): boolean {
  const store = useConfigStore.getState();
  return !!store.serverAIConfig?.configured;
}

/** 检查用户本地是否配置了 AI */
export function isLocalAIConfigured(): boolean {
  const { apiKey, baseUrl } = useConfigStore.getState().getActiveAIConfig();
  return !!(apiKey && baseUrl);
}

/** Check whether AI feature is available (either server-side or local). */
export function isAIConfigured(): boolean {
  return isLocalAIConfigured() || isServerAIConfigured();
}

/**
 * Returns the current effective AI mode.
 * - If user explicitly chose local mode (aiPreferLocal) AND has local config → 'local'
 * - If server AI is available → 'server'
 * - If only local config → 'local'
 * - Otherwise → null
 */
export function getAIMode(): 'local' | 'server' | null {
  const store = useConfigStore.getState();
  const hasLocal = isLocalAIConfigured();
  const hasServer = isServerAIConfigured();

  // 用户明确选择本地模式，且本地有配置
  if (store.aiPreferLocal && hasLocal) return 'local';

  // 默认优先后端
  if (hasServer) return 'server';
  if (hasLocal) return 'local';
  return null;
}

/**
 * getAIModel creates an AI SDK language model based on current mode.
 */
export function getAIModel() {
  const mode = getAIMode();
  const store = useConfigStore.getState();

  if (mode === 'local') {
    const localCfg = store.getActiveAIConfig();
    const llmProvider = createOpenAICompatible({
      name: localCfg.provider || 'custom',
      baseURL: localCfg.baseUrl.replace(/\/+$/, ''),
      apiKey: localCfg.apiKey,
      fetch: proxyFetch as typeof globalThis.fetch,
    });
    return llmProvider(localCfg.model || 'gpt-4o-mini');
  }

  if (mode === 'server') {
    const serverUrl = store.getEffectiveServerUrl();
    const jwtToken = store.jwtToken;
    if (!serverUrl || !jwtToken) {
      throw new Error('Please login to use server-side AI.');
    }

    const llmProvider = createOpenAICompatible({
      name: 'server',
      baseURL: `${serverUrl.replace(/\/+$/, '')}/api/v1/ai`,
      apiKey: 'server-managed',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
      },
      fetch: proxyFetch as typeof globalThis.fetch,
    });

    const serverModel = store.serverAIConfig?.model || 'default';
    return llmProvider(serverModel);
  }

  throw new Error('AI is not configured. Please configure API Key in Settings or login to use server AI.');
}

/** Check whether the current user has Pro or Admin role (required for AI features).
 *  When pro_gate_enabled is false (self-hosted default), all users have access. */
export function hasAIAccess(): boolean {
  const profile = useConfigStore.getState().userProfile;
  // If server doesn't enforce Pro gating, everyone has access
  if (!profile?.pro_gate_enabled) return true;
  const role = profile?.role;
  return role === 'pro' || role === 'admin';
}
