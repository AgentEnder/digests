import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectManifests } from './detect.js';
import * as fs from 'fs/promises';
import { join } from 'path';

vi.mock('fs/promises');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockEntry(parentPath: string, name: string, isFile: boolean): any {
  return { name, parentPath, isFile: () => isFile };
}

describe('detectManifests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should detect .csproj files', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      mockEntry('/project/src/MyApp', 'MyApp.csproj', true),
      mockEntry('/project/src/MyLib', 'MyLib.csproj', true),
    ] as never);

    const result = await detectManifests('/project');

    expect(result).toEqual([
      { path: join('/project/src/MyApp', 'MyApp.csproj'), type: 'csproj' },
      { path: join('/project/src/MyLib', 'MyLib.csproj'), type: 'csproj' },
    ]);
  });

  it('should detect .fsproj and .vbproj files', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      mockEntry('/project/src', 'App.fsproj', true),
      mockEntry('/project/src', 'Legacy.vbproj', true),
    ] as never);

    const result = await detectManifests('/project');

    expect(result).toEqual([
      { path: join('/project/src', 'App.fsproj'), type: 'fsproj' },
      { path: join('/project/src', 'Legacy.vbproj'), type: 'vbproj' },
    ]);
  });

  it('should prefer .sln files over individual projects', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      mockEntry('/project', 'MySolution.sln', true),
      mockEntry('/project/src/MyApp', 'MyApp.csproj', true),
      mockEntry('/project/src/MyLib', 'MyLib.csproj', true),
    ] as never);

    const result = await detectManifests('/project');

    expect(result).toEqual([
      { path: join('/project', 'MySolution.sln'), type: 'sln' },
    ]);
  });

  it('should skip files in bin, obj, and node_modules directories', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      mockEntry('/project/src/MyApp', 'MyApp.csproj', true),
      mockEntry('/project/src/MyApp/bin/Debug/net8.0', 'MyApp.csproj', true),
      mockEntry('/project/src/MyApp/obj', 'MyApp.csproj', true),
      mockEntry('/project/node_modules/SomePkg', 'SomePkg.csproj', true),
    ] as never);

    const result = await detectManifests('/project');

    expect(result).toEqual([
      { path: join('/project/src/MyApp', 'MyApp.csproj'), type: 'csproj' },
    ]);
  });

  it('should return empty array when no .NET files found', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      mockEntry('/project', 'package.json', true),
      mockEntry('/project', 'README.md', true),
    ] as never);

    const result = await detectManifests('/project');
    expect(result).toEqual([]);
  });

  it('should return empty array on filesystem error', async () => {
    vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));

    const result = await detectManifests('/nonexistent');
    expect(result).toEqual([]);
  });
});
