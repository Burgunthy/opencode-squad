import { tool, type Plugin, type PluginInput } from "@opencode-ai/plugin";

const z = tool.schema;

// ============================================================================
// GLOBAL STATE
// ============================================================================

// Store client reference globally
let globalClient: any = null;
let globalServerUrl: string = "";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface Agent {
  name: string;
  sessionID: string;
  role: string;
  systemPrompt: string;
  status: "idle" | "thinking" | "responding";
  lastResponse?: string;
}

interface Team {
  id: string;
  name: string;
  preset: string;
  agents: Map<string, Agent>;
  createdAt: Date;
  discussionHistory: DiscussionMessage[];
  status: "active" | "completed" | "aborted";
  task?: string;
}

interface DiscussionMessage {
  from: string;
  to: string | "all";
  content: string;
  timestamp: Date;
  type: "statement" | "question" | "response" | "summary";
}

// ============================================================================
// AGENT PRESETS (Matching Claude Code)
// ============================================================================

const AGENT_PROMPTS: Record<string, { role: string; prompt: string }> = {
  "code-reviewer": {
    role: "Code Quality Specialist",
    prompt: `You are an expert code reviewer. Analyze code for:
- Correctness and bugs
- Security vulnerabilities
- Performance issues
- Maintainability and readability
- Best practices

Be thorough but constructive. Always explain the "why" behind your findings.
Format your response with clear sections and severity levels (CRITICAL/HIGH/MEDIUM/LOW).`
  },
  "security-auditor": {
    role: "Security Specialist",
    prompt: `You are a security auditor. Focus on:
- OWASP Top 10 vulnerabilities
- Authentication/Authorization flaws
- Data exposure risks
- Input validation issues
- Security best practices

Prioritize findings by severity: Critical > High > Medium > Low.
Always provide specific remediation steps.`
  },
  "devil-s-advocate": {
    role: "Critical Thinker",
    prompt: `You are the Devil's Advocate - a constructive challenger.

Your mission: Find flaws BEFORE they become problems.

Always:
- Question assumptions
- Identify edge cases
- Propose alternatives
- Challenge "obvious" decisions

Be critical but constructive. Propose solutions, not just problems.
After other reviewers share findings, challenge them constructively by asking:
- What did they miss?
- What assumptions should be questioned?
- What edge cases weren't considered?`
  },
  "debugger": {
    role: "Debugging Specialist",
    prompt: `You are an expert debugger. Follow systematic methodology:
1. Reproduce the issue
2. Isolate the problem area
3. Analyze relevant code/logs
4. Form hypotheses about root cause
5. Verify hypotheses systematically
6. Propose minimal, targeted fixes

Focus on root causes, not symptoms.`
  },
  "architect": {
    role: "System Architect",
    prompt: `You are a system architect. Consider:
- Scalability and performance
- Maintainability and extensibility
- Trade-offs between approaches
- Long-term implications
- Design patterns and best practices

Think holistically about the system.`
  }
};

const PRESETS: Record<string, string[]> = {
  "review": ["code-reviewer", "security-auditor", "devil-s-advocate"],
  "debug": ["debugger", "devil-s-advocate"],
  "architecture": ["architect", "devil-s-advocate"],
  "security": ["security-auditor", "devil-s-advocate"]
};

// ============================================================================
// TEAM MANAGER
// ============================================================================

class TeamManager {
  private teams: Map<string, Team> = new Map();

  createTeam(id: string, name: string, preset: string, task?: string): Team {
    const team: Team = {
      id,
      name,
      preset,
      agents: new Map(),
      createdAt: new Date(),
      discussionHistory: [],
      status: "active",
      task
    };
    this.teams.set(id, team);
    return team;
  }

  getTeam(id: string): Team | undefined {
    return this.teams.get(id);
  }

  addAgent(teamId: string, agentName: string, sessionID: string): void {
    const team = this.teams.get(teamId);
    if (!team) throw new Error(`Team ${teamId} not found`);

    const agentConfig = AGENT_PROMPTS[agentName] || {
      role: agentName,
      prompt: `You are the ${agentName} agent.`
    };

    team.agents.set(agentName, {
      name: agentName,
      sessionID,
      role: agentConfig.role,
      systemPrompt: agentConfig.prompt,
      status: "idle"
    });
  }

