import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectManifests } from './detect.js';
import * as fs from 'fs/promises';
import { join } from 'path';

vi.mock('fs/promises');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockReaddir(entries: Array<{ name: string; isFile: boolean }>): any {
  return entries.map((e) => ({ name: e.name, isFile: () => e.isFile }));
}

describe('detectManifests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should detect pom.xml for Maven projects', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(
      mockReaddir([
        { name: 'pom.xml', isFile: true },
        { name: 'src', isFile: false },
      ])
    );

    const result = await detectManifests('/project');

    expect(result).toEqual([
      { path: join('/project', 'pom.xml'), type: 'pom.xml' },
    ]);
  });

  it('should detect build.gradle for Gradle projects', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(
      mockReaddir([
        { name: 'build.gradle', isFile: true },
        { name: 'settings.gradle', isFile: true },
      ])
    );

    const result = await detectManifests('/project');

    expect(result).toEqual([
      { path: join('/project', 'build.gradle'), type: 'build.gradle' },
    ]);
  });

  it('should prefer build.gradle.kts over build.gradle', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(
      mockReaddir([
        { name: 'build.gradle', isFile: true },
        { name: 'build.gradle.kts', isFile: true },
      ])
    );

    const result = await detectManifests('/project');

    expect(result).toEqual([
      {
        path: join('/project', 'build.gradle.kts'),
        type: 'build.gradle.kts',
      },
    ]);
  });

  it('should detect both Maven and Gradle manifests when both exist', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(
      mockReaddir([
        { name: 'pom.xml', isFile: true },
        { name: 'build.gradle', isFile: true },
      ])
    );

    const result = await detectManifests('/project');

    expect(result).toHaveLength(2);
    expect(result).toContainEqual({
      path: join('/project', 'pom.xml'),
      type: 'pom.xml',
    });
    expect(result).toContainEqual({
      path: join('/project', 'build.gradle'),
      type: 'build.gradle',
    });
  });

  it('should return empty array when no Java manifests found', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(
      mockReaddir([
        { name: 'package.json', isFile: true },
        { name: 'README.md', isFile: true },
      ])
    );

    const result = await detectManifests('/project');
    expect(result).toEqual([]);
  });

  it('should return empty array on filesystem error', async () => {
    vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));

    const result = await detectManifests('/nonexistent');
    expect(result).toEqual([]);
  });

  it('should ignore directories named like manifest files', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(
      mockReaddir([
        { name: 'pom.xml', isFile: false },
        { name: 'build.gradle', isFile: false },
      ])
    );

    const result = await detectManifests('/project');
    expect(result).toEqual([]);
  });
});
