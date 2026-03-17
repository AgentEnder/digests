import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseManifest } from './parser.js';
import * as fs from 'fs/promises';
import * as lockfileModule from './lockfile/index.js';

vi.mock('fs/promises');
vi.mock('./lockfile/index.js');

describe('parseManifest', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should use lockfile versions when available', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        dependencies: { react: '^19.0.0' },
        devDependencies: { typescript: '^5.7.2' },
      })
    );

    vi.mocked(lockfileModule.parseLockfile).mockResolvedValue(
      new Map([
        ['react', { name: 'react', version: '19.0.0', registryUrl: 'https://registry.npmjs.org/react/-/react-19.0.0.tgz' }],
        ['typescript', { name: 'typescript', version: '5.7.2' }],
      ])
    );

    const result = await parseManifest({
      path: '/project/package.json',
      type: 'package-lock.json',
    });

    expect(result).toEqual([
      { name: 'react', versionRange: '19.0.0', group: 'dependencies' },
      { name: 'typescript', versionRange: '5.7.2', group: 'devDependencies' },
    ]);
  });

  it('should fall back to package.json range when dep not in lockfile', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn());

    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        dependencies: { react: '^19.0.0', lodash: '^4.17.21' },
      })
    );

    vi.mocked(lockfileModule.parseLockfile).mockResolvedValue(
      new Map([
        ['react', { name: 'react', version: '19.0.0' }],
      ])
    );

    const result = await parseManifest({
      path: '/project/package.json',
      type: 'package-lock.json',
    });

    expect(result).toContainEqual(
      { name: 'lodash', versionRange: '^4.17.21', group: 'dependencies' }
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('lodash'));
    warnSpy.mockRestore();
  });

  it('should use package.json ranges when type is package.json (no lockfile)', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        dependencies: { react: '^19.0.0' },
      })
    );

    vi.mocked(lockfileModule.parseLockfile).mockResolvedValue(new Map());

    const result = await parseManifest({
      path: '/project/package.json',
      type: 'package.json',
    });

    expect(result).toEqual([
      { name: 'react', versionRange: '^19.0.0', group: 'dependencies' },
    ]);
  });

  it('should skip workspace/link/file/portal protocols', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        dependencies: {
          'local-pkg': 'workspace:*',
          'linked-pkg': 'link:../other',
          react: '^19.0.0',
        },
      })
    );

    vi.mocked(lockfileModule.parseLockfile).mockResolvedValue(new Map());

    const result = await parseManifest({
      path: '/project/package.json',
      type: 'package.json',
    });

    expect(result).toEqual([
      { name: 'react', versionRange: '^19.0.0', group: 'dependencies' },
    ]);
  });
});
