export interface NavigationItem {
  title: string;
  path?: string;
  children?: NavigationItem[];
  order?: number;
}

export interface DocMetadata {
  path: string;
  filePath: string;
  title: string;
  description?: string;
  nav?: {
    section: string;
    order: number;
  };
  content: string;
  renderedHtml: string;
}

declare global {
  namespace Vike {
    interface GlobalContextServer {
      docs: Record<string, DocMetadata>;
      navigation: NavigationItem[];
    }
    interface GlobalContextClient {
      navigation: NavigationItem[];
    }
  }
}
