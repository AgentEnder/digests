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

    expect(result.get('react')?.[0]).toEqual({
      name: 'react',
      version: '19.0.0',
      registryUrl: 'https://registry.npmjs.org/react/-/react-19.0.0.tgz',
      integrity: 'sha512-abc123',
      dev: false,
    });
    expect(result.get('typescript')?.[0]).toEqual({
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
    expect(result.get('vitest')?.[0]?.dev).toBe(true);
    expect(result.get('react')?.[0]?.dev).toBe(false);
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
    expect(result.get('lodash')?.[0]?.version).toBe('4.17.21');
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
    expect(result.get('express')?.[0]).toEqual({
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
    expect(result.get('@octokit/rest')?.[0]?.version).toBe('21.0.1');
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
    const debugVersions = result.get('debug');
    expect(debugVersions).toHaveLength(2);
    expect(debugVersions?.map(d => d.version).sort()).toEqual(['2.6.9', '4.3.4']);
    expect(result.get('express')?.[0]?.version).toBe('4.18.2');
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
    const semverVersions = result.get('semver');
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
    expect(result.get('debug')).toHaveLength(1);
  });

  it('should return empty map for invalid JSON', () => {
    const result = parseNpmLockfile('not valid json');
    expect(result.size).toBe(0);
  });
});
