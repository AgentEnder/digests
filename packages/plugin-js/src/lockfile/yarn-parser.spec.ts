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

    expect(result.get('react')).toEqual({
      name: 'react',
      version: '19.0.0',
      registryUrl: 'https://registry.yarnpkg.com/react/-/react-19.0.0.tgz#abc123',
      integrity: 'sha512-abc123',
    });
    expect(result.get('typescript')?.version).toBe('5.7.2');
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
    expect(result.get('@octokit/rest')?.version).toBe('21.0.1');
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
    expect(result.get('lodash')?.version).toBe('4.17.21');
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
    expect(result.get('react')?.version).toBe('19.0.0');
    expect(result.get('typescript')?.version).toBe('5.7.2');
  });

  it('should return empty map for empty content', () => {
    const result = parseYarnLockfile('');
    expect(result.size).toBe(0);
  });
});
