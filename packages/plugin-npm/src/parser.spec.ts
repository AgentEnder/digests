import { describe, it, expect } from 'vitest';
import { parsePackageJson } from './parser.js';

describe('parsePackageJson', () => {
  it('should parse dependencies from package.json content', () => {
    const content = JSON.stringify({
      dependencies: {
        react: '^19.0.0',
        express: '~4.18.0',
      },
      devDependencies: {
        typescript: '^5.7.2',
      },
    });

    const deps = parsePackageJson(content);

    expect(deps).toEqual([
      { name: 'react', versionRange: '^19.0.0', group: 'dependencies' },
      { name: 'express', versionRange: '~4.18.0', group: 'dependencies' },
      {
        name: 'typescript',
        versionRange: '^5.7.2',
        group: 'devDependencies',
      },
    ]);
  });

  it('should handle missing dependency fields', () => {
    const content = JSON.stringify({ name: 'empty-pkg' });
    const deps = parsePackageJson(content);
    expect(deps).toEqual([]);
  });

  it('should skip workspace: and link: protocols', () => {
    const content = JSON.stringify({
      dependencies: {
        'local-pkg': 'workspace:*',
        'linked-pkg': 'link:../other',
        react: '^19.0.0',
      },
    });
    const deps = parsePackageJson(content);
    expect(deps).toEqual([
      { name: 'react', versionRange: '^19.0.0', group: 'dependencies' },
    ]);
  });
});
