import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseManifest } from './parser.js';
import * as fs from 'fs/promises';
import * as lockfileModule from './lockfile/index.js';
import type { ResolvedDependency } from './lockfile/index.js';

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
      new Map<string, ResolvedDependency[]>([
        [
          'react',
          [
            {
              name: 'react',
              version: '19.0.0',
              registryUrl:
                'https://registry.npmjs.org/react/-/react-19.0.0.tgz',
              dev: false,
            },
          ],
        ],
        ['typescript', [{ name: 'typescript', version: '5.7.2', dev: false }]],
      ])
    );

    const result = await parseManifest({
      path: '/project/package.json',
      type: 'package-lock.json',
    });

    expect(result).toEqual([
      {
        name: 'react',
        version: '19.0.0',
        specifier: '^19.0.0',
        dev: false,
        transitive: false,
        registryUrl: 'https://registry.npmjs.org/react/-/react-19.0.0.tgz',
        integrity: undefined,
      },
      {
        name: 'typescript',
        version: '5.7.2',
        specifier: '^5.7.2',
        dev: true,
        transitive: false,
        registryUrl: undefined,
        integrity: undefined,
      },
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
      new Map<string, ResolvedDependency[]>([
        ['react', [{ name: 'react', version: '19.0.0', dev: false }]],
      ])
    );

    const result = await parseManifest({
      path: '/project/package.json',
      type: 'package-lock.json',
    });

    expect(result).toContainEqual({
      name: 'lodash',
      version: '^4.17.21',
      specifier: '^4.17.21',
      dev: false,
      transitive: false,
    });
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
      {
        name: 'react',
        version: '^19.0.0',
        specifier: '^19.0.0',
        dev: false,
        transitive: false,
      },
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
      {
        name: 'react',
        version: '^19.0.0',
        specifier: '^19.0.0',
        dev: false,
        transitive: false,
      },
    ]);
  });

  it('should include transitive deps from lockfile', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        dependencies: { react: '^19.0.0' },
      })
    );

    vi.mocked(lockfileModule.parseLockfile).mockResolvedValue(
      new Map<string, ResolvedDependency[]>([
        ['react', [{ name: 'react', version: '19.0.0', dev: false }]],
        [
          'loose-envify',
          [{ name: 'loose-envify', version: '1.4.0', dev: false }],
        ],
        [
          'js-tokens',
          [
            {
              name: 'js-tokens',
              version: '4.0.0',
              dev: false,
              integrity: 'sha512-abc',
            },
          ],
        ],
      ])
    );

    const result = await parseManifest({
      path: '/project/package.json',
      type: 'package-lock.json',
    });

    // Direct dep
    expect(result).toContainEqual(
      expect.objectContaining({
        name: 'react',
        version: '19.0.0',
        transitive: false,
        dev: false,
        specifier: '^19.0.0',
      })
    );

    // Transitive deps
    expect(result).toContainEqual(
      expect.objectContaining({
        name: 'loose-envify',
        version: '1.4.0',
        transitive: true,
        dev: false,
        specifier: undefined,
      })
    );

    expect(result).toContainEqual(
      expect.objectContaining({
        name: 'js-tokens',
        version: '4.0.0',
        transitive: true,
        dev: false,
        integrity: 'sha512-abc',
      })
    );
  });

  it('should produce multiple entries for multi-version packages', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        dependencies: { react: '^19.0.0' },
      })
    );

    vi.mocked(lockfileModule.parseLockfile).mockResolvedValue(
      new Map<string, ResolvedDependency[]>([
        ['react', [{ name: 'react', version: '19.0.0', dev: false }]],
        [
          'semver',
          [
            { name: 'semver', version: '6.3.1', dev: false },
            { name: 'semver', version: '7.6.0', dev: false },
          ],
        ],
      ])
    );

    const result = await parseManifest({
      path: '/project/package.json',
      type: 'package-lock.json',
    });

    const semverEntries = result.filter((d) => d.name === 'semver');
    expect(semverEntries).toHaveLength(2);
    expect(semverEntries).toContainEqual(
      expect.objectContaining({ name: 'semver', version: '6.3.1', transitive: true })
    );
    expect(semverEntries).toContainEqual(
      expect.objectContaining({ name: 'semver', version: '7.6.0', transitive: true })
    );
  });

  it('should set dev flag correctly for direct vs transitive deps', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        dependencies: { react: '^19.0.0' },
        devDependencies: { vitest: '^1.0.0' },
      })
    );

    vi.mocked(lockfileModule.parseLockfile).mockResolvedValue(
      new Map<string, ResolvedDependency[]>([
        ['react', [{ name: 'react', version: '19.0.0', dev: false }]],
        ['vitest', [{ name: 'vitest', version: '1.0.0', dev: true }]],
        [
          'tinyspy',
          [{ name: 'tinyspy', version: '2.2.0', dev: true }],
        ],
        [
          'scheduler',
          [{ name: 'scheduler', version: '0.25.0', dev: false }],
        ],
      ])
    );

    const result = await parseManifest({
      path: '/project/package.json',
      type: 'package-lock.json',
    });

    // Direct prod dep
    expect(result).toContainEqual(
      expect.objectContaining({
        name: 'react',
        dev: false,
        transitive: false,
      })
    );

    // Direct dev dep
    expect(result).toContainEqual(
      expect.objectContaining({
        name: 'vitest',
        dev: true,
        transitive: false,
      })
    );

    // Transitive dev dep (dev flag from resolved)
    expect(result).toContainEqual(
      expect.objectContaining({
        name: 'tinyspy',
        dev: true,
        transitive: true,
      })
    );

    // Transitive prod dep
    expect(result).toContainEqual(
      expect.objectContaining({
        name: 'scheduler',
        dev: false,
        transitive: true,
      })
    );
  });
});
