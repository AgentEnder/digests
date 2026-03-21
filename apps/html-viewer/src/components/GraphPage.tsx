import { useEffect, useMemo, useState, useCallback } from 'react';
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import {
  SigmaContainer,
  useLoadGraph,
  useRegisterEvents,
  useSigma,
  ControlsContainer,
  ZoomControl,
  FullScreenControl,
} from '@react-sigma/core';
import '@react-sigma/core/lib/style.css';
import type { DependencyMetrics } from '../types.js';
import styles from './GraphPage.module.css';

interface GraphPageProps {
  deps: DependencyMetrics[];
  edges: Record<string, string[]>;
}

type Direction = 'deps' | 'dependents' | 'both';

interface NodeDetail {
  name: string;
  version: string;
  dep: DependencyMetrics | null;
  dependents: string[];
  dependencies: string[];
}

interface SubgraphResult {
  nodes: Set<string>;
  /** Only edges that were traversed during BFS (source→target pairs) */
  traversedEdges: Array<[string, string]>;
}

/** BFS to collect nodes within N hops of a focus node, tracking only traversed edges. */
function collectSubgraph(
  focusKey: string,
  edges: Record<string, string[]>,
  reverseEdges: Map<string, string[]>,
  depth: number,
  direction: Direction,
): SubgraphResult {
  const visited = new Set<string>();
  const traversedEdges: Array<[string, string]> = [];
  const queue: Array<{ key: string; d: number }> = [{ key: focusKey, d: 0 }];
  visited.add(focusKey);

  while (queue.length > 0) {
    const { key, d } = queue.shift()!;
    if (d >= depth) continue;

    if (direction === 'deps' || direction === 'both') {
      for (const dep of edges[key] ?? []) {
        traversedEdges.push([key, dep]);
        if (!visited.has(dep)) {
          visited.add(dep);
          queue.push({ key: dep, d: d + 1 });
        }
      }
    }
    if (direction === 'dependents' || direction === 'both') {
      for (const dep of reverseEdges.get(key) ?? []) {
        traversedEdges.push([dep, key]);
        if (!visited.has(dep)) {
          visited.add(dep);
          queue.push({ key: dep, d: d + 1 });
        }
      }
    }
  }

  return { nodes: visited, traversedEdges };
}

function buildSubgraph(
  focusKey: string,
  nodeKeys: Set<string>,
  traversedEdges: Array<[string, string]>,
  depMap: Map<string, DependencyMetrics>,
  dependentCounts: Map<string, number>,
): Graph {
  const graph = new Graph({ type: 'directed' });

  // Seed positions: focus at center, direct neighbors in a circle, rest random
  const directNeighbors = new Set<string>();
  for (const [source, target] of traversedEdges) {
    if (source === focusKey) directNeighbors.add(target);
    if (target === focusKey) directNeighbors.add(source);
  }

  const neighborArray = Array.from(directNeighbors);
  const radius = Math.max(100, neighborArray.length * 15);

  for (const key of nodeKeys) {
    const dep = depMap.get(key);
    const vulnCount = dep?.vulnerabilities.length ?? 0;
    const inDegree = dependentCounts.get(key) ?? 0;

    let color = '#58a6ff';
    if (dep?.dev) color = '#6e7681';
    if (vulnCount > 0) color = vulnCount >= 3 ? '#f85149' : '#d29922';
    if (key === focusKey) color = '#f0883e';

    const size = key === focusKey ? 18 : Math.min(4 + Math.sqrt(inDegree) * 2, 14);
    const label = dep?.name ?? (key.split('@').slice(0, -1).join('@') || key);

    let x: number, y: number;
    if (key === focusKey) {
      x = 0;
      y = 0;
    } else {
      const neighborIdx = neighborArray.indexOf(key);
      if (neighborIdx >= 0) {
        // Place direct neighbors evenly around a circle
        const angle = (2 * Math.PI * neighborIdx) / neighborArray.length;
        x = Math.cos(angle) * radius;
        y = Math.sin(angle) * radius;
      } else {
        // Deeper nodes: random in a larger ring
        const angle = Math.random() * 2 * Math.PI;
        const dist = radius * 1.5 + Math.random() * radius;
        x = Math.cos(angle) * dist;
        y = Math.sin(angle) * dist;
      }
    }

    graph.addNode(key, { label, size, color, x, y });
  }

  for (const [source, target] of traversedEdges) {
    if (graph.hasNode(source) && graph.hasNode(target) && !graph.hasEdge(source, target)) {
      graph.addEdge(source, target, { size: 0.8, color: '#30363d' });
    }
  }

  return graph;
}

