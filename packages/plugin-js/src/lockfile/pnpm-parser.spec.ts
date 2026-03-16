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

    expect(result.get('react')).toEqual({
      name: 'react',
      version: '19.0.0',
      integrity: 'sha512-abc123',
      registryUrl: 'https://registry.npmjs.org/react/-/react-19.0.0.tgz',
    });
    expect(result.get('typescript')?.version).toBe('5.7.2');
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
    expect(result.get('express')?.version).toBe('4.18.2');
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
    expect(result.get('@octokit/rest')?.version).toBe('21.0.1');
  });

  it('should return empty map for invalid YAML', () => {
    const result = parsePnpmLockfile('{{invalid yaml}}');
    expect(result.size).toBe(0);
  });
});
