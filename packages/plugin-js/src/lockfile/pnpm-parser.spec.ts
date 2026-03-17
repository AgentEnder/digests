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

    expect(result.get('react')?.[0]).toEqual({
      name: 'react',
      version: '19.0.0',
      integrity: 'sha512-abc123',
      registryUrl: 'https://registry.npmjs.org/react/-/react-19.0.0.tgz',
      dev: false,
    });
    expect(result.get('typescript')?.[0]?.version).toBe('5.7.2');
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
    expect(result.get('express')?.[0]?.version).toBe('4.18.2');
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
    expect(result.get('@octokit/rest')?.[0]?.version).toBe('21.0.1');
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
    const debugVersions = result.get('debug');
    expect(debugVersions).toHaveLength(2);
    expect(debugVersions?.some(e => e.version === '4.3.4')).toBe(true);
    expect(debugVersions?.some(e => e.version === '2.6.9')).toBe(true);
  });

  it('should return empty map for invalid YAML', () => {
    const result = parsePnpmLockfile('{{invalid yaml}}');
    expect(result.size).toBe(0);
  });
});
