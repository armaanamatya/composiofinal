import type { ParsedTool } from "./parseTool.ts";

export interface DependencyEdge {
  from: string;
  to: string;
  parameter: string;
  reason: string;
}

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";
const MODEL = "google/gemini-2.0-flash-001";
const BATCH_SIZE = 25;
const DELAY_MS = 500;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function toolSummary(t: ParsedTool): string {
  const req = t.requiredInputs.map((i) => `${i.name}(${i.type}): ${i.description}`).join(", ");
  return [
    `TOOL: ${t.name}`,
    `DISPLAY: ${t.displayName}`,
    `DESC: ${t.description.slice(0, 250)}`,
    req ? `REQUIRED_INPUTS: ${req}` : "REQUIRED_INPUTS: none",
    t.outputRef ? `RETURNS: ${t.outputRef}` : "",
  ].filter(Boolean).join("\n");
}

async function callLLM(toolsText: string, contextHint: string): Promise<DependencyEdge[]> {
  const prompt = `You are analyzing Composio API tool schemas to build a dependency graph.

CONTEXT: ${contextHint}

TOOLS:
${toolsText}

TASK: Identify dependency edges where Tool A MUST run before Tool B because B has a REQUIRED input that A produces as output.

Rules:
- Only consider REQUIRED inputs (not optional ones) as creating true dependencies
- Use semantic matching: "repo", "repository", "repo_name", "repository_full_name" all refer to the same concept
- A tool with no required inputs has no incoming dependencies from other tools
- Only add edges where the dependency is clear and specific (cite the exact parameter)
- Consider transitive chains (A→B→C is valid)
- Cross-service edges are valid (e.g., contacts tool → gmail tool)

Return ONLY a JSON array (no markdown, no explanation) with this exact shape:
[
  {
    "from": "TOOL_NAME_THAT_PRODUCES",
    "to": "TOOL_NAME_THAT_NEEDS",
    "parameter": "exact_parameter_name",
    "reason": "one sentence explanation"
  }
]

If no dependencies exist, return [].`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/composio/dep-graph",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${err}`);
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  const content = data.choices[0]?.message?.content ?? "[]";

  // Strip markdown code fences if present
  const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is DependencyEdge =>
        typeof e === "object" && e !== null &&
        typeof (e as DependencyEdge).from === "string" &&
        typeof (e as DependencyEdge).to === "string" &&
        typeof (e as DependencyEdge).parameter === "string"
    );
  } catch {
    // Try to extract JSON array from response
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]) as DependencyEdge[];
      } catch {
        return [];
      }
    }
    return [];
  }
}

function groupByService(tools: ParsedTool[]): Map<string, ParsedTool[]> {
  const groups = new Map<string, ParsedTool[]>();
  for (const tool of tools) {
    const g = tool.serviceGroup;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(tool);
  }
  return groups;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export async function analyzeDependencies(allTools: ParsedTool[]): Promise<DependencyEdge[]> {
  const allEdges: DependencyEdge[] = [];
  const seen = new Set<string>();

  function addEdges(edges: DependencyEdge[]) {
    for (const e of edges) {
      const key = `${e.from}→${e.to}:${e.parameter}`;
      if (!seen.has(key) && e.from !== e.to) {
        seen.add(key);
        allEdges.push(e);
      }
    }
  }

  const toolsByService = groupByService(allTools);
  const toolNames = new Set(allTools.map((t) => t.name));

  // Phase 1: within-service batches
  console.log("\nPhase 1: Within-service dependency analysis...");
  for (const [service, tools] of toolsByService) {
    const batches = chunkArray(tools, BATCH_SIZE);
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]!;
      const text = batch.map(toolSummary).join("\n\n---\n\n");
      const hint = `Analyzing ${service} tools (batch ${i + 1}/${batches.length})`;
      console.log(`  ${hint} (${batch.length} tools)`);
      try {
        const edges = await callLLM(text, hint);
        const valid = edges.filter((e) => toolNames.has(e.from) && toolNames.has(e.to));
        addEdges(valid);
        console.log(`    Found ${valid.length} edges`);
      } catch (err) {
        console.error(`    Error: ${err}`);
      }
      await sleep(DELAY_MS);
    }
  }

  // Phase 2: cross-service batches (mix tools from different services)
  console.log("\nPhase 2: Cross-service dependency analysis...");
  const crossServiceGroups = buildCrossServiceGroups(allTools);
  for (const [hint, batch] of crossServiceGroups) {
    const text = batch.map(toolSummary).join("\n\n---\n\n");
    console.log(`  ${hint} (${batch.length} tools)`);
    try {
      const edges = await callLLM(text, hint);
      const valid = edges.filter((e) => toolNames.has(e.from) && toolNames.has(e.to));
      addEdges(valid);
      console.log(`    Found ${valid.length} cross-service edges`);
    } catch (err) {
      console.error(`    Error: ${err}`);
    }
    await sleep(DELAY_MS);
  }

  // Phase 3: overlap batches within service — tools that share common output/input patterns
  console.log("\nPhase 3: Transitive chain analysis...");
  const chainBatches = buildChainBatches(allTools, allEdges);
  for (const [hint, batch] of chainBatches) {
    if (batch.length < 3) continue;
    const text = batch.map(toolSummary).join("\n\n---\n\n");
    console.log(`  ${hint} (${batch.length} tools)`);
    try {
      const edges = await callLLM(text, hint);
      const valid = edges.filter((e) => toolNames.has(e.from) && toolNames.has(e.to));
      addEdges(valid);
      console.log(`    Found ${valid.length} chain edges`);
    } catch (err) {
      console.error(`    Error: ${err}`);
    }
    await sleep(DELAY_MS);
  }

  return allEdges;
}

