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

    expect(result.packages.get('react')?.[0]).toEqual({
      name: 'react',
      version: '19.0.0',
      registryUrl: 'https://registry.npmjs.org/react/-/react-19.0.0.tgz',
      integrity: 'sha512-abc123',
      dev: false,
    });
    expect(result.packages.get('typescript')?.[0]?.version).toBe('5.7.2');
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
    expect(result.packages.get('@octokit/rest')?.[0]?.version).toBe('21.0.1');
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
    expect(result.packages.has('@my/core')).toBe(false);
    expect(result.packages.has('react')).toBe(true);
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
    const debugVersions = result.packages.get('debug');
    expect(debugVersions).toHaveLength(2);
    expect(debugVersions?.some(e => e.version === '4.3.4')).toBe(true);
    expect(debugVersions?.some(e => e.version === '2.6.9')).toBe(true);
  });

  it('should return empty maps for invalid JSON', () => {
    const result = parseBunLockfile('not json');
    expect(result.packages.size).toBe(0);
    expect(result.edges.size).toBe(0);
    expect(result.rootDeps.size).toBe(0);
  });

  it('should extract rootDeps from workspace root entry', () => {
    const lockfile = JSON.stringify({
      lockfileVersion: 1,
      workspaces: {
        '': {
          name: 'my-app',
          dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
          devDependencies: { typescript: '^5.7.0', vitest: '^1.0.0' },
        },
      },
      packages: {
        'react': ['react@19.0.0', '', {}, ''],
        'react-dom': ['react-dom@19.0.0', '', {}, ''],
        'typescript': ['typescript@5.7.2', '', {}, ''],
        'vitest': ['vitest@1.6.0', '', {}, ''],
      },
    });

    const result = parseBunLockfile(lockfile);

    expect(result.rootDeps.get('react')).toBe('prod');
    expect(result.rootDeps.get('react-dom')).toBe('prod');
    expect(result.rootDeps.get('typescript')).toBe('dev');
    expect(result.rootDeps.get('vitest')).toBe('dev');
    expect(result.rootDeps.size).toBe(4);
  });

  it('should extract edges from dependency tuples', () => {
    const lockfile = JSON.stringify({
      lockfileVersion: 1,
      workspaces: {
        '': { dependencies: { express: '^4.18.0' } },
      },
      packages: {
        'express': ['express@4.18.2', '', { 'body-parser': '1.20.1', 'accepts': '~1.3.8' }, ''],
        'body-parser': ['body-parser@1.20.1', '', {}, ''],
        'accepts': ['accepts@1.3.8', '', { 'mime-types': '~2.1.34' }, ''],
        'mime-types': ['mime-types@2.1.35', '', {}, ''],
      },
    });

    const result = parseBunLockfile(lockfile);

    expect(result.edges.get('express@4.18.2')).toEqual(
      expect.arrayContaining(['body-parser@1.20.1', 'accepts@1.3.8'])
    );
    expect(result.edges.get('accepts@1.3.8')).toEqual(['mime-types@2.1.35']);
    expect(result.edges.has('body-parser@1.20.1')).toBe(false);
    expect(result.edges.has('mime-types@2.1.35')).toBe(false);
  });
});
