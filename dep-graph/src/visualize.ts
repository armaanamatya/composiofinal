import type { Graph } from "./buildGraph.ts";
import { writeFile } from "fs/promises";

const SERVICE_COLORS: Record<string, string> = {
  // Google Super
  gmail: "#EA4335",
  gcalendar: "#4285F4",
  gdrive: "#34A853",
  gcontact: "#FBBC05",
  gsheets: "#0F9D58",
  gdocs: "#4285F4",
  gslides: "#FF6D00",
  gmeet: "#00897B",
  gtask: "#8E24AA",
  googledrive: "#34A853",
  googlecalendar: "#4285F4",
  googlecontact: "#FBBC05",
  // GitHub
  github_repos: "#F05032",
  github_issues: "#CB2431",
  github_pulls: "#6F42C1",
  github_actions: "#2088FF",
  github_commits: "#E36209",
  github_teams: "#0366D6",
  github_orgs: "#24292E",
  github_gists: "#0075CA",
  github_search: "#28A745",
  github_releases: "#6F42C1",
  github_branches: "#E36209",
  github_checks: "#2188FF",
  github_notifications: "#D73A49",
  github_projects: "#0075CA",
  github: "#24292E",
};

function getColor(group: string): string {
  // Try exact match first
  if (SERVICE_COLORS[group]) return SERVICE_COLORS[group]!;
  // Try prefix match
  for (const [key, color] of Object.entries(SERVICE_COLORS)) {
    if (group.startsWith(key)) return color;
  }
  return "#999999";
}