function layoutGraph(graph: Graph): void {
  if (graph.order <= 1) return;

  const n = graph.order;
  // More iterations for small graphs so they settle well
  const iterations = n > 500 ? 200 : n > 100 ? 150 : 120;

  forceAtlas2.assign(graph, {
    iterations,
    settings: {
      barnesHutOptimize: n > 100,
      barnesHutTheta: 0.5,
      // Strong repulsion to spread fan-outs evenly
      scalingRatio: n > 300 ? 10 : n > 50 ? 6 : 4,
      gravity: 0.3,
      adjustSizes: true,
      strongGravityMode: true,
      slowDown: 5,
      edgeWeightInfluence: 0,
    },
  });
}

function GraphEvents({
  onClickNode,
}: {
  onClickNode: (nodeKey: string) => void;
}) {
  const registerEvents = useRegisterEvents();
  const sigma = useSigma();

  useEffect(() => {
    registerEvents({
      clickNode: (event) => {
        onClickNode(event.node);
      },
      enterNode: (event) => {
        const graph = sigma.getGraph();
        const neighbors = new Set(graph.neighbors(event.node));
        neighbors.add(event.node);

        graph.forEachNode((node, attrs) => {
          if (neighbors.has(node)) {
            graph.setNodeAttribute(node, 'highlighted', true);
          } else {
            graph.setNodeAttribute(node, 'originalColor', attrs.originalColor ?? attrs.color);
            graph.setNodeAttribute(node, 'color', '#21262d');
          }
        });
        graph.forEachEdge((edge, _attrs, source, target) => {
          if (neighbors.has(source) && neighbors.has(target)) {
            graph.setEdgeAttribute(edge, 'color', '#58a6ff');
            graph.setEdgeAttribute(edge, 'size', 2);
          } else {
            graph.setEdgeAttribute(edge, 'color', '#161b22');
            graph.setEdgeAttribute(edge, 'size', 0.3);
          }
        });
        sigma.refresh();
      },
      leaveNode: () => {
        const graph = sigma.getGraph();
        graph.forEachNode((node, attrs) => {
          graph.setNodeAttribute(node, 'highlighted', false);
          if (attrs.originalColor) {
            graph.setNodeAttribute(node, 'color', attrs.originalColor);
            graph.removeNodeAttribute(node, 'originalColor');
          }
        });
        graph.forEachEdge((edge) => {
          graph.setEdgeAttribute(edge, 'color', '#30363d');
          graph.setEdgeAttribute(edge, 'size', 0.8);
        });
        sigma.refresh();
      },
    });
  }, [registerEvents, sigma, onClickNode]);

  return null;
}

function GraphLoader({
  graph,
  onReady,
}: {
  graph: Graph;
  onReady: () => void;
}) {
  const loadGraph = useLoadGraph();

  useEffect(() => {
    loadGraph(graph);
    onReady();
  }, [graph, loadGraph, onReady]);

  return null;
}

