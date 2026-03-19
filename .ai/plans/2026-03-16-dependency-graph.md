# Dependency Graph, Dev Reachability, and "Included By" Chains

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add dependency graph edges to lockfile parsers so we can accurately compute `dev` flags via reachability analysis and show "included by" chains in the report.

**Architecture:** Each lockfile parser returns a `LockfileParseResult` with packages, edges (dependency graph), and root dep classification. `parser.ts` does BFS from prod/dev roots to compute `dev` flags and `includedBy` chains. The formatter renders chains in the details section, capped at 5 with "+ N more".

**Tech Stack:** TypeScript (NodeNext ESM), Vitest, pnpm workspaces, Nx

---

### Task 1: Update lockfile types for graph data

**Files:**
- Modify: `packages/plugin-js/src/lockfile/types.ts`

**Step 1: Add `LockfileParseResult` type**

Replace the file with:

```typescript
export interface ResolvedDependency {
  name: string;
  version: string;
  registryUrl?: string;
  integrity?: string;
  dev: boolean;
}

export interface LockfileParseResult {
  /** All resolved packages, keyed by name */
  packages: Map<string, ResolvedDependency[]>;
  /** Dependency edges: "name@version" → ["dep-name@version", ...] */
  edges: Map<string, string[]>;
  /** Root-level dependency classification from importers/workspace section */
  rootDeps: Map<string, 'prod' | 'dev'>;
}

export type LockfileType = 'npm' | 'yarn' | 'pnpm' | 'bun';

export const LOCKFILE_PRIORITY: Array<{
  filename: string;
  type: LockfileType;
}> = [
  { filename: 'bun.lock', type: 'bun' },
  { filename: 'bun.lockb', type: 'bun' },
  { filename: 'pnpm-lock.yaml', type: 'pnpm' },
  { filename: 'yarn.lock', type: 'yarn' },
  { filename: 'package-lock.json', type: 'npm' },
];
```

Remove the now-unused `LockfileData` interface.

**Step 2: Commit**

```bash
git add packages/plugin-js/src/lockfile/types.ts
git commit -m "feat(plugin-js): add LockfileParseResult type with edges and rootDeps"
```

---

### Task 2: Update pnpm parser to extract edges and rootDeps

**Files:**
- Modify: `packages/plugin-js/src/lockfile/pnpm-parser.ts`
- Modify: `packages/plugin-js/src/lockfile/pnpm-parser.spec.ts`

**Step 1: Write tests for edges and rootDeps**

Add to `pnpm-parser.spec.ts`:

```typescript
it('should extract dependency edges from snapshots section', () => {
  const content = `
lockfileVersion: '9.0'

importers:
  '.':
    dependencies:
      express:
        specifier: ^4.18.0
        version: 4.18.2

packages:
  express@4.18.2:
    resolution: {integrity: sha512-expr}

snapshots:
  express@4.18.2:
    dependencies:
      debug: 4.3.4
      accepts: 1.3.8

  debug@4.3.4:
    dependencies:
      ms: 2.1.3

  accepts@1.3.8: {}

  ms@2.1.3: {}
`;

  const result = parsePnpmLockfile(content);
  expect(result.edges.get('express@4.18.2')).toEqual(
    expect.arrayContaining(['debug@4.3.4', 'accepts@1.3.8'])
  );
  expect(result.edges.get('debug@4.3.4')).toEqual(['ms@2.1.3']);
  expect(result.edges.get('accepts@1.3.8')).toEqual([]);
});

it('should extract rootDeps from importers section', () => {
  const content = `
lockfileVersion: '9.0'

importers:
  '.':
    dependencies:
      react:
        specifier: ^19.0.0
        version: 19.0.0
    devDependencies:
      typescript:
        specifier: ^5.7.2
        version: 5.7.2

packages:
  react@19.0.0:
    resolution: {integrity: sha512-abc}

  typescript@5.7.2:
    resolution: {integrity: sha512-def}

snapshots:
  react@19.0.0: {}
  typescript@5.7.2: {}
`;

  const result = parsePnpmLockfile(content);
  expect(result.rootDeps.get('react')).toBe('prod');
  expect(result.rootDeps.get('typescript')).toBe('dev');
});
```

**Step 2: Update the parser return type and implement**

Change `parsePnpmLockfile` to return `LockfileParseResult`. Key changes:

1. Parse the `importers` section to build `rootDeps` — iterate `importers['.'].dependencies` (prod) and `importers['.'].devDependencies` (dev). Extract the package name from each entry.

