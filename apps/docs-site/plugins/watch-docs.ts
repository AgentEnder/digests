import path from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';

export function watchDocs(): Plugin {
  const docsDir = path.resolve(process.cwd(), '../../docs');

  return {
    name: 'watch-docs',
    configureServer(server: ViteDevServer) {
      server.watcher.add(docsDir);

      function onDocsChange(filePath: string) {
        if (!filePath.includes(`${docsDir}/`)) {
          return;
        }

        console.log(`[watch-docs] Change detected: ${filePath}`);

        const triggerFile = path.join(
          process.cwd(),
          'pages/+onCreateGlobalContext.server.ts'
        );
        server.watcher.emit('change', triggerFile);
      }

      server.watcher.on('add', onDocsChange);
      server.watcher.on('unlink', onDocsChange);
      server.watcher.on('change', onDocsChange);
    },
  };
}
