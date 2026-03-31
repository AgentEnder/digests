# Secret Detection — Plugin-Based

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Prerequisite:** The unified plugin interface refactor (`.ai/plans/2026-03-24-unified-plugin-interface.md`) must be completed first.

**Goal:** Add secret detection as a plugin that finds hardcoded credentials, API keys, tokens, and other sensitive data. Secrets are detected by dedicated scanner plugins AND by ecosystem plugins that know their domain-specific secrets.

**Architecture:** Two-layer approach:
1. **`@digests/plugin-secrets`** — A standalone plugin that implements `DigestPlugin`. It detects files to scan, and its `async *scan()` yields progress and returns `SecretResult[]`.
2. **Ecosystem plugins enhanced** — `plugin-js` can also return `SecretResult` findings for JS-specific secrets (npm tokens in `.npmrc`, credentials in `.env` files, etc.). This happens naturally since `scan()` returns `ScanResult[]` — a plugin can mix result kinds.

**Tech Stack:** TypeScript (NodeNext ESM), Vitest

---

### Task 1: Create the plugin-secrets package scaffold

**Files to create:**
- `packages/plugin-secrets/package.json`
- `packages/plugin-secrets/tsconfig.json`
- `packages/plugin-secrets/src/index.ts`

**package.json:**

```json
{
  "name": "@digests/plugin-secrets",
  "version": "1.0.0",
  "description": "Secret detection plugin for digests — finds hardcoded credentials, API keys, and tokens",
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
import type { DigestPlugin, PluginContext, ScanTarget, ProgressEvent, ScanResult, SecretResult } from 'dependency-digest';
import { DEFAULT_RULES } from './rules.js';
import { scanFiles } from './scanner.js';

const plugin: DigestPlugin = {
  name: 'secrets',

  async detect(dir: string, _context: PluginContext): Promise<ScanTarget[]> {
    // The entire directory is one scan target
    return [{ path: dir, type: 'directory' }];
  },

  async *scan(target: ScanTarget, _context: PluginContext): AsyncGenerator<ProgressEvent, ScanResult[]> {
    yield { phase: 'scan', message: 'scanning for secrets...' };

    let filesScanned = 0;
    const allFindings: SecretFinding[] = [];

    for await (const { file, findings, scannedCount, totalEstimate } of scanFiles(target.path, DEFAULT_RULES)) {
      filesScanned = scannedCount;
      allFindings.push(...findings);
      yield { phase: 'scan', current: scannedCount, total: totalEstimate, message: file };
    }

    return [{
      kind: 'secret',
      findings: allFindings,
      filesScanned,
    } satisfies SecretResult];
  },
};

export default plugin;
export { plugin };
export { DEFAULT_RULES } from './rules.js';
export type { SecretRule } from './rules.js';
```

**Verification:** `npx nx build plugin-secrets` compiles.

---

### Task 2: Define secret detection rules

**Files to create:**
- `packages/plugin-secrets/src/rules.ts`

```typescript
export interface SecretRule {
  id: string;
  name: string;
  severity: 'critical' | 'high' | 'moderate' | 'low';
  /** Regex pattern. Must have one capture group for the secret value. */
  pattern: RegExp;
  /** Entropy threshold (0-1) for captured group. Filters low-entropy false positives. */
  entropyThreshold?: number;
  /** Additional validation function */
  validate?: (match: string) => boolean;
}
```

**Rules to implement (prioritized by real-world frequency):**

**Critical:**
- `aws-access-key-id` — `AKIA[0-9A-Z]{16}`
- `aws-secret-access-key` — AWS secret key patterns
- `github-pat` — `ghp_[0-9a-zA-Z]{36}`, `github_pat_[0-9a-zA-Z]{22}_[0-9a-zA-Z]{59}`
- `github-oauth` — `gho_[0-9a-zA-Z]{36}`
- `github-app-token` — `ghu_[0-9a-zA-Z]{36}`, `ghs_[0-9a-zA-Z]{36}`
- `private-key` — `-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----`
- `google-api-key` — `AIza[0-9A-Za-z\-_]{35}`

**High:**
- `slack-token` — `xox[baprs]-[0-9a-zA-Z-]+`
- `slack-webhook` — `https://hooks.slack.com/services/T[0-9A-Z]+/B[0-9A-Z]+/[0-9a-zA-Z]+`
- `stripe-secret-key` — `sk_live_[0-9a-zA-Z]{24,}`
- `twilio-api-key` — `SK[0-9a-fA-F]{32}`
- `npm-token` — `npm_[0-9a-zA-Z]{36}`
- `pypi-token` — `pypi-[0-9a-zA-Z_-]{100,}`
- `sendgrid-api-key` — `SG\.[0-9a-zA-Z\-_]{22}\.[0-9a-zA-Z\-_]{43}`

**Moderate:**
- `generic-api-key` — `api_key\s*[:=]\s*['"]([^'"]+)['"]` with entropy ≥ 0.5
- `generic-secret` — `secret\s*[:=]\s*['"]([^'"]+)['"]` with entropy ≥ 0.5
- `generic-password` — `password\s*[:=]\s*['"]([^'"]+)['"]` with entropy ≥ 0.5
- `basic-auth-url` — `https?://[^:]+:[^@]+@`
- `jwt` — `eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+`
- `connection-string` — Database connection strings with credentials

