import { execFile } from 'child_process';
import { dirname } from 'path';
import type { ManifestFile } from 'dependency-digest';

export async function runMavenDependencyTree(
  manifest: ManifestFile
): Promise<string> {
  const dir = dirname(manifest.path);

  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(
      'mvn',
      ['dependency:tree', '-DoutputType=text', '-f', manifest.path],
      { cwd: dir, maxBuffer: 50 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `mvn dependency:tree failed: ${stderr || error.message}`
            )
          );
          return;
        }
        resolve(stdout);
      }
    );
  });

  return stdout;
}
