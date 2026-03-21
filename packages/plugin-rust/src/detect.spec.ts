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

  it('should detect Cargo.toml with Cargo.lock', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(
      mockReaddir([
        { name: 'Cargo.toml', isFile: true },
        { name: 'Cargo.lock', isFile: true },
        { name: 'src', isFile: false },
      ])
    );

    const result = await detectManifests('/project');

    expect(result).toEqual([
      { path: join('/project', 'Cargo.toml'), type: 'Cargo.lock' },
    ]);
  });

  it('should fall back to Cargo.toml type when no lockfile found', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(
      mockReaddir([{ name: 'Cargo.toml', isFile: true }])
    );

    const result = await detectManifests('/project');

    expect(result).toEqual([
      { path: join('/project', 'Cargo.toml'), type: 'Cargo.toml' },
    ]);
  });

  it('should return empty array when no Cargo.toml found', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(
      mockReaddir([
        { name: 'package.json', isFile: true },
        { name: 'README.md', isFile: true },
      ])
    );

    const result = await detectManifests('/project');
    expect(result).toEqual([]);
  });

  it('should return empty array on filesystem error', async () => {
    vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));

    const result = await detectManifests('/nonexistent');
    expect(result).toEqual([]);
  });
});
