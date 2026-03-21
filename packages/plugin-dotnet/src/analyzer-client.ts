import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface AnalyzerOutput {
  packages: Array<{
    name: string;
    version: string;
    sha512: string | null;
    direct: boolean;
    framework: string | null;
    dependencies: string[];
  }>;
  edges: Record<string, string[]>;
  packageSources: string[];
  errors: string[];
}

function isPreviewSdk(): boolean {
  const result = spawnSync('dotnet', ['--version'], {
    encoding: 'utf-8',
    timeout: 10_000,
  });
  if (result.status !== 0) return false;
  const version = result.stdout.trim();
  return /-(preview|rc|alpha|beta)/.test(version);
}

export function runAnalyzer(
  workspaceRoot: string,
  projectFiles: string[]
): AnalyzerOutput {
  const dllPath = join(__dirname, 'analyzer', 'DotnetAnalyzer.dll');

  // First attempt: run without preview roll-forward
  const result = spawnSync('dotnet', [dllPath, workspaceRoot], {
    input: projectFiles.join('\n'),
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
    cwd: workspaceRoot,
  });

  if (result.status === 0 || result.status === null && result.signal) {
    // Success or killed by signal — don't retry
    if (result.status !== 0) {
      throw new Error(
        `DotnetAnalyzer failed (signal ${result.signal}): ${result.stderr}`
      );
    }
    return JSON.parse(result.stdout) as AnalyzerOutput;
  }

  // Check if the failure looks like a runtime/SDK version mismatch
  const stderr = result.stderr ?? '';
  const isVersionMismatch =
    stderr.includes('System.Runtime') ||
    stderr.includes('Could not load file or assembly') ||
    stderr.includes('No .NET SDK found');

  if (!isVersionMismatch) {
    throw new Error(
      `DotnetAnalyzer failed (exit ${result.status}): ${stderr}`
    );
  }

  // Detect if this is a preview SDK situation
  if (!isPreviewSdk()) {
    throw new Error(
      `DotnetAnalyzer failed (exit ${result.status}): ${stderr}`
    );
  }

  // Retry with preview roll-forward, but warn the user
  console.warn(
    'Warning: Only a preview .NET SDK was detected. ' +
      'Retrying with DOTNET_ROLL_FORWARD_TO_PRERELEASE=1. ' +
      'Consider installing a stable .NET SDK for reliable results.'
  );

  const retryResult = spawnSync('dotnet', [dllPath, workspaceRoot], {
    input: projectFiles.join('\n'),
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
    cwd: workspaceRoot,
    env: {
      ...process.env,
      DOTNET_ROLL_FORWARD_TO_PRERELEASE: '1',
    },
  });

  if (retryResult.status !== 0) {
    throw new Error(
      `DotnetAnalyzer failed (exit ${retryResult.status}): ${retryResult.stderr}`
    );
  }

  return JSON.parse(retryResult.stdout) as AnalyzerOutput;
}
