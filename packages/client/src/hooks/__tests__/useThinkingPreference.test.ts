import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useThinkingPreference } from '../useThinkingPreference';

describe('useThinkingPreference', () => {
  const STORAGE_KEY = 'claude-bridge:thinking-expanded';

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('should return default value (true) when localStorage is empty', () => {
    const { result } = renderHook(() => useThinkingPreference());

    expect(result.current.isExpanded).toBe(true);
  });

  it('should return saved value from localStorage when true', () => {
    localStorage.setItem(STORAGE_KEY, 'true');

    const { result } = renderHook(() => useThinkingPreference());

    expect(result.current.isExpanded).toBe(true);
  });

  it('should return saved value from localStorage when false', () => {
    localStorage.setItem(STORAGE_KEY, 'false');

    const { result } = renderHook(() => useThinkingPreference());

    expect(result.current.isExpanded).toBe(false);
  });

  it('should update localStorage when setExpanded is called with true', () => {
    localStorage.setItem(STORAGE_KEY, 'false');

    const { result } = renderHook(() => useThinkingPreference());

    act(() => {
      result.current.setExpanded(true);
    });

    expect(result.current.isExpanded).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('should update localStorage when setExpanded is called with false', () => {
    const { result } = renderHook(() => useThinkingPreference());

    act(() => {
      result.current.setExpanded(false);
    });

    expect(result.current.isExpanded).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');
  });

  it('should toggle expanded state', () => {
    const { result } = renderHook(() => useThinkingPreference());

    expect(result.current.isExpanded).toBe(true);

    act(() => {
      result.current.toggleExpanded();
    });

    expect(result.current.isExpanded).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');

    act(() => {
      result.current.toggleExpanded();
    });

    expect(result.current.isExpanded).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('should handle invalid localStorage value gracefully', () => {
    localStorage.setItem(STORAGE_KEY, 'invalid-value');

    const { result } = renderHook(() => useThinkingPreference());

    // Should fall back to default (true)
    expect(result.current.isExpanded).toBe(true);
  });
});
