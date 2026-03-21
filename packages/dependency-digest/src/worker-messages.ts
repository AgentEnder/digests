import type { DefineMessages } from 'isolated-workers';

import type {
  DependencyMetrics,
  ManifestFile,
  ParsedDependency,
  ParseResult,
} from './types.js';

export interface LogEntry {
  stream: 'stdout' | 'stderr';
  data: string;
  timestamp: number;
}

export type PluginWorkerMessages = DefineMessages<{
  init: {
    payload: { pluginName: string; skipCache?: boolean };
    result: { name: string; ecosystem: string };
  };
  detect: {
    payload: { dir: string };
    result: { manifests: ManifestFile[] };
  };
  parseDependencies: {
    payload: { manifest: ManifestFile };
    result: ParseResult;
  };
  fetchMetrics: {
    payload: { dep: ParsedDependency; token?: string };
    result: { metrics: DependencyMetrics };
  };
  flushLogs: {
    payload: Record<string, never>;
    result: { logs: LogEntry[] };
  };
}>;
