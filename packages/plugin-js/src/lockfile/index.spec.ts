import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseLockfile } from './index.js';
import * as fs from 'fs/promises';

vi.mock('fs/promises');

describe('parseLockfile', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should dispatch to npm parser for package-lock.json', async () => {
    const lockContent = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/react': {
          version: '19.0.0',
          resolved: 'https://registry.npmjs.org/react/-/react-19.0.0.tgz',
        },
      },
    });
    vi.mocked(fs.readFile).mockResolvedValue(lockContent);

    const result = await parseLockfile('/project', 'package-lock.json');
    expect(result.get('react')?.[0]?.version).toBe('19.0.0');
  });

  it('should dispatch to bun parser for bun.lock', async () => {
    const lockContent = JSON.stringify({
      lockfileVersion: 1,
      workspaces: { '': {} },
      packages: {
        'react': ['react@19.0.0', 'https://registry.npmjs.org/react/-/react-19.0.0.tgz', {}, 'sha512-abc'],
      },
    });
    vi.mocked(fs.readFile).mockResolvedValue(lockContent);

    const result = await parseLockfile('/project', 'bun.lock');
    expect(result.get('react')?.[0]?.version).toBe('19.0.0');
  });

  it('should return empty map for package.json type (no lockfile)', async () => {
    const result = await parseLockfile('/project', 'package.json');
    expect(result.size).toBe(0);
  });

  it('should return empty map and warn when lockfile read fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn());
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

    const result = await parseLockfile('/project', 'package-lock.json');
    expect(result.size).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Could not parse lockfile'));
    warnSpy.mockRestore();
  });
});
