import { createWorker, type WorkerClient } from "isolated-workers";
import { fileURLToPath } from "url";

import type { ProgressDisplay } from "./progress-display.js";
import type {
  DependencyMetrics,
  DigestOutput,
  ManifestDigest,
  ParsedDependency,
} from "./types.js";
import type { PluginWorkerMessages } from "./worker-messages.js";

// ── Public types ────────────────────────────────────────────────────────────

export interface PluginEntry {
  /** Package name used to dynamically import the plugin in the worker */
  packageName: string;
  /** Human-readable name for display (e.g. "js", "rust") */
  displayName: string;
  /** Ecosystem identifier (e.g. "npm", "cargo") */
  ecosystem: string;
}

export interface ScanOptions {
  dir: string;
  plugins: PluginEntry[];
  token?: string;
  concurrency?: number;
  excludePatterns?: string[];
  skipCache?: boolean;
  display: ProgressDisplay;
}

export interface ProgressEvent {
  phase: "detect" | "parse" | "fetch";
  plugin: string;
  manifest?: string;
  current: number;
  total: number;
  dependency?: string;
}

// ── Worker script path ──────────────────────────────────────────────────────

function resolveWorkerScript(): string {
  const currentExt = import.meta.url.endsWith(".ts") ? ".ts" : ".js";
  return fileURLToPath(
    new URL(`./plugin-worker${currentExt}`, import.meta.url),
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function matchesExclude(name: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern.endsWith("*")) {
      return name.startsWith(pattern.slice(0, -1));
    }
    return name === pattern;
  });
}

async function fetchWithConcurrency(
  deps: ParsedDependency[],
  fetcher: (dep: ParsedDependency) => Promise<DependencyMetrics>,
  concurrency: number,
  onProgress?: (current: number, total: number, name: string) => void,
): Promise<DependencyMetrics[]> {
  const results: DependencyMetrics[] = [];
  const queue = [...deps];
  let completed = 0;
  const total = deps.length;

  const workers = Array.from(
    { length: Math.min(concurrency, queue.length) },
    async () => {
      while (queue.length > 0) {
        const dep = queue.shift();
        if (!dep) break;
        try {
          const metrics = await fetcher(dep);
          results.push(metrics);
        } catch (err) {
          console.error(
            `Failed to fetch metrics for ${dep.name}@${dep.version}:`,
            err,
          );
        }
        completed++;
        onProgress?.(completed, total, dep.name);
      }
    },
  );

  await Promise.all(workers);
  return results;
}

async function flushWorkerLogs(
  worker: WorkerClient<PluginWorkerMessages>,
  pluginName: string,
  display: ProgressDisplay,
): Promise<void> {
  try {
    const { logs } = await worker.send("flushLogs", {});
    if (logs.length > 0) {
      display.appendLogs(pluginName, logs);
    }
  } catch {
    // Worker may have shut down already
  }
}

// ── Per-plugin scan (runs in its own worker process) ────────────────────────

async function scanPlugin(options: {
  plugin: PluginEntry;
  dir: string;
  token: string | undefined;
  concurrency: number;
  excludePatterns: string[];
  skipCache: boolean;
  display: ProgressDisplay;
}): Promise<ManifestDigest[]> {
  const {
    plugin,
    dir,
    token,
    concurrency,
    excludePatterns,
    skipCache,
    display,
  } = options;

  // displayName is the pre-registered name from the in-process plugin load.
  // We use it as fallback if the worker crashes before init returns.
  let name = plugin.displayName;

  const workerScript = resolveWorkerScript();
  const worker = await createWorker<PluginWorkerMessages>({
    script: workerScript,
    timeout: 5 * 60_000, // 5 minutes — large dep trees can take a while
    spawnOptions: {
      stdio: "ignore",
    },
  });

  try {
    // Initialize: load the plugin inside the worker
    const initResult = await worker.send("init", {
      pluginName: plugin.packageName,
      skipCache,
    });
    name = initResult.name;
    const ecosystem = initResult.ecosystem;
    await flushWorkerLogs(worker, name, display);

    // Detect
    display.updatePhase(name, "detect");
    const { manifests: manifestFiles } = await worker.send("detect", { dir });
    await flushWorkerLogs(worker, name, display);
    display.updatePhase(name, "detect", {
      manifestCount: manifestFiles.length,
    });

    const manifests: ManifestDigest[] = [];

    for (const manifest of manifestFiles) {
      // Parse
      display.updatePhase(name, "parse");
      const { dependencies: allDeps, edges } = await worker.send(
        "parseDependencies",
        { manifest },
      );
      await flushWorkerLogs(worker, name, display);

      const filteredDeps = allDeps.filter(
        (d) => !matchesExclude(d.name, excludePatterns),
      );

      // Fetch metrics — each call goes through the IPC channel to the worker
      display.updatePhase(name, "fetch", {
        current: 0,
        total: filteredDeps.length,
      });

      let flushCounter = 0;
      let flushing = false;
      const dependencies = await fetchWithConcurrency(
        filteredDeps,
        async (dep) => {
          const { metrics } = await worker.send("fetchMetrics", { dep, token });
          return metrics;
        },
        concurrency,
        (current, total, depName) => {
          display.updatePhase(name, "fetch", {
            current,
            total,
            currentDep: depName,
          });
          // Flush logs every 10 fetches — gated so at most one is in-flight
          flushCounter++;
          if (flushCounter % 10 === 0 && !flushing) {
            flushing = true;
            flushWorkerLogs(worker, name, display)
              .catch((_e: unknown) => {
                /* non-fatal */
              })
              .finally(() => {
                flushing = false;
              });
          }
        },
      );

      // Final log flush for this manifest
      await flushWorkerLogs(worker, name, display);

      manifests.push({
        file: manifest.path,
        ecosystem,
        dependencies,
        edges,
      });
    }

    const totalDeps = manifests.reduce(
      (sum, m) => sum + m.dependencies.length,
      0,
    );
    const manifestLabel =
      manifests.length === 1 ? "1 manifest" : `${manifests.length} manifests`;
    display.updatePhase(name, "done", {
      summary: `${totalDeps} deps scanned (${manifestLabel})`,
    });

    return manifests;
  } catch (err) {
    display.updatePhase(name, "error", {
      summary: String(err),
    });
    await flushWorkerLogs(worker, name, display).catch((_e: unknown) => {
      /* non-fatal */
    });
    return [];
  } finally {
    await worker.close();
  }
}

// ── Main entry point ────────────────────────────────────────────────────────

export async function scan(options: ScanOptions): Promise<DigestOutput> {
  const {
    dir,
    plugins,
    token,
    concurrency = 5,
    excludePatterns = [],
    skipCache = false,
    display,
  } = options;

  // Register plugins in the display
  for (const plugin of plugins) {
    display.registerPlugin(plugin.displayName, plugin.ecosystem);
  }

  // Launch all plugins in parallel — each in its own worker process
  const results = await Promise.all(
    plugins.map((plugin) =>
      scanPlugin({
        plugin,
        dir,
        token,
        concurrency,
        excludePatterns,
        skipCache,
        display,
      }),
    ),
  );

  return {
    scannedAt: new Date().toISOString(),
    manifests: results.flat(),
  };
}
