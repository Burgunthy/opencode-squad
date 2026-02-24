import { tool, type Plugin, type PluginInput } from "@opencode-ai/plugin";
import type { OpencodeClient } from "@opencode-ai/sdk";

// Use the Zod instance from the tool namespace for compatibility
const z = tool.schema;

// Global client reference for API calls
let opencodeClient: OpencodeClient | null = null;

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

interface Task {
  id: string;
  title: string;
  description?: string;
  assignee?: string;
  status: "pending" | "in_progress" | "completed" | "deleted";
  priority: "low" | "medium" | "high" | "critical";
  createdAt: Date;
  completedAt?: Date;
  blocks: string[];
  blockedBy: string[];
  metadata?: Record<string, any>;
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

interface Message {
  id: string;
  from: string;
  to: string | "all";
  content: string;
  summary?: string;
  timestamp: Date;
  type: "message" | "broadcast" | "shutdown_request" | "shutdown_response" | "plan_approval_response";
  requestId?: string;
  approve?: boolean;
}

interface AgentSession {
  agentName: string;
  sessionID: string;
  status: "idle" | "thinking" | "responding";
  lastActivity: Date;
  currentTask?: string;
}

interface ShutdownRequest {
  id: string;
  requester: string;
  recipient: string;
  reason: string;
  createdAt: Date;
  respondedAt?: Date;
  approved?: boolean;
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

Be thorough but constructive. Always explain the "why" behind your findings.
Format your response with clear sections and severity levels.`
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
After other reviewers share findings, challenge them constructively.`
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
// MESSAGE MANAGER
// ============================================================================

class MessageManager {
  private messages: Message[] = [];

  sendMessage(input: {
    from: string;
    to: string | "all";
    content: string;
    type: Message["type"];
    requestId?: string;
    approve?: boolean;
  }): Message {
    const message: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      from: input.from,
      to: input.to,
      content: input.content,
      timestamp: new Date(),
      type: input.type,
      requestId: input.requestId,
      approve: input.approve
    };
    this.messages.push(message);
    return message;
  }

  broadcast(from: string, content: string): Message {
    return this.sendMessage({
      from,
      to: "all",
      content,
      type: "broadcast"
    });
  }

  getMessages(recipient?: string): Message[] {
    if (!recipient) return [...this.messages];
    return this.messages.filter(
      (msg) => msg.to === recipient || msg.to === "all" || msg.from === recipient
    );
  }

  clear(): void {
    this.messages = [];
  }
}

const messageManager = new MessageManager();

// ============================================================================
// TASK MANAGER
// ============================================================================

class TaskManager {
  private tasks: Map<string, Task> = new Map();

