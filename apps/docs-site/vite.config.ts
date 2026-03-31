import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import vike from 'vike/plugin';
import { defineConfig } from 'vite';
import { watchDocs } from './plugins';

export default defineConfig({
  plugins: [vike(), react(), tailwindcss(), watchDocs()],
  resolve: {
    // When using pnpm link for vike-plugin-typedoc/rehype-typedoc, their transitive
    // deps (unified ecosystem, shiki, etc.) must resolve from this project's node_modules
    // rather than from the linked source repo's node_modules.
    dedupe: [
      'rehype-typedoc',
      'unified',
      'remark-parse',
      'remark-breaks',
      'remark-directive',
      'remark-gfm',
      'remark-rehype',
      'rehype-stringify',
      'unist-util-visit',
      'typedoc',
      'shiki',
    ],
  },
  ssr: {
    // Force Vite to bundle the linked packages (and their deps) during SSR build
    // so module resolution goes through this project's dependency graph.
    noExternal: ['vike-plugin-typedoc', 'rehype-typedoc'],
  },
  build: {
    rollupOptions: {
      external: ['/pagefind/pagefind.js', 'prettier'],
    },
  },
  base: process.env.BASE_URL || '/digests',
});
