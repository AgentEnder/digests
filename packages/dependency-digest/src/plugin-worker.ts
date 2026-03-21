import { disableCache } from '@digests/cache-utils';
import { startWorkerServer, type Handlers } from 'isolated-workers';

import type { DependencyDigestPlugin } from './types.js';
import type { LogEntry, PluginWorkerMessages } from './worker-messages.js';

// --- Log capture -----------------------------------------------------------
// Patches stdout/stderr so all worker output is buffered and retrievable
// via the `flushLogs` message. The host polls this to display logs in the
// alt-screen buffer when a user inspects a specific plugin worker.

const logBuffer: LogEntry[] = [];

function captureStream(
  stream: NodeJS.WriteStream,
  kind: 'stdout' | 'stderr',
): void {
  stream.write = function (
    ...args: Parameters<typeof stream.write>
  ): boolean {
    const chunk = args[0];
    const str = typeof chunk === 'string' ? chunk : chunk.toString();
    logBuffer.push({ stream: kind, data: str, timestamp: Date.now() });
    // Swallow the write — don't pass through to the real stream.
    // Since isolated-workers uses Unix domain sockets for IPC (not stdio),
    // suppressing stdout/stderr has no effect on the message channel.
    // The captured logs are retrievable via the `flushLogs` message and
    // viewable in the host's alt-screen buffer.
    //
    // If we passed through here, the output would leak into the parent's
    // terminal (child inherits parent stdio with silent:false) and corrupt
    // the multi-line progress display.
    const cb = args[2] ?? args[1];
    if (typeof cb === 'function') {
      cb();
    }
    return true;
  } as typeof stream.write;
}

captureStream(process.stdout, 'stdout');
captureStream(process.stderr, 'stderr');

// --- Plugin loading --------------------------------------------------------

let plugin: DependencyDigestPlugin | undefined;

const handlers: Handlers<PluginWorkerMessages> = {
  init: async ({ pluginName, skipCache }) => {
    if (skipCache) {
      disableCache();
    }
    const mod = await import(pluginName);
    plugin = mod.default ?? mod.plugin ?? mod;
    if (!plugin) {
      throw new Error(`Plugin "${pluginName}" did not export a valid plugin`);
    }
    return { name: plugin.name, ecosystem: plugin.ecosystem };
  },

  detect: async ({ dir }) => {
    if (!plugin) throw new Error('Worker not initialized — call init first');
    const manifests = await plugin.detect(dir);
    return { manifests };
  },

  parseDependencies: async ({ manifest }) => {
    if (!plugin) throw new Error('Worker not initialized — call init first');
    return plugin.parseDependencies(manifest);
  },

  fetchMetrics: async ({ dep, token }) => {
    if (!plugin) throw new Error('Worker not initialized — call init first');
    const metrics = await plugin.fetchMetrics(dep, token);
    return { metrics };
  },

  flushLogs: async () => {
    const logs = logBuffer.splice(0);
    return { logs };
  },
};

const server = await startWorkerServer(handlers);

process.on('SIGTERM', async () => {
  await server.stop();
  process.exit(0);
});