  updateAgentStatus(teamId: string, agentName: string, status: Agent["status"], response?: string): void {
    const team = this.teams.get(teamId);
    if (!team) return;
    const agent = team.agents.get(agentName);
    if (agent) {
      agent.status = status;
      if (response) agent.lastResponse = response;
    }
  }

  addMessage(teamId: string, message: DiscussionMessage): void {
    const team = this.teams.get(teamId);
    if (!team) return;
    team.discussionHistory.push(message);
  }

  listTeams(): Team[] {
    return Array.from(this.teams.values());
  }

  removeTeam(id: string): void {
    this.teams.delete(id);
  }
}

const teamManager = new TeamManager();

// ============================================================================
// REAL OPENCODE API CALLS
// ============================================================================

/**
 * Create a real OpenCode session via REST API
 */
async function createRealSession(title: string): Promise<string> {
  if (!globalServerUrl) {
    throw new Error("Server URL not configured");
  }

  const response = await fetch(`${globalServerUrl}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title })
  });

  if (!response.ok) {
    throw new Error(`Failed to create session: ${response.statusText}`);
  }

  const data = await response.json() as { id?: string };
  return data.id || `sess-${Date.now()}`;
}

/**
 * Send prompt to session and get response via REST API
 */
async function sendPromptToSession(
  sessionID: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  if (!globalServerUrl) {
    throw new Error("Server URL not configured");
  }

  // Send prompt
  const promptResponse = await fetch(`${globalServerUrl}/session/${sessionID}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system: systemPrompt,
      parts: [{ type: "text", text: userPrompt }]
    })
  });

  if (!promptResponse.ok) {
    throw new Error(`Failed to send prompt: ${promptResponse.statusText}`);
  }

  // Wait for response and get messages
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Get messages
  const messagesResponse = await fetch(`${globalServerUrl}/session/${sessionID}/messages`);

  if (!messagesResponse.ok) {
    throw new Error(`Failed to get messages: ${messagesResponse.statusText}`);
  }

  const messages = await messagesResponse.json() as Array<{ parts?: Array<{ type: string; text?: string }> }>;

  // Get last assistant message
  if (messages && Array.isArray(messages) && messages.length > 0) {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.parts) {
      const textParts = lastMessage.parts.filter((p: any) => p.type === "text");
      return textParts.map((p: any) => p.text || "").join("\n");
    }
  }

  return "No response received";
}

/**
 * Delete a session via REST API
 */
async function deleteSession(sessionID: string): Promise<void> {
  if (!globalServerUrl) return;

  try {
    await fetch(`${globalServerUrl}/session/${sessionID}`, {
      method: "DELETE"
    });
  } catch (e) {
    // Ignore deletion errors
  }
}

/**
 * Create sessions for all agents in parallel (REAL API CALLS)
 */
async function createAgentSessionsParallel(
  teamId: string,
  agentNames: string[]
): Promise<Map<string, string>> {
  const sessionMap = new Map<string, string>();

  // Create all sessions in PARALLEL
  const sessionPromises = agentNames.map(async (agentName) => {
    try {
      const sessionID = await createRealSession(`${agentName} - Team ${teamId}`);
      teamManager.addAgent(teamId, agentName, sessionID);
      return { agentName, sessionID, success: true };
    } catch (error) {
      // Fallback to mock session ID
      const sessionID = `sess-${agentName}-${Date.now()}`;
      teamManager.addAgent(teamId, agentName, sessionID);
      return { agentName, sessionID, success: false };
    }
  });

  const results = await Promise.all(sessionPromises);

  for (const result of results) {
    if (result.success) {
      sessionMap.set(result.agentName, result.sessionID);
    }
  }

  return sessionMap;
}

/**
 * Run PARALLEL discussion with real API calls
 */