export function GraphPage({ deps, edges }: GraphPageProps) {
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [focusHistory, setFocusHistory] = useState<Array<string | null>>([]);
  const [depth, setDepth] = useState(2);
  const [direction, setDirection] = useState<Direction>('deps');
  const [showDev, setShowDev] = useState(true);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);

  const depMap = useMemo(() => {
    const map = new Map<string, DependencyMetrics>();
    for (const dep of deps) {
      map.set(`${dep.name}@${dep.version}`, dep);
    }
    return map;
  }, [deps]);

  const allKeys = useMemo(() => Array.from(depMap.keys()).sort(), [depMap]);

  const reverseEdges = useMemo(() => {
    const rev = new Map<string, string[]>();
    for (const [source, targets] of Object.entries(edges)) {
      for (const target of targets) {
        const list = rev.get(target) ?? [];
        list.push(source);
        rev.set(target, list);
      }
    }
    return rev;
  }, [edges]);

  const dependentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const targets of Object.values(edges)) {
      for (const target of targets) {
        counts.set(target, (counts.get(target) ?? 0) + 1);
      }
    }
    return counts;
  }, [edges]);

  // Compute subgraph when focus/depth/direction changes
  const subgraph = useMemo<Graph | null>(() => {
    if (!focusKey) return null;

    const { nodes: nodeKeys, traversedEdges } = collectSubgraph(
      focusKey, edges, reverseEdges, depth, direction,
    );

    // Filter dev deps if needed
    if (!showDev) {
      for (const key of nodeKeys) {
        const dep = depMap.get(key);
        if (dep?.dev && key !== focusKey) nodeKeys.delete(key);
      }
    }

    const graph = buildSubgraph(focusKey, nodeKeys, traversedEdges, depMap, dependentCounts);
    layoutGraph(graph);
    return graph;
  }, [focusKey, depth, direction, showDev, edges, reverseEdges, depMap, dependentCounts]);

  const handleFocus = useCallback((key: string) => {
    setFocusKey((prev) => {
      setFocusHistory((h) => [...h, prev]);
      return key;
    });
    setSelectedNode(key);
    setLoading(true);
  }, []);

  const handleBack = useCallback(() => {
    setFocusHistory((h) => {
      const next = [...h];
      const prev = next.pop();
      if (prev !== undefined) {
        setFocusKey(prev);
        setSelectedNode(prev);
        setLoading(prev !== null);
      }
      return next;
    });
  }, []);

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (!query.trim()) {
        setSearchResults([]);
        return;
      }
      const lower = query.toLowerCase();
      setSearchResults(
        allKeys.filter((k) => k.toLowerCase().includes(lower)).slice(0, 20),
      );
    },
    [allKeys],
  );

  const onReady = useCallback(() => setLoading(false), []);

  const nodeDetail = useMemo<NodeDetail | null>(() => {
    if (!selectedNode) return null;
    const dep = depMap.get(selectedNode) ?? null;
    const parts = selectedNode.split('@');
    const version = parts.pop()!;
    const name = parts.join('@');
    const dependencies = edges[selectedNode] ?? [];
    const dependents = reverseEdges.get(selectedNode) ?? [];
    return { name, version, dep, dependents, dependencies };
  }, [selectedNode, depMap, edges, reverseEdges]);

  // Direct deps (no focus selected) — show a picker
  const directDeps = useMemo(
    () => deps.filter((d) => !d.transitive).sort((a, b) => a.name.localeCompare(b.name)),
    [deps],
  );

  if (!focusKey) {
    return (
      <div className={styles.page}>
        <div className={styles.picker}>
          <h2 className={styles.pickerTitle}>Explore Dependency Graph</h2>
          <p className={styles.pickerHint}>
            Select a package to explore its dependency tree. You can control the
            depth and direction of traversal.
          </p>
          <input
            type="text"
            className={styles.pickerSearch}
            placeholder="Search packages..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            autoFocus
          />
          <div className={styles.pickerList}>
            {(searchQuery ? searchResults : directDeps.map((d) => `${d.name}@${d.version}`)).map(
              (key) => {
                const dep = depMap.get(key);
                return (
                  <button
                    key={key}
                    className={styles.pickerItem}
                    onClick={() => handleFocus(key)}
                  >
                    <span className={styles.pickerName}>{dep?.name ?? key}</span>
                    <span className={styles.pickerVersion}>{dep?.version}</span>
                    {dep?.vulnerabilities && dep.vulnerabilities.length > 0 && (
                      <span className={styles.pickerVuln}>
                        {dep.vulnerabilities.length} CVE
                      </span>
                    )}
                  </button>
                );
              },
            )}
            {!searchQuery && (
              <p className={styles.pickerFooter}>
                Showing {directDeps.length} direct dependencies. Search to find any package.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <button
          className={styles.backButton}
          onClick={handleBack}
          disabled={focusHistory.length === 0}
          title="Go back"
        >
          ←
        </button>
        <span className={styles.focusLabel}>
          <strong>{depMap.get(focusKey)?.name ?? focusKey}</strong>
        </span>

        <label className={styles.control}>
          Depth:
          <input
            type="range"
            min={1}
            max={5}
            value={depth}
            onChange={(e) => {
              setDepth(Number(e.target.value));
              setLoading(true);
            }}
            className={styles.slider}
          />
          <span className={styles.depthValue}>{depth}</span>
        </label>

        <select
          className={styles.select}
          value={direction}
          onChange={(e) => {
            setDirection(e.target.value as Direction);
            setLoading(true);
          }}
        >
          <option value="deps">Dependencies →</option>
          <option value="dependents">← Dependents</option>
          <option value="both">↔ Both</option>
        </select>

        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={showDev}
            onChange={(e) => {
              setShowDev(e.target.checked);
              setLoading(true);
            }}
          />
          Dev
        </label>

        {subgraph && (
          <span className={styles.stats}>
            {subgraph.order} nodes / {subgraph.size} edges
          </span>
        )}

        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={styles.dot} style={{ background: '#f0883e' }} /> Focus
          </span>
          <span className={styles.legendItem}>
            <span className={styles.dot} style={{ background: '#58a6ff' }} /> Prod
          </span>
          <span className={styles.legendItem}>
            <span className={styles.dot} style={{ background: '#6e7681' }} /> Dev
          </span>
          <span className={styles.legendItem}>
            <span className={styles.dot} style={{ background: '#d29922' }} /> Vuln
          </span>
        </div>
      </div>

      <div className={styles.container}>
        {loading && (
          <div className={styles.loadingOverlay}>Computing layout...</div>
        )}
        <div className={styles.graphWrapper}>
          {subgraph && (
            <SigmaContainer
              style={{ width: '100%', height: '100%' }}
              settings={{
                renderLabels: true,
                labelRenderedSizeThreshold: 4,
                labelDensity: 0.3,
                labelGridCellSize: 80,
                defaultEdgeType: 'arrow',
                enableEdgeEvents: false,
                zIndex: true,
              }}
            >
              <GraphLoader graph={subgraph} onReady={onReady} />
              <GraphEvents onClickNode={handleFocus} />
              <ControlsContainer position="bottom-right">
                <ZoomControl />
                <FullScreenControl />
              </ControlsContainer>
            </SigmaContainer>
          )}
        </div>

        {nodeDetail && (
          <div className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
              <h3 className={styles.sidebarTitle}>{nodeDetail.name}</h3>
              <button
                className={styles.closeButton}
                onClick={() => setSelectedNode(null)}
              >
                ✕
              </button>
            </div>
            <code className={styles.version}>{nodeDetail.version}</code>

            {nodeDetail.dep && (
              <div className={styles.sidebarContent}>
                {nodeDetail.dep.description && (
                  <p className={styles.description}>{nodeDetail.dep.description}</p>
                )}
                <dl className={styles.dl}>
                  <dt>License</dt>
                  <dd>{nodeDetail.dep.license ?? 'Unknown'}</dd>
                  <dt>Ecosystem</dt>
                  <dd>{nodeDetail.dep.ecosystem}</dd>
                  <dt>Type</dt>
                  <dd>
                    {nodeDetail.dep.dev ? 'Dev' : 'Prod'}
                    {nodeDetail.dep.transitive ? ', Transitive' : ', Direct'}
                  </dd>
                  {nodeDetail.dep.repoUrl && (
                    <>
                      <dt>Repo</dt>
                      <dd>
                        <a href={nodeDetail.dep.repoUrl} target="_blank" rel="noopener noreferrer">
                          {nodeDetail.dep.repoUrl.replace(/^https?:\/\//, '')}
                        </a>
                      </dd>
                    </>
                  )}
                </dl>

                {nodeDetail.dep.vulnerabilities.length > 0 && (
                  <>
                    <h4 className={styles.subheading}>Vulnerabilities</h4>
                    <ul className={styles.vulnList}>
                      {nodeDetail.dep.vulnerabilities.map((v) => (
                        <li key={v.id} className={styles.vulnItem}>
                          <span className={`${styles.severity} ${styles[v.severity]}`}>
                            {v.severity}
                          </span>
                          {v.url ? (
                            <a href={v.url} target="_blank" rel="noopener noreferrer">
                              {v.id}
                            </a>
                          ) : (
                            v.id
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}

            {nodeDetail.dependents.length > 0 && (
              <>
                <h4 className={styles.subheading}>
                  Depended on by ({nodeDetail.dependents.length})
                </h4>
                <ul className={styles.depList}>
                  {nodeDetail.dependents.slice(0, 30).map((d) => (
                    <li key={d}>
                      <button
                        className={styles.depLink}
                        onClick={() => handleFocus(d)}
                      >
                        {d}
                      </button>
                    </li>
                  ))}
                  {nodeDetail.dependents.length > 30 && (
                    <li className={styles.muted}>
                      ...and {nodeDetail.dependents.length - 30} more
                    </li>
                  )}
                </ul>
              </>
            )}

            {nodeDetail.dependencies.length > 0 && (
              <>
                <h4 className={styles.subheading}>
                  Depends on ({nodeDetail.dependencies.length})
                </h4>
                <ul className={styles.depList}>
                  {nodeDetail.dependencies.slice(0, 30).map((d) => (
                    <li key={d}>
                      <button
                        className={styles.depLink}
                        onClick={() => handleFocus(d)}
                      >
                        {d}
                      </button>
                    </li>
                  ))}
                  {nodeDetail.dependencies.length > 30 && (
                    <li className={styles.muted}>
                      ...and {nodeDetail.dependencies.length - 30} more
                    </li>
                  )}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
