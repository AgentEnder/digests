# Digests Monorepo

## Project Structure

- `packages/` - All publishable packages
- `.ai/plans/` - Implementation plans and design documents

## Conventions

- Package manager: pnpm 9.12.2
- Build: Nx 22.5.0 with `@nx/js/typescript` plugin
- TypeScript: strict mode, NodeNext module resolution
- Testing: Vitest
- All packages are ESM (`"type": "module"`)
- Use `catalog:` for shared dev dependency versions (defined in pnpm-workspace.yaml)
- Use `workspace:*` for internal package dependencies

## Commands

- Build all: `npx nx run-many -t build`
- Test all: `npx nx run-many -t test`
- Build one: `npx nx build <project>`
- Test one: `npx nx test <project>`
- Lint one: `npx nx lint <project>`