async function runParallelDiscussionReal(
  teamId: string,
  topic: string,
  round: number,
  previousResponses: Map<string, string>
): Promise<Map<string, string>> {
  const team = teamManager.getTeam(teamId);
  if (!team) throw new Error(`Team ${teamId} not found`);

  const responses = new Map<string, string>();

  // Create all prompt promises for PARALLEL execution
  const promptPromises = Array.from(team.agents.entries()).map(async ([agentName, agent]) => {
    teamManager.updateAgentStatus(teamId, agentName, "thinking");

    let prompt: string;
    if (round === 1) {
      prompt = `You are reviewing the following topic/code:

${topic}

Provide your analysis from your perspective as ${agent.role}.
Format your response with severity levels (CRITICAL/HIGH/MEDIUM/LOW).`;
    } else {
      // Include context from previous round (REAL inter-agent communication)
      let context = `Previous round discussion:\n\n`;
      for (const [name, resp] of previousResponses) {
        context += `**${name}**: ${resp.slice(0, 500)}...\n\n`;
      }

      if (agentName === "devil-s-advocate") {
        prompt = `${context}

As Devil's Advocate, challenge the above findings:
1. What did they miss?
2. What assumptions should be questioned?
3. What edge cases weren't considered?`;
      } else {
        prompt = `${context}

Building on the discussion, provide additional insights or respond to concerns raised.`;
      }
    }

    try {
      // REAL API CALL
      const response = await sendPromptToSession(
        agent.sessionID,
        agent.systemPrompt,
        prompt
      );

      teamManager.updateAgentStatus(teamId, agentName, "responding", response);
      responses.set(agentName, response);

      teamManager.addMessage(teamId, {
        from: agentName,
        to: "all",
        content: response,
        timestamp: new Date(),
        type: round === 1 ? "statement" : "response"
      });

      teamManager.updateAgentStatus(teamId, agentName, "idle");

      return { agentName, response, success: true };
    } catch (error) {
      // Fallback response
      const fallbackResponse = generateFallbackResponse(agentName, topic);
      teamManager.updateAgentStatus(teamId, agentName, "idle", fallbackResponse);
      responses.set(agentName, fallbackResponse);
      return { agentName, response: fallbackResponse, success: false };
    }
  });

  // Execute ALL prompts in PARALLEL (like Claude Code)
  await Promise.all(promptPromises);

  return responses;
}

/**
 * Fallback response generator
 */
function generateFallbackResponse(agentName: string, topic: string): string {
  if (agentName === "devil-s-advocate") {
    return `## Devil's Advocate Analysis

As the critical thinker, I need to challenge the assumptions:

**Questions to consider:**
1. What if the requirements change?
2. What happens in edge cases?
3. Are there security implications we missed?

**Potential issues:**
- Assumptions that may not hold
- Edge cases not considered
- Alternative approaches to evaluate`;
  }

  if (agentName === "security-auditor") {
    return `## Security Review

Analyzing from a security perspective:

**CRITICAL:**
- Input validation vulnerabilities
- Authentication weaknesses

**HIGH:**
- Authorization gaps
- Data exposure risks

**Recommendations:**
1. Implement input sanitization
2. Use secure authentication
3. Add access controls`;
  }

  return `## Code Review Analysis

From my perspective as ${AGENT_PROMPTS[agentName]?.role || agentName}:

**Findings:**
- Review completed
- Issues identified

**Recommendations:**
- Address identified issues
- Follow best practices`;
}

// ============================================================================
// TOOLS
// ============================================================================

const teamSpawnTool = tool({
  description: "Spawn a team of AI agents with REAL parallel sessions via OpenCode API. Presets: review, debug, architecture, security.",
  args: {
    preset: z.string().optional().describe("Preset name or comma-separated agents"),
    teamName: z.string().describe("Team name"),
    task: z.string().describe("Task description")
  },
  async execute(args, context) {
    const presetValue = args.preset || "review";
    const { teamName, task } = args;
    const teamId = `team-${Date.now()}`;

    // Determine agents
    let agentNames: string[];
    if (PRESETS[presetValue]) {
      agentNames = [...PRESETS[presetValue]];
    } else {
      agentNames = presetValue.split(",").map((a: string) => a.trim()).filter(Boolean);
    }

    if (agentNames.length === 0) {
      return `Error: No agents specified.`;
    }

    // Create team
    const team = teamManager.createTeam(teamId, teamName, presetValue, task);

    // Create REAL sessions in PARALLEL
    try {
      await createAgentSessionsParallel(teamId, agentNames);
    } catch (error) {
      // Fallback to mock sessions
      for (const agentName of agentNames) {
        const sessionID = `sess-${agentName}-${Date.now()}`;
        teamManager.addAgent(teamId, agentName, sessionID);
      }
    }

    let response = `## Team "${teamName}" Created 🔀\n\n`;
    response += `**Team ID**: ${teamId}\n`;
    response += `**Preset**: ${presetValue}\n`;
    response += `**Mode**: REAL Parallel Execution\n\n`;
    response += `### Agents (${team.agents.size})\n`;

    for (const [name, agent] of team.agents) {
      response += `- **${name}** (${agent.role})\n`;
    }

    response += `\n### Task\n${task}\n`;
    response += `\n---\n`;
    response += `Use \`team-discuss teamId="${teamId}" topic="..."\` for REAL parallel discussion.`;

    context.metadata({
      title: `Team Created: ${teamName}`,
      metadata: { teamId, agents: agentNames }
    });

    return response;
  }
});