2. Parse the `snapshots` section (same regex-based approach as `packages`) to extract edges. For each snapshot entry, parse the `dependencies:` block underneath it:
   - Each line like `      debug: 4.3.4` becomes an edge from the snapshot key to `debug@4.3.4`
   - The snapshot key format is `name@version(peer-info):` — strip any peer info in parens from the key to get `name@version`
   - Build `edges: Map<string, string[]>` where key is `name@version` and values are `depName@depVersion`

3. The `packages` section parsing stays the same for `ResolvedDependency` data.

**Importers parsing approach:**
```
importers:
  '.':
    dependencies:
      react:
        specifier: ^19.0.0
        version: 19.0.0
    devDependencies:
      typescript:
        specifier: ^5.7.2
        version: 5.7.2
```

Parse this by finding the `importers:` section, then within `'.':`(or other workspace paths), find `dependencies:` and `devDependencies:` sub-sections. For each entry under those, the key is the package name (at 6-space indent), and `version:` line underneath gives the resolved version.

**Snapshots parsing approach:**
```
snapshots:
  express@4.18.2:
    dependencies:
      debug: 4.3.4
      accepts: 1.3.8
```

Find the `snapshots:` section. Each entry at 2-space indent is a package key. Within each entry, find lines under `    dependencies:` (6-space indent) — each `      name: version` line is an edge.

**Step 3: Run tests**

Run: `npx vitest run` (from packages/plugin-js)

**Step 4: Commit**

```bash
git add packages/plugin-js/src/lockfile/pnpm-parser.ts packages/plugin-js/src/lockfile/pnpm-parser.spec.ts
git commit -m "feat(plugin-js): extract dependency edges and rootDeps from pnpm lockfile"
```

---

### Task 3: Update npm parser to extract edges and rootDeps

**Files:**
- Modify: `packages/plugin-js/src/lockfile/npm-parser.ts`
- Modify: `packages/plugin-js/src/lockfile/npm-parser.spec.ts`

**Step 1: Write tests for edges and rootDeps**

Add to `npm-parser.spec.ts`:

```typescript
it('should extract dependency edges from v3 packages', () => {
  const lockfile = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': { name: 'my-app', dependencies: { express: '^4.18.0' }, devDependencies: { typescript: '^5.7.2' } },
      'node_modules/express': {
        version: '4.18.2',
        dependencies: { debug: '4.3.4', accepts: '1.3.8' },
      },
      'node_modules/debug': {
        version: '4.3.4',
        dependencies: { ms: '2.1.3' },
      },
      'node_modules/accepts': { version: '1.3.8' },
      'node_modules/ms': { version: '2.1.3' },
      'node_modules/typescript': { version: '5.7.2', dev: true },
    },
  });

  const result = parseNpmLockfile(lockfile);
  expect(result.edges.get('express@4.18.2')).toEqual(
    expect.arrayContaining(['debug@4.3.4', 'accepts@1.3.8'])
  );
  expect(result.edges.get('debug@4.3.4')).toEqual(['ms@2.1.3']);
  expect(result.rootDeps.get('express')).toBe('prod');
  expect(result.rootDeps.get('typescript')).toBe('dev');
});
```

**Step 2: Implement**

Change `parseNpmLockfile` to return `LockfileParseResult`.

- **rootDeps:** Read from `packages['']` — its `dependencies` keys are prod, `devDependencies` keys are dev.
- **edges:** For each `node_modules/X` entry that has a `dependencies` field, resolve each dep name to its version by looking up `node_modules/X/node_modules/depName` first (nested), then `node_modules/depName` (hoisted). Build edge as `X@version → depName@resolvedVersion`.

The npm lockfile `dependencies` field on a package entry contains the *ranges* that package depends on, not resolved versions. To resolve them, look up the `node_modules/` path. For edge building, the simplest approach: for each dep name in `pkg.dependencies`, find the corresponding entry in `packages` and use its resolved version.

**Step 3: Run tests, commit**

---

### Task 4: Update yarn parser to extract edges and rootDeps

**Files:**
- Modify: `packages/plugin-js/src/lockfile/yarn-parser.ts`
- Modify: `packages/plugin-js/src/lockfile/yarn-parser.spec.ts`

**Step 1: Implement**

Change `parseYarnLockfile` to return `LockfileParseResult`.

- **rootDeps:** Yarn lockfiles don't contain root dep classification. Return empty map — `parser.ts` already reads this from `package.json`.
- **edges:** In classic format, each block can have a `dependencies:` section with indented `"name" "range"` entries. For each dep, look up the resolved version from the already-parsed packages map. In Berry format, similar — `dependencies:` block with `name: range` entries.

**Step 2: Run tests, commit**

---

### Task 5: Update bun parser to extract edges and rootDeps

**Files:**
- Modify: `packages/plugin-js/src/lockfile/bun-parser.ts`
- Modify: `packages/plugin-js/src/lockfile/bun-parser.spec.ts`

