# Container Image Scanner — Plugin-Based

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Prerequisite:** The unified plugin interface refactor (`.ai/plans/2026-03-24-unified-plugin-interface.md`) must be completed first.

**Goal:** Add container image scanning that unpacks OCI/Docker images and identifies vulnerabilities in OS packages (apt, apk, rpm) and application dependencies baked into the image.

**Architecture:** `@digests/plugin-container` implements `DigestPlugin` like any other plugin. Its `detect()` reads the `images` array from `PluginContext.config` and also auto-detects `docker-compose.yml` and `Dockerfile` `FROM` lines in the scanned directory. Each image becomes a `ScanTarget`. No special CLI flags needed.

**Image sources (merged by `detect()`):**
1. `config.images` array in `dependency-digest.config.json` — explicit image list
2. `docker-compose.yml` / `docker-compose.yaml` — parse `services.*.image` fields
3. `Dockerfile` / `Dockerfile.*` — parse `FROM` lines (final stage only)

**Approach:**
- Shell out to `skopeo` for image pulling (avoid reimplementing registry auth)
- Extract layers with `tar`
- Parse OS package databases directly (dpkg status, apk installed)
- Use OSV.dev for vulnerability data (covers Debian, Alpine, Ubuntu, etc.)
- Optionally run other installed plugins against app files found in the image

**Tech Stack:** TypeScript (NodeNext ESM), Vitest

**External dependencies:** `skopeo` (or `docker` fallback) for pulling images

---

### Task 1: Scaffold plugin-container package

**Files to create:**
- `packages/plugin-container/package.json`
- `packages/plugin-container/tsconfig.json`
- `packages/plugin-container/src/index.ts`

**package.json:**

```json
{
  "name": "@digests/plugin-container",
  "version": "1.0.0",
  "description": "Container image vulnerability scanner for digests — scans Docker/OCI images for OS package vulnerabilities",
  "author": { "name": "Craigory Coppola", "url": "https://craigory.dev" },
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "publishConfig": { "access": "public" },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {},
  "dependencies": {
    "@digests/osv": "workspace:*",
    "dependency-digest": "workspace:*",
    "tslib": "catalog:"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

**`src/index.ts`:**

```typescript
import type { DigestPlugin, PluginContext, ScanTarget, ProgressEvent, ScanResult, ContainerResult } from 'dependency-digest';
import { detectImages } from './detect.js';
import { loadImage } from './image-loader.js';
import { extractLayers } from './layer-extractor.js';
import { detectOS } from './os-detect.js';
import { parsePackages } from './parsers/index.js';
import { matchVulnerabilities } from './vulnerability-matcher.js';
import { checkPrerequisites } from './prerequisites.js';

const plugin: DigestPlugin = {
  name: 'container',

  async detect(dir: string, context: PluginContext): Promise<ScanTarget[]> {
    // Merge images from 3 sources:
    // 1. config.images array (explicit)
    // 2. docker-compose.yml services.*.image fields
    // 3. Dockerfile FROM lines (final stage)
    return detectImages(dir, context.config);
  },

  async *scan(target: ScanTarget, _context: PluginContext): AsyncGenerator<ProgressEvent, ScanResult[]> {
    const prereqs = await checkPrerequisites();
    if (!prereqs.ok) {
      throw new Error(`Container scanning requires: ${prereqs.missing.join(', ')}`);
    }

    yield { phase: 'pull', message: `pulling ${target.path}...` };
    const image = await loadImage(target.path);

    try {
      yield { phase: 'extract', message: 'extracting layers...' };
      const fs = await extractLayers(image);

      yield { phase: 'detect-os', message: 'detecting OS...' };
      const os = await detectOS(fs.rootDir);

      yield { phase: 'parse-packages', message: 'reading package databases...' };
      const packages = await parsePackages(fs.rootDir);

      yield { phase: 'match-vulns', current: 0, total: packages.length, message: 'matching vulnerabilities...' };
      const vulnerabilities = os ? await matchVulnerabilities(packages, os) : [];

      return [{
        kind: 'container',
        imageRef: target.path,
        os: os ? { name: os.name, version: os.version } : null,
        packages,
        vulnerabilities,
      } satisfies ContainerResult];
    } finally {
      await image.cleanup();
    }
  },
};

