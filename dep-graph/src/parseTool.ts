export interface ParsedTool {
  name: string;
  displayName: string;
  serviceGroup: string;
  toolkit: string;
  description: string;
  requiredInputs: Array<{ name: string; type: string; description: string }>;
  optionalInputs: Array<{ name: string; type: string; description: string }>;
  outputRef: string; // the $ref type name from outputParameters
}

const HINT_TAGS = new Set([
  "openWorldHint", "idempotentHint", "destructiveHint", "updateHint",
  "createHint", "readOnlyHint", "mcpIgnore", "important", "GraphQL",
  "deprecated", "batch",
]);

const GH_SERVICE_MAP: Record<string, string> = {
  repos: "repos", Repositories: "repos", "repositories": "repos", "Repository Management": "repos",
  "Content Management": "repos",
  issues: "issues", Issues: "issues",
  pulls: "pulls", "Pull Requests": "pulls", "Pull Request Management": "pulls",
  actions: "actions", Workflows: "actions", "Workflow Management": "actions", "CI/CD": "actions",
  "Workflow and Automation Management": "actions",
  orgs: "orgs", Organizations: "orgs", "Organization Management": "orgs",
  "organization_management": "orgs",
  teams: "teams", Teams: "teams", "Team Management": "teams",
  gists: "gists", Gists: "gists",
  users: "users", Users: "users", "User Management": "users", "user_management": "users",
  packages: "packages", "Package Management": "packages",
  codespaces: "codespaces", "Code Spaces": "codespaces",
  projects: "projects", Projects: "projects", "Project and Card Management": "projects",
  dependabot: "dependabot",
  git: "git",
  search: "search",
  migrations: "migrations",
  apps: "apps",
  reactions: "reactions",
  checks: "checks", "Check Suites & Runs": "checks",
  activity: "activity",
  security: "security", Security: "security",
  discussions: "discussions", Discussions: "discussions",
  releases: "releases", "Release Management": "releases",
  deployments: "deployments", "Deployments and Environments": "deployments",
  "Branches": "branches", "Branch Protection": "branches",
  "Labels and Milestones": "issues",
  "Secrets Management": "security",
};