Export as `DEFAULT_RULES: SecretRule[]`.

**Verification:** Unit tests — each rule matches expected patterns and rejects non-matches.

---

### Task 3: Entropy analysis utility

**Files to create:**
- `packages/plugin-secrets/src/entropy.ts`

**Shannon entropy calculation:**

```typescript
export function shannonEntropy(str: string): number {
  const freq = new Map<string, number>();
  for (const char of str) {
    freq.set(char, (freq.get(char) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / str.length;
    entropy -= p * Math.log2(p);
  }
  return entropy / 6.57; // Normalize to 0-1
}
```

**Verification:** `shannonEntropy("aaaaaaa")` → low. `shannonEntropy("aB3$kL9#mP2&")` → high.

---

### Task 4: File walker and scan engine

**Files to create:**
- `packages/plugin-secrets/src/scanner.ts`
- `packages/plugin-secrets/src/file-walker.ts`

**Step 1: File walker**

Walk directory tree yielding files:

- **Skip binary files:** Check first 512 bytes for null bytes
- **Skip large files:** Default 1MB limit
- **Skip directories:** `node_modules`, `.git`, `dist`, `build`, `__pycache__`, `.venv`, `vendor`, `target`, `bin`, `obj`
- **Skip by extension:** `.png`, `.jpg`, `.gif`, `.ico`, `.woff`, `.ttf`, `.pdf`, `.zip`, `.tar`, `.gz`, `.exe`, `.dll`, `.so`, `.dylib`
- **Respect `.gitignore`** at root level

**Step 2: Scan engine**

`scanFiles` is an async generator so the plugin can yield progress as files are scanned:

```typescript
export async function* scanFiles(
  dir: string,
  rules: SecretRule[],
): AsyncGenerator<{ file: string; findings: SecretFinding[]; scannedCount: number; totalEstimate: number }> {
  const files = await collectFiles(dir);
  let scannedCount = 0;

  for (const file of files) {
    scannedCount++;
    const content = await readFile(file.path, 'utf-8');
    const findings = scanContent(file.path, content, rules);
    yield { file: file.path, findings, scannedCount, totalEstimate: files.length };
  }
}
```

**Step 3: Redaction**

- Show first 4 and last 4 chars: `AKIAIOSFODNN7EXAMPLE` → `AKIA...MPLE`
- Short secrets (< 12 chars): first 2 only: `abc123` → `ab...`

**Verification:** Integration test — temp directory with test secrets, verify findings.

---

### Task 5: Allowlisting

**Files to create:**
- `packages/plugin-secrets/src/allowlist.ts`

**Support:**
1. **Inline comments:** `// digests:ignore-secret` or `# digests:ignore-secret` on same line
2. **File-level:** `.digests-secret-allowlist` with patterns (one per line)

Parse inline ignores during scanning — check each line before reporting.

**Verification:** Test that allowlisted findings are excluded.

---

### Task 6: Enhance plugin-js with JS-specific secret detection

**Files to modify:**
- `packages/plugin-js/src/index.ts`
- **Files to create:**
- `packages/plugin-js/src/secret-rules.ts`

**This demonstrates the power of the unified interface.** `plugin-js` already knows to look for `.npmrc`, `.env`, and `.yarnrc.yml`. It can return `SecretResult` findings alongside its `DependencyResult`:

```typescript
async *scan(target: ScanTarget, context: PluginContext): AsyncGenerator<ProgressEvent, ScanResult[]> {
  // ... existing dependency scanning ...
  const depResult: DependencyResult = { ... };

  // JS-specific secret scan
  yield { phase: 'secrets', message: 'checking for JS-specific secrets...' };
  const secretFindings = await scanJsSecrets(dirname(target.path));

  const results: ScanResult[] = [depResult];
  if (secretFindings.length > 0) {
    results.push({
      kind: 'secret',
      findings: secretFindings,
      filesScanned: 1,
    });
  }

  return results;
}
```

**JS-specific secret rules:**
- npm tokens in `.npmrc` (`//registry.npmjs.org/:_authToken=...`)
- Credentials in `.env` (only if `.env` is NOT in `.gitignore`)
- Yarn registry tokens in `.yarnrc.yml`

**Verification:** Test that `plugin-js` returns both dependency and secret results.

---

### Task 7: Register plugin and add SARIF output

**Files to modify:**
- `packages/dependency-digest/src/cli.ts`

**Add to KNOWN_PLUGINS:**

```typescript
"@digests/plugin-secrets",
```

**Files to create:**
- `packages/dependency-digest/src/format-sarif.ts`

**SARIF v2.1.0 output** — maps perfectly to secret findings (and IaC findings later):
- `tool.driver.name` = "digests"
- `tool.driver.rules` = rule definitions
- `results` = findings mapped to SARIF result objects

Add `sarif` to the `Format` type union and `FORMAT_EXTENSIONS` in cli.ts.

**Verification:** `dependency-digest --plugins @digests/plugin-secrets` runs and produces findings. SARIF output validates against schema.
