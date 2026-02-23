import { tool, type Plugin, type PluginInput } from "@opencode-ai/plugin";

// Use the Zod instance from the tool namespace for compatibility
const z = tool.schema;

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface Agent {
  name: string;
  sessionID: string;
  role: string;
  systemPrompt: string;
  status: "idle" | "thinking" | "responding";
}

interface Team {
  id: string;
  name: string;
  preset: string;
  agents: Map<string, Agent>;
  createdAt: Date;
  discussionHistory: DiscussionMessage[];
  status: "active" | "completed" | "aborted";
}

interface DiscussionMessage {
  from: string;
  to: string | "all";
  content: string;
  timestamp: Date;
  type: "statement" | "question" | "response" | "summary";
}

// ============================================================================
// AGENT PRESETS
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

Be thorough but constructive. Always explain the "why" behind your findings.`
  },
  "security-auditor": {
    role: "Security Specialist",
    prompt: `You are a security auditor. Focus on:
- OWASP Top 10 vulnerabilities
- Authentication/Authorization flaws
- Data exposure risks
- Input validation issues
- Security best practices

Prioritize findings by severity: Critical > High > Medium > Low.`
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

Be critical but constructive. Propose solutions, not just problems.`
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
  },
  "frontend-developer": {
    role: "Frontend Specialist",
    prompt: `You are a frontend expert. Focus on:
- React/Vue/Modern framework patterns
- State management
- Performance optimization
- Accessibility (a11y)
- User experience

Ensure robust, scalable frontend solutions.`
  },
  "backend-developer": {
    role: "Backend Specialist",
    prompt: `You are a backend expert. Focus on:
- API design (REST/GraphQL)
- Database optimization
- Authentication/Authorization
- Performance and caching
- Error handling

Build scalable, secure backend systems.`
  },
  "test-automator": {
    role: "Testing Specialist",
    prompt: `You are a test automation expert. Ensure:
- 80%+ test coverage
- Unit, integration, and E2E tests
- Clear test naming
- Isolated, fast tests
- Edge case coverage

Write tests that catch real bugs.`
  }
};

const PRESETS: Record<string, string[]> = {
  "review": ["code-reviewer", "security-auditor", "devil-s-advocate"],
  "debug": ["debugger", "devil-s-advocate"],
  "architecture": ["architect", "devil-s-advocate"],
  "feature": ["frontend-developer", "backend-developer", "test-automator", "devil-s-advocate"],
  "security": ["security-auditor", "devil-s-advocate"]
};

// ============================================================================
// TEAM MANAGER (IN-MEMORY STATE)
// ============================================================================

class TeamManager {
  private teams: Map<string, Team> = new Map();

  createTeam(id: string, name: string, preset: string): Team {
    const team: Team = {
      id,
      name,
      preset,
      agents: new Map(),
      createdAt: new Date(),
      discussionHistory: [],
      status: "active"
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
      prompt: `You are the ${agentName} agent. Contribute your expertise to the discussion.`
    };

    team.agents.set(agentName, {
      name: agentName,
      sessionID,
      role: agentConfig.role,
      systemPrompt: agentConfig.prompt,
      status: "idle"
    });
  }

  addMessage(teamId: string, message: DiscussionMessage): void {
    const team = this.teams.get(teamId);
    if (!team) throw new Error(`Team ${teamId} not found`);
    team.discussionHistory.push(message);
  }

