/**
 * Model limits for Claude models
 * Context window and max output token information
 */

export interface ModelLimits {
  contextWindow: number;
  maxOutputTokens: number;
}

/**
 * Known Claude models and their limits
 * Based on Anthropic's official documentation and Claude Code CLI output
 */
export const MODEL_LIMITS: Record<string, ModelLimits> = {
  // Claude 4 family
  'claude-opus-4-5-20251101': { contextWindow: 200_000, maxOutputTokens: 64_000 },
  'claude-sonnet-4-5-20250929': { contextWindow: 200_000, maxOutputTokens: 64_000 },
  'claude-haiku-4-5-20251001': { contextWindow: 200_000, maxOutputTokens: 64_000 },
  // Claude 3.5 family
  'claude-3-5-sonnet-20241022': { contextWindow: 200_000, maxOutputTokens: 8_192 },
  'claude-3-5-haiku-20241022': { contextWindow: 200_000, maxOutputTokens: 8_192 },
  // Claude 3 family
  'claude-3-opus-20240229': { contextWindow: 200_000, maxOutputTokens: 4_096 },
  'claude-3-sonnet-20240229': { contextWindow: 200_000, maxOutputTokens: 4_096 },
  'claude-3-haiku-20240307': { contextWindow: 200_000, maxOutputTokens: 4_096 },
};

/**
 * Default context window for Claude models (fallback for unknown versions)
 */
const DEFAULT_CLAUDE_CONTEXT_WINDOW = 200_000;

/**
 * Get context window size for a model.
 * Uses pattern matching for model families to handle unknown versions.
 *
 * @param modelName - The model identifier (e.g., 'claude-opus-4-5-20251101')
 * @returns Context window size in tokens, or null if unknown model
 */
export function getContextWindow(modelName: string | undefined): number | null {
  if (!modelName) return null;

  // Exact match
  if (MODEL_LIMITS[modelName]) {
    return MODEL_LIMITS[modelName].contextWindow;
  }

  // Pattern matching for Claude model families (handles future versions)
  if (
    modelName.includes('opus') ||
    modelName.includes('sonnet') ||
    modelName.includes('haiku')
  ) {
    return DEFAULT_CLAUDE_CONTEXT_WINDOW;
  }

  return null; // Unknown model
}

/**
 * Calculate context window occupancy rate
 *
 * @param inputTokens - Number of input tokens used
 * @param modelName - The model identifier
 * @param contextWindowOverride - Optional explicit context window size (from CLI result)
 * @returns Percentage (0-100) or null if calculation not possible
 */
export function calculateOccupancyRate(
  inputTokens: number,
  modelName: string | undefined,
  contextWindowOverride?: number
): number | null {
  if (inputTokens < 0) return null;

  const contextWindow = contextWindowOverride ?? getContextWindow(modelName);
  if (!contextWindow) return null;

  return Math.min(100, (inputTokens / contextWindow) * 100);
}
