import type { PageContextServer } from 'vike/types';
import type { DocMetadata } from '../../vike-types';

export interface DocsData {
  doc: DocMetadata | null;
}

export async function data(pageContext: PageContextServer): Promise<DocsData> {
  const urlPath = pageContext.urlPathname;
  const doc = pageContext.globalContext.docs[urlPath] ?? null;
  return { doc };
}
