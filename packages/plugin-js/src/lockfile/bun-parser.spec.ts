import { describe, it, expect } from 'vitest';
import { parseBunLockfile } from './bun-parser.js';

describe('parseBunLockfile', () => {
  it('should parse bun.lock text format', () => {
    const lockfile = JSON.stringify({
      lockfileVersion: 1,
      workspaces: {
        '': { name: 'my-app', dependencies: { react: '^19.0.0' } },
      },
      packages: {
        'react': ['react@19.0.0', 'https://registry.npmjs.org/react/-/react-19.0.0.tgz', {}, 'sha512-abc123'],
        'typescript': ['typescript@5.7.2', 'https://registry.npmjs.org/typescript/-/typescript-5.7.2.tgz', {}, 'sha512-def456'],
      },
    });

    const result = parseBunLockfile(lockfile);

    expect(result.get('react')?.[0]).toEqual({
      name: 'react',
      version: '19.0.0',
      registryUrl: 'https://registry.npmjs.org/react/-/react-19.0.0.tgz',
      integrity: 'sha512-abc123',
      dev: false,
    });
    expect(result.get('typescript')?.[0]?.version).toBe('5.7.2');
  });

  it('should handle scoped packages', () => {
    const lockfile = JSON.stringify({
      lockfileVersion: 1,
      workspaces: { '': {} },
      packages: {
        '@octokit/rest': ['@octokit/rest@21.0.1', 'https://registry.npmjs.org/@octokit/rest/-/rest-21.0.1.tgz', {}, 'sha512-octo'],
      },
    });

    const result = parseBunLockfile(lockfile);
    expect(result.get('@octokit/rest')?.[0]?.version).toBe('21.0.1');
  });

  it('should skip workspace packages', () => {
    const lockfile = JSON.stringify({
      lockfileVersion: 1,
      workspaces: {
        '': { name: 'root' },
        'packages/core': { name: '@my/core' },
      },
      packages: {
        '@my/core': ['@my/core@workspace:packages/core'],
        'react': ['react@19.0.0', 'https://registry.npmjs.org/react/-/react-19.0.0.tgz', {}, 'sha512-abc'],
      },
    });

    const result = parseBunLockfile(lockfile);
    expect(result.has('@my/core')).toBe(false);
    expect(result.has('react')).toBe(true);
  });

  it('should support multi-version: same package with different versions', () => {
    const lockfile = JSON.stringify({
      lockfileVersion: 1,
      workspaces: { '': {} },
      packages: {
        'debug': ['debug@4.3.4', 'https://registry.npmjs.org/debug/-/debug-4.3.4.tgz', {}, 'sha512-debug4'],
        'debug-2': ['debug@2.6.9', 'https://registry.npmjs.org/debug/-/debug-2.6.9.tgz', {}, 'sha512-debug2'],
      },
    });

    const result = parseBunLockfile(lockfile);
    const debugVersions = result.get('debug');
    expect(debugVersions).toHaveLength(2);
    expect(debugVersions?.some(e => e.version === '4.3.4')).toBe(true);
    expect(debugVersions?.some(e => e.version === '2.6.9')).toBe(true);
  });

  it('should return empty map for invalid JSON', () => {
    const result = parseBunLockfile('not json');
    expect(result.size).toBe(0);
  });
});
