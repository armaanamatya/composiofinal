import type { ParsedTool } from "./parseTool.ts";
import type { DependencyEdge } from "./analyzeDeps.ts";
import { writeFile } from "fs/promises";

export interface GraphNode {
  id: string;
  label: string;
  group: string;
  toolkit: string;
  description: string;
  requiredInputs: Array<{ name: string; type: string; description: string }>;
  outputRef: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  label: string;
  reason: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: {
    totalTools: number;
    totalEdges: number;
    generatedAt: string;
    toolkits: string[];
  };
}

export function buildGraph(tools: ParsedTool[], edges: DependencyEdge[]): Graph {
  // Only include nodes that participate in at least one edge
  const connectedNames = new Set<string>();
  for (const e of edges) {
    connectedNames.add(e.from);
    connectedNames.add(e.to);
  }

  // Include ALL tools as nodes (so isolated ones are visible too)
  const nodes: GraphNode[] = tools.map((t) => ({
    id: t.name,
    label: t.displayName || t.name,
    group: t.serviceGroup,
    toolkit: t.toolkit,
    description: t.description,
    requiredInputs: t.requiredInputs,
    outputRef: t.outputRef,
  }));

  const graphEdges: GraphEdge[] = edges.map((e) => ({
    from: e.from,
    to: e.to,
    label: e.parameter,
    reason: e.reason,
  }));

  const toolkits = [...new Set(tools.map((t) => t.toolkit))];

  return {
    nodes,
    edges: graphEdges,
    metadata: {
      totalTools: tools.length,
      totalEdges: edges.length,
      generatedAt: new Date().toISOString(),
      toolkits,
    },
  };
}

export async function saveGraph(graph: Graph): Promise<void> {
  await writeFile("output/graph.json", JSON.stringify(graph, null, 2));
  console.log(`Saved graph.json: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
}
