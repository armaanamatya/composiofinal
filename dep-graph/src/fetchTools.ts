import { Composio } from "@composio/core";
import { writeFile, mkdir } from "fs/promises";

export async function fetchAndSaveTools(): Promise<{ googleTools: unknown[]; githubTools: unknown[] }> {
  await mkdir("output", { recursive: true });

  const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });

  console.log("Fetching googlesuper tools...");
  const googleTools = await composio.tools.getRawComposioTools({
    toolkits: ["googlesuper"],
    limit: 1000,
  }) as unknown[];
  await writeFile("output/googlesuper_tools.json", JSON.stringify(googleTools, null, 2));
  console.log(`  Saved ${googleTools.length} googlesuper tools`);

  console.log("Fetching github tools...");
  const githubTools = await composio.tools.getRawComposioTools({
    toolkits: ["github"],
    limit: 1000,
  }) as unknown[];
  await writeFile("output/github_tools.json", JSON.stringify(githubTools, null, 2));
  console.log(`  Saved ${githubTools.length} github tools`);

  return { googleTools, githubTools };
}
