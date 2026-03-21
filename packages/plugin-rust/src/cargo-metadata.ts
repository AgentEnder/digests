import { execFile } from 'child_process';
import { dirname } from 'path';
import type { ManifestFile } from 'dependency-digest';

export interface CargoPackage {
  id: string;
  name: string;
  version: string;
  source: string | null;
  license: string | null;
  license_file: string | null;
  description: string | null;
  authors: string[];
  repository: string | null;
  manifest_path: string;
}

export interface CargoResolveNode {
  id: string;
  deps: Array<{
    name: string;
    pkg: string;
    dep_kinds: Array<{
      kind: 'normal' | 'dev' | 'build' | null;
      target: string | null;
    }>;
  }>;
}

export interface CargoMetadata {
  packages: CargoPackage[];
  workspace_members: string[];
  resolve: {
    nodes: CargoResolveNode[];
    root: string | null;
  };
}

export async function runCargoMetadata(
  manifest: ManifestFile
): Promise<CargoMetadata> {
  const dir = dirname(manifest.path);

  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(
      'cargo',
      ['metadata', '--format-version', '1', '--manifest-path', manifest.path],
      { cwd: dir, maxBuffer: 50 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `cargo metadata failed: ${stderr || error.message}`
            )
          );
          return;
        }
        resolve(stdout);
      }
    );
  });

  return JSON.parse(stdout) as CargoMetadata;
}
