---
title: Getting Started
description: Quick start guide for using digests
nav:
  section: Getting Started
  order: 1
---

# Getting Started

## Installation

```bash
npm install -g dependency-digest
```

## Quick Start

Run a scan on your project:

```bash
dependency-digest
```

This will scan your project directory, detect dependency manifests, and generate a Markdown report.

## Output Options

Generate different output formats:

```bash
# Markdown report (default)
dependency-digest -f md

# JSON output
dependency-digest -f json

# Interactive HTML viewer
dependency-digest -f html

# CycloneDX SBOM
dependency-digest -f cyclonedx

# SPDX document
dependency-digest -f spdx
```

## Configuration

Create a `digest.config.json` in your project root to configure license policies, ignored packages, and more.