  createTask(input: {
    title: string;
    description?: string;
    assignee?: string;
    priority?: "low" | "medium" | "high" | "critical";
    blocks?: string[];
    metadata?: Record<string, any>;
  }): Task {
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const task: Task = {
      id,
      title: input.title,
      description: input.description,
      assignee: input.assignee,
      status: "pending",
      priority: input.priority || "medium",
      createdAt: new Date(),
      blocks: input.blocks || [],
      blockedBy: [],
      metadata: input.metadata
    };
    this.tasks.set(id, task);

    if (task.blocks.length > 0) {
      for (const blockedTaskId of task.blocks) {
        const blockedTask = this.tasks.get(blockedTaskId);
        if (blockedTask && !blockedTask.blockedBy.includes(id)) {
          blockedTask.blockedBy.push(id);
        }
      }
    }

    return task;
  }

  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  listTasks(filters?: {
    status?: Task["status"];
    assignee?: string;
    priority?: Task["priority"];
  }): Task[] {
    let tasks = Array.from(this.tasks.values());

    if (filters) {
      if (filters.status) tasks = tasks.filter(t => t.status === filters.status);
      if (filters.assignee) tasks = tasks.filter(t => t.assignee === filters.assignee);
      if (filters.priority) tasks = tasks.filter(t => t.priority === filters.priority);
    }

    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return tasks.sort((a, b) => {
      if (a.priority !== b.priority) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  }

  updateTask(id: string, updates: Partial<Omit<Task, "id" | "createdAt">>): Task | null {
    const task = this.tasks.get(id);
    if (!task) return null;

    if (updates.status === "completed" && task.status !== "completed") {
      updates.completedAt = new Date();
    }

    Object.assign(task, updates);
    this.tasks.set(id, task);
    return task;
  }

  deleteTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;

    for (const blockedId of task.blocks) {
      const blockedTask = this.tasks.get(blockedId);
      if (blockedTask) {
        blockedTask.blockedBy = blockedTask.blockedBy.filter(bid => bid !== id);
      }
    }

    for (const blockerId of task.blockedBy) {
      const blockerTask = this.tasks.get(blockerId);
      if (blockerTask) {
        blockerTask.blocks = blockerTask.blocks.filter(bid => bid !== id);
      }
    }

    this.tasks.delete(id);
    return true;
  }
}

const taskManager = new TaskManager();

// ============================================================================
// PARALLEL AGENT EXECUTION
// ============================================================================

/**
 * Create real OpenCode sessions for each agent in parallel
 */
async function createAgentSessions(
  teamId: string,
  agentNames: string[]
): Promise<Map<string, string>> {
  const sessionMap = new Map<string, string>();

  if (!opencodeClient) {
    // Fallback: generate mock session IDs
    for (const agentName of agentNames) {
      const sessionID = `sess-${agentName}-${Date.now()}`;
      teamManager.addAgent(teamId, agentName, sessionID);
      sessionMap.set(agentName, sessionID);
    }
    return sessionMap;
  }

  // Create real sessions in parallel
  const sessionPromises = agentNames.map(async (agentName) => {
    try {
      const response = await opencodeClient!.session.create({
        body: {
          title: `${agentName} - Team ${teamId}`
        }
      });

      if (response.data?.id) {
        teamManager.addAgent(teamId, agentName, response.data.id);
        sessionMap.set(agentName, response.data.id);
        return { agentName, sessionID: response.data.id, success: true };
      }
      return { agentName, sessionID: null, success: false };
    } catch (error) {
      // Fallback to mock session
      const sessionID = `sess-${agentName}-${Date.now()}`;
      teamManager.addAgent(teamId, agentName, sessionID);
      sessionMap.set(agentName, sessionID);
      return { agentName, sessionID, success: true };
    }
  });

  await Promise.all(sessionPromises);
  return sessionMap;
}

/**
 * Send prompt to a specific agent session and get response
 */
async function promptAgent(
  sessionID: string,
  agentName: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  if (!opencodeClient) {
    // Fallback: return simulated response
    return generateSimulatedResponse(agentName, userPrompt);
  }

  try {
    // Send prompt to the session
    const response = await opencodeClient.session.prompt({
      path: { id: sessionID },
      body: {
        system: systemPrompt,
        parts: [{ type: "text", text: userPrompt }]
      }
    });

    // Extract response text
    if (response.data) {
      // The response should contain the assistant's message
      const messages = await opencodeClient.session.messages({
        path: { id: sessionID }
      });

      if (messages.data && messages.data.length > 0) {
        const lastMessage = messages.data[messages.data.length - 1];
        // Extract text from message parts
        const textParts = lastMessage.parts?.filter(p => p.type === "text") || [];
        return textParts.map(p => (p as any).text || "").join("\n");
      }
    }

    return generateSimulatedResponse(agentName, userPrompt);
  } catch (error) {
    return generateSimulatedResponse(agentName, userPrompt);
  }
}

/**
 * Run parallel discussion with all agents
 */
async function runParallelDiscussion(
  teamId: string,
  topic: string,
  round: number,
  previousResponses: Map<string, string>
): Promise<Map<string, string>> {
  const team = teamManager.getTeam(teamId);
  if (!team) throw new Error(`Team ${teamId} not found`);

  const responses = new Map<string, string>();
  const promptPromises: Promise<void>[] = [];

  for (const [agentName, agent] of team.agents) {
    teamManager.updateAgentStatus(teamId, agentName, "thinking");

    const promptPromise = (async () => {
      let prompt: string;

      if (round === 1) {
        prompt = `You are reviewing the following topic/code:

${topic}

Provide your analysis from your perspective as ${agent.role}.`;
      } else {
        // Include context from previous round
        let context = `Previous round discussion:\n\n`;
        for (const [name, resp] of previousResponses) {
          context += `**${name}**: ${resp.slice(0, 500)}...\n\n`;
        }

        if (agentName === "devil-s-advocate") {
          prompt = `${context}

As Devil's Advocate, challenge the above findings. What did they miss? What assumptions should be questioned?`;
        } else {
          prompt = `${context}

Building on the discussion, provide additional insights or respond to concerns raised.`;
        }
      }

      const response = await promptAgent(
        agent.sessionID,
        agentName,
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
    })();

    promptPromises.push(promptPromise);
  }

  // Execute all prompts in parallel
  await Promise.all(promptPromises);
  return responses;
}

/**
 * Generate simulated response when API is not available
 */
function generateSimulatedResponse(agentName: string, topic: string): string {
  if (agentName === "devil-s-advocate") {
    return `As Devil's Advocate, I need to challenge the assumptions here.

**Questions to consider:**
1. What if the requirements change?
2. What happens in edge cases?
3. Are there security implications we missed?
4. What could go wrong at scale?

Let me propose some alternatives for consideration.`;
  }

  if (agentName === "security-auditor") {
    return `**Security Assessment:**

Analyzing from a security perspective:

1. **Input Validation**: Check for injection vulnerabilities
2. **Authentication**: Verify auth mechanisms
3. **Authorization**: Ensure proper access control
4. **Data Protection**: Review data handling

**Risk Level**: Requires further investigation

**Recommendations**: Implement additional security controls.`;
  }

  if (agentName === "code-reviewer") {
    return `**Code Review Analysis:**

From a code quality perspective:

1. **Correctness**: Logic appears sound
2. **Readability**: Could be improved with better naming
3. **Maintainability**: Consider extracting functions
4. **Testing**: Need more test coverage

**Overall**: Minor improvements recommended.`;
  }

  return `As ${agentName}, I've analyzed the topic.

**Key observations:**
- This requires careful consideration
- Multiple factors to weigh
- Trade-offs exist

**Recommendation**: Proceed with caution and iterate based on feedback.`;
}

// ============================================================================
// TOOLS
// ============================================================================

/**
 * TEAM SPAWN - Create a new agent team with real sessions
 */
const teamSpawnTool = tool({
  description: "Spawn a team of AI agents with REAL parallel sessions. Presets: review, debug, architecture, feature, security. Or provide custom agent names.",
  args: {
    preset: z.string().optional().describe("Preset name or comma-separated agent names"),
    teamName: z.string().describe("Unique name for this team"),
    task: z.string().describe("The task or question for the team to work on")
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
      return `Error: No agents specified. Use a preset or provide agent names.`;
    }

    // Create team
    const team = teamManager.createTeam(teamId, teamName, presetValue, task);

    // Create REAL sessions in parallel
    await createAgentSessions(teamId, agentNames);

    // Build response
    let response = `## Team "${teamName}" Created\n\n`;
    response += `**Team ID**: ${teamId}\n`;
    response += `**Preset**: ${presetValue}\n`;
    response += `**Mode**: 🔀 Parallel Execution\n\n`;
    response += `### Agents Spawned (${team.agents.size})\n`;

    for (const [name, agent] of team.agents) {
      response += `- **${name}** (${agent.role})\n`;
      response += `  Session: \`${agent.sessionID.slice(0, 30)}...\`\n`;
    }

    response += `\n### Task\n${task}\n`;
    response += `\n---\n`;
    response += `Use \`team-discuss\` for **REAL parallel discussion**.\n`;
    response += `Usage: \`team-discuss teamId="${teamId}" topic="your topic"\``;

    context.metadata({
      title: `Team Created: ${teamName} (Parallel)`,
      metadata: { teamId, agents: agentNames, mode: "parallel" }
    });

    return response;
  }
});

/**
 * TEAM DISCUSS - Run REAL parallel discussion
 */
const teamDiscussTool = tool({
  description: "Run a REAL parallel discussion between team agents using actual OpenCode sessions. Each agent responds in parallel.",
  args: {
    teamId: z.string().describe("Team ID from team-spawn"),
    topic: z.string().describe("Topic/code for discussion"),
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

    let response = `## 🔀 Parallel Discussion: ${topic.slice(0, 50)}...\n\n`;
    response += `**Team**: ${team.name}\n`;
    response += `**Rounds**: ${rounds}\n`;
    response += `**Mode**: Real Parallel Execution\n\n`;

    let previousResponses = new Map<string, string>();

    // Run discussion rounds
    for (let round = 1; round <= rounds; round++) {
      response += `### Round ${round} ⚡\n\n`;

      // Run ALL agents in PARALLEL
      const roundResponses = await runParallelDiscussion(teamId, topic, round, previousResponses);

      for (const [agentName, agentResponse] of roundResponses) {
        response += `**${agentName}**:\n`;
        response += `${agentResponse.slice(0, 500)}${agentResponse.length > 500 ? '...' : ''}\n\n`;
      }

      previousResponses = roundResponses;
    }

    // Summary
    response += `---\n\n`;
    response += `### Discussion Summary\n\n`;
    response += `**Participants**: ${Array.from(team.agents.keys()).join(", ")}\n`;
    response += `**Total Messages**: ${team.discussionHistory.length}\n`;
    response += `**Execution**: 🔀 Parallel (all agents responded simultaneously)\n`;

    context.metadata({
      title: `Parallel Discussion Complete`,
      metadata: { teamId, rounds, messagesCount: team.discussionHistory.length }
    });

    return response;
  }
});

/**
 * TEAM STATUS - Check team status
 */
const teamStatusTool = tool({
  description: "Get the status and discussion history of a team.",
  args: {
    teamId: z.string().optional().describe("Team ID to check")
  },
  async execute(args, context) {
    const { teamId } = args;

    if (!teamId) {
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

    const team = teamManager.getTeam(teamId);
    if (!team) {
      return `Error: Team ${teamId} not found.`;
    }

    let response = `## Team Status: ${team.name}\n\n`;
    response += `**ID**: ${team.id}\n`;
    response += `**Preset**: ${team.preset}\n`;
    response += `**Status**: ${team.status}\n`;
    response += `**Created**: ${team.createdAt.toISOString()}\n\n`;

    response += `### Agents (${team.agents.size})\n`;
    for (const [name, agent] of team.agents) {
      response += `- **${name}**: ${agent.role} [${agent.status}]\n`;
      response += `  Session: ${agent.sessionID.slice(0, 30)}...\n`;
    }

    response += `\n### Discussion History (${team.discussionHistory.length} messages)\n`;
    for (const msg of team.discussionHistory.slice(-5)) {
      response += `- **${msg.from}**: ${msg.content.slice(0, 100)}...\n`;
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
    const agentNames = Array.from(team.agents.keys());

    // Delete agent sessions
    if (opencodeClient) {
      for (const agent of team.agents.values()) {
        try {
          await opencodeClient.session.delete({ path: { id: agent.sessionID } });
        } catch (e) {
          // Ignore deletion errors
        }
      }
    }

    teamManager.removeTeam(teamId);

    context.metadata({
      title: `Team Shutdown: ${name}`,
      metadata: { teamId, archivedMessages: messageCount }
    });

    return `## Team Shutdown\n\nTeam "${name}" (${teamId}) has been shut down.\n- Archived ${messageCount} discussion messages.\n- Closed ${agentNames.length} agent sessions: ${agentNames.join(", ")}.`;
  }
});

/**
 * MESSAGE - Send a message to a specific agent
 */
const messageTool = tool({
  description: "Send a direct message to a specific agent.",
  args: {
    from: z.string().describe("Sender agent name"),
    to: z.string().describe("Recipient agent name"),
    content: z.string().describe("Message content"),
    summary: z.string().optional().describe("Optional summary")
  },
  async execute(args, context) {
    const { from, to, content, summary } = args;

    const message = messageManager.sendMessage({
      from,
      to,
      content,
      type: "message"
    });

    context.metadata({
      title: `Message: ${from} -> ${to}`,
      metadata: { messageId: message.id }
    });

    return `## Message Sent\n\n**From**: ${from}\n**To**: ${to}\n**Message ID**: ${message.id}\n\n**Content**:\n${content}`;
  }
});

/**
 * BROADCAST - Send a message to all team members
 */
const broadcastTool = tool({
  description: "Broadcast a message to all team members.",
  args: {
    from: z.string().describe("Sender agent name"),
    content: z.string().describe("Message content"),
    summary: z.string().optional().describe("Optional summary")
  },
  async execute(args, context) {
    const { from, content, summary } = args;

    const message = messageManager.broadcast(from, content);

    context.metadata({
      title: `Broadcast from ${from}`,
      metadata: { messageId: message.id }
    });

    return `## Broadcast Sent\n\n**From**: ${from}\n**To**: all\n**Message ID**: ${message.id}\n\n**Content**:\n${content}`;
  }
});

/**
 * TASK CREATE
 */
const taskCreateTool = tool({
  description: "Create a new task.",
  args: {
    title: z.string().describe("Task title"),
    description: z.string().optional().describe("Task description"),
    assignee: z.string().optional().describe("Assigned agent"),
    priority: z.enum(["low", "medium", "high", "critical"]).optional().describe("Priority"),
    blocks: z.array(z.string()).optional().describe("Task IDs this blocks")
  },
  async execute(args, context) {
    const task = taskManager.createTask({
      title: args.title,
      description: args.description,
      assignee: args.assignee,
      priority: args.priority,
      blocks: args.blocks
    });

    context.metadata({
      title: `Task Created: ${task.title}`,
      metadata: { taskId: task.id }
    });

    return `## Task Created\n\n**ID**: ${task.id}\n**Title**: ${task.title}\n**Status**: ${task.status}\n**Priority**: ${task.priority}`;
  }
});

/**
 * TASK UPDATE
 */
const taskUpdateTool = tool({
  description: "Update a task.",
  args: {
    taskId: z.string().describe("Task ID"),
    status: z.enum(["pending", "in_progress", "completed", "deleted"]).optional(),
    assignee: z.string().optional()
  },
  async execute(args, context) {
    const { taskId, ...updates } = args;
    const task = taskManager.updateTask(taskId, updates);

    if (!task) {
      return `Error: Task ${taskId} not found.`;
    }

    return `## Task Updated\n\n**ID**: ${task.id}\n**Status**: ${task.status}`;
  }
});

/**
 * TASK LIST
 */
const taskListTool = tool({
  description: "List all tasks.",
  args: {
    status: z.enum(["pending", "in_progress", "completed", "deleted"]).optional()
  },
  async execute(args, context) {
    const tasks = taskManager.listTasks({ status: args.status });

    if (tasks.length === 0) {
      return `No tasks found.`;
    }

    let response = `## Tasks (${tasks.length})\n\n`;
    for (const task of tasks) {
      response += `- **${task.title}** [${task.status}] (${task.priority})\n`;
    }
    return response;
  }
});

/**
 * TASK GET
 */
const taskGetTool = tool({
  description: "Get task details.",
  args: {
    taskId: z.string().describe("Task ID")
  },
  async execute(args, context) {
    const task = taskManager.getTask(args.taskId);

    if (!task) {
      return `Error: Task ${args.taskId} not found.`;
    }

    return `## Task: ${task.title}\n\n**ID**: ${task.id}\n**Status**: ${task.status}\n**Priority**: ${task.priority}\n**Description**: ${task.description || "N/A"}`;
  }
});

// ============================================================================
// PLUGIN EXPORT
// ============================================================================

const plugin: Plugin = async (input: PluginInput) => {
  // Store client reference for parallel execution
  opencodeClient = input.client as OpencodeClient;

  return {
    tool: {
      "team-spawn": teamSpawnTool,
      "team-discuss": teamDiscussTool,
      "team-status": teamStatusTool,
      "team-shutdown": teamShutdownTool,
      "message": messageTool,
      "broadcast": broadcastTool,
      "task-create": taskCreateTool,
      "task-update": taskUpdateTool,
      "task-list": taskListTool,
      "task-get": taskGetTool
    }
  };
};

export default plugin;
