import type { PageContext } from 'vike/types';

export function route(pageContext: PageContext) {
  const { urlPathname } = pageContext;

  // Match /api, /api/:package/:symbol, /api/internal/:package/:symbol
  if (urlPathname === '/api' || urlPathname.startsWith('/api/')) {
    return true;
  }

  return false;
}
