import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { useConfigStore } from '../store/configStore';

/**
 * getAIModel creates an AI SDK language model from the user's active AI provider config.
 * Supports any OpenAI-compatible API (OpenAI, DeepSeek, GLM, Kimi, etc.)
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
    headers: {
      'HTTP-Referer': 'https://catheadtab.com',
      'X-Title': 'CatHeadTab',
    },
  });

  return llmProvider(model || 'gpt-4o-mini');
}

/** Check whether the AI feature is configured and ready to use. */
export function isAIConfigured(): boolean {
  const { apiKey, baseUrl } = useConfigStore.getState().getActiveAIConfig();
  return !!(apiKey && baseUrl);
}
