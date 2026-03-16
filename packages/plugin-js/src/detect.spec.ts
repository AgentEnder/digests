import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectManifests } from './detect.js';
import * as fs from 'fs/promises';
import { join } from 'path';

vi.mock('fs/promises');

describe('detectManifests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should detect package.json with pnpm-lock.yaml', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: 'package.json', isFile: () => true },
      { name: 'pnpm-lock.yaml', isFile: () => true },
      { name: 'src', isFile: () => false },
    ] as any);

    const result = await detectManifests('/project');

    expect(result).toEqual([
      { path: join('/project', 'package.json'), type: 'pnpm-lock.yaml' },
    ]);
  });

  it('should prefer bun.lock over other lockfiles', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: 'package.json', isFile: () => true },
      { name: 'bun.lock', isFile: () => true },
      { name: 'package-lock.json', isFile: () => true },
    ] as any);

    const result = await detectManifests('/project');

    expect(result).toEqual([
      { path: join('/project', 'package.json'), type: 'bun.lock' },
    ]);
  });

  it('should fall back to package.json type when no lockfile found', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: 'package.json', isFile: () => true },
    ] as any);

    const result = await detectManifests('/project');

    expect(result).toEqual([
      { path: join('/project', 'package.json'), type: 'package.json' },
    ]);
  });

  it('should return empty array when no package.json found', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: 'README.md', isFile: () => true },
    ] as any);

    const result = await detectManifests('/project');
    expect(result).toEqual([]);
  });
});
