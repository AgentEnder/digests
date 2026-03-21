import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchNuGetRegistryData } from './nuget-registry.js';

vi.mock('@digests/github-utils', () => ({
  withCache: vi.fn(
    (_ns: string, _key: string, fn: () => Promise<unknown>) => fn()
  ),
}));

const mockServiceIndex = {
  resources: [
    {
      '@id': 'https://api.nuget.org/v3/registration5-gz-semver2/',
      '@type': 'RegistrationsBaseUrl/3.6.0',
    },
    {
      '@id': 'https://azuresearch-usnc.nuget.org/query',
      '@type': 'SearchQueryService/3.5.0',
    },
  ],
};

describe('fetchNuGetRegistryData', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should parse NuGet V3 registration response', async () => {
    const mockRegistration = {
      items: [
        {
          '@id': 'https://api.nuget.org/v3/registration5-gz-semver2/newtonsoft.json/page1.json',
          items: [
            {
              catalogEntry: {
                id: 'Newtonsoft.Json',
                version: '12.0.0',
                description: 'Json.NET',
                licenseExpression: 'MIT',
                projectUrl: 'https://github.com/JamesNK/Newtonsoft.Json',
                authors: 'James Newton-King',
                published: '2023-01-01T00:00:00Z',
              },
            },
            {
              catalogEntry: {
                id: 'Newtonsoft.Json',
                version: '13.0.0',
                description: 'Json.NET is a popular high-performance JSON framework for .NET',
                licenseExpression: 'MIT',
                projectUrl: 'https://github.com/JamesNK/Newtonsoft.Json',
                authors: 'James Newton-King',
                published: '2024-03-15T00:00:00Z',
              },
            },
            {
              catalogEntry: {
                id: 'Newtonsoft.Json',
                version: '13.0.3',
                description: 'Json.NET is a popular high-performance JSON framework for .NET',
                licenseExpression: 'MIT',
                projectUrl: 'https://github.com/JamesNK/Newtonsoft.Json',
                authors: 'James Newton-King',
                published: '2024-06-01T00:00:00Z',
              },
            },
          ],
        },
      ],
    };

    const mockSearch = {
      data: [{ id: 'Newtonsoft.Json', version: '13.0.3', totalDownloads: 5000000 }],
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('index.json') && !url.includes('registration')) {
        return { ok: true, json: () => Promise.resolve(mockServiceIndex) } as Response;
      }
      if (url.includes('registration')) {
        return { ok: true, json: () => Promise.resolve(mockRegistration) } as Response;
      }
      if (url.includes('query')) {
        return { ok: true, json: () => Promise.resolve(mockSearch) } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    const result = await fetchNuGetRegistryData('Newtonsoft.Json');

    expect(result).toEqual({
      latestVersion: '13.0.3',
      license: 'MIT',
      description: 'Json.NET is a popular high-performance JSON framework for .NET',
      repoUrl: 'https://github.com/JamesNK/Newtonsoft.Json',
      lastMajorDate: '2024-03-15T00:00:00Z',
      lastPatchDate: '2024-06-01T00:00:00Z',
      weeklyDownloads: 5000000,
      author: 'James Newton-King',
    });
  });

  it('should return defaults on HTTP error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    const result = await fetchNuGetRegistryData('nonexistent-package');

    expect(result).toEqual({
      latestVersion: 'unknown',
      license: null,
      description: null,
      repoUrl: null,
      lastMajorDate: null,
      lastPatchDate: null,
      weeklyDownloads: null,
      author: null,
    });
  });

  it('should use custom source URLs', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    await fetchNuGetRegistryData('SomePackage', [
      'https://custom-feed.example.com/v3/index.json',
    ]);

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://custom-feed.example.com/v3/index.json',
      expect.anything()
    );
  });
});
