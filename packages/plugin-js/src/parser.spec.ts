import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseManifest } from './parser.js';
import * as fs from 'fs/promises';
import * as lockfileModule from './lockfile/index.js';
import type { ResolvedDependency, LockfileParseResult } from './lockfile/index.js';

vi.mock('fs/promises');
vi.mock('./lockfile/index.js');

function emptyResult(): LockfileParseResult {
  return { packages: new Map(), edges: new Map(), rootDeps: new Map() };
}

function resultFromPackages(
  entries: Array<[string, ResolvedDependency[]]>
): LockfileParseResult {
  return {
    packages: new Map(entries),
    edges: new Map(),
    rootDeps: new Map(),
  };
}

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
      resultFromPackages([
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

    expect(result.dependencies).toEqual([
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
    expect(result.edges).toBeDefined();
  });

  it('should fall back to package.json range when dep not in lockfile', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn());

    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        dependencies: { react: '^19.0.0', lodash: '^4.17.21' },
      })
    );

    vi.mocked(lockfileModule.parseLockfile).mockResolvedValue(
      resultFromPackages([
        ['react', [{ name: 'react', version: '19.0.0', dev: false }]],
      ])
    );

    const result = await parseManifest({
      path: '/project/package.json',
      type: 'package-lock.json',
    });

    expect(result.dependencies).toContainEqual({
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

    vi.mocked(lockfileModule.parseLockfile).mockResolvedValue(emptyResult());

    const result = await parseManifest({
      path: '/project/package.json',
      type: 'package.json',
    });

    expect(result.dependencies).toEqual([
      {
        name: 'react',
        version: '^19.0.0',
        specifier: '^19.0.0',
        dev: false,
        transitive: false,
      },
    ]);
    expect(result.edges).toEqual({});
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

    vi.mocked(lockfileModule.parseLockfile).mockResolvedValue(emptyResult());

    const result = await parseManifest({
      path: '/project/package.json',
      type: 'package.json',
    });

    expect(result.dependencies).toEqual([
      {
        name: 'react',
        version: '^19.0.0',
        specifier: '^19.0.0',
        dev: false,
        transitive: false,
      },
    ]);
    expect(result.edges).toEqual({});
  });

  it('should include transitive deps from lockfile', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        dependencies: { react: '^19.0.0' },
      })
    );

    vi.mocked(lockfileModule.parseLockfile).mockResolvedValue(
      resultFromPackages([
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
    expect(result.dependencies).toContainEqual(
      expect.objectContaining({
        name: 'react',
        version: '19.0.0',
        transitive: false,
        dev: false,
        specifier: '^19.0.0',
      })
    );

    // Transitive deps
    expect(result.dependencies).toContainEqual(
      expect.objectContaining({
        name: 'loose-envify',
        version: '1.4.0',
        transitive: true,
        dev: false,
        specifier: undefined,
      })
    );

    expect(result.dependencies).toContainEqual(
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
      resultFromPackages([
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

    const semverEntries = result.dependencies.filter((d) => d.name === 'semver');
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
      resultFromPackages([
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
    expect(result.dependencies).toContainEqual(
      expect.objectContaining({
        name: 'react',
        dev: false,
        transitive: false,
      })
    );

    // Direct dev dep
    expect(result.dependencies).toContainEqual(
      expect.objectContaining({
        name: 'vitest',
        dev: true,
        transitive: false,
      })
    );

    // Transitive dev dep (dev flag from resolved)
    expect(result.dependencies).toContainEqual(
      expect.objectContaining({
        name: 'tinyspy',
        dev: true,
        transitive: true,
      })
    );

    // Transitive prod dep
    expect(result.dependencies).toContainEqual(
      expect.objectContaining({
        name: 'scheduler',
        dev: false,
        transitive: true,
      })
    );
  });

  it('should compute dev flag from graph reachability', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        dependencies: { express: '^4.18.0' },
        devDependencies: { vitest: '^4.0.0' },
      })
    );

    vi.mocked(lockfileModule.parseLockfile).mockResolvedValue({
      packages: new Map([
        ['express', [{ name: 'express', version: '4.18.2', dev: false }]],
        ['debug', [{ name: 'debug', version: '4.3.4', dev: false }]],
        ['vitest', [{ name: 'vitest', version: '4.1.0', dev: false }]],
        ['tinyspy', [{ name: 'tinyspy', version: '2.2.0', dev: false }]],
      ]),
      edges: new Map([
        ['express@4.18.2', ['debug@4.3.4']],
        ['debug@4.3.4', []],
        ['vitest@4.1.0', ['tinyspy@2.2.0']],
        ['tinyspy@2.2.0', []],
      ]),
      rootDeps: new Map([
        ['express', 'prod'],
        ['vitest', 'dev'],
      ]),
    });

    const result = await parseManifest({
      path: '/project/package.json',
      type: 'pnpm-lock.yaml',
    });

    // debug is transitive prod (reachable from express)
    expect(result.dependencies.find((d) => d.name === 'debug')).toMatchObject({
      dev: false,
      transitive: true,
    });
    // tinyspy is transitive dev (only reachable from vitest)
    expect(result.dependencies.find((d) => d.name === 'tinyspy')).toMatchObject({
      dev: true,
      transitive: true,
    });
    // edges should be populated
    expect(result.edges).toEqual({
      'express@4.18.2': ['debug@4.3.4'],
      'debug@4.3.4': [],
      'vitest@4.1.0': ['tinyspy@2.2.0'],
      'tinyspy@2.2.0': [],
    });
  });

  it('should compute includedBy chains', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        dependencies: { express: '^4.18.0' },
      })
    );

    vi.mocked(lockfileModule.parseLockfile).mockResolvedValue({
      packages: new Map([
        ['express', [{ name: 'express', version: '4.18.2', dev: false }]],
        ['debug', [{ name: 'debug', version: '4.3.4', dev: false }]],
        ['ms', [{ name: 'ms', version: '2.1.3', dev: false }]],
      ]),
      edges: new Map([
        ['express@4.18.2', ['debug@4.3.4']],
        ['debug@4.3.4', ['ms@2.1.3']],
        ['ms@2.1.3', []],
      ]),
      rootDeps: new Map([['express', 'prod']]),
    });

    const result = await parseManifest({
      path: '/project/package.json',
      type: 'pnpm-lock.yaml',
    });

    const ms = result.dependencies.find((d) => d.name === 'ms');
    expect(ms?.includedBy).toEqual([['express@4.18.2', 'debug@4.3.4']]);

    const debug = result.dependencies.find((d) => d.name === 'debug');
    expect(debug?.includedBy).toEqual([['express@4.18.2']]);

    // Direct deps should not have includedBy
    const express = result.dependencies.find((d) => d.name === 'express');
    expect(express?.includedBy).toBeUndefined();
  });

  it('should mark dep as prod when reachable from both prod and dev roots', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        dependencies: { express: '^4.18.0' },
        devDependencies: { morgan: '^1.10.0' },
      })
    );

    vi.mocked(lockfileModule.parseLockfile).mockResolvedValue({
      packages: new Map([
        ['express', [{ name: 'express', version: '4.18.2', dev: false }]],
        ['morgan', [{ name: 'morgan', version: '1.10.0', dev: false }]],
        ['debug', [{ name: 'debug', version: '4.3.4', dev: false }]],
      ]),
      edges: new Map([
        ['express@4.18.2', ['debug@4.3.4']],
        ['morgan@1.10.0', ['debug@4.3.4']],
        ['debug@4.3.4', []],
      ]),
      rootDeps: new Map([
        ['express', 'prod'],
        ['morgan', 'dev'],
      ]),
    });

    const result = await parseManifest({
      path: '/project/package.json',
      type: 'pnpm-lock.yaml',
    });

    // debug is reachable from prod root (express) → dev: false
    const debug = result.dependencies.find((d) => d.name === 'debug');
    expect(debug).toMatchObject({
      dev: false,
      transitive: true,
    });

    // debug should have chains from both roots
    expect(debug?.includedBy).toEqual(
      expect.arrayContaining([
        ['express@4.18.2'],
        ['morgan@1.10.0'],
      ])
    );
  });
});
