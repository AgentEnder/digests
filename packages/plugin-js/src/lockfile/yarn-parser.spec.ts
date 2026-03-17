import { describe, it, expect } from 'vitest';
import { parseYarnLockfile } from './yarn-parser.js';

describe('parseYarnLockfile', () => {
  it('should parse yarn classic lockfile', () => {
    const content = `
# yarn lockfile v1

react@^19.0.0:
  version "19.0.0"
  resolved "https://registry.yarnpkg.com/react/-/react-19.0.0.tgz#abc123"
  integrity sha512-abc123

typescript@^5.7.2:
  version "5.7.2"
  resolved "https://registry.yarnpkg.com/typescript/-/typescript-5.7.2.tgz#def456"
  integrity sha512-def456
`;

    const result = parseYarnLockfile(content);

    expect(result.get('react')?.[0]).toEqual({
      name: 'react',
      version: '19.0.0',
      registryUrl: 'https://registry.yarnpkg.com/react/-/react-19.0.0.tgz#abc123',
      integrity: 'sha512-abc123',
      dev: false,
    });
    expect(result.get('typescript')?.[0]?.version).toBe('5.7.2');
  });

  it('should handle scoped packages', () => {
    const content = `
# yarn lockfile v1

"@octokit/rest@^21.0.1":
  version "21.0.1"
  resolved "https://registry.yarnpkg.com/@octokit/rest/-/rest-21.0.1.tgz#hash"
  integrity sha512-scoped
`;

    const result = parseYarnLockfile(content);
    expect(result.get('@octokit/rest')?.[0]?.version).toBe('21.0.1');
  });

  it('should handle multiple version ranges for same package (take first)', () => {
    const content = `
# yarn lockfile v1

lodash@^4.17.0, lodash@^4.17.21:
  version "4.17.21"
  resolved "https://registry.yarnpkg.com/lodash/-/lodash-4.17.21.tgz#hash"
  integrity sha512-lodash
`;

    const result = parseYarnLockfile(content);
    expect(result.get('lodash')?.[0]?.version).toBe('4.17.21');
  });

  it('should support multi-version: same package with different versions', () => {
    const content = `
# yarn lockfile v1

debug@^2.6.0:
  version "2.6.9"
  resolved "https://registry.yarnpkg.com/debug/-/debug-2.6.9.tgz#hash1"
  integrity sha512-debug2

debug@^4.0.0:
  version "4.3.4"
  resolved "https://registry.yarnpkg.com/debug/-/debug-4.3.4.tgz#hash2"
  integrity sha512-debug4
`;

    const result = parseYarnLockfile(content);
    const debugVersions = result.get('debug');
    expect(debugVersions).toHaveLength(2);
    expect(debugVersions?.some(e => e.version === '2.6.9')).toBe(true);
    expect(debugVersions?.some(e => e.version === '4.3.4')).toBe(true);
  });

  it('should parse yarn berry lockfile', () => {
    const content = `
__metadata:
  version: 8
  cacheKey: 10c0

"react@npm:^19.0.0":
  version: 19.0.0
  resolution: "react@npm:19.0.0"
  checksum: 10c0-abc123
  languageName: node
  linkType: hard

"typescript@npm:^5.7.2":
  version: 5.7.2
  resolution: "typescript@npm:5.7.2"
  checksum: 10c0-def456
  languageName: node
  linkType: hard
`;

    const result = parseYarnLockfile(content);
    expect(result.get('react')?.[0]?.version).toBe('19.0.0');
    expect(result.get('typescript')?.[0]?.version).toBe('5.7.2');
  });

  it('should return empty map for empty content', () => {
    const result = parseYarnLockfile('');
    expect(result.size).toBe(0);
  });
});