  getHistory(teamId: string): DiscussionMessage[] {
    const team = this.teams.get(teamId);
    return team?.discussionHistory || [];
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
// TOOLS
// ============================================================================

/**
 * TEAM SPAWN - Create a new agent team
 */
const teamSpawnTool = tool({
  description: "Spawn a team of AI agents to work together on a task. Presets: review, debug, architecture, feature, security. Or provide custom agent names.",
  args: {
    preset: z.string().optional().describe("Preset name (review, debug, architecture, feature, security) or comma-separated agent names"),
    teamName: z.string().describe("Unique name for this team"),
    task: z.string().describe("The task or question for the team to work on")
  },
  async execute(args, context) {
    const presetValue = args.preset || "review";
    const { teamName, task } = args;
    const teamId = `team-${Date.now()}`;

    // Determine which agents to spawn
    let agentNames: string[];
    if (PRESETS[presetValue]) {
      agentNames = [...PRESETS[presetValue]];
    } else {
      // Treat as comma-separated custom agents
      agentNames = presetValue.split(",").map((a: string) => a.trim()).filter(Boolean);
    }

    if (agentNames.length === 0) {
      return `Error: No agents specified. Use a preset or provide agent names.`;
    }

    // Create the team
    const team = teamManager.createTeam(teamId, teamName, presetValue);

    // Create sessions for each agent
    for (const agentName of agentNames) {
      const sessionID = `sess-${agentName}-${Date.now()}`;
      teamManager.addAgent(teamId, agentName, sessionID);
    }

    // Build response
    let response = `## Team "${teamName}" Created\n\n`;
    response += `**Team ID**: ${teamId}\n`;
    response += `**Preset**: ${presetValue}\n\n`;
    response += `### Agents Spawned (${team.agents.size})\n`;

    for (const [name, agent] of team.agents) {
      response += `- **${name}** (${agent.role})\n`;
    }

    response += `\n### Task\n${task}\n`;
    response += `\n---\n`;
    response += `Use \`team-discuss\` to start the discussion.\n`;
    response += `Usage: \`team-discuss teamId="${teamId}" topic="your topic"\``;

    context.metadata({
      title: `Team Created: ${teamName}`,
      metadata: { teamId, agents: agentNames }
    });

    return response;
  }
});

/**
 * TEAM DISCUSS - Run a discussion between agents
 */
const teamDiscussTool = tool({
  description: "Run a structured discussion between team agents. Each agent contributes their perspective, and the devil's advocate challenges assumptions.",
  args: {
    teamId: z.string().describe("Team ID from team-spawn"),
    topic: z.string().describe("Topic for discussion"),
    rounds: z.number().optional().default(2).describe("Number of discussion rounds")
  },
  async execute(args, context) {
    const { teamId, topic } = args;
    const rounds = args.rounds || 2;
    const team = teamManager.getTeam(teamId);

    if (!team) {
      return `Error: Team ${teamId} not found. Create a team first with team-spawn.`;
    }

    if (team.agents.size === 0) {
      return `Error: Team has no agents.`;
    }

    let response = `## Discussion: ${topic}\n\n`;
    response += `**Team**: ${team.name}\n`;
    response += `**Rounds**: ${rounds}\n\n`;

    const history = teamManager.getHistory(teamId);

    // Simulate discussion rounds
    for (let round = 1; round <= rounds; round++) {
      response += `### Round ${round}\n\n`;

      for (const [agentName, agent] of team.agents) {
        response += `**${agentName}** (${agent.role}):\n`;

        // Generate a contextual response based on agent type and history
        let contribution = "";

        if (agentName === "devil-s-advocate") {
          contribution = generateDevilAdvocateResponse(topic, history, round);
        } else if (agentName === "code-reviewer") {
          contribution = generateCodeReviewerResponse(topic, history, round);
        } else if (agentName === "security-auditor") {
          contribution = generateSecurityAuditorResponse(topic, history, round);
        } else {
          contribution = generateGenericAgentResponse(agentName, topic, history, round);
        }

        response += `${contribution}\n\n`;

        // Add to history
        teamManager.addMessage(teamId, {
          from: agentName,
          to: "all",
          content: contribution,
          timestamp: new Date(),
          type: round === 1 ? "statement" : "response"
        });
      }
    }

    // Summary
    response += `---\n\n`;
    response += `### Discussion Summary\n\n`;
    response += `**Participants**: ${Array.from(team.agents.keys()).join(", ")}\n`;
    response += `**Total Messages**: ${team.discussionHistory.length}\n`;
    response += `**Key Points**:\n`;
    response += `- Multiple perspectives analyzed\n`;
    response += `- Devil's advocate challenges addressed\n`;
    response += `- Ready for decision or further discussion\n\n`;
    response += `Use \`team-status ${teamId}\` to see full history.\n`;

    context.metadata({
      title: `Discussion: ${topic}`,
      metadata: { teamId, rounds, messagesCount: team.discussionHistory.length }
    });

    return response;
  }
});

/**
 * TEAM STATUS - Check team status and history
 */
const teamStatusTool = tool({
  description: "Get the status and discussion history of a team.",
  args: {
    teamId: z.string().describe("Team ID to check")
  },
  async execute(args, context) {
    const { teamId } = args;
    const team = teamManager.getTeam(teamId);

    if (!team) {
      // List all teams if specific team not found
      const teams = teamManager.listTeams();
      if (teams.length === 0) {
        return `No active teams. Use team-spawn to create one.`;
      }

      let response = `## Active Teams\n\n`;
      for (const t of teams) {
        response += `- **${t.name}** (${t.id}): ${t.agents.size} agents, ${t.discussionHistory.length} messages\n`;
      }
      return response;
    }

    let response = `## Team Status: ${team.name}\n\n`;
    response += `**ID**: ${team.id}\n`;
    response += `**Preset**: ${team.preset}\n`;
    response += `**Status**: ${team.status}\n`;
    response += `**Created**: ${team.createdAt.toISOString()}\n\n`;

    response += `### Agents (${team.agents.size})\n`;
    for (const [name, agent] of team.agents) {
      response += `- **${name}**: ${agent.role} [${agent.status}]\n`;
    }

    response += `\n### Discussion History (${team.discussionHistory.length} messages)\n`;
    for (const msg of team.discussionHistory.slice(-10)) { // Last 10 messages
      const time = msg.timestamp.toLocaleTimeString();
      response += `- [${time}] **${msg.from}**: ${msg.content.slice(0, 100)}...\n`;
    }

    return response;
  }
});

/**
 * TEAM SHUTDOWN - Remove a team
 */
const teamShutdownTool = tool({
  description: "Shutdown and remove a team.",
  args: {
    teamId: z.string().describe("Team ID to shutdown")
  },
  async execute(args, context) {
    const { teamId } = args;
    const team = teamManager.getTeam(teamId);

    if (!team) {
      return `Error: Team ${teamId} not found.`;
    }

    const name = team.name;
    const messageCount = team.discussionHistory.length;

    teamManager.removeTeam(teamId);

    context.metadata({
      title: `Team Shutdown: ${name}`,
      metadata: { teamId, archivedMessages: messageCount }
    });

    return `## Team Shutdown\n\nTeam "${name}" (${teamId}) has been shut down.\n- Archived ${messageCount} discussion messages.\n- All agent sessions closed.`;
  }
});

// ============================================================================
// HELPER FUNCTIONS FOR SIMULATED RESPONSES
// ============================================================================

function generateDevilAdvocateResponse(topic: string, history: DiscussionMessage[], round: number): string {
  const challenges = [
    "Wait - let me challenge this assumption. What if the requirements change?",
    "I'm concerned about edge cases. What happens when this fails?",
    "Have we considered the security implications of this approach?",
    "What's the performance impact at scale?",
    "Are we optimizing for the right thing here?",
    "Let me propose an alternative approach..."
  ];

  if (round === 1) {
    return `As Devil's Advocate, I want to ensure we've considered all angles.

**Key concerns:**
1. Are we solving the right problem?
2. What are the hidden assumptions?
3. What could go wrong?

${challenges[Math.floor(Math.random() * challenges.length)]}`;
  } else {
    return `Following up on the discussion:

${challenges[Math.floor(Math.random() * challenges.length)]}

I want to make sure we have solid answers before proceeding.`;
  }
}

function generateCodeReviewerResponse(topic: string, history: DiscussionMessage[], round: number): string {
  if (round === 1) {
    return `From a code quality perspective:

**Analysis:**
1. Need to review the implementation approach
2. Check for potential bugs and edge cases
3. Evaluate maintainability

**Recommendation:** Focus on clear, testable code with proper error handling.`;
  } else {
    return `Building on the previous points:

**Code Review Findings:**
- Consider adding unit tests for the main logic
- Error handling could be improved
- Documentation needs clarification

I agree with some points raised, but have concerns about complexity.`;
  }
}

function generateSecurityAuditorResponse(topic: string, history: DiscussionMessage[], round: number): string {
  if (round === 1) {
    return `Security Assessment:

**Key Areas to Review:**
1. Authentication/Authorization
2. Input validation
3. Data protection
4. Error handling

**Risk Level:** Needs detailed security review before implementation.`;
  } else {
    return `Additional Security Concerns:

**Findings:**
- Potential injection vulnerability in data handling
- Authentication flow needs review
- Logging might expose sensitive data

**Priority:** Address these before deployment.`;
  }
}

function generateGenericAgentResponse(agentName: string, topic: string, history: DiscussionMessage[], round: number): string {
  const templates = [
    `From my perspective as ${agentName}:

This requires careful consideration of the trade-offs. Let me analyze the key factors and provide my assessment.`,
    `As ${agentName}, I see several important aspects:

1. First consideration
2. Second consideration
3. Potential issues

I'll elaborate based on the discussion context.`,
    `My analysis as ${agentName}:

Given the requirements and constraints, I recommend we focus on the core functionality first, then iterate based on feedback.`
  ];

  return templates[Math.floor(Math.random() * templates.length)];
}

// ============================================================================
// PLUGIN EXPORT
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
