import { useState, useEffect, useCallback } from 'react';

export type Route = 'deps' | 'licenses' | 'graph';

const VALID_ROUTES: Route[] = ['deps', 'licenses', 'graph'];

function parseHash(): Route {
  const hash = window.location.hash.replace('#/', '').replace('#', '');
  if (VALID_ROUTES.includes(hash as Route)) return hash as Route;
  return 'deps';
}

export function useHashRoute(): [Route, (route: Route) => void] {
  const [route, setRouteState] = useState<Route>(parseHash);

  useEffect(() => {
    const onHashChange = () => setRouteState(parseHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((r: Route) => {
    window.location.hash = `#/${r}`;
  }, []);

  return [route, navigate];
}
