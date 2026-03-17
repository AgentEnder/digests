import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectManifests } from './detect.js';
import * as fs from 'fs/promises';
import { join } from 'path';
import type { Dirent } from 'fs';

vi.mock('fs/promises');

function fakeDirent(name: string, isFile: boolean): Dirent {
  return { name, isFile: () => isFile } as Dirent;
}

describe('detectManifests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should detect package.json with pnpm-lock.yaml', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      fakeDirent('package.json', true),
      fakeDirent('pnpm-lock.yaml', true),
      fakeDirent('src', false),
    ] as unknown as Dirent[]);

    const result = await detectManifests('/project');

    expect(result).toEqual([
      { path: join('/project', 'package.json'), type: 'pnpm-lock.yaml' },
    ]);
  });

  it('should prefer bun.lock over other lockfiles', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      fakeDirent('package.json', true),
      fakeDirent('bun.lock', true),
      fakeDirent('package-lock.json', true),
    ] as unknown as Dirent[]);

    const result = await detectManifests('/project');

    expect(result).toEqual([
      { path: join('/project', 'package.json'), type: 'bun.lock' },
    ]);
  });

  it('should fall back to package.json type when no lockfile found', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      fakeDirent('package.json', true),
    ] as unknown as Dirent[]);

    const result = await detectManifests('/project');

    expect(result).toEqual([
      { path: join('/project', 'package.json'), type: 'package.json' },
    ]);
  });

  it('should return empty array when no package.json found', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      fakeDirent('README.md', true),
    ] as unknown as Dirent[]);

    const result = await detectManifests('/project');
    expect(result).toEqual([]);
  });
});
