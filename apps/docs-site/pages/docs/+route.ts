import type { PageContext } from 'vike/types';

export function route(pageContext: PageContext) {
  const match = pageContext.urlPathname.startsWith('/docs/')
    ? true
    : pageContext.urlPathname === '/docs';
  if (match) {
    return {
      routeParams: {
        splat: pageContext.urlPathname.slice('/docs/'.length),
      },
    };
  }
  return false;
}