**Step 1: Implement**

Change `parseBunLockfile` to return `LockfileParseResult`.

- **rootDeps:** Read from `workspaces[''].dependencies` (prod) and `workspaces[''].devDependencies` (dev).
- **edges:** Tuple index 2 is the dependencies object `{ depName: "range", ... }`. For each dep, look up resolved version from the packages map. Build edge as `name@version → depName@resolvedVersion`.

**Step 2: Run tests, commit**

---

### Task 6: Update lockfile dispatcher

**Files:**
- Modify: `packages/plugin-js/src/lockfile/index.ts`
- Modify: `packages/plugin-js/src/lockfile/index.spec.ts`

**Step 1: Update return type and exports**

Change `parseLockfile` to return `LockfileParseResult`. When returning empty (package.json fallback or error), return `{ packages: new Map(), edges: new Map(), rootDeps: new Map() }`.

Update exports to include `LockfileParseResult`.

**Step 2: Update tests**

Tests now check `result.packages.get(...)` instead of `result.get(...)`.

**Step 3: Run tests, commit**

---

### Task 7: Add core types for `includedBy`

**Files:**
- Modify: `packages/dependency-digest/src/types.ts`

**Step 1: Add `includedBy` to `ParsedDependency` and `DependencyMetrics`**

Add to both interfaces:

```typescript
/** Chains showing why this dep is included. Each chain is an array of "name@version" from root. */
includedBy?: string[][];
```

**Step 2: Commit**

---

### Task 8: Rewrite parser.ts with graph walk

**Files:**
- Modify: `packages/plugin-js/src/parser.ts`
- Modify: `packages/plugin-js/src/parser.spec.ts`

**Step 1: Write tests for dev computation and includedBy chains**

Add to `parser.spec.ts`:

```typescript
it('should compute dev flag from graph reachability', async () => {
  vi.mocked(fs.readFile).mockResolvedValue(
    JSON.stringify({
      dependencies: { express: '^4.18.0' },
      devDependencies: { vitest: '^4.0.0' },
    })
  );

  vi.mocked(lockfileModule.parseLockfile).mockResolvedValue({
    packages: new Map([
      ['express', [{ name: 'express', version: '4.18.2', dev: false }]],
      ['debug', [{ name: 'debug', version: '4.3.4', dev: false }]],
      ['vitest', [{ name: 'vitest', version: '4.1.0', dev: false }]],
      ['tinyspy', [{ name: 'tinyspy', version: '2.2.0', dev: false }]],
    ]),
    edges: new Map([
      ['express@4.18.2', ['debug@4.3.4']],
      ['debug@4.3.4', []],
      ['vitest@4.1.0', ['tinyspy@2.2.0']],
      ['tinyspy@2.2.0', []],
    ]),
    rootDeps: new Map([
      ['express', 'prod'],
      ['vitest', 'dev'],
    ]),
  });

  const result = await parseManifest({
    path: '/project/package.json',
    type: 'pnpm-lock.yaml',
  });

  // debug is transitive prod (reachable from express)
  expect(result.find(d => d.name === 'debug')).toMatchObject({
    dev: false, transitive: true,
  });
  // tinyspy is transitive dev (only reachable from vitest)
  expect(result.find(d => d.name === 'tinyspy')).toMatchObject({
    dev: true, transitive: true,
  });
});

it('should compute includedBy chains', async () => {
  vi.mocked(fs.readFile).mockResolvedValue(
    JSON.stringify({
      dependencies: { express: '^4.18.0' },
    })
  );

  vi.mocked(lockfileModule.parseLockfile).mockResolvedValue({
    packages: new Map([
      ['express', [{ name: 'express', version: '4.18.2', dev: false }]],
      ['debug', [{ name: 'debug', version: '4.3.4', dev: false }]],
      ['ms', [{ name: 'ms', version: '2.1.3', dev: false }]],
    ]),
    edges: new Map([
      ['express@4.18.2', ['debug@4.3.4']],
      ['debug@4.3.4', ['ms@2.1.3']],
      ['ms@2.1.3', []],
    ]),
    rootDeps: new Map([['express', 'prod']]),
  });

  const result = await parseManifest({
    path: '/project/package.json',
    type: 'pnpm-lock.yaml',
  });

  const ms = result.find(d => d.name === 'ms');
  expect(ms?.includedBy).toEqual([
    ['express@4.18.2', 'debug@4.3.4'],
  ]);

  const debug = result.find(d => d.name === 'debug');
  expect(debug?.includedBy).toEqual([
    ['express@4.18.2'],
  ]);
});
```

**Step 2: Implement the graph walk in parser.ts**

The key algorithm:

