import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { useConfigStore } from '../store/configStore';
import { proxyFetch } from './proxyFetch';

/**
 * getAIModel creates an AI SDK language model from the user's active AI provider config.
 * Supports any OpenAI-compatible API (OpenAI, DeepSeek, GLM, Kimi, etc.)
 *
 * Uses proxyFetch to route requests through the Chrome extension background
 * service worker, bypassing CORS restrictions from providers like MiniMax/GLM.
 */
export function getAIModel() {
  const { provider, apiKey, baseUrl, model } = useConfigStore.getState().getActiveAIConfig();

  if (!apiKey || !baseUrl) {
    throw new Error('AI API Key and Base URL are required. Please configure in Settings → AI.');
  }

  const llmProvider = createOpenAICompatible({
    name: provider || 'custom',
    baseURL: baseUrl.replace(/\/+$/, ''),
    apiKey,
    fetch: proxyFetch as typeof globalThis.fetch,
  });

  return llmProvider(model || 'gpt-4o-mini');
}

/** Check whether the AI feature is configured and ready to use. */
export function isAIConfigured(): boolean {
  const { apiKey, baseUrl } = useConfigStore.getState().getActiveAIConfig();
  return !!(apiKey && baseUrl);
}
