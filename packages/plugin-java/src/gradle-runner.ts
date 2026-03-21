import { execFile } from 'child_process';
import { dirname, join } from 'path';
import { access } from 'fs/promises';
import type { ManifestFile } from 'dependency-digest';

export interface GradleDependencyOutput {
  runtimeClasspath: string;
  testRuntimeClasspath: string;
}

async function findGradleExecutable(dir: string): Promise<string> {
  // Prefer the project's Gradle wrapper over system-installed Gradle
  const wrapperPath = join(dir, 'gradlew');
  try {
    await access(wrapperPath);
    return wrapperPath;
  } catch {
    return 'gradle';
  }
}

function runGradleCommand(
  executable: string,
  args: string[],
  cwd: string
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile(
      executable,
      args,
      { cwd, maxBuffer: 50 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `gradle dependencies failed: ${stderr || error.message}`
            )
          );
          return;
        }
        resolve(stdout);
      }
    );
  });
}

export async function runGradleDependencies(
  manifest: ManifestFile
): Promise<GradleDependencyOutput> {
  const dir = dirname(manifest.path);
  const executable = await findGradleExecutable(dir);

  const [runtimeClasspath, testRuntimeClasspath] = await Promise.all([
    runGradleCommand(
      executable,
      ['dependencies', '--configuration', 'runtimeClasspath', '-q'],
      dir
    ).catch(() => ''),
    runGradleCommand(
      executable,
      ['dependencies', '--configuration', 'testRuntimeClasspath', '-q'],
      dir
    ).catch(() => ''),
  ]);

  return { runtimeClasspath, testRuntimeClasspath };
}