const GS_SERVICE_MAP: Record<string, string> = {
  gmail: "gmail", messages: "gmail", filters: "gmail", labels: "gmail",
  mailbox_automation: "gmail", mail_protocols: "gmail", send_as_aliases: "gmail",
  account_settings: "gmail", forwarding: "gmail",
  googledocs: "docs", document: "docs", "googledocs": "docs",
  googlesheets: "sheets", spreadsheets: "sheets", spreadsheet: "sheets",
  cell_values: "sheets", dimensions: "sheets", sheets: "sheets",
  "Calendars Management": "calendar", "Events Management": "calendar",
  calendar_list: "calendar", events: "calendar", CalendarList: "calendar",
  "Instances and Queries": "calendar", "Time and Date Management": "calendar",
  drive: "drive", files: "drive", googledrive: "drive", file: "drive",
  "file management": "drive", file_management_and_monitoring: "drive",
  parent: "drive", changes: "drive", revision: "drive", revisions: "drive",
  permission: "drive",
  googlemeet: "meet", conferenceRecords: "meet", spaces: "meet",
  transcript: "meet", participants: "meet", recordings: "meet",
  "Geocoding & geolocation": "maps", google_maps: "maps",
  "Places search & details": "maps", "Map tiles & rendering": "maps",
  "Aerial imagery & videos": "maps", "Google Maps": "maps",
  tasks: "tasks", Tasks: "tasks", tasklist: "tasks",
  Presentations: "slides",
  audiences: "analytics", reporting: "analytics", "Audience Management": "analytics",
  "custom_definitions_metrics": "analytics", "reporting_configuration": "analytics",
  "events_conversions": "analytics", "data_streams_ingestion": "analytics",
  "Reporting": "analytics", "attribution_skan": "analytics",
  comment: "drive", comments: "drive",
  "access_control": "calendar",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getServiceGroup(raw: any, toolkit: string): string {
  const tags: string[] = raw.tags ?? [];
  const svcTags = tags.filter((t) => !HINT_TAGS.has(t));
  const slug: string = raw.slug ?? "";

  if (toolkit === "github") {
    for (const tag of svcTags) {
      const mapped = GH_SERVICE_MAP[tag];
      if (mapped) return `github_${mapped}`;
    }
    // Slug-based fallback for GitHub
    if (/REPO|REPOSITORY/.test(slug)) return "github_repos";
    if (/ISSUE/.test(slug)) return "github_issues";
    if (/PULL/.test(slug)) return "github_pulls";
    if (/WORKFLOW|ACTION|RUNNER/.test(slug)) return "github_actions";
    if (/ORG/.test(slug)) return "github_orgs";
    if (/TEAM/.test(slug)) return "github_teams";
    if (/GIST/.test(slug)) return "github_gists";
    if (/USER/.test(slug)) return "github_users";
    if (/RELEASE/.test(slug)) return "github_releases";
    if (/CODESPACE/.test(slug)) return "github_codespaces";
    if (/PROJECT/.test(slug)) return "github_projects";
    if (/SEARCH/.test(slug)) return "github_search";
    if (/DEPLOYMENT/.test(slug)) return "github_deployments";
    if (/DISCUSSION/.test(slug)) return "github_discussions";
    if (/BRANCH/.test(slug)) return "github_branches";
    if (/COMMIT/.test(slug)) return "github_commits";
    return "github_other";
  }

  if (toolkit === "googlesuper") {
    for (const tag of svcTags) {
      const mapped = GS_SERVICE_MAP[tag];
      if (mapped) return mapped;
    }
    // Slug-based fallback for GoogleSuper
    if (/GMAIL/.test(slug)) return "gmail";
    if (/CALENDAR|ACL|FREEBUSY/.test(slug)) return "calendar";
    if (/DRIVE|FILE|FOLDER/.test(slug)) return "drive";
    if (/DOCS|DOCUMENT/.test(slug)) return "docs";
    if (/SHEETS|SPREADSHEET/.test(slug)) return "sheets";
    if (/SLIDES|PRESENTATION/.test(slug)) return "slides";
    if (/MEET|CONFERENCE/.test(slug)) return "meet";
    if (/TASKS|TASK/.test(slug)) return "tasks";
    if (/MAPS|GEO|GEOCODE|PLACE|GEOLOCATE/.test(slug)) return "maps";
    if (/CONTACT/.test(slug)) return "contacts";
    return "googlesuper_other";
  }

  return svcTags[0]?.toLowerCase() ?? "other";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseTool(raw: any, toolkit: string): ParsedTool {
  const name: string = raw.slug ?? "";
  const displayName: string = raw.name ?? name;

  const inputParams = raw.inputParameters ?? {};
  const properties: Record<string, { type?: string; description?: string }> =
    inputParams.properties ?? {};
  const requiredSet = new Set<string>(inputParams.required ?? []);

  const requiredInputs: ParsedTool["requiredInputs"] = [];
  const optionalInputs: ParsedTool["optionalInputs"] = [];

  for (const [key, val] of Object.entries(properties)) {
    const param = {
      name: key,
      type: val.type ?? "string",
      description: val.description ?? "",
    };
    if (requiredSet.has(key)) {
      requiredInputs.push(param);
    } else {
      optionalInputs.push(param);
    }
  }

  // Extract $ref name from outputParameters as a hint of what this tool returns
  const outputRef: string =
    raw.outputParameters?.properties?.data?.$ref?.replace("#/$defs/", "") ?? "";

  return {
    name,
    displayName,
    serviceGroup: getServiceGroup(raw, toolkit),
    toolkit,
    description: raw.description ?? "",
    requiredInputs,
    optionalInputs,
    outputRef,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseTools(rawTools: unknown[], toolkit: string): ParsedTool[] {
  return (rawTools as any[])
    .map((t) => parseTool(t, toolkit))
    .filter((t) => t.name.length > 0);
}
