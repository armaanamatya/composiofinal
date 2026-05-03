# Composio: Tool Dependency Graph Assignment

## What Is It?

Build a **dependency graph** showing which Composio tools must run before other tools.

**Core concept:** Some tools need IDs or data that only other tools can produce.

Examples:
- `GMAIL_REPLY_TO_THREAD` requires a `thread_id` → must call `GMAIL_LIST_THREADS` first
- `GITHUB_CREATE_ISSUE_COMMENT` requires `issue_number` + `repo` → must list issues first
- Sending an email to "John Smith" → need to look up his email in contacts first

Scope: **Google Super toolkit** (438 tools) + **GitHub toolkit** (867 tools)

---

## What You Need to Deliver

1. A **dependency graph** data structure (JSON) with:
   - Nodes = tools
   - Edges = "Tool A must run before Tool B to get parameter X"

2. An **interactive visualization** (HTML) showing the graph with nodes and edges

Composio will judge: **quality of dependency relationships discovered**

---

## How to Build It

### Architecture

```
dep-graph/
  src/
    fetchTools.ts    ← pull schemas from Composio API for both toolkits
    parseTool.ts     ← structure each tool: name, required inputs, outputs
    analyzeDeps.ts   ← use LLM in batches to find dependency edges
    buildGraph.ts    ← merge edges → graph.json
    visualize.ts     ← generate interactive graph.html with vis.js
    main.ts          ← run all steps
  output/
    googlesuper_tools.json
    github_tools.json
    graph.json
    graph.html       ← final deliverable visualization
```

### Step-by-Step

**1. Setup (you do this manually)**
```bash
cd dep-graph
bun install
COMPOSIO_API_KEY=<your_key> sh scaffold.sh   # writes .env with both API keys
```
Get your key at https://platform.composio.dev

**2. Fetch tool schemas**
Use `composio.tools.getRawComposioTools({ toolkits: ["googlesuper"], limit: 1000 })` — already shown in `src/index.ts`. Repeat for `github`. Save both to JSON files.

**3. Parse each tool**
Extract structured data from each raw tool schema:
```
{
  name: "GMAIL_REPLY_TO_THREAD",
  serviceGroup: "gmail",
  description: "...",
  requiredInputs: [{ name: "thread_id", type: "string", description: "..." }],
  outputs: ["message_id", "thread_id", ...]
}
```

**4. LLM dependency analysis (the core part)**

1,300+ tools is too many to analyze at once. Strategy:
- Group by service prefix: `GMAIL_`, `GCALENDAR_`, `GDRIVE_`, `GCONTACTS_`, `GITHUB_`, etc.
- Send **~30 tools per batch** to an LLM (use OpenRouter key from `.env`)
- Prompt: *"Given these tool schemas, identify which tools must run before other tools because they produce required inputs. Return JSON edges: `{from, to, parameter, reason}`"*
- Also run cross-group batches (GitHub tools share `repo_name` across many categories)
- Collect + deduplicate all edges

**5. Build graph.json**
```json
{
  "nodes": [
    { "id": "GMAIL_LIST_THREADS", "label": "List Threads", "group": "gmail", "toolkit": "googlesuper" }
  ],
  "edges": [
    { "from": "GMAIL_LIST_THREADS", "to": "GMAIL_REPLY_TO_THREAD", "label": "thread_id", "reason": "..." }
  ]
}
```

**6. Generate graph.html**
Use **vis.js Network** (loaded from CDN, no install needed):
- Color nodes by service group (Gmail=red, Calendar=blue, Drive=green, GitHub=orange, etc.)
- Edge labels show the parameter name creating the dependency
- Click a node → sidebar shows full tool description
- Checkboxes to filter by service group
- Force-directed layout with physics

**7. Run & verify**
```bash
bun run src/main.ts
# Then open output/graph.html in browser
```

**8. Submit**
```bash
sh upload.sh armaanamatya2014@gmail.com
```

---

## Quality Checklist

| Check | Why |
|-------|-----|
| Semantic matching, not just name matching | `repo` vs `repository_full_name` vs `owner/repo` are the same concept |
| Required inputs only | Optional parameters don't create true ordering constraints |
| Transitive chains | list repos → list issues → get issue → add comment (3 steps) |
| Cross-service deps | Contacts lookup → Gmail send (if you only have a name) |
| Confidence filter | Discard vague LLM edges that don't cite a specific parameter |

---

## Tech Stack

| Tool | Use |
|------|-----|
| Bun | Runtime (fast, TypeScript native) |
| `@composio/core` | Fetch raw tool schemas |
| OpenRouter API | LLM calls for dependency analysis (key from scaffold.sh) |
| `@anthropic-ai/claude-agent-sdk` v0.2.87 | Already in package.json, can use for structured LLM calls |
| `zod` | Schema validation for LLM JSON output |
| vis.js (CDN) | Interactive graph visualization |

---

## Expected Output

- **200–500+ meaningful dependency edges** across both toolkits
- Clear service clusters visible in the visualization
- Transitive chains (e.g., 3–4 step GitHub workflows)
- Cross-service edges (Google Contacts → Gmail, etc.)
