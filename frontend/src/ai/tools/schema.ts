import { jsonSchema } from 'ai';
import type { JSONSchema7 } from '@ai-sdk/provider';

/**
 * Helper to create a tool definition compatible with AI SDK v6.
 * v6 internally reads `inputSchema` (not `parameters`) from tool objects.
 */
export function defineTool<TParams>(config: {
  description: string;
  schema: JSONSchema7;
  execute: (params: TParams) => Promise<any>;
}) {
  return {
    description: config.description,
    inputSchema: jsonSchema<TParams>(config.schema, {
      validate: (value) => ({ success: true as const, value: value as TParams }),
    }),
    execute: config.execute,
  };
}
