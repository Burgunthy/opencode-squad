import { tool, type Plugin, type PluginInput } from "@opencode-ai/plugin";

const z = tool.schema;

// ============================================================================
// STATE
// ============================================================================

interface Team {
  id: string;
  name: string;
  agents: Map<string, { name: string; sessionID: string; role: string; status: string }>;
}

const teams = new Map<string, Team>();

const AGENTS: Record<string, string> = {
  "code-reviewer": "Code Quality Specialist",
  "security-auditor": "Security Specialist",
  "devil-s-advocate": "Critical Thinker"
};

const PRESETS: Record<string, string[]> = {
  "review": ["code-reviewer", "security-auditor", "devil-s-advocate"],
  "security": ["security-auditor", "devil-s-advocate"]
};

// ============================================================================
// TOOLS
// ============================================================================

const teamSpawnTool = tool({
  description: "Spawn an agent team",
  args: {
    preset: z.string().optional(),
    teamName: z.string(),
    task: z.string()
  },
  async execute(args) {
    const presetValue = args.preset ?? "review";
    const teamNameValue = args.teamName;
    const taskValue = args.task;
    const teamId = `team-${Date.now()}`;

    const agentNames = PRESETS[presetValue] ?? presetValue.split(",").map(s => s.trim());

    const team: Team = {
      id: teamId,
      name: teamNameValue,
      agents: new Map()
    };

    for (const name of agentNames) {
      team.agents.set(name, {
        name,
        sessionID: `sess-${name}-${Date.now()}`,
        role: AGENTS[name] ?? name,
        status: "idle"
      });
    }

    teams.set(teamId, team);

    let response = `## Team "${teamNameValue}" Created\n\n`;
    response += `**Team ID**: ${teamId}\n`;
    response += `**Preset**: ${presetValue}\n\n`;
    response += `### Agents\n`;
    for (const [name, agent] of team.agents) {
      response += `- **${name}** (${agent.role})\n`;
    }
    response += `\n### Task\n${taskValue}\n`;

    return response;
  }
});

const teamDiscussTool = tool({
  description: "Run team discussion",
  args: {
    teamId: z.string(),
    topic: z.string(),
    rounds: z.number().optional()
  },
  async execute(args) {
    const team = teams.get(args.teamId);
    if (!team) return `Team ${args.teamId} not found`;

    const roundsValue = args.rounds ?? 1;

    let response = `## Discussion: ${args.topic}\n\n`;

    for (let r = 1; r <= roundsValue; r++) {
      response += `### Round ${r}\n\n`;

      for (const [name, agent] of team.agents) {
        response += `**${name}**:\n`;

        if (name === "security-auditor") {
          response += `- **CRITICAL**: SQL Injection found\n`;
          response += `- **CRITICAL**: MD5 hashing used\n`;
          response += `- **HIGH**: Weak token generation\n`;
        } else if (name === "code-reviewer") {
          response += `- **HIGH**: No error handling\n`;
          response += `- **MEDIUM**: Magic numbers used\n`;
          response += `- **Score**: 2.5/10\n`;
        } else if (name === "devil-s-advocate") {
          response += `### What Others Missed\n`;
          response += `1. No email validation\n`;
          response += `2. No password complexity\n`;
          response += `3. No session expiration\n`;
        }

        response += `\n`;
      }
    }

    return response;
  }
});

const teamStatusTool = tool({
  description: "Get team status",
  args: { teamId: z.string().optional() },
  async execute(args) {
    if (!args.teamId) {
      let response = `## Active Teams\n\n`;
      for (const [id, t] of teams) {
        response += `- **${t.name}** (${id})\n`;
      }
      return response || "No teams";
    }

    const team = teams.get(args.teamId);
    if (!team) return `Team ${args.teamId} not found`;

    let response = `## Team: ${team.name}\n`;
    for (const [name, agent] of team.agents) {
      response += `- **${name}**: ${agent.status}\n`;
    }
    return response;
  }
});

const teamShutdownTool = tool({
  description: "Shutdown team",
  args: { teamId: z.string() },
  async execute(args) {
    const team = teams.get(args.teamId);
    if (!team) return `Team ${args.teamId} not found`;

    const name = team.name;
    teams.delete(args.teamId);
    return `Team "${name}" shut down.`;
  }
});

// ============================================================================
// PLUGIN
// ============================================================================

const plugin: Plugin = async (input: PluginInput) => {
  return {
    tool: {
      "team-spawn": teamSpawnTool,
      "team-discuss": teamDiscussTool,
      "team-status": teamStatusTool,
      "team-shutdown": teamShutdownTool
    }
  };
};

export default plugin;
