# HTML Viewer Pages Design: Licenses & Dependency Graph

## Routing

Hash-based client-side router (`#/deps`, `#/licenses`, `#/graph`). Implemented as a small custom hook (~30 lines). Tab bar navigation below the header.

## Licenses Page

### Policy Violations Banner
- Red banner at top if `allowedLicenses`/`deniedLicenses` config is present
- Lists each violating dep with name, version, detected license, reason

### Distribution Chart
- Horizontal bar chart (pure CSS, no chart library)
- License counts sorted descending, clickable to scroll to group
- Color-coded: green (allowed), red (denied), neutral (unconfigured)

### Grouped Table
- Collapsible sections per license with count badges
- Package name, version, dev/transitive within each group
- Unknown/null licenses at top with warning style

## Dependency Graph

### Technology
- **Sigma.js** + **Graphology** for WebGL rendering
- **graphology-layout-forceatlas2** in a web worker for layout
- `@react-sigma/core` for React integration

### Graph Construction
- Nodes from `manifests[].dependencies`
- Edges from `manifests[].edges`
- Synthetic workspace root nodes as entry points
- Node color: dev (muted) vs prod (primary), red intensity for vulnerabilities
- Node size: scaled by dependent count

### Layout
- ForceAtlas2 with `barnesHutOptimize: true`, `scalingRatio: 2`
- Pre-compute N iterations before first render
- Runs in web worker to avoid blocking UI

### Interaction
- Zoom/pan (Sigma built-in)
- Hover: highlight node + direct neighbors, dim rest
- Click: sidebar with package details
- Search bar to find/focus nodes
- Filters: dev deps toggle, vulnerable only, subtree isolation

### Performance (3-5k nodes)
- Straight-line edges only
- Labels hidden at low zoom (Sigma label grid)
- No edge labels
- Barnes-Hut optimization for force layout
