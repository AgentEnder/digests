import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectManifests } from './detect.js';
import * as fs from 'fs/promises';
import { join } from 'path';

vi.mock('fs/promises');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockReaddir(entries: Array<{ name: string; isFile: boolean }>): any {
  return entries.map((e) => ({ name: e.name, isFile: () => e.isFile }));
}

describe('detectManifests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should detect package.json with pnpm-lock.yaml', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(
      mockReaddir([
        { name: 'package.json', isFile: true },
        { name: 'pnpm-lock.yaml', isFile: true },
        { name: 'src', isFile: false },
      ])
    );

    const result = await detectManifests('/project');

    expect(result).toEqual([
      { path: join('/project', 'package.json'), type: 'pnpm-lock.yaml' },
    ]);
  });

  it('should prefer bun.lock over other lockfiles', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(
      mockReaddir([
        { name: 'package.json', isFile: true },
        { name: 'bun.lock', isFile: true },
        { name: 'package-lock.json', isFile: true },
      ])
    );

    const result = await detectManifests('/project');

    expect(result).toEqual([
      { path: join('/project', 'package.json'), type: 'bun.lock' },
    ]);
  });

  it('should fall back to package.json type when no lockfile found', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(
      mockReaddir([{ name: 'package.json', isFile: true }])
    );

    const result = await detectManifests('/project');

    expect(result).toEqual([
      { path: join('/project', 'package.json'), type: 'package.json' },
    ]);
  });

  it('should return empty array when no package.json found', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(
      mockReaddir([{ name: 'README.md', isFile: true }])
    );

    const result = await detectManifests('/project');
    expect(result).toEqual([]);
  });
});
