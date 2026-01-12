import { useState, useCallback } from 'react';

const STORAGE_KEY = 'agent-dock:thinking-expanded';

function getStoredValue(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
    // Default to true (expanded) for any other value
    return true;
  } catch {
    // localStorage may not be available
    return true;
  }
}

function setStoredValue(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // localStorage may not be available
  }
}

export interface UseThinkingPreferenceReturn {
  isExpanded: boolean;
  setExpanded: (value: boolean) => void;
  toggleExpanded: () => void;
}

export function useThinkingPreference(): UseThinkingPreferenceReturn {
  const [isExpanded, setIsExpanded] = useState<boolean>(getStoredValue);

  const setExpanded = useCallback((value: boolean) => {
    setIsExpanded(value);
    setStoredValue(value);
  }, []);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => {
      const newValue = !prev;
      setStoredValue(newValue);
      return newValue;
    });
  }, []);

  return {
    isExpanded,
    setExpanded,
    toggleExpanded,
  };
}
