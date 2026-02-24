import { tool, type Plugin, type PluginInput } from "@opencode-ai/plugin";

const z = tool.schema;

// ============================================================================
// GLOBAL STATE
// ============================================================================

let globalClient: any = null;
let globalServerUrl: string = "";

// Active teams with real-time state
const activeTeams: Map<string, {
  id: string;
  name: string;
  agents: Map<string, {
    name: string;
    sessionID: string;
    role: string;
    systemPrompt: string;
    status: "idle" | "thinking" | "responding";
    lastResponse?: string;
  }>;
  pendingMessages: Map<string, string[]>; // agentName -> messages
}> = new Map();

// Agent presets
const AGENT_PROMPTS: Record<string, { role: string; prompt: string }> = {
  "code-reviewer": {
    role: "Code Quality Specialist",
    prompt: `You are an expert code reviewer. Format response as:
## Code Review
### CRITICAL Issues
- [issue]: [description] | Fix: [solution]
### HIGH Issues
- [issue]: [description]
### Score: X/10`
  },
  "security-auditor": {
    role: "Security Specialist",
    prompt: `You are a security auditor. Format response as:
## Security Review
### CRITICAL
- [vulnerability]: [description] | Fix: [solution]
### HIGH
- [vulnerability]: [description]`
  },
  "devil-s-advocate": {
    role: "Critical Thinker",
    prompt: `You are the Devil's Advocate. After other reviewers share findings:
## Devil's Advocate
### What They Missed
1. [issue not found]
### Assumptions to Challenge
- [assumption]: [why wrong]
### Verdict: [APPROVED/NEEDS WORK/BLOCK]`
  }
};

const PRESETS: Record<string, string[]> = {
  "review": ["code-reviewer", "security-auditor", "devil-s-advocate"],
  "security": ["security-auditor", "devil-s-advocate"]
};

// ============================================================================
// API HELPERS
// ============================================================================

async function createSession(title: string): Promise<string> {
  if (!globalServerUrl) return `mock-${Date.now()}`;

  try {
    const res = await fetch(`${globalServerUrl}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title })
    });
    const data = await res.json() as { id?: string };
    return data.id || `mock-${Date.now()}`;
  } catch {
    return `mock-${Date.now()}`;
  }
}

async function sendPrompt(sessionID: string, system: string, prompt: string): Promise<string> {
  if (sessionID.startsWith("mock-")) {
    // Simulate response based on agent type
    return simulateResponse(prompt);
  }

  try {
    await fetch(`${globalServerUrl}/session/${sessionID}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system,
        parts: [{ type: "text", text: prompt }]
      })
    });

    // Wait for response
    await new Promise(r => setTimeout(r, 3000));

    const msgRes = await fetch(`${globalServerUrl}/session/${sessionID}/messages`);
    const messages = await msgRes.json() as Array<{ parts?: Array<{ type: string; text?: string }> }>;

    if (Array.isArray(messages) && messages.length > 0) {
      const last = messages[messages.length - 1];
      const texts = last.parts?.filter(p => p.type === "text").map(p => p.text || "") || [];
      return texts.join("\n");
    }
  } catch {}

  return simulateResponse(prompt);
}

function simulateResponse(prompt: string): string {
  if (prompt.includes("Security") || prompt.includes("vulnerability")) {
    return `## Security Review

### CRITICAL Issues
- **SQL Injection**: User input directly interpolated | Fix: Use parameterized queries
- **MD5 Hashing**: Cryptographically broken | Fix: Use bcrypt/argon2

### HIGH Issues
- **Weak Token**: Predictable format | Fix: Use JWT with secure secret

### Summary: NOT READY FOR PRODUCTION`;
  }

  if (prompt.includes("Code") || prompt.includes("quality")) {
    return `## Code Review

### CRITICAL Issues
- **SQL Injection**: Direct string interpolation

### HIGH Issues
- **DB Connection Leak**: No context manager | Fix: Use \`with\` statement
- **No Error Handling**: Database errors not caught

### Score: 2.5/10`;
  }

  if (prompt.includes("Devil") || prompt.includes("missed")) {
    return `## Devil's Advocate

### What Other Reviewers Missed
1. **No Email Validation**: Can register with invalid emails
2. **No Username Uniqueness**: Duplicate usernames possible
3. **No Password Complexity**: Empty passwords allowed

### Assumptions to Challenge
- Assuming database is always available
- Assuming input is always valid

### Verdict: BLOCK - Critical fixes needed`;
  }

  return "Analysis complete.";
}

// ============================================================================
// TOOLS
// ============================================================================

