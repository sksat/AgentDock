import { describe, it, expect } from 'vitest';
import { getContextWindow, calculateOccupancyRate, MODEL_LIMITS } from './model-limits.js';

describe('getContextWindow', () => {
  it('should return context window for known models', () => {
    expect(getContextWindow('claude-opus-4-5-20251101')).toBe(200_000);
    expect(getContextWindow('claude-sonnet-4-5-20250929')).toBe(200_000);
    expect(getContextWindow('claude-haiku-4-5-20251001')).toBe(200_000);
  });

  it('should return context window for Claude 3.5 models', () => {
    expect(getContextWindow('claude-3-5-sonnet-20241022')).toBe(200_000);
    expect(getContextWindow('claude-3-5-haiku-20241022')).toBe(200_000);
  });

  it('should return context window for model family patterns (future versions)', () => {
    // Future versions should fall back to 200K
    expect(getContextWindow('claude-sonnet-5-0-20260101')).toBe(200_000);
    expect(getContextWindow('claude-opus-99')).toBe(200_000);
    expect(getContextWindow('claude-haiku-6-0')).toBe(200_000);
  });

  it('should return null for unknown models', () => {
    expect(getContextWindow('gpt-4')).toBe(null);
    expect(getContextWindow('unknown-model')).toBe(null);
  });

  it('should return null for undefined/empty model', () => {
    expect(getContextWindow(undefined)).toBe(null);
    expect(getContextWindow('')).toBe(null);
  });
});

describe('calculateOccupancyRate', () => {
  it('should calculate occupancy rate correctly', () => {
    // 50,000 / 200,000 = 25%
    expect(calculateOccupancyRate(50_000, 'claude-sonnet-4-5-20250929')).toBe(25);
    // 100,000 / 200,000 = 50%
    expect(calculateOccupancyRate(100_000, 'claude-sonnet-4-5-20250929')).toBe(50);
  });

  it('should return 0 for zero tokens', () => {
    expect(calculateOccupancyRate(0, 'claude-sonnet-4-5-20250929')).toBe(0);
  });

  it('should cap at 100%', () => {
    expect(calculateOccupancyRate(250_000, 'claude-sonnet-4-5-20250929')).toBe(100);
    expect(calculateOccupancyRate(1_000_000, 'claude-sonnet-4-5-20250929')).toBe(100);
  });

  it('should return null for unknown model', () => {
    expect(calculateOccupancyRate(50_000, 'unknown')).toBe(null);
  });

  it('should return null for undefined model', () => {
    expect(calculateOccupancyRate(50_000, undefined)).toBe(null);
  });

  it('should return null for negative tokens', () => {
    expect(calculateOccupancyRate(-100, 'claude-sonnet-4-5-20250929')).toBe(null);
  });

  it('should accept custom context window size', () => {
    // With explicit context window, model name is not required
    expect(calculateOccupancyRate(50_000, undefined, 100_000)).toBe(50);
    expect(calculateOccupancyRate(150_000, undefined, 100_000)).toBe(100);
  });
});

describe('MODEL_LIMITS', () => {
  it('should have maxOutputTokens for all models', () => {
    for (const [modelName, limits] of Object.entries(MODEL_LIMITS)) {
      expect(limits.maxOutputTokens).toBeGreaterThan(0);
      expect(limits.contextWindow).toBeGreaterThan(0);
    }
  });
});