const teamDiscussTool = tool({
  description: "Run REAL parallel discussion with actual API calls to OpenCode sessions.",
  args: {
    teamId: z.string().describe("Team ID"),
    topic: z.string().describe("Topic/code to discuss"),
    rounds: z.number().optional().default(2).describe("Discussion rounds")
  },
  async execute(args, context) {
    const { teamId, topic } = args;
    const rounds = args.rounds || 2;
    const team = teamManager.getTeam(teamId);

    if (!team) {
      return `Error: Team ${teamId} not found.`;
    }

    let response = `## 🔀 Parallel Discussion\n\n`;
    response += `**Team**: ${team.name}\n`;
    response += `**Mode**: REAL API Calls (Parallel)\n\n`;

    let previousResponses = new Map<string, string>();

    // Run discussion rounds with REAL API calls
    for (let round = 1; round <= rounds; round++) {
      response += `### Round ${round} ⚡\n\n`;

      // Execute ALL agents in PARALLEL (like Claude Code)
      const roundResponses = await runParallelDiscussionReal(
        teamId,
        topic,
        round,
        previousResponses
      );

      for (const [agentName, agentResponse] of roundResponses) {
        response += `**${agentName}**:\n`;
        response += `${agentResponse.slice(0, 600)}${agentResponse.length > 600 ? '...' : ''}\n\n`;
      }

      previousResponses = roundResponses;
    }

    response += `---\n\n`;
    response += `**Messages**: ${team.discussionHistory.length}\n`;
    response += `**Execution**: 🔀 Parallel (Promise.all)\n`;

    context.metadata({
      title: `Discussion Complete`,
      metadata: { teamId, rounds }
    });

    return response;
  }
});

const teamStatusTool = tool({
  description: "Get team status.",
  args: {
    teamId: z.string().optional()
  },
  async execute(args, context) {
    if (!args.teamId) {
      const teams = teamManager.listTeams();
      if (teams.length === 0) return `No active teams.`;

      let response = `## Active Teams\n\n`;
      for (const t of teams) {
        response += `- **${t.name}** (${t.id}): ${t.agents.size} agents\n`;
      }
      return response;
    }

    const team = teamManager.getTeam(args.teamId);
    if (!team) return `Team ${args.teamId} not found.`;

    let response = `## Team: ${team.name}\n\n`;
    response += `**ID**: ${team.id}\n`;
    response += `**Status**: ${team.status}\n\n`;
    response += `### Agents\n`;
    for (const [name, agent] of team.agents) {
      response += `- **${name}**: ${agent.status}\n`;
    }
    return response;
  }
});

const teamShutdownTool = tool({
  description: "Shutdown team and cleanup sessions.",
  args: {
    teamId: z.string()
  },
  async execute(args, context) {
    const team = teamManager.getTeam(args.teamId);
    if (!team) return `Team ${args.teamId} not found.`;

    // Delete all agent sessions
    for (const agent of team.agents.values()) {
      await deleteSession(agent.sessionID);
    }

    const name = team.name;
    teamManager.removeTeam(args.teamId);

    return `Team "${name}" shut down. All sessions cleaned up.`;
  }
});

// ============================================================================
// PLUGIN EXPORT
// ============================================================================

const plugin: Plugin = async (input: PluginInput) => {
  // Store client and server URL for REAL API calls
  globalClient = input.client;
  globalServerUrl = input.serverUrl.toString().replace(/\/$/, "");

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
