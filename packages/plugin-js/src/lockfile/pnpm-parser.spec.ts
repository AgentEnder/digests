import { describe, it, expect } from 'vitest';
import { parsePnpmLockfile } from './pnpm-parser.js';

describe('parsePnpmLockfile', () => {
  it('should parse pnpm v9 lockfile', () => {
    const content = `
lockfileVersion: '9.0'

importers:
  '.':
    dependencies:
      react:
        specifier: ^19.0.0
        version: 19.0.0
    devDependencies:
      typescript:
        specifier: ^5.7.2
        version: 5.7.2

packages:
  react@19.0.0:
    resolution: {integrity: sha512-abc123, tarball: https://registry.npmjs.org/react/-/react-19.0.0.tgz}
    engines: {node: '>=16'}

  typescript@5.7.2:
    resolution: {integrity: sha512-def456}
    engines: {node: '>=14'}
`;

    const result = parsePnpmLockfile(content);

    expect(result.packages.get('react')?.[0]).toEqual({
      name: 'react',
      version: '19.0.0',
      integrity: 'sha512-abc123',
      registryUrl: 'https://registry.npmjs.org/react/-/react-19.0.0.tgz',
      dev: false,
    });
    expect(result.packages.get('typescript')?.[0]?.version).toBe('5.7.2');
  });

  it('should parse pnpm v6 lockfile', () => {
    const content = `
lockfileVersion: '6.0'

dependencies:
  express:
    specifier: ^4.18.0
    version: 4.18.2

packages:
  /express@4.18.2:
    resolution: {integrity: sha512-expr}
    engines: {node: '>= 0.10.0'}
`;

    const result = parsePnpmLockfile(content);
    expect(result.packages.get('express')?.[0]?.version).toBe('4.18.2');
  });

  it('should handle scoped packages', () => {
    const content = `
lockfileVersion: '9.0'

importers:
  '.':
    dependencies:
      '@octokit/rest':
        specifier: ^21.0.1
        version: 21.0.1

packages:
  '@octokit/rest@21.0.1':
    resolution: {integrity: sha512-octo}
`;

    const result = parsePnpmLockfile(content);
    expect(result.packages.get('@octokit/rest')?.[0]?.version).toBe('21.0.1');
  });

  it('should support multi-version: same package with different versions', () => {
    const content = `
lockfileVersion: '9.0'

importers:
  '.':
    dependencies:
      debug:
        specifier: ^4.0.0
        version: 4.3.4

packages:
  debug@4.3.4:
    resolution: {integrity: sha512-debug4}
    engines: {node: '>=6.0'}

  debug@2.6.9:
    resolution: {integrity: sha512-debug2}
`;

    const result = parsePnpmLockfile(content);
    const debugVersions = result.packages.get('debug');
    expect(debugVersions).toHaveLength(2);
    expect(debugVersions?.some(e => e.version === '4.3.4')).toBe(true);
    expect(debugVersions?.some(e => e.version === '2.6.9')).toBe(true);
  });

  it('should return empty maps for invalid YAML', () => {
    const result = parsePnpmLockfile('{{invalid yaml}}');
    expect(result.packages.size).toBe(0);
    expect(result.edges.size).toBe(0);
    expect(result.rootDeps.size).toBe(0);
  });

  it('should extract dependency edges from snapshots section', () => {
    const content = `
lockfileVersion: '9.0'

importers:
  '.':
    dependencies:
      express:
        specifier: ^4.18.0
        version: 4.18.2

packages:
  express@4.18.2:
    resolution: {integrity: sha512-expr}

snapshots:
  express@4.18.2:
    dependencies:
      debug: 4.3.4
      accepts: 1.3.8

  debug@4.3.4:
    dependencies:
      ms: 2.1.3

  accepts@1.3.8: {}

  ms@2.1.3: {}
`;

    const result = parsePnpmLockfile(content);
    expect(result.edges.get('express@4.18.2')).toEqual(
      expect.arrayContaining(['debug@4.3.4', 'accepts@1.3.8'])
    );
    expect(result.edges.get('debug@4.3.4')).toEqual(['ms@2.1.3']);
    expect(result.edges.get('accepts@1.3.8')).toEqual([]);
  });

  it('should extract rootDeps from importers section', () => {
    const content = `
lockfileVersion: '9.0'

importers:
  '.':
    dependencies:
      react:
        specifier: ^19.0.0
        version: 19.0.0
    devDependencies:
      typescript:
        specifier: ^5.7.2
        version: 5.7.2

packages:
  react@19.0.0:
    resolution: {integrity: sha512-abc}

  typescript@5.7.2:
    resolution: {integrity: sha512-def}

snapshots:
  react@19.0.0: {}
  typescript@5.7.2: {}
`;

    const result = parsePnpmLockfile(content);
    expect(result.rootDeps.get('react')).toBe('prod');
    expect(result.rootDeps.get('typescript')).toBe('dev');
  });
});
