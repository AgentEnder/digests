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

    expect(result.get('react')).toEqual({
      name: 'react',
      version: '19.0.0',
      registryUrl: 'https://registry.npmjs.org/react/-/react-19.0.0.tgz',
      integrity: 'sha512-abc123',
    });
    expect(result.get('typescript')).toEqual({
      name: 'typescript',
      version: '5.7.2',
      registryUrl: 'https://registry.npmjs.org/typescript/-/typescript-5.7.2.tgz',
      integrity: 'sha512-def456',
    });
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
    expect(result.get('lodash')?.version).toBe('4.17.21');
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
    expect(result.get('express')).toEqual({
      name: 'express',
      version: '4.18.2',
      registryUrl: 'https://registry.npmjs.org/express/-/express-4.18.2.tgz',
      integrity: 'sha512-v1',
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
    expect(result.get('@octokit/rest')?.version).toBe('21.0.1');
  });

  it('should skip nested (transitive) dependencies', () => {
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
    // Should get hoisted debug (4.3.4), not nested one (2.6.9)
    expect(result.get('debug')?.version).toBe('4.3.4');
    expect(result.get('express')?.version).toBe('4.18.2');
  });

  it('should return empty map for invalid JSON', () => {
    const result = parseNpmLockfile('not valid json');
    expect(result.size).toBe(0);
  });
});
