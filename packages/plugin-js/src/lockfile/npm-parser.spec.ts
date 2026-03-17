import { describe, it, expect } from 'vitest';
import { parseNpmLockfile } from './npm-parser.js';

describe('parseNpmLockfile', () => {
  it('should parse v3 lockfile (packages section)', () => {
    const lockfile = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': { name: 'my-app', version: '1.0.0' },
        'node_modules/react': {
          version: '19.0.0',
          resolved: 'https://registry.npmjs.org/react/-/react-19.0.0.tgz',
          integrity: 'sha512-abc123',
        },
        'node_modules/typescript': {
          version: '5.7.2',
          resolved: 'https://registry.npmjs.org/typescript/-/typescript-5.7.2.tgz',
          integrity: 'sha512-def456',
          dev: true,
        },
      },
    });

    const result = parseNpmLockfile(lockfile);

    expect(result.packages.get('react')?.[0]).toEqual({
      name: 'react',
      version: '19.0.0',
      registryUrl: 'https://registry.npmjs.org/react/-/react-19.0.0.tgz',
      integrity: 'sha512-abc123',
      dev: false,
    });
    expect(result.packages.get('typescript')?.[0]).toEqual({
      name: 'typescript',
      version: '5.7.2',
      registryUrl: 'https://registry.npmjs.org/typescript/-/typescript-5.7.2.tgz',
      integrity: 'sha512-def456',
      dev: true,
    });
  });

  it('should read dev: true from lockfile entries', () => {
    const lockfile = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/vitest': {
          version: '1.0.0',
          resolved: 'https://registry.npmjs.org/vitest/-/vitest-1.0.0.tgz',
          dev: true,
        },
        'node_modules/react': {
          version: '19.0.0',
          resolved: 'https://registry.npmjs.org/react/-/react-19.0.0.tgz',
        },
      },
    });

    const result = parseNpmLockfile(lockfile);
    expect(result.packages.get('vitest')?.[0]?.dev).toBe(true);
    expect(result.packages.get('react')?.[0]?.dev).toBe(false);
  });

  it('should parse v2 lockfile (packages section preferred)', () => {
    const lockfile = JSON.stringify({
      lockfileVersion: 2,
      packages: {
        '': { name: 'my-app' },
        'node_modules/lodash': {
          version: '4.17.21',
          resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
          integrity: 'sha512-xyz',
        },
      },
      dependencies: {
        lodash: { version: '4.17.21', resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz' },
      },
    });

    const result = parseNpmLockfile(lockfile);
    expect(result.packages.get('lodash')?.[0]?.version).toBe('4.17.21');
  });

  it('should parse v1 lockfile (dependencies section)', () => {
    const lockfile = JSON.stringify({
      lockfileVersion: 1,
      dependencies: {
        express: {
          version: '4.18.2',
          resolved: 'https://registry.npmjs.org/express/-/express-4.18.2.tgz',
          integrity: 'sha512-v1',
        },
      },
    });

    const result = parseNpmLockfile(lockfile);
    expect(result.packages.get('express')?.[0]).toEqual({
      name: 'express',
      version: '4.18.2',
      registryUrl: 'https://registry.npmjs.org/express/-/express-4.18.2.tgz',
      integrity: 'sha512-v1',
      dev: false,
    });
  });

  it('should handle scoped packages', () => {
    const lockfile = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/@octokit/rest': {
          version: '21.0.1',
          resolved: 'https://registry.npmjs.org/@octokit/rest/-/rest-21.0.1.tgz',
          integrity: 'sha512-scoped',
        },
      },
    });

    const result = parseNpmLockfile(lockfile);
    expect(result.packages.get('@octokit/rest')?.[0]?.version).toBe('21.0.1');
  });

  it('should include nested (transitive) dependencies', () => {
    const lockfile = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/express': {
          version: '4.18.2',
          resolved: 'https://registry.npmjs.org/express/-/express-4.18.2.tgz',
        },
        'node_modules/express/node_modules/debug': {
          version: '2.6.9',
          resolved: 'https://registry.npmjs.org/debug/-/debug-2.6.9.tgz',
        },
        'node_modules/debug': {
          version: '4.3.4',
          resolved: 'https://registry.npmjs.org/debug/-/debug-4.3.4.tgz',
        },
      },
    });

    const result = parseNpmLockfile(lockfile);
    // Should include both versions of debug
    const debugVersions = result.packages.get('debug');
    expect(debugVersions).toHaveLength(2);
    expect(debugVersions?.map(d => d.version).sort()).toEqual(['2.6.9', '4.3.4']);
    expect(result.packages.get('express')?.[0]?.version).toBe('4.18.2');
  });

  it('should support multi-version: same package with different versions', () => {
    const lockfile = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/semver': {
          version: '7.5.0',
          resolved: 'https://registry.npmjs.org/semver/-/semver-7.5.0.tgz',
        },
        'node_modules/some-pkg/node_modules/semver': {
          version: '6.3.1',
          resolved: 'https://registry.npmjs.org/semver/-/semver-6.3.1.tgz',
        },
      },
    });

    const result = parseNpmLockfile(lockfile);
    const semverVersions = result.packages.get('semver');
    expect(semverVersions).toHaveLength(2);
    expect(semverVersions?.some(e => e.version === '7.5.0')).toBe(true);
    expect(semverVersions?.some(e => e.version === '6.3.1')).toBe(true);
  });

  it('should deduplicate same version appearing in multiple locations', () => {
    const lockfile = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/debug': {
          version: '4.3.4',
          resolved: 'https://registry.npmjs.org/debug/-/debug-4.3.4.tgz',
        },
        'node_modules/some-pkg/node_modules/debug': {
          version: '4.3.4',
          resolved: 'https://registry.npmjs.org/debug/-/debug-4.3.4.tgz',
        },
      },
    });

    const result = parseNpmLockfile(lockfile);
    expect(result.packages.get('debug')).toHaveLength(1);
  });

  it('should return empty result for invalid JSON', () => {
    const result = parseNpmLockfile('not valid json');
    expect(result.packages.size).toBe(0);
    expect(result.edges.size).toBe(0);
    expect(result.rootDeps.size).toBe(0);
  });

  it('should extract dependency edges from v3 packages', () => {
    const lockfile = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': { name: 'my-app', dependencies: { express: '^4.18.0' }, devDependencies: { typescript: '^5.7.2' } },
        'node_modules/express': {
          version: '4.18.2',
          dependencies: { debug: '4.3.4', accepts: '1.3.8' },
        },
        'node_modules/debug': {
          version: '4.3.4',
          dependencies: { ms: '2.1.3' },
        },
        'node_modules/accepts': { version: '1.3.8' },
        'node_modules/ms': { version: '2.1.3' },
        'node_modules/typescript': { version: '5.7.2', dev: true },
      },
    });

    const result = parseNpmLockfile(lockfile);
    expect(result.edges.get('express@4.18.2')).toEqual(
      expect.arrayContaining(['debug@4.3.4', 'accepts@1.3.8'])
    );
    expect(result.edges.get('debug@4.3.4')).toEqual(['ms@2.1.3']);
    expect(result.rootDeps.get('express')).toBe('prod');
    expect(result.rootDeps.get('typescript')).toBe('dev');
  });

  it('should resolve nested deps before hoisted deps for edges', () => {
    const lockfile = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/express': {
          version: '4.18.2',
          dependencies: { debug: '~2.6.0' },
        },
        'node_modules/express/node_modules/debug': {
          version: '2.6.9',
        },
        'node_modules/debug': {
          version: '4.3.4',
        },
      },
    });

    const result = parseNpmLockfile(lockfile);
    // Should resolve to nested version 2.6.9, not hoisted 4.3.4
    expect(result.edges.get('express@4.18.2')).toEqual(['debug@2.6.9']);
  });
});
