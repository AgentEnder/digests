# IaC Misconfiguration Scanner — Plugin-Based

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Prerequisite:** The unified plugin interface refactor (`.ai/plans/2026-03-24-unified-plugin-interface.md`) must be completed first.

**Goal:** Add Infrastructure-as-Code misconfiguration detection as a plugin. Supports Dockerfiles, Kubernetes manifests, Terraform HCL, and CloudFormation templates.

**Architecture:** `@digests/plugin-iac` implements `DigestPlugin`. Its `detect()` finds IaC files, and `scan()` evaluates rules against parsed documents. Each IaC file type has a "checker" module with type-specific rules.

**Tech Stack:** TypeScript (NodeNext ESM), Vitest

---

### Task 1: Scaffold plugin-iac package

**Files to create:**
- `packages/plugin-iac/package.json`
- `packages/plugin-iac/tsconfig.json`
- `packages/plugin-iac/src/index.ts`

**package.json:**

```json
{
  "name": "@digests/plugin-iac",
  "version": "1.0.0",
  "description": "IaC misconfiguration plugin for digests — Dockerfile, Kubernetes, Terraform, CloudFormation",
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
    "tslib": "catalog:",
    "yaml": "^2.7.0"
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
import type { DigestPlugin, PluginContext, ScanTarget, ProgressEvent, ScanResult, IaCResult } from 'dependency-digest';
import { detectIaCFiles } from './detect.js';
import { checkFile } from './checker.js';

const plugin: DigestPlugin = {
  name: 'iac',

  async detect(dir: string, _context: PluginContext): Promise<ScanTarget[]> {
    return detectIaCFiles(dir);
  },

  async *scan(target: ScanTarget, _context: PluginContext): AsyncGenerator<ProgressEvent, ScanResult[]> {
    yield { phase: 'check', message: target.type };
    const findings = await checkFile(target);

    return [{
      kind: 'iac',
      findings,
      filesScanned: 1,
    } satisfies IaCResult];
  },
};

export default plugin;
export { plugin };
```

**Note:** Unlike dependency plugins that return one target per manifest, the IaC plugin returns **one ScanTarget per IaC file** found. This means `scan()` is called once per file, and the scanner orchestrator handles parallelism.

**Verification:** `npx nx build plugin-iac` compiles.

---

### Task 2: IaC file detection

**Files to create:**
- `packages/plugin-iac/src/detect.ts`

**Walk the directory tree and find IaC files:**

```typescript
import type { ScanTarget } from 'dependency-digest';

export async function detectIaCFiles(dir: string): Promise<ScanTarget[]> {
  const targets: ScanTarget[] = [];

  for await (const file of walkDir(dir)) {
    const type = classifyFile(file);
    if (type) targets.push({ path: file, type });
  }

  return targets;
}
```

**Classification rules:**

| Pattern | Type | Notes |
|---------|------|-------|
| `Dockerfile`, `Dockerfile.*`, `*.dockerfile` | `dockerfile` | |
| `*.tf` | `terraform` | |
| `*.yaml`, `*.yml` | Check content | Could be K8s or CloudFormation |

For YAML files, read first 50 lines to classify:
- Has `apiVersion` + `kind` → `kubernetes`
- Has `AWSTemplateFormatVersion` or `Resources` with `AWS::` types → `cloudformation`
- Otherwise skip

**Skip directories:** `node_modules`, `.git`, `dist`, `build`, `vendor`, `target`, `.terraform`

**Verification:** Unit test with a directory tree containing mixed IaC files.

---

### Task 3: Checker dispatch and shared types

**Files to create:**
- `packages/plugin-iac/src/checker.ts`
- `packages/plugin-iac/src/types.ts`

**Internal checker interface:**

```typescript
// types.ts
import type { IaCFinding } from 'dependency-digest';

export interface IaCRule {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'moderate' | 'low';
  remediation: string;
  url?: string;
}

export type CheckerFn = (filePath: string, content: string) => Promise<IaCFinding[]>;
```

**Dispatcher:**

```typescript
// checker.ts
import type { ScanTarget } from 'dependency-digest';
import { checkDockerfile } from './checkers/dockerfile.js';
import { checkKubernetes } from './checkers/kubernetes.js';
import { checkTerraform } from './checkers/terraform.js';
import { checkCloudFormation } from './checkers/cloudformation.js';

export async function checkFile(target: ScanTarget): Promise<IaCFinding[]> {
  const content = await readFile(target.path, 'utf-8');
  switch (target.type) {
    case 'dockerfile':      return checkDockerfile(target.path, content);
    case 'kubernetes':       return checkKubernetes(target.path, content);
    case 'terraform':        return checkTerraform(target.path, content);
    case 'cloudformation':   return checkCloudFormation(target.path, content);
    default: return [];
  }
}
```

---

### Task 4: Dockerfile checker

**Files to create:**
- `packages/plugin-iac/src/checkers/dockerfile.ts`

