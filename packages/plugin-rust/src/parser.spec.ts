import { describe, it, expect } from 'vitest';
import { parseCargoMetadata } from './parser.js';
import type { CargoMetadata } from './cargo-metadata.js';

function makePackage(
  name: string,
  version: string,
  source: string | null = 'registry+https://github.com/rust-lang/crates.io-index'
): CargoMetadata['packages'][number] {
  return {
    id: `${name} ${version} (${source ?? 'path+file:///project'})`,
    name,
    version,
    source,
    license: 'MIT',
    license_file: null,
    description: null,
    authors: [],
    repository: null,
    manifest_path: `/project/${name}/Cargo.toml`,
  };
}

function makeNode(
  name: string,
  version: string,
  source: string | null = 'registry+https://github.com/rust-lang/crates.io-index',
  deps: Array<{
    name: string;
    pkg: string;
    dep_kinds: Array<{ kind: 'normal' | 'dev' | 'build' | null; target: string | null }>;
  }> = []
): CargoMetadata['resolve']['nodes'][number] {
  return {
    id: `${name} ${version} (${source ?? 'path+file:///project'})`,
    deps,
  };
}

function makeDep(
  name: string,
  version: string,
  kind: 'normal' | 'dev' | 'build' | null = null,
  source: string | null = 'registry+https://github.com/rust-lang/crates.io-index'
) {
  return {
    name,
    pkg: `${name} ${version} (${source ?? 'path+file:///project'})`,
    dep_kinds: [{ kind, target: null }],
  };
}

