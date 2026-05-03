import { readFile } from "fs/promises";
import { existsSync } from "fs";

// Load .env
if (existsSync(".env")) {
  const env = await readFile(".env", "utf-8");
  for (const line of env.split("\n")) {
    const [key, ...rest] = line.split("=");
    if (key && rest.length > 0) {
      process.env[key.trim()] = rest.join("=").trim();
    }
  }
}

import { fetchAndSaveTools } from "./fetchTools.ts";
import { parseTools } from "./parseTool.ts";
import { analyzeDependencies } from "./analyzeDeps.ts";
import { buildGraph, saveGraph } from "./buildGraph.ts";
import { generateHTML } from "./visualize.ts";

const SKIP_FETCH = process.argv.includes("--skip-fetch");
const SKIP_ANALYSIS = process.argv.includes("--skip-analysis");

console.log("=== Composio Tool Dependency Graph Builder ===\n");

// Step 1: Fetch tools
let googleRaw: unknown[];
let githubRaw: unknown[];

if (SKIP_FETCH && existsSync("output/googlesuper_tools.json") && existsSync("output/github_tools.json")) {
  console.log("Loading cached tool schemas...");
  googleRaw = JSON.parse(await readFile("output/googlesuper_tools.json", "utf-8")) as unknown[];
  githubRaw = JSON.parse(await readFile("output/github_tools.json", "utf-8")) as unknown[];
  console.log(`  Loaded ${googleRaw.length} googlesuper tools, ${githubRaw.length} github tools`);
} else {
  console.log("Step 1: Fetching tool schemas from Composio API...");
  const result = await fetchAndSaveTools();
  googleRaw = result.googleTools;
  githubRaw = result.githubTools;
}

// Step 2: Parse tools
console.log("\nStep 2: Parsing tool schemas...");
const googleTools = parseTools(googleRaw, "googlesuper");
const githubTools = parseTools(githubRaw, "github");
const allTools = [...googleTools, ...githubTools];
console.log(`  Parsed ${googleTools.length} googlesuper + ${githubTools.length} github = ${allTools.length} total tools`);

// Log service groups
const groups = new Map<string, number>();
for (const t of allTools) {
  groups.set(t.serviceGroup, (groups.get(t.serviceGroup) ?? 0) + 1);
}
console.log("  Service groups:", [...groups.entries()].map(([g, n]) => `${g}(${n})`).join(", "));

// Step 3: Analyze dependencies
let edges: import("./analyzeDeps.ts").DependencyEdge[];

if (SKIP_ANALYSIS && existsSync("output/graph.json")) {
  console.log("\nLoading cached graph...");
  const cached = JSON.parse(await readFile("output/graph.json", "utf-8")) as { edges: import("./buildGraph.ts").GraphEdge[] };
  edges = cached.edges.map((e) => ({ from: e.from, to: e.to, parameter: e.label, reason: e.reason }));
  console.log(`  Loaded ${edges.length} edges from cache`);
} else {
  console.log("\nStep 3: LLM dependency analysis (this takes a few minutes)...");
  edges = await analyzeDependencies(allTools);
  console.log(`\n  Total dependency edges found: ${edges.length}`);
}

// Step 4: Build graph
console.log("\nStep 4: Building graph.json...");
const graph = buildGraph(allTools, edges);
await saveGraph(graph);

// Step 5: Generate visualization
console.log("\nStep 5: Generating graph.html...");
await generateHTML(graph);

console.log("\n=== Done! ===");
console.log(`Nodes: ${graph.nodes.length}`);
console.log(`Edges: ${graph.edges.length}`);
console.log("Open output/graph.html in your browser to explore the graph.");