export async function generateHTML(graph: Graph): Promise<void> {
  const serviceGroups = [...new Set(graph.nodes.map((n) => n.group))].sort();

  // Compute per-node degree
  const inDeg = new Map<string, number>();
  const outDeg = new Map<string, number>();
  for (const n of graph.nodes) { inDeg.set(n.id, 0); outDeg.set(n.id, 0); }
  for (const e of graph.edges) {
    outDeg.set(e.from, (outDeg.get(e.from) ?? 0) + 1);
    inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
  }

  function nodeSize(degree: number): number {
    if (degree === 0) return 6;
    return Math.round(Math.min(40, 9 + Math.sqrt(degree) * 7));
  }

  const nodesData = graph.nodes.map((n) => {
    const deg = (inDeg.get(n.id) ?? 0) + (outDeg.get(n.id) ?? 0);
    const sz = nodeSize(deg);
    const showLabel = deg >= 3;
    const col = getColor(n.group);
    return {
      id: n.id,
      label: showLabel ? (n.label.length > 28 ? n.label.slice(0, 26) + "…" : n.label) : "",
      title: `${n.id}\n${deg} connections`,
      group: n.group,
      degree: deg,
      color: { background: col, border: deg === 0 ? "#333" : "#fff", highlight: { background: col, border: "#FFD700" } },
      font: { color: "#fff", size: Math.min(13, 9 + Math.floor(deg / 5)), bold: deg >= 10 },
      shape: "dot",
      size: sz,
      borderWidth: deg === 0 ? 0 : 1,
    };
  });

  const edgesData = graph.edges.map((e, i) => ({
    id: `e${i}`,
    from: e.from,
    to: e.to,
    label: e.label,
    title: e.reason,
    arrows: "to",
    font: { size: 9, align: "middle" },
    color: { color: "#aaa", highlight: "#333" },
  }));

  const checkboxes = serviceGroups.map((g) => {
    const color = getColor(g);
    return `<label class="filter-label">
      <input type="checkbox" class="group-filter" data-group="${g}" checked>
      <span class="dot" style="background:${color}"></span>${g}
    </label>`;
  }).join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Composio Tool Dependency Graph</title>
<script src="https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f1117; color: #e1e4e8; height: 100vh; display: flex; flex-direction: column; }
  header { background: #161b22; border-bottom: 1px solid #30363d; padding: 10px 20px; display: flex; align-items: center; gap: 16px; flex-shrink: 0; position: relative; }
  header h1 { font-size: 16px; font-weight: 600; color: #f0f6fc; white-space: nowrap; }
  .stats { font-size: 12px; color: #8b949e; white-space: nowrap; }
  #nav-search-wrap { position: absolute; left: 50%; transform: translateX(-50%); width: 380px; z-index: 100; }
  #nav-search { width: 100%; background: transparent; border: none; border-bottom: 1.5px solid #444d56; border-radius: 0; padding: 5px 10px; color: #e1e4e8; font-size: 13px; outline: none; transition: border-color 0.2s; }
  #nav-search::placeholder { color: #555d65; }
  #nav-search:focus { border-bottom-color: #58a6ff; }
  #search-dropdown { display: none; position: absolute; top: 100%; left: 0; right: 0; background: #1c2028; border: 1px solid #30363d; border-top: none; border-radius: 0 0 6px 6px; max-height: 280px; overflow-y: auto; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
  .search-item { padding: 7px 12px; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #21262d; }
  .search-item:last-child { border-bottom: none; }
  .search-item:hover, .search-item.active { background: #21262d; }
  .search-item-name { color: #e1e4e8; flex: 1; font-family: monospace; font-size: 11px; }
  .search-item-name mark { background: none; color: #58a6ff; font-weight: 700; }
  .search-item-group { font-size: 10px; color: #8b949e; white-space: nowrap; }
  .search-item-deg { font-size: 10px; color: #3fb950; white-space: nowrap; }
  #search-count { padding: 4px 12px; font-size: 10px; color: #8b949e; border-top: 1px solid #21262d; text-align: center; }
  .main { display: flex; flex: 1; overflow: hidden; }
  #graph { flex: 1; background: #0d1117; }
  .sidebar { width: 400px; background: #161b22; border-left: 1px solid #30363d; display: flex; flex-direction: column; overflow: hidden; flex-shrink: 0; }
  .filters { padding: 10px 14px; border-bottom: 1px solid #30363d; overflow-y: auto; max-height: 180px; }
  .filters h3 { font-size: 10px; text-transform: uppercase; color: #8b949e; letter-spacing: 0.05em; margin-bottom: 6px; }
  .filter-label { display: flex; align-items: center; gap: 5px; font-size: 11px; cursor: pointer; padding: 1px 0; color: #c9d1d9; }
  .filter-label:hover { color: #f0f6fc; }
  .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .filter-actions { display: flex; gap: 6px; margin-top: 6px; }
  .btn-sm { font-size: 11px; padding: 3px 8px; background: #21262d; border: 1px solid #30363d; color: #c9d1d9; border-radius: 4px; cursor: pointer; }
  .btn-sm:hover { background: #30363d; }
  .tool-detail { flex: 1; overflow-y: auto; padding: 14px 16px; }
  .tool-name { font-size: 12px; font-weight: 700; color: #f0f6fc; margin-bottom: 3px; word-break: break-all; font-family: monospace; }
  .tool-badge { display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }
  .badge { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 10px; font-weight: 600; }
  .badge-group { background: #21262d; color: #8b949e; border: 1px solid #30363d; }
  .badge-toolkit { background: #0d419d22; color: #58a6ff; border: 1px solid #1f6feb55; }
  .badge-deg { background: #1a3a1a; color: #3fb950; border: 1px solid #2ea04355; }
  .tool-desc { font-size: 12px; color: #8b949e; line-height: 1.5; margin-bottom: 10px; }
  .section-title { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 5px; margin-top: 14px; font-weight: 700; }
  .param { display: flex; align-items: baseline; gap: 6px; padding: 5px 0; border-bottom: 1px solid #21262d; font-size: 11px; }
  .param:last-child { border-bottom: none; }
  .param-name { font-weight: 600; color: #79c0ff; white-space: nowrap; }
  .param-type { color: #ff7b72; font-size: 10px; white-space: nowrap; }
  .param-desc { color: #8b949e; font-size: 10px; }
  .edge-list { display: flex; flex-direction: column; gap: 3px; }
  .edge-item { display: flex; align-items: center; gap: 6px; padding: 5px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; }
  .edge-item:hover { background: #21262d; }
  .edge-item:hover .edge-tool { text-decoration: underline; }
  .edge-tool { font-family: monospace; font-size: 10px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .edge-param { font-size: 10px; padding: 1px 5px; border-radius: 3px; white-space: nowrap; font-weight: 600; }
  .edge-up .edge-tool { color: #FF9944; }
  .edge-up .edge-param { background: #2a1800; color: #FF8C00; }
  .edge-down .edge-tool { color: #33CCFF; }
  .edge-down .edge-param { background: #001a2a; color: #00BFFF; }
  .placeholder { color: #555d65; font-size: 12px; line-height: 1.8; text-align: center; padding: 40px 20px; }
  .legend-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
  .layout-controls { padding: 8px 16px; border-bottom: 1px solid #30363d; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .layout-controls label { font-size: 11px; color: #8b949e; }
  select { background: #21262d; border: 1px solid #30363d; color: #c9d1d9; font-size: 11px; padding: 3px 6px; border-radius: 4px; }
  .degree-controls { padding: 10px 16px; border-bottom: 1px solid #30363d; }
  .degree-controls h3 { font-size: 11px; text-transform: uppercase; color: #8b949e; letter-spacing: 0.05em; margin-bottom: 8px; }
  .degree-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .degree-row label { font-size: 11px; color: #c9d1d9; flex: 1; }
  #degree-val { font-size: 11px; color: #58a6ff; font-weight: 600; min-width: 16px; text-align: right; }
  input[type=range] { flex: 1; accent-color: #58a6ff; }
  .degree-stats { font-size: 10px; color: #8b949e; margin-top: 4px; }
  #isolated-toggle { accent-color: #58a6ff; }
</style>
</head>
<body>
<header>
  <h1>Composio Tool Dependency Graph</h1>
  <div class="stats">
    ${graph.nodes.length} tools &bull; ${graph.edges.length} edges &bull; ${graph.metadata.toolkits.join(", ")}
  </div>
  <div id="nav-search-wrap">
    <input type="text" id="nav-search" placeholder="Search tools…" autocomplete="off" spellcheck="false" />
    <div id="search-dropdown">
      <div id="search-count"></div>
    </div>
  </div>
</header>
<div class="main">
  <div id="graph"></div>
  <div class="sidebar">
    <div class="filters">
      <h3>Filter by Service</h3>
      ${checkboxes}
      <div class="filter-actions">
        <button class="btn-sm" onclick="toggleAll(true)">All</button>
        <button class="btn-sm" onclick="toggleAll(false)">None</button>
      </div>
    </div>
    <div class="degree-controls">
      <h3>Connectivity Filter</h3>
      <div class="degree-row">
        <label>Min connections</label>
        <input type="range" id="degree-slider" min="0" max="15" value="1" step="1" oninput="onDegreeChange(this.value)">
        <span id="degree-val">1</span>
      </div>
      <div class="degree-row">
        <label for="isolated-toggle" style="cursor:pointer">Show isolated nodes (0 edges)</label>
        <input type="checkbox" id="isolated-toggle" onchange="applyFilters()">
      </div>
      <div class="degree-stats" id="degree-stats"></div>
    </div>
    <div class="layout-controls">
      <label>Layout:</label>
      <select id="layout-select" onchange="changeLayout(this.value)">
        <option value="barnesHut">Force-directed</option>
        <option value="hierarchical">Hierarchical</option>
        <option value="repulsion">Repulsion</option>
      </select>
      <button class="btn-sm" id="phys-btn" onclick="togglePhysics()">Stabilizing…</button>
    </div>
    <div class="tool-detail" id="tool-detail"></div>
  </div>
</div>

<script>
const ALL_NODES = ${JSON.stringify(nodesData)};
const ALL_EDGES = ${JSON.stringify(edgesData)};
const EDGE_MAP = ${JSON.stringify(graph.edges)};
const TOOL_META = ${JSON.stringify(Object.fromEntries(graph.nodes.map((n) => [n.id, n])))};

// Per-node degree and original appearance
const DEGREE = {};
const ORIG_COLOR = {};
const ORIG_SIZE = {};
ALL_NODES.forEach(n => {
  DEGREE[n.id] = n.degree;
  ORIG_COLOR[n.id] = n.color;
  ORIG_SIZE[n.id] = n.size;
});

// Start with isolated nodes hidden (min degree = 1)
let minDegree = 1;
const startNodes = ALL_NODES.filter(n => n.degree >= 1);
const startIds = new Set(startNodes.map(n => n.id));

const nodesDS = new vis.DataSet(startNodes);
const edgesDS = new vis.DataSet(ALL_EDGES.filter(e => startIds.has(e.from) && startIds.has(e.to)));

const container = document.getElementById('graph');
const network = new vis.Network(container, { nodes: nodesDS, edges: edgesDS }, {
  physics: {
    enabled: true,
    barnesHut: { gravitationalConstant: -5000, springLength: 100, springConstant: 0.05, damping: 0.18 },
    stabilization: { enabled: true, iterations: 150, updateInterval: 25, fit: true },
  },
  interaction: { tooltipDelay: 200, hover: false, multiselect: false,
    hideEdgesOnDrag: true, hideNodesOnDrag: false, zoomSpeed: 0.8 },
  layout: { randomSeed: 42, improvedLayout: false },
  edges: { smooth: false, scaling: { min: 1, max: 1 } },
  rendering: { hideEdgesOnDrag: true },
});

let physicsOn = true;

// Freeze physics once stable — massive rendering speed boost
network.once('stabilized', () => {
  network.setOptions({ physics: { enabled: false } });
  physicsOn = false;
  document.getElementById('phys-btn').textContent = '▶ Unfreeze';
  // Cache initial layout positions for restore on deselect
  savedPositions = network.getPositions();
});

// ── BFS helpers ──────────────────────────────────────────────────────────────

// Build adjacency maps once
const FWD = {};  // id → Set of ids it enables (outgoing)
const BWD = {};  // id → Set of ids it depends on (incoming)
ALL_NODES.forEach(n => { FWD[n.id] = new Set(); BWD[n.id] = new Set(); });
ALL_EDGES.forEach(e => { FWD[e.from]?.add(e.to); BWD[e.to]?.add(e.from); });

function bfs(startId, adjFn) {
  const visited = new Set();
  const queue = [startId];
  while (queue.length) {
    const cur = queue.shift();
    for (const nb of (adjFn(cur) || [])) {
      if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
    }
  }
  return visited;
}

// ── Selection state ───────────────────────────────────────────────────────────
let selectedId = null;
let savedPositions = {};

network.on('click', function(params) {
  if (params.nodes.length > 0) {
    const id = params.nodes[0];
    if (id === selectedId) { deselect(); return; }
    selectNode(id);
  } else {
    deselect();
  }
});

function selectNode(id) {
  // Save positions of all currently visible nodes before replacing
  if (!selectedId) {
    savedPositions = network.getPositions();
  }
  selectedId = id;
  showToolDetail(id);

  const ancestors   = bfs(id, cur => BWD[cur]);  // must run BEFORE
  const descendants = bfs(id, cur => FWD[cur]);  // this ENABLES
  const subgraphIds = new Set([id, ...ancestors, ...descendants]);

  // ── Keep ONLY subgraph nodes in the dataset ──
  const subNodes = ALL_NODES
    .filter(n => subgraphIds.has(n.id))
    .map(n => {
      const base = Math.max(ORIG_SIZE[n.id] || 9, 12);
      if (n.id === id) {
        return { ...n,
          color: { background: '#FFD700', border: '#ffffff', highlight: { background: '#FFE55C', border: '#ffffff' } },
          borderWidth: 3,
          shadow: { enabled: true, color: 'rgba(255,215,0,0.6)', size: 20, x: 0, y: 0 },
          font: { color: '#000000', size: 14, bold: true },
          size: Math.max(base, 22),
          label: n.id.length > 30 ? n.id.slice(0, 28) + '…' : n.id,
        };
      } else if (ancestors.has(n.id)) {
        return { ...n,
          color: { background: '#E8680A', border: '#FFB347', highlight: { background: '#FF9933', border: '#FFD700' } },
          borderWidth: 2, shadow: { enabled: false },
          font: { color: '#ffffff', size: 11, bold: false },
          size: Math.max(base, 12),
          label: n.label || (DEGREE[n.id] >= 2 ? (n.id.length > 26 ? n.id.slice(0,24)+'…' : n.id) : ''),
        };
      } else {
        // descendant
        return { ...n,
          color: { background: '#0096CC', border: '#33DDFF', highlight: { background: '#00BFFF', border: '#66EEFF' } },
          borderWidth: 2, shadow: { enabled: false },
          font: { color: '#ffffff', size: 11, bold: false },
          size: Math.max(base, 12),
          label: n.label || (DEGREE[n.id] >= 2 ? (n.id.length > 26 ? n.id.slice(0,24)+'…' : n.id) : ''),
        };
      }
    });

  nodesDS.clear();
  nodesDS.add(subNodes);

  // ── Keep only edges within subgraph, colored by direction ──
  const subEdges = ALL_EDGES
    .filter(e => subgraphIds.has(e.from) && subgraphIds.has(e.to))
    .map(e => {
      const isUpstream = ancestors.has(e.from) || e.to === id;
      const col = isUpstream ? '#E8680A' : '#0096CC';
      return { ...e, color: { color: col, highlight: '#FFD700', opacity: 1 }, width: 2,
        font: { color: col, size: 10, strokeWidth: 2, strokeColor: '#0d1117' } };
    });

  edgesDS.clear();
  edgesDS.add(subEdges);

  // ── Spread subgraph with physics, then zoom in tight ──
  network.setOptions({ physics: {
    enabled: true,
    barnesHut: { gravitationalConstant: -8000, springLength: 160, springConstant: 0.04, damping: 0.25 },
    stabilization: { enabled: true, iterations: 80, updateInterval: 20 }
  }});
  network.once('stabilized', () => {
    network.setOptions({ physics: { enabled: false } });
    network.fit({
      nodes: [...subgraphIds],
      animation: { duration: 450, easingFunction: 'easeInOutQuad' }
    });
    setTimeout(() => {
      const s = network.getScale();
      network.moveTo({ scale: s * 1.5, animation: { duration: 250, easingFunction: 'easeInOutQuad' } });
    }, 480);
  });
}

function deselect() {
  selectedId = null;
  clearDetail();

  // Rebuild adjacency
  ALL_NODES.forEach(n => { FWD[n.id] = new Set(); BWD[n.id] = new Set(); });
  ALL_EDGES.forEach(e => { FWD[e.from]?.add(e.to); BWD[e.to]?.add(e.from); });

  // Recompute which nodes should be visible (same logic as applyFilters)
  const activeGroups = new Set([...document.querySelectorAll('.group-filter:checked')].map(c => c.dataset.group));
  const showIsolated = document.getElementById('isolated-toggle').checked;
  const effectiveMin = showIsolated ? 0 : Math.max(minDegree, 1);

  const visibleNodes = ALL_NODES.filter(n => {
    const deg = DEGREE[n.id] || 0;
    if (deg === 0) return showIsolated && minDegree === 0 && activeGroups.has(n.group);
    return deg >= effectiveMin && activeGroups.has(n.group);
  });

  // Restore nodes with their saved positions so the layout snaps back
  const restoredNodes = visibleNodes.map(n => {
    const pos = savedPositions[n.id];
    return pos ? { ...n, x: pos.x, y: pos.y } : n;
  });
  const visibleIds = new Set(visibleNodes.map(n => n.id));

  nodesDS.clear();
  edgesDS.clear();
  nodesDS.add(restoredNodes);
  edgesDS.add(ALL_EDGES.filter(e => visibleIds.has(e.from) && visibleIds.has(e.to)));

  // Physics stays off — layout is already computed
  network.setOptions({ physics: { enabled: false } });
  physicsOn = false;
  document.getElementById('phys-btn').textContent = '▶ Unfreeze';

  // Update stats
  const isolated = ALL_NODES.filter(n => DEGREE[n.id] === 0).length;
  document.getElementById('degree-stats').textContent =
    \`Showing \${visibleNodes.length} of \${ALL_NODES.length} tools (\${isolated} isolated hidden)\`;

  network.fit({ animation: { duration: 500, easingFunction: 'easeInOutQuad' } });
}

// ── Sidebar detail ───────────────────────────────────────────────────────────

function showToolDetail(toolId) {
  const meta = TOOL_META[toolId];
  if (!meta) return;
  const deg = DEGREE[toolId] || 0;
  const inEdges = EDGE_MAP.filter(e => e.to === toolId);
  const outEdges = EDGE_MAP.filter(e => e.from === toolId);

  let html = \`
    <div class="tool-name">\${toolId}</div>
    <div class="tool-badge">
      <span class="badge badge-group">\${meta.group}</span>
      <span class="badge badge-toolkit">\${meta.toolkit}</span>
      <span class="badge badge-deg">\${deg} connections</span>
    </div>
    <div class="tool-desc">\${meta.description || ''}</div>
  \`;

  if (meta.requiredInputs?.length > 0) {
    html += \`<div class="section-title" style="color:#8b949e">Required inputs</div>\`;
    for (const inp of meta.requiredInputs) {
      html += \`<div class="param"><span class="param-name">\${inp.name}</span><span class="param-type">\${inp.type}</span><span class="param-desc">\${inp.description || ''}</span></div>\`;
    }
  }

  // Deduplicate edges by tool id, grouping their param labels
  function groupEdges(edges, keyFn) {
    const map = {};
    for (const e of edges) {
      const k = keyFn(e);
      if (!map[k]) map[k] = { id: k, labels: [], reasons: [] };
      if (!map[k].labels.includes(e.label)) map[k].labels.push(e.label);
      if (e.reason && !map[k].reasons.includes(e.reason)) map[k].reasons.push(e.reason);
    }
    return Object.values(map);
  }

  const inGrouped = groupEdges(inEdges, e => e.from);
  const outGrouped = groupEdges(outEdges, e => e.to);

  if (inGrouped.length > 0) {
    html += \`<div class="section-title" style="color:#FF8C00">▲ Depends on (\${inGrouped.length})</div><div class="edge-list">\`;
    for (const g of inGrouped) {
      const tip = g.reasons.join('; ');
      const params = g.labels.map(l => \`<span class="edge-param">\${l}</span>\`).join(' ');
      html += \`<div class="edge-item edge-up" title="\${tip}" onclick="selectNode('\${g.id}')" onmouseenter="highlightNode('\${g.id}')" onmouseleave="unhighlightNode('\${g.id}')"><span class="edge-tool">\${g.id}</span>\${params}</div>\`;
    }
    html += '</div>';
  }

  if (outGrouped.length > 0) {
    html += \`<div class="section-title" style="color:#00BFFF">▼ Enables (\${outGrouped.length})</div><div class="edge-list">\`;
    for (const g of outGrouped) {
      const tip = g.reasons.join('; ');
      const params = g.labels.map(l => \`<span class="edge-param">\${l}</span>\`).join(' ');
      html += \`<div class="edge-item edge-down" title="\${tip}" onclick="selectNode('\${g.id}')" onmouseenter="highlightNode('\${g.id}')" onmouseleave="unhighlightNode('\${g.id}')"><span class="edge-tool">\${g.id}</span>\${params}</div>\`;
    }
    html += '</div>';
  }

  document.getElementById('tool-detail').innerHTML = html;
}

let _hoverId = null;
let _hoverPrev = null;

function highlightNode(id) {
  if (_hoverId === id) return;
  if (_hoverId) unhighlightNode(_hoverId);
  const node = nodesDS.get(id);
  if (!node) return;
  _hoverId = id;
  _hoverPrev = { borderWidth: node.borderWidth, shadow: node.shadow, size: node.size };
  nodesDS.update({ id: id, borderWidth: 4, shadow: { enabled: true, color: '#FFD70088', size: 15, x: 0, y: 0 },
    size: (node.size || 12) + 8 });
  network.focus(id, { scale: network.getScale(), animation: { duration: 200, easingFunction: 'easeInOutQuad' } });
}

function unhighlightNode(id) {
  if (!id) id = _hoverId;
  if (!id) return;
  const node = nodesDS.get(id);
  if (!node) return;
  if (_hoverPrev && id === _hoverId) {
    nodesDS.update({ id: id, borderWidth: _hoverPrev.borderWidth, shadow: _hoverPrev.shadow, size: _hoverPrev.size });
  }
  _hoverId = null;
  _hoverPrev = null;
}

function clearDetail() {
  document.getElementById('tool-detail').innerHTML = \`<div class="placeholder">
    Click any node to focus its dependency chain.<br><br>
    <span class="legend-dot" style="background:#E8680A"></span>Orange = must run before<br>
    <span class="legend-dot" style="background:#FFD700"></span>Gold = selected<br>
    <span class="legend-dot" style="background:#0096CC"></span>Cyan = this enables
  </div>\`;
}

// ── Filters ──────────────────────────────────────────────────────────────────

document.querySelectorAll('.group-filter').forEach(cb => {
  cb.addEventListener('change', () => { if (!selectedId) applyFilters(); });
});

function onDegreeChange(val) {
  minDegree = parseInt(val);
  document.getElementById('degree-val').textContent = val;
  if (!selectedId) applyFilters();
}

function applyFilters() {
  const activeGroups = new Set([...document.querySelectorAll('.group-filter:checked')].map(c => c.dataset.group));
  const searchVal = document.getElementById('nav-search').value.toLowerCase();
  const showIsolated = document.getElementById('isolated-toggle').checked;
  const effectiveMin = showIsolated ? 0 : Math.max(minDegree, 1);

  const visibleNodes = ALL_NODES.filter(n => {
    const deg = DEGREE[n.id] || 0;
    // isolated nodes: only show if toggle is on AND minDegree is 0
    if (deg === 0) return showIsolated && minDegree === 0 && activeGroups.has(n.group);
    const degOk = deg >= effectiveMin;
    const groupOk = activeGroups.has(n.group);
    const searchOk = !searchVal || n.id.toLowerCase().includes(searchVal) || (n.title || '').toLowerCase().includes(searchVal);
    return degOk && groupOk && searchOk;
  });
  const visibleIds = new Set(visibleNodes.map(n => n.id));

  // Restore positions so the layout doesn't reset
  const currentPositions = network.getPositions();
  const positionedNodes = visibleNodes.map(n => {
    const pos = currentPositions[n.id] || savedPositions[n.id];
    return pos ? { ...n, x: pos.x, y: pos.y } : n;
  });

  nodesDS.clear();
  edgesDS.clear();
  nodesDS.add(positionedNodes);
  edgesDS.add(ALL_EDGES.filter(e => visibleIds.has(e.from) && visibleIds.has(e.to)));

  // Rebuild adjacency after filter
  ALL_NODES.forEach(n => { FWD[n.id] = new Set(); BWD[n.id] = new Set(); });
  edgesDS.get().forEach(e => { FWD[e.from]?.add(e.to); BWD[e.to]?.add(e.from); });

  // If searching, highlight matches and zoom to them
  if (searchVal) {
    const matchIds = visibleNodes
      .filter(n => n.id.toLowerCase().includes(searchVal) || (n.title||'').toLowerCase().includes(searchVal))
      .map(n => n.id);
    // Bold/enlarge matched nodes
    const updates = visibleNodes.map(n => {
      const isMatch = n.id.toLowerCase().includes(searchVal) || (n.title||'').toLowerCase().includes(searchVal);
      return isMatch
        ? { id: n.id, borderWidth: 3, font: { color: '#FFD700', size: 13, bold: true },
            color: { background: n.color.background, border: '#FFD700', highlight: n.color.highlight } }
        : { id: n.id, color: { background: '#1a1d27', border: '#22263a', highlight: { background: '#1a1d27', border: '#22263a' } },
            font: { color: '#333', size: 9 } };
    });
    nodesDS.update(updates);
    if (matchIds.length > 0) {
      network.fit({ nodes: matchIds, animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
    }
  }

  // Update stats
  const isolated = ALL_NODES.filter(n => DEGREE[n.id] === 0).length;
  document.getElementById('degree-stats').textContent =
    \`Showing \${visibleNodes.length} of \${ALL_NODES.length} tools (\${isolated} isolated hidden)\`;
}

function toggleAll(checked) {
  document.querySelectorAll('.group-filter').forEach(cb => { cb.checked = checked; });
  applyFilters();
}

// ── Autocomplete search ───────────────────────────────────────────────────────
const searchInput = document.getElementById('nav-search');
const dropdown = document.getElementById('search-dropdown');
const searchCount = document.getElementById('search-count');
const MAX_RESULTS = 30;
let activeIdx = -1;

function highlight(text, query) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return text.slice(0, idx) + '<mark>' + text.slice(idx, idx + query.length) + '</mark>' + text.slice(idx + query.length);
}

function getNodeColor(n) {
  return ORIG_COLOR[n.id]?.background || '#999';
}

function showDropdown(query) {
  if (!query) { dropdown.style.display = 'none'; return; }
  const q = query.toLowerCase();
  const matches = ALL_NODES
    .filter(n => n.id.toLowerCase().includes(q) || (TOOL_META[n.id]?.description || '').toLowerCase().includes(q))
    .sort((a, b) => {
      // Exact prefix match first, then degree desc
      const aPrefix = a.id.toLowerCase().startsWith(q) ? 0 : 1;
      const bPrefix = b.id.toLowerCase().startsWith(q) ? 0 : 1;
      if (aPrefix !== bPrefix) return aPrefix - bPrefix;
      return (DEGREE[b.id] || 0) - (DEGREE[a.id] || 0);
    });

  const shown = matches.slice(0, MAX_RESULTS);
  const col = document.createElement('div');
  shown.forEach((n, i) => {
    const item = document.createElement('div');
    item.className = 'search-item';
    item.dataset.id = n.id;
    item.dataset.idx = i;
    const dot = \`<span style="width:8px;height:8px;border-radius:50%;background:\${getNodeColor(n)};flex-shrink:0;display:inline-block"></span>\`;
    const deg = DEGREE[n.id] || 0;
    item.innerHTML = \`\${dot}<span class="search-item-name">\${highlight(n.id, query)}</span><span class="search-item-group">\${n.group}</span><span class="search-item-deg">\${deg} conn</span>\`;
    item.addEventListener('mousedown', e => { e.preventDefault(); pickResult(n.id); });
    col.appendChild(item);
  });

  searchCount.textContent = matches.length > MAX_RESULTS
    ? \`\${MAX_RESULTS} of \${matches.length} results\`
    : \`\${matches.length} result\${matches.length !== 1 ? 's' : ''}\`;

  dropdown.innerHTML = '';
  dropdown.appendChild(col);
  dropdown.appendChild(searchCount);
  dropdown.style.display = matches.length ? 'block' : 'none';
  activeIdx = -1;
}

function pickResult(id) {
  searchInput.value = '';
  dropdown.style.display = 'none';
  // Make sure the node is visible first (may be filtered out)
  const node = ALL_NODES.find(n => n.id === id);
  if (!node) return;
  if (!nodesDS.get(id)) {
    // Temporarily add it so it can be selected
    nodesDS.add(node);
  }
  selectNode(id);
}

searchInput.addEventListener('input', () => {
  activeIdx = -1;
  showDropdown(searchInput.value.trim());
  if (!selectedId && !searchInput.value.trim()) applyFilters();
});

searchInput.addEventListener('keydown', e => {
  const items = dropdown.querySelectorAll('.search-item');
  if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, items.length - 1); items.forEach((el,i) => el.classList.toggle('active', i === activeIdx)); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); items.forEach((el,i) => el.classList.toggle('active', i === activeIdx)); }
  else if (e.key === 'Enter') { e.preventDefault(); if (activeIdx >= 0) { const id = items[activeIdx]?.dataset.id; if (id) pickResult(id); } }
  else if (e.key === 'Escape') { dropdown.style.display = 'none'; searchInput.blur(); }
});

searchInput.addEventListener('blur', () => setTimeout(() => { dropdown.style.display = 'none'; }, 150));
searchInput.addEventListener('focus', () => { if (searchInput.value.trim()) showDropdown(searchInput.value.trim()); });

function togglePhysics() {
  physicsOn = !physicsOn;
  network.setOptions({ physics: { enabled: physicsOn } });
  document.getElementById('phys-btn').textContent = physicsOn ? '⏸ Freeze' : '▶ Unfreeze';
}

function changeLayout(type) {
  if (type === 'hierarchical') {
    network.setOptions({ layout: { hierarchical: { enabled: true, direction: 'LR', sortMethod: 'directed' } }, physics: { enabled: false } });
  } else if (type === 'repulsion') {
    network.setOptions({ layout: { hierarchical: { enabled: false } }, physics: { enabled: true, repulsion: { nodeDistance: 150 } } });
  } else {
    network.setOptions({ layout: { hierarchical: { enabled: false } }, physics: { enabled: true, barnesHut: { gravitationalConstant: -4000, springLength: 120 } } });
  }
}

// Initialize
clearDetail();
applyFilters();
</script>
</body>
</html>`;

  await writeFile("output/graph.html", html);
  console.log("Saved output/graph.html");
}