export default plugin;
export { plugin };
```

**Verification:** `npx nx build plugin-container` compiles.

---

### Task 2: Image detection from config + project files

**Files to create:**
- `packages/plugin-container/src/detect.ts`

```typescript
import type { ScanTarget } from 'dependency-digest';
import type { DigestConfig } from 'dependency-digest';

export async function detectImages(dir: string, config: DigestConfig): Promise<ScanTarget[]> {
  const images = new Set<string>();

  // 1. Explicit config: config.images
  if (config.images) {
    for (const img of config.images) images.add(img);
  }

  // 2. docker-compose.yml — parse services.*.image
  for (const name of ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']) {
    const composePath = join(dir, name);
    if (await exists(composePath)) {
      const parsed = parseYaml(await readFile(composePath, 'utf-8'));
      for (const service of Object.values(parsed.services ?? {})) {
        if (service.image) images.add(service.image);
      }
    }
  }

  // 3. Dockerfile FROM lines (final stage only)
  for (const name of await findDockerfiles(dir)) {
    const content = await readFile(join(dir, name), 'utf-8');
    const fromLines = content.match(/^FROM\s+(\S+)/gm);
    if (fromLines?.length) {
      const lastFrom = fromLines[fromLines.length - 1].replace(/^FROM\s+/, '').split(/\s/)[0];
      if (lastFrom && !lastFrom.startsWith('$') && lastFrom !== 'scratch') {
        images.add(lastFrom);
      }
    }
  }

  // Return empty if no images found — plugin just won't produce results
  return [...images].map(img => ({ path: img, type: 'container-image' }));
}
```

**Verification:** Unit test with fixture directories containing config files, compose files, and Dockerfiles.

---

### Task 3: Image loading

**Files to create:**
- `packages/plugin-container/src/image-loader.ts`

**Three image sources:**

1. **Registry reference:** `docker.io/library/node:20-slim` → `skopeo copy docker://ref oci:tmpDir`
2. **Docker tarball:** `image.tar` → extract directly
3. **Local Docker daemon:** fallback to `docker save`

```typescript
export interface LoadedImage {
  extractDir: string;
  layers: string[];      // Ordered layer paths (bottom to top)
  cleanup: () => Promise<void>;
}

export async function loadImage(ref: string): Promise<LoadedImage> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'digests-container-'));

  if (ref.endsWith('.tar') || ref.endsWith('.tar.gz')) {
    return loadFromTarball(ref, tmpDir);
  }
  return loadFromSkopeo(ref, tmpDir);
}
```

**skopeo:** `skopeo copy docker://image:tag oci:${tmpDir}/image:latest`
**Fallback:** `docker save image:tag -o ${tmpDir}/image.tar`

**OCI layout parsing:**
1. `index.json` → manifest digest
2. Manifest blob → layer digests + config digest
3. Layers are `.tar.gz` in `blobs/sha256/`

**Verification:** Unit test with a pre-built small test tarball.

---

### Task 4: Layer extraction

**Files to create:**
- `packages/plugin-container/src/layer-extractor.ts`

Extract layers in order (bottom to top). Only extract paths needed for scanning:

- `/etc/os-release`, `/etc/alpine-release`, `/etc/debian_version`
- `/var/lib/dpkg/status` (Debian/Ubuntu)
- `/lib/apk/db/installed` (Alpine)
- `/var/lib/rpm/` (RPM-based)
- Application manifests: `**/package.json`, `**/requirements.txt`, `**/go.mod`, etc.

**Handle whiteout files:** `.wh.filename` prefix means delete from assembled filesystem.

**Verification:** Test with multi-layer fixture.

---

### Task 5: OS detection

**Files to create:**
- `packages/plugin-container/src/os-detect.ts`

Parse `/etc/os-release` (`KEY=value` pairs):
- `ID` → distribution (`alpine`, `debian`, `ubuntu`, `fedora`, etc.)
- `VERSION_ID` → version string

**OS to OSV ecosystem mapping:**

| OS ID | OSV Ecosystem |
|-------|---------------|
| `alpine` | `Alpine:v{major}.{minor}` |
| `debian` | `Debian:{version}` |
| `ubuntu` | `Ubuntu:{version}` |
| `rhel`, `centos`, `fedora` | `Red Hat` |
| `amzn` | `Amazon Linux` |