function buildCrossServiceGroups(tools: ParsedTool[]): Array<[string, ParsedTool[]]> {
  const groups: Array<[string, ParsedTool[]]> = [];

  // Google Contacts → Gmail cross-service
  const contacts = tools.filter((t) => t.serviceGroup.includes("contact") || t.name.startsWith("GCONTACT"));
  const gmail = tools.filter((t) => t.serviceGroup === "gmail");
  if (contacts.length > 0 && gmail.length > 0) {
    const sample = [...contacts.slice(0, 8), ...gmail.slice(0, 12)];
    groups.push(["Google Contacts → Gmail cross-service", sample]);
  }

  // Google Drive → Google Docs/Sheets/Slides
  const drive = tools.filter((t) => t.serviceGroup === "gdrive" || t.name.startsWith("GOOGLEDRIVE"));
  const docs = tools.filter((t) =>
    t.serviceGroup.includes("doc") || t.serviceGroup.includes("sheet") || t.serviceGroup.includes("slide")
  );
  if (drive.length > 0 && docs.length > 0) {
    groups.push(["Google Drive → Docs/Sheets cross-service", [...drive.slice(0, 8), ...docs.slice(0, 12)]]);
  }

  // GitHub repos → issues → comments chain
  const ghRepos = tools.filter((t) => t.toolkit === "github" && (t.serviceGroup === "github_repos" || t.name.includes("REPO")));
  const ghIssues = tools.filter((t) => t.toolkit === "github" && (t.serviceGroup === "github_issues" || t.name.includes("ISSUE")));
  const ghComments = tools.filter((t) => t.toolkit === "github" && t.name.includes("COMMENT"));
  if (ghRepos.length > 0 && ghIssues.length > 0) {
    groups.push(["GitHub Repos → Issues → Comments", [
      ...ghRepos.slice(0, 8),
      ...ghIssues.slice(0, 8),
      ...ghComments.slice(0, 6),
    ]]);
  }

  // GitHub pulls → reviews
  const ghPulls = tools.filter((t) => t.toolkit === "github" && (t.serviceGroup === "github_pulls" || t.name.includes("PULL")));
  const ghReviews = tools.filter((t) => t.toolkit === "github" && t.name.includes("REVIEW"));
  if (ghPulls.length > 0 && ghReviews.length > 0) {
    groups.push(["GitHub PRs → Reviews", [...ghPulls.slice(0, 10), ...ghReviews.slice(0, 10)]]);
  }

  // GitHub Actions
  const ghActions = tools.filter((t) => t.toolkit === "github" && (t.serviceGroup === "github_actions" || t.name.includes("ACTION") || t.name.includes("WORKFLOW")));
  if (ghActions.length > 0) {
    groups.push(["GitHub Actions workflows", ghActions.slice(0, BATCH_SIZE)]);
  }

  // Calendar → Gmail (event invites)
  const calendar = tools.filter((t) => t.serviceGroup.includes("calendar") || t.serviceGroup.includes("gcal"));
  if (calendar.length > 0 && gmail.length > 0) {
    groups.push(["Calendar → Gmail cross-service", [...calendar.slice(0, 8), ...gmail.slice(0, 8)]]);
  }

  return groups;
}

function buildChainBatches(tools: ParsedTool[], existingEdges: DependencyEdge[]): Array<[string, ParsedTool[]]> {
  const batches: Array<[string, ParsedTool[]]> = [];
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  // Find tools that appear in existing edges and expand their neighborhood
  const connected = new Set<string>();
  for (const e of existingEdges) {
    connected.add(e.from);
    connected.add(e.to);
  }

  // Group connected tools by service and look for missing transitive links
  const serviceConnected = new Map<string, string[]>();
  for (const name of connected) {
    const t = toolMap.get(name);
    if (!t) continue;
    if (!serviceConnected.has(t.serviceGroup)) serviceConnected.set(t.serviceGroup, []);
    serviceConnected.get(t.serviceGroup)!.push(name);
  }

  for (const [service, names] of serviceConnected) {
    if (names.length > 3) {
      const batch = names.slice(0, BATCH_SIZE).map((n) => toolMap.get(n)!).filter(Boolean);
      if (batch.length > 0) {
        batches.push([`Transitive chain analysis: ${service}`, batch]);
      }
    }
  }

  return batches;
}