**Parse into instructions:** Line-by-line regex for `INSTRUCTION args` with continuation handling (`\`).

**Rules:**

| Rule ID | Severity | Check |
|---------|----------|-------|
| `dockerfile-user-root` | High | No `USER` instruction or last `USER` is `root`/`0` |
| `dockerfile-latest-tag` | Moderate | `FROM image:latest` or `FROM image` (no tag) |
| `dockerfile-add-instead-of-copy` | Low | `ADD` for local files instead of `COPY` |
| `dockerfile-expose-ssh` | High | `EXPOSE 22` |
| `dockerfile-sudo` | High | `RUN` uses `sudo` |
| `dockerfile-curl-pipe-sh` | Moderate | `RUN curl ... \| sh` or `wget ... \| sh` |
| `dockerfile-secrets-in-env` | Critical | `ENV` with `*PASSWORD*`, `*SECRET*`, `*TOKEN*`, `*KEY*` |
| `dockerfile-healthcheck-missing` | Low | No `HEALTHCHECK` instruction |

**Verification:** Unit tests with secure + insecure fixture Dockerfiles.

---

### Task 5: Kubernetes checker

**Files to create:**
- `packages/plugin-iac/src/checkers/kubernetes.ts`

**Parse with `yaml` package.** Handle multi-document YAML (`---` separators).

**Navigate to pod specs** — handle Deployment, StatefulSet, DaemonSet, Job, CronJob, Pod. Extract containers from `spec.template.spec.containers` and `initContainers`.

**Rules:**

| Rule ID | Severity | Check |
|---------|----------|-------|
| `k8s-privileged-container` | Critical | `securityContext.privileged: true` |
| `k8s-capabilities-all` | Critical | `capabilities.add` includes `ALL` or `SYS_ADMIN` |
| `k8s-run-as-root` | High | `runAsNonRoot` not `true`, or `runAsUser: 0` |
| `k8s-host-network` | High | `hostNetwork: true` |
| `k8s-host-pid` | High | `hostPID: true` |
| `k8s-no-resource-limits` | Moderate | Missing `resources.limits` |
| `k8s-latest-image` | Moderate | Image has no tag or uses `:latest` |
| `k8s-no-security-context` | Moderate | No `securityContext` at pod/container level |
| `k8s-writable-root-fs` | Moderate | `readOnlyRootFilesystem` not `true` |
| `k8s-default-namespace` | Low | Resource in `default` namespace |
| `k8s-no-readiness-probe` | Low | No `readinessProbe` |

**Verification:** Unit tests with secure + insecure K8s manifests.

---

### Task 6: CloudFormation checker

**Files to create:**
- `packages/plugin-iac/src/checkers/cloudformation.ts`

**Parse JSON or YAML.** Iterate `Resources` map, match `Type` to checks.

**Rules:**

| Rule ID | Severity | Check |
|---------|----------|-------|
| `cfn-s3-public-access` | Critical | S3 without `PublicAccessBlockConfiguration` or public ACL |
| `cfn-sg-open-ingress` | Critical | Security group with `0.0.0.0/0` on sensitive ports |
| `cfn-rds-public` | Critical | RDS with `PubliclyAccessible: true` |
| `cfn-s3-no-encryption` | High | S3 without `BucketEncryption` |
| `cfn-rds-no-encryption` | High | RDS without `StorageEncrypted: true` |
| `cfn-iam-wildcard` | High | IAM policy with `Action: *` or `Resource: *` |
| `cfn-ebs-no-encryption` | Moderate | EBS without `Encrypted: true` |

**Verification:** Unit tests with fixture CloudFormation templates.

---

### Task 7: Terraform checker

**Files to create:**
- `packages/plugin-iac/src/checkers/terraform.ts`
- `packages/plugin-iac/src/parsers/hcl-lite.ts`

**HCL-lite parser** — no full HCL AST. Extract:
- Block types and labels: `resource "aws_s3_bucket" "my_bucket" { ... }`
- Key-value pairs within blocks
- Nested blocks

Returns `HCLBlock { type, labels, attributes, children }` tree.

**Rules:**

| Rule ID | Severity | Check |
|---------|----------|-------|
| `tf-s3-public-acl` | Critical | `acl = "public-read"` or `"public-read-write"` |
| `tf-sg-open-ingress` | Critical | Ingress with `cidr_blocks = ["0.0.0.0/0"]` |
| `tf-rds-public` | Critical | `publicly_accessible = true` |
| `tf-s3-no-encryption` | High | Missing `server_side_encryption_configuration` |
| `tf-rds-no-encryption` | High | Missing `storage_encrypted = true` |
| `tf-iam-wildcard` | High | `actions = ["*"]` or `resources = ["*"]` |
| `tf-s3-no-versioning` | Moderate | Missing `versioning { enabled = true }` |
| `tf-ec2-imdsv2` | Moderate | Missing `metadata_options { http_tokens = "required" }` |

**Verification:** Unit tests with fixture `.tf` files.

---

### Task 8: Register plugin and integrate

**Files to modify:**
- `packages/dependency-digest/src/cli.ts`
- `packages/dependency-digest/src/formatter.ts`

**Add to KNOWN_PLUGINS:**

```typescript
"@digests/plugin-iac",
```

**Update markdown formatter** to include IaC section:

```typescript
const iacResults = digest.results.filter((r): r is IaCResult => r.kind === 'iac');
if (iacResults.length > 0) {
  // Group findings by iacType, render table per type
}
```

**SARIF output** (from secret scanning plan) also handles IaC findings — same structure.

**Verification:** `dependency-digest --plugins @digests/plugin-iac` scans and reports. Runs alongside dependency plugins with `dependency-digest` (default plugins).

---

### Task 9: Tests and fixtures

**Files to create:**
- `packages/plugin-iac/src/__tests__/dockerfile.test.ts`
- `packages/plugin-iac/src/__tests__/kubernetes.test.ts`
- `packages/plugin-iac/src/__tests__/cloudformation.test.ts`
- `packages/plugin-iac/src/__tests__/terraform.test.ts`
- `packages/plugin-iac/src/__tests__/fixtures/`

**Per checker:** Two fixtures — secure (zero findings) and insecure (triggers every rule). Test each rule independently.

**Verification:** `npx nx test plugin-iac` — all green.