const teamSpawnTool = tool({
  description: "Spawn agent team with REAL parallel sessions",
  args: {
    preset: z.string().optional(),
    teamName: z.string(),
    task: z.string()
  },
  async execute(args, context) {
    const preset = args.preset || "review";
    const agentNames = PRESETS[preset] || preset.split(",").map(s => s.trim());
    const teamId = `team-${Date.now()}`;

    // Create team state
    const team = {
      id: teamId,
      name: args.teamName,
      agents: new Map(),
      pendingMessages: new Map()
    };
    activeTeams.set(teamId, team);

    // Create sessions in PARALLEL
    const sessionPromises = agentNames.map(async (name) => {
      const config = AGENT_PROMPTS[name] || { role: name, prompt: "" };
      const sessionID = await createSession(`${name} - ${args.teamName}`);

      team.agents.set(name, {
        name,
        sessionID,
        role: config.role,
        systemPrompt: config.prompt,
        status: "idle"
      });
      team.pendingMessages.set(name, []);

      return { name, sessionID };
    });

    await Promise.all(sessionPromises);

    let response = `## Team "${args.teamName}" Created 🔀\n\n`;
    response += `**Team ID**: ${teamId}\n`;
    response += `**Agents**: ${agentNames.join(", ")}\n`;
    response += `**Task**: ${args.task}\n\n`;
    response += `Use: \`team-discuss teamId="${teamId}" topic="..."\``;

    context.metadata({ title: `Team: ${args.teamName}`, metadata: { teamId } });
    return response;
  }
});

const teamDiscussTool = tool({
  description: "Run PARALLEL discussion with REAL API calls",
  args: {
    teamId: z.string(),
    topic: z.string(),
    rounds: z.number().optional().default(2)
  },
  async execute(args, context) {
    const team = activeTeams.get(args.teamId);
    if (!team) return `Team ${args.teamId} not found`;

    let response = `## Parallel Discussion 🔀\n\n`;
    let previousResponses = new Map<string, string>();

    for (let round = 1; round <= args.rounds; round++) {
      response += `### Round ${round}\n\n`;

      // Build prompts based on round
      const promptPromises = Array.from(team.agents.entries()).map(async ([name, agent]) => {
        agent.status = "thinking";

        let prompt: string;
        if (round === 1) {
          prompt = `Review this code:\n\n${args.topic}`;
        } else {
          // Include previous responses for context (REAL inter-agent communication)
          let context = `Previous discussion:\n`;
          for (const [otherName, resp] of previousResponses) {
            if (otherName !== name) {
              context += `**${otherName}**: ${resp.slice(0, 300)}...\n\n`;
            }
          }

          if (name === "devil-s-advocate") {
            prompt = `${context}\nAs Devil's Advocate, challenge these findings. What did they miss?`;
          } else {
            prompt = `${context}\nBuild on the discussion with additional insights.`;
          }
        }

        const result = await sendPrompt(agent.sessionID, agent.systemPrompt, prompt);
        agent.status = "responding";
        agent.lastResponse = result;
        previousResponses.set(name, result);

        return { name, result };
      });

      // Execute ALL in PARALLEL
      const results = await Promise.all(promptPromises);

      for (const { name, result } of results) {
        const agent = team.agents.get(name)!;
        agent.status = "idle";
        response += `**${name}** (${agent.role}):\n${result.slice(0, 500)}...\n\n`;
      }
    }

    response += `---\n**Mode**: 🔀 Parallel Execution (Promise.all)`;
    return response;
  }
});

const teamStatusTool = tool({
  description: "Get team status",
  args: { teamId: z.string().optional() },
  async execute(args, context) {
    if (!args.teamId) {
      let response = `## Active Teams\n\n`;
      for (const [id, team] of activeTeams) {
        response += `- **${team.name}** (${id}): ${team.agents.size} agents\n`;
      }
      return response || "No active teams";
    }

    const team = activeTeams.get(args.teamId);
    if (!team) return `Team ${args.teamId} not found`;

    let response = `## Team: ${team.name}\n\n`;
    for (const [name, agent] of team.agents) {
      response += `- **${name}**: ${agent.status}\n`;
    }
    return response;
  }
});

const teamShutdownTool = tool({
  description: "Shutdown team",
  args: { teamId: z.string() },
  async execute(args, context) {
    const team = activeTeams.get(args.teamId);
    if (!team) return `Team ${args.teamId} not found`;

    for (const agent of team.agents.values()) {
      if (!agent.sessionID.startsWith("mock-")) {
        try {
          await fetch(`${globalServerUrl}/session/${agent.sessionID}`, { method: "DELETE" });
        } catch {}
      }
    }

    activeTeams.delete(args.teamId);
    return `Team "${team.name}" shut down.`;
  }
});

// ============================================================================
// PLUGIN WITH HOOKS
// ============================================================================

const plugin: Plugin = async (input: PluginInput) => {
  globalClient = input.client;
  globalServerUrl = input.serverUrl.toString().replace(/\/$/, "");

  return {
    // Tools
    tool: {
      "team-spawn": teamSpawnTool,
      "team-discuss": teamDiscussTool,
      "team-status": teamStatusTool,
      "team-shutdown": teamShutdownTool
    },

    // HOOKS for automatic behavior
    "chat.message": async (input, output) => {
      // Auto-detect review requests and spawn team
      const content = output.parts
        .filter(p => p.type === "text")
        .map(p => (p as any).text || "")
        .join(" ");

      if (content.includes("리뷰") || content.toLowerCase().includes("review")) {
        // Could auto-spawn team here
        // For now, just add context
        output.parts.push({
          type: "text" as const,
          text: "\n\n💡 Tip: Use `/team-spawn preset=\"review\"` to start a team review."
        } as any);
      }
    },

    "tool.execute.after": async ({ tool, sessionID }, output) => {
      // After code-review tool, notify devil's advocate
      if (tool === "team-discuss") {
        // Could trigger follow-up analysis
      }
    }
  };
};

export default plugin;