describe('parseCargoMetadata', () => {
  it('should parse direct dependencies', () => {
    const metadata: CargoMetadata = {
      packages: [
        makePackage('my-app', '0.1.0', null),
        makePackage('serde', '1.0.210'),
        makePackage('tokio', '1.40.0'),
      ],
      workspace_members: ['my-app 0.1.0 (path+file:///project)'],
      resolve: {
        root: 'my-app 0.1.0 (path+file:///project)',
        nodes: [
          makeNode('my-app', '0.1.0', null, [
            makeDep('serde', '1.0.210'),
            makeDep('tokio', '1.40.0'),
          ]),
          makeNode('serde', '1.0.210'),
          makeNode('tokio', '1.40.0'),
        ],
      },
    };

    const result = parseCargoMetadata(metadata);

    expect(result.dependencies).toHaveLength(2);
    expect(result.dependencies).toContainEqual(
      expect.objectContaining({
        name: 'serde',
        version: '1.0.210',
        dev: false,
        transitive: false,
      })
    );
    expect(result.dependencies).toContainEqual(
      expect.objectContaining({
        name: 'tokio',
        version: '1.40.0',
        dev: false,
        transitive: false,
      })
    );
  });

  it('should skip workspace members', () => {
    const metadata: CargoMetadata = {
      packages: [
        makePackage('my-app', '0.1.0', null),
        makePackage('my-lib', '0.1.0', null),
        makePackage('serde', '1.0.210'),
      ],
      workspace_members: [
        'my-app 0.1.0 (path+file:///project)',
        'my-lib 0.1.0 (path+file:///project)',
      ],
      resolve: {
        root: null,
        nodes: [
          makeNode('my-app', '0.1.0', null, [makeDep('serde', '1.0.210')]),
          makeNode('my-lib', '0.1.0', null),
          makeNode('serde', '1.0.210'),
        ],
      },
    };

    const result = parseCargoMetadata(metadata);

    expect(result.dependencies).toHaveLength(1);
    expect(result.dependencies[0].name).toBe('serde');
  });

  it('should identify transitive dependencies', () => {
    const metadata: CargoMetadata = {
      packages: [
        makePackage('my-app', '0.1.0', null),
        makePackage('serde', '1.0.210'),
        makePackage('serde_derive', '1.0.210'),
      ],
      workspace_members: ['my-app 0.1.0 (path+file:///project)'],
      resolve: {
        root: 'my-app 0.1.0 (path+file:///project)',
        nodes: [
          makeNode('my-app', '0.1.0', null, [makeDep('serde', '1.0.210')]),
          makeNode('serde', '1.0.210', undefined, [
            makeDep('serde_derive', '1.0.210'),
          ]),
          makeNode('serde_derive', '1.0.210'),
        ],
      },
    };

    const result = parseCargoMetadata(metadata);

    expect(result.dependencies).toContainEqual(
      expect.objectContaining({
        name: 'serde',
        transitive: false,
      })
    );
    expect(result.dependencies).toContainEqual(
      expect.objectContaining({
        name: 'serde_derive',
        transitive: true,
      })
    );
  });

  it('should mark dev-only dependencies correctly', () => {
    const metadata: CargoMetadata = {
      packages: [
        makePackage('my-app', '0.1.0', null),
        makePackage('serde', '1.0.210'),
        makePackage('pretty_assertions', '1.4.0'),
      ],
      workspace_members: ['my-app 0.1.0 (path+file:///project)'],
      resolve: {
        root: 'my-app 0.1.0 (path+file:///project)',
        nodes: [
          makeNode('my-app', '0.1.0', null, [
            makeDep('serde', '1.0.210'),
            makeDep('pretty_assertions', '1.4.0', 'dev'),
          ]),
          makeNode('serde', '1.0.210'),
          makeNode('pretty_assertions', '1.4.0'),
        ],
      },
    };

    const result = parseCargoMetadata(metadata);

    expect(result.dependencies).toContainEqual(
      expect.objectContaining({
        name: 'serde',
        dev: false,
      })
    );
    expect(result.dependencies).toContainEqual(
      expect.objectContaining({
        name: 'pretty_assertions',
        dev: true,
      })
    );
  });

  it('should build dependency graph edges', () => {
    const metadata: CargoMetadata = {
      packages: [
        makePackage('my-app', '0.1.0', null),
        makePackage('serde', '1.0.210'),
        makePackage('serde_derive', '1.0.210'),
      ],
      workspace_members: ['my-app 0.1.0 (path+file:///project)'],
      resolve: {
        root: 'my-app 0.1.0 (path+file:///project)',
        nodes: [
          makeNode('my-app', '0.1.0', null, [makeDep('serde', '1.0.210')]),
          makeNode('serde', '1.0.210', undefined, [
            makeDep('serde_derive', '1.0.210'),
          ]),
          makeNode('serde_derive', '1.0.210'),
        ],
      },
    };

    const result = parseCargoMetadata(metadata);

    expect(result.edges['serde@1.0.210']).toEqual(['serde_derive@1.0.210']);
  });

  it('should compute includedBy chains', () => {
    const metadata: CargoMetadata = {
      packages: [
        makePackage('my-app', '0.1.0', null),
        makePackage('serde', '1.0.210'),
        makePackage('serde_derive', '1.0.210'),
        makePackage('proc-macro2', '1.0.86'),
      ],
      workspace_members: ['my-app 0.1.0 (path+file:///project)'],
      resolve: {
        root: 'my-app 0.1.0 (path+file:///project)',
        nodes: [
          makeNode('my-app', '0.1.0', null, [makeDep('serde', '1.0.210')]),
          makeNode('serde', '1.0.210', undefined, [
            makeDep('serde_derive', '1.0.210'),
          ]),
          makeNode('serde_derive', '1.0.210', undefined, [
            makeDep('proc-macro2', '1.0.86'),
          ]),
          makeNode('proc-macro2', '1.0.86'),
        ],
      },
    };

    const result = parseCargoMetadata(metadata);

    const procMacro2 = result.dependencies.find(
      (d) => d.name === 'proc-macro2'
    );
    expect(procMacro2?.includedBy).toEqual([
      ['serde@1.0.210', 'serde_derive@1.0.210'],
    ]);
  });

  it('should set registryUrl from source field', () => {
    const metadata: CargoMetadata = {
      packages: [
        makePackage('my-app', '0.1.0', null),
        makePackage('serde', '1.0.210'),
      ],
      workspace_members: ['my-app 0.1.0 (path+file:///project)'],
      resolve: {
        root: 'my-app 0.1.0 (path+file:///project)',
        nodes: [
          makeNode('my-app', '0.1.0', null, [makeDep('serde', '1.0.210')]),
          makeNode('serde', '1.0.210'),
        ],
      },
    };

    const result = parseCargoMetadata(metadata);

    expect(result.dependencies[0].registryUrl).toBe(
      'https://github.com/rust-lang/crates.io-index'
    );
  });

  it('should mark dep as prod when reachable from both prod and dev roots', () => {
    const metadata: CargoMetadata = {
      packages: [
        makePackage('my-app', '0.1.0', null),
        makePackage('serde', '1.0.210'),
        makePackage('serde_json', '1.0.128'),
        makePackage('test-helper', '0.1.0'),
      ],
      workspace_members: ['my-app 0.1.0 (path+file:///project)'],
      resolve: {
        root: 'my-app 0.1.0 (path+file:///project)',
        nodes: [
          makeNode('my-app', '0.1.0', null, [
            makeDep('serde', '1.0.210'),
            makeDep('serde_json', '1.0.128'),
            makeDep('test-helper', '0.1.0', 'dev'),
          ]),
          makeNode('serde', '1.0.210'),
          makeNode('serde_json', '1.0.128', undefined, [
            makeDep('serde', '1.0.210'),
          ]),
          makeNode('test-helper', '0.1.0', undefined, [
            makeDep('serde', '1.0.210'),
          ]),
        ],
      },
    };

    const result = parseCargoMetadata(metadata);

    const serde = result.dependencies.find((d) => d.name === 'serde');
    expect(serde?.dev).toBe(false);
  });
});