**Verification:** Unit tests with fixture os-release files.

---

### Task 6: Package database parsers

**Files to create:**
- `packages/plugin-container/src/parsers/dpkg-parser.ts`
- `packages/plugin-container/src/parsers/apk-parser.ts`

**dpkg parser** — `/var/lib/dpkg/status`:

RFC822-like paragraphs. Extract `Package`, `Version`, `Source`, `Architecture`. Parse source version from `Source: name (version)`.

**apk parser** — `/lib/apk/db/installed`:

Single-letter field prefixes: `P` = package, `V` = version, `A` = arch, `o` = origin, `L` = license. Entries separated by blank lines.

**Note:** RPM parser deferred to a later task — requires native SQLite binding or shelling out to `rpm`. Start with Debian/Ubuntu and Alpine (the most common container base images).

**Verification:** Unit tests with fixture database files.

---

### Task 7: Vulnerability matching

**Files to create:**
- `packages/plugin-container/src/vulnerability-matcher.ts`

Use `@digests/osv` to query vulnerabilities with OS-specific ecosystem names.

**Important:** For Debian/Ubuntu, query by **source package** name (e.g., `openssl` not `libssl3`).

**Batch optimization:** Implement batch queries to OSV (`/v1/querybatch`) — up to 100 packages per request.

**Files to modify (if needed):**
- `packages/osv/src/index.ts` — Add batch query support

**Verification:** Unit test with known vulnerable package versions.

---

### Task 8: Scanner orchestration

**Files to create:**
- `packages/plugin-container/src/scanner.ts`

Wire together: `loadImage` → `extractLayers` → `detectOS` → `parsePackages` → `matchVulnerabilities`.

```typescript
export async function scanImage(ref: string): Promise<{
  os: DetectedOS | null;
  packages: OSPackage[];
  vulnerabilities: ContainerVulnerability[];
}> { ... }
```

Called by the plugin's `scan()` generator, which yields progress events between phases.

**Verification:** Integration test with fixture image tarball.

---

### Task 9: CLI integration

**Files to modify:**
- `packages/dependency-digest/src/cli.ts`
- `packages/dependency-digest/src/formatter.ts`
- `packages/dependency-digest/src/types.ts` (add `images` to `DigestConfig`)

**No special `--image` flag needed.** The container plugin reads `config.images` from `PluginContext` and auto-detects from `docker-compose.yml` / `Dockerfile`. It works like any other plugin — just add it to `KNOWN_PLUGINS`.

**Add `images` CLI option** (merged into config like existing options):

```typescript
.option("images", {
  type: "array",
  items: "string",
  description: "Container images to scan (e.g. node:20-slim, postgres:16)",
})
```

**Add to KNOWN_PLUGINS:**

```typescript
"@digests/plugin-container",
```

**Update markdown formatter** with container section:
- OS info, package count, vulnerability table grouped by severity

**Verification:** `dependency-digest` in a directory with `docker-compose.yml` auto-detects and scans images. `dependency-digest --images node:20-slim` scans explicit image. Config file `{ "images": ["postgres:16"] }` also works.

---

### Task 10: Prerequisite detection

**Files to create:**
- `packages/plugin-container/src/prerequisites.ts`

Check for `skopeo`, fall back to `docker`. Clear error message if neither available.

**Verification:** Clear errors when tools missing.

---

### Task 11: Tests with fixtures

**Files to create:**
- `packages/plugin-container/src/__tests__/dpkg-parser.test.ts`
- `packages/plugin-container/src/__tests__/apk-parser.test.ts`
- `packages/plugin-container/src/__tests__/os-detect.test.ts`
- `packages/plugin-container/src/__tests__/fixtures/`

**Fixtures:** Trimmed dpkg status (~5 packages), trimmed apk installed (~5 packages), os-release files for Alpine 3.19, Debian 12, Ubuntu 24.04.

**Unit tests don't require Docker/skopeo.** Optional integration tests gated behind `DIGESTS_INTEGRATION_TESTS=1`.

**Verification:** `npx nx test plugin-container` — unit tests green without Docker/skopeo.
