import { useCallback, useEffect, useState } from 'react';

export type NavView = 'sessions' | 'usage' | 'settings';

/**
 * Hook for managing navigation between main views (Sessions, Usage, Settings).
 * Handles URL-based routing and browser history integration.
 */
export function useNavigation() {
  const [currentView, setCurrentView] = useState<NavView>(() => getViewFromUrl());

  // Extract view from URL pathname
  function getViewFromUrl(): NavView {
    const path = window.location.pathname;
    if (path === '/settings') return 'settings';
    if (path === '/usage') return 'usage';
    // '/' or '/session/:id' -> sessions view
    return 'sessions';
  }

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      setCurrentView(getViewFromUrl());
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Navigate to a view
  const navigate = useCallback((view: NavView) => {
    setCurrentView(view);
    // For sessions view, preserve current session URL if any
    // For other views, just use /<view>
    if (view === 'sessions') {
      // Don't change URL - let useSession handle it
      // Just update the view state
      const currentPath = window.location.pathname;
      // If we're already on a session path, keep it
      if (!currentPath.startsWith('/session/') && currentPath !== '/') {
        window.history.pushState({ view }, '', '/');
      }
    } else {
      window.history.pushState({ view }, '', `/${view}`);
    }
  }, []);

  return { currentView, navigate };
}
