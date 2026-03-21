# @digests/plugin-rust

Rust/Cargo ecosystem plugin for [dependency-digest](../dependency-digest).

## Usage

```bash
npx dependency-digest --plugin @digests/plugin-rust
```

## Requirements

- `cargo` must be available on `PATH` (ships with any Rust installation)

## How It Works

This plugin uses `cargo metadata --format-version 1` to extract the full dependency graph from a Cargo workspace or project. It then enriches each crate with:

- **crates.io** metadata (license, author, description, versions, downloads)
- **GitHub** activity metrics (commits, issues, PRs)
- **OSV.dev** vulnerability data