```typescript
function computeGraphInfo(
  lockfileResult: LockfileParseResult,
  directDeps: Map<string, { specifier: string; dev: boolean }>
): {
  devFlags: Map<string, boolean>;       // "name@version" → dev
  includedByChains: Map<string, string[][]>; // "name@version" → chains
} {
  const { packages, edges, rootDeps } = lockfileResult;

  // Build set of all "name@version" keys
  const allKeys = new Set<string>();
  for (const [name, versions] of packages) {
    for (const v of versions) {
      allKeys.add(`${name}@${v.version}`);
    }
  }

  // BFS from prod roots → mark prod-reachable
  const prodReachable = new Set<string>();
  // BFS from all roots → collect includedBy chains
  const includedByChains = new Map<string, string[][]>();

  // Determine root keys using rootDeps or directDeps fallback
  const rootEntries: Array<{ key: string; dev: boolean }> = [];
  const depsSource = rootDeps.size > 0 ? rootDeps : null;

  for (const [name, versions] of packages) {
    const direct = directDeps.get(name);
    if (!direct) continue;

    for (const v of versions) {
      const key = `${name}@${v.version}`;
      const isDev = depsSource
        ? depsSource.get(name) === 'dev'
        : direct.dev;
      rootEntries.push({ key, dev: isDev });
    }
  }

  // BFS from each root
  for (const root of rootEntries) {
    const queue: Array<{ key: string; chain: string[] }> = [
      { key: root.key, chain: [] },
    ];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { key, chain } = queue.shift()!;
      if (visited.has(key)) {
        // Still record the chain if it's a new path
        if (chain.length > 0) {
          const existing = includedByChains.get(key) ?? [];
          existing.push(chain);
          includedByChains.set(key, existing);
        }
        continue;
      }
      visited.add(key);

      if (!root.dev) prodReachable.add(key);

      // Record chain for non-root nodes
      if (chain.length > 0) {
        const existing = includedByChains.get(key) ?? [];
        existing.push(chain);
        includedByChains.set(key, existing);
      }

      // Walk edges
      const deps = edges.get(key) ?? [];
      for (const depKey of deps) {
        if (allKeys.has(depKey)) {
          queue.push({ key: depKey, chain: [...chain, key] });
        }
      }
    }
  }

  // Compute dev flags
  const devFlags = new Map<string, boolean>();
  for (const key of allKeys) {
    devFlags.set(key, !prodReachable.has(key));
  }

  return { devFlags, includedByChains };
}
```

Then update `parseManifest` to use `computeGraphInfo` instead of `resolved.dev`.

**Step 3: Update existing parser tests**

The mock for `parseLockfile` now returns `LockfileParseResult` instead of `Map`. Update all existing tests.

**Step 4: Run tests, commit**

---

### Task 9: Update metrics.ts to pass through includedBy

**Files:**
- Modify: `packages/plugin-js/src/metrics.ts`

**Step 1: Pass through `includedBy`**

Add to the return object:

```typescript
includedBy: dep.includedBy,
```

**Step 2: Build and test, commit**

---

### Task 10: Update formatter to render includedBy chains

**Files:**
- Modify: `packages/dependency-digest/src/formatter.ts`
- Modify: `packages/dependency-digest/src/formatter.spec.ts`

**Step 1: Add includedBy rendering in detailSection**

After the info items list, before vulnerabilities:

```typescript
if (dep.includedBy && dep.includedBy.length > 0) {
  const maxChains = 5;
  const chains = dep.includedBy.slice(0, maxChains).map(
    (chain) => chain.join(' → ') + ` → ${dep.name}@${dep.version}`
  );
  if (dep.includedBy.length > maxChains) {
    chains.push(`+ ${dep.includedBy.length - maxChains} more`);
  }
  parts.push('', bold('Included by'), unorderedList(chains));
}
```

**Step 2: Add test for includedBy rendering**

```typescript
it('should render includedBy chains in details', () => {
  const digestWithChains: DigestOutput = {
    ...sampleDigest,
    manifests: [{
      ...sampleDigest.manifests[0],
      dependencies: [{
        ...sampleDigest.manifests[0].dependencies[0],
        name: 'debug',
        transitive: true,
        includedBy: [
          ['express@4.18.2'],
          ['morgan@1.10.0'],
        ],
      }],
    }],
  };
  const md = formatDigestAsMarkdown(digestWithChains);
  expect(md).toContain('Included by');
  expect(md).toContain('express@4.18.2');
  expect(md).toContain('morgan@1.10.0');
});
```

**Step 3: Run tests, commit**

---

### Task 11: Full workspace verification

**Step 1:** `npx nx run-many -t build`
**Step 2:** Run vitest directly in each package
**Step 3:** `npx nx run-many -t lint`
**Step 4:** Commit any fixes
