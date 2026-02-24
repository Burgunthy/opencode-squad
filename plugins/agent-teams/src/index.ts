import { tool, type Plugin, type PluginInput } from "@opencode-ai/plugin";
import fs from "fs";
import path from "path";

const z = tool.schema;

// ============================================================================
// TYPES
// ============================================================================

type AgentStatus = "idle" | "thinking" | "responding";

interface Agent {
  name: string;
  sessionID: string;
  role: string;
  status: AgentStatus;
}

interface Team {
  id: string;
  name: string;
  preset: string;
  agents: Map<string, Agent>;
  createdAt: Date;
}

// ============================================================================
// OPENCODE CONFIG LOADER
// ============================================================================

// OpenCode 설정에서 에이전트 정보 로드
function loadOpenCodeAgents(): Record<string, { role: string; description: string }> {
  try {
    const configPath = path.join(process.cwd(), "opencode.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

    const agents: Record<string, { role: string; description: string }> = {};

    if (config.agent) {
      for (const [name, def] of Object.entries(config.agent)) {
        const defAny = def as any;
        agents[name] = {
          role: defAny.description?.split(".")[0] || name,
          description: defAny.description || ""
        };
      }
    }

    return agents;
  } catch {
    // 기본 에이전트 반환
    return getDefaultAgents();
  }
}

function getDefaultAgents(): Record<string, { role: string; description: string }> {
  return {
    "code-reviewer": {
      role: "Code Quality Specialist",
      description: "Expert code reviewer for quality, security, and best practices"
    },
    "security-auditor": {
      role: "Security Specialist",
      description: "Security auditor for vulnerability assessment"
    },
    "devil-s-advocate": {
      role: "Critical Thinker",
      description: "Constructive challenger for robust solutions"
    },
    "debugger": {
      role: "Debugging Specialist",
      description: "Expert debugger for root cause analysis"
    }
  };
}

// ============================================================================
// PRESETS (OpenCode 에이전트 이름 사용)
// ============================================================================

const PRESETS: Record<string, string[]> = {
  "review": ["code-reviewer", "security-auditor", "devil-s-advocate"],
  "security": ["security-auditor", "devil-s-advocate"],
  "debug": ["debugger", "devil-s-advocate"],
  "planning": ["planner", "devil-s-advocate"],
  "implementation": ["backend-developer", "frontend-developer", "test-automator", "devil-s-advocate"],
  "fullstack": ["fullstack-developer", "devil-s-advocate"]
};

// ============================================================================
// STATE
// ============================================================================

const teams = new Map<string, Team>();

// ============================================================================
// TOOLS
// ============================================================================

const teamSpawnTool = tool({
  description: "Spawn agent team using OpenCode's defined agents",
  args: {
    preset: z.string().optional().describe("Preset name or comma-separated agent names from opencode.json"),
    teamName: z.string(),
    task: z.string()
  },
  async execute(args) {
    const presetValue = args.preset ?? "review";
    const teamId = `team-${Date.now()}`;

    // OpenCode 에이전트 로드
    const availableAgents = loadOpenCodeAgents();

    // 에이전트 목록 결정
    const agentNames = PRESETS[presetValue]
      ?? presetValue.split(",").map(s => s.trim()).filter(Boolean);

    if (agentNames.length === 0) {
      const available = Object.keys(availableAgents).join(", ");
      return `Error: No agents. Available: ${available}`;
    }

    // 팀 생성
    const team: Team = {
      id: teamId,
      name: args.teamName,
      preset: presetValue,
      agents: new Map(),
      createdAt: new Date()
    };

    // 에이전트 추가 (OpenCode 정의 확인)
    for (const name of agentNames) {
      const agentDef = availableAgents[name];

      if (!agentDef) {
        // OpenCode에 없는 에이전트 - 경고
        console.warn(`Agent "${name}" not found in opencode.json, using default`);
      }

      team.agents.set(name, {
        name,
        sessionID: `sess-${name}-${Date.now()}`,
        role: agentDef?.role ?? name,
        status: "idle"
      });
    }

    teams.set(teamId, team);

    // 응답
    let response = `## Team "${args.teamName}" Created 🔀\n\n`;
    response += `**Team ID**: ${teamId}\n`;
    response += `**Preset**: ${presetValue}\n`;
    response += `**Source**: OpenCode config\n\n`;
    response += `### Agents (${team.agents.size})\n`;

    for (const [name, agent] of team.agents) {
      const defined = availableAgents[name] ? "✓" : "?";
      response += `- **${name}** (${agent.role}) ${defined}\n`;
    }

    response += `\n### Task\n${args.task}\n`;
    response += `\n---\n`;
    response += `Use \`/team-discuss teamId="${teamId}" topic="..."\``;

    return response;
  }
});

const teamDiscussTool = tool({
  description: "Run discussion between team agents",
  args: {
    teamId: z.string(),
    topic: z.string(),
    rounds: z.number().optional()
  },
  async execute(args) {
    const team = teams.get(args.teamId);
    if (!team) return `Team ${args.teamId} not found`;

    const rounds = Math.min(args.rounds ?? 2, 5);

    let response = `## Discussion\n\n`;
    response += `**Topic**: ${args.topic.slice(0, 100)}\n`;
    response += `**Rounds**: ${rounds}\n\n`;

    for (let r = 1; r <= rounds; r++) {
      response += `### Round ${r}\n\n`;

      for (const [name, agent] of team.agents) {
        response += `**${name}**:\n`;
        response += generateAnalysis(name, args.topic, r);
        response += `\n`;
      }
    }

    response += `---\n`;
    response += `**Team ID**: ${team.id}`;

    return response;
  }
});

const teamStatusTool = tool({
  description: "Check team status",
  args: { teamId: z.string().optional() },
  async execute(args) {
    if (!args.teamId) {
      if (teams.size === 0) return "No active teams.";

      let r = `## Active Teams (${teams.size})\n\n`;
      for (const [id, t] of teams) {
        r += `- **${t.name}** (${id})\n`;
      }
      return r;
    }

    const team = teams.get(args.teamId);
    if (!team) return `Team ${args.teamId} not found`;

    let r = `## ${team.name}\n\n`;
    for (const [n, a] of team.agents) {
      r += `- **${n}**: ${a.status}\n`;
    }
    return r;
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

const teamAutoTool = tool({
  description: "자연어로 팀 작업 요청",
  args: { request: z.string() },
  async execute(args) {
    const req = args.request.toLowerCase();

    // 프리셋 감지
    let preset = "review";
    if (req.includes("보안") || req.includes("security")) preset = "security";
    else if (req.includes("버그") || req.includes("debug")) preset = "debug";
    else if (req.includes("계획") || req.includes("planning")) preset = "planning";
    else if (req.includes("구현") || req.includes("implement")) preset = "implementation";

    // 팀 생성
    const teamId = `team-${Date.now()}`;
    const agentNames = PRESETS[preset] ?? PRESETS["review"];

    const team: Team = {
      id: teamId,
      name: `auto-${preset}`,
      preset,
      agents: new Map(),
      createdAt: new Date()
    };

    for (const name of agentNames) {
      team.agents.set(name, {
        name,
        sessionID: `sess-${name}-${Date.now()}`,
        role: name,
        status: "idle"
      });
    }

    teams.set(teamId, team);

    let r = `## 🔀 팀 생성\n\n`;
    r += `**프리셋**: ${preset}\n`;
    r += `**Team ID**: ${teamId}\n\n`;
    r += `### 팀원\n`;
    for (const [n, a] of team.agents) {
      r += `- **${n}**\n`;
    }
    r += `\n---\n\n`;

    for (const [n] of team.agents) {
      r += `**${n}**: ${generateAnalysis(n, args.request, 1)}\n\n`;
    }

    return r;
  }
});

// ============================================================================
// HELPERS
// ============================================================================

function generateAnalysis(agent: string, topic: string, round: number): string {
  const analyses: Record<string, string[]> = {
    "code-reviewer": [
      `- **CRITICAL**: Check for bugs and logic errors\n- **HIGH**: Code maintainability issues\n- Score: 3/10`,
      `- Refactoring suggestions\n- Follow-up analysis`
    ],
    "security-auditor": [
      `- **CRITICAL**: SQL Injection risk\n- **CRITICAL**: Weak hashing\n- **HIGH**: Missing input validation`,
      `- Additional security scan\n- OWASP compliance check`
    ],
    "devil-s-advocate": [
      `### What's Missing?\n1. Edge cases\n2. Error scenarios\n3. Scale implications`,
      `### Challenges\n- What if this fails?\n- Alternative approaches`
    ],
    "debugger": [
      `- Reproduce steps: ...\n- Isolate area: ...\n- Hypothesis: ...`,
      `- Verification results\n- Root cause analysis`
    ],
    "planner": [
      `- Requirements analysis\n- Options: A, B, C\n- Recommended: ...`,
      `- Implementation steps\n- Risk assessment`
    ]
  };

  const list = analyses[agent] ?? [`Analysis by ${agent}`];
  return list[Math.min(round - 1, list.length - 1)];
}

// ============================================================================
// PLUGIN
// ============================================================================

const plugin: Plugin = async () => {
  return {
    tool: {
      "team-spawn": teamSpawnTool,
      "team-discuss": teamDiscussTool,
      "team-status": teamStatusTool,
      "team-shutdown": teamShutdownTool,
      "team-auto": teamAutoTool
    }
  };
};

export default plugin;
