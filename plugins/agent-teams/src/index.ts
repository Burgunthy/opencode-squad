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

/**
 * Represents an active agent session with state tracking
 */
interface AgentSession {
  agentName: string;
  sessionID: string;
  status: "idle" | "thinking" | "responding";
  lastActivity: Date;
  currentTask?: string;
}

/**
 * Represents a shutdown request between agents
 */
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
// SESSION MANAGER
// ============================================================================

/**
 * Manages agent sessions with state tracking and activity monitoring.
 * Provides centralized session lifecycle management for all agents.
 */
class SessionManager {
  private sessions: Map<string, AgentSession> = new Map();
  private agentToSessionMap: Map<string, string> = new Map(); // agentName -> sessionID

  /**
   * Register a new agent session
   * @param agentName - The name of the agent
   * @param sessionID - Unique session identifier
   * @param initialStatus - Starting status (default: "idle")
   */
  registerSession(
    agentName: string,
    sessionID: string,
    initialStatus: "idle" | "thinking" | "responding" = "idle"
  ): void {
    const session: AgentSession = {
      agentName,
      sessionID,
      status: initialStatus,
      lastActivity: new Date()
    };
    this.sessions.set(sessionID, session);
    this.agentToSessionMap.set(agentName, sessionID);
  }

  /**
   * Update the status of an existing session
   * @param sessionID - The session identifier
   * @param status - New status value
   * @param task - Optional current task description
   */
  updateStatus(
    sessionID: string,
    status: "idle" | "thinking" | "responding",
    task?: string
  ): void {
    const session = this.sessions.get(sessionID);
    if (session) {
      session.status = status;
      session.lastActivity = new Date();
      if (task !== undefined) {
        session.currentTask = task;
      }
    }
  }

  /**
   * Update status by agent name
   * @param agentName - The name of the agent
   * @param status - New status value
   * @param task - Optional current task description
   */
  updateStatusByAgent(
    agentName: string,
    status: "idle" | "thinking" | "responding",
    task?: string
  ): void {
    const sessionID = this.agentToSessionMap.get(agentName);
    if (sessionID) {
      this.updateStatus(sessionID, status, task);
    }
  }

  /**
   * Get session information for a specific agent
   * @param agentName - The name of the agent
   * @returns The agent's session or undefined if not found
   */
  getAgentSession(agentName: string): AgentSession | undefined {
    const sessionID = this.agentToSessionMap.get(agentName);
    if (sessionID) {
      return this.sessions.get(sessionID);
    }
    return undefined;
  }

  /**
   * Get session by session ID
   * @param sessionID - The session identifier
   * @returns The session or undefined if not found
   */
  getSession(sessionID: string): AgentSession | undefined {
    return this.sessions.get(sessionID);
  }

  /**
   * List all active sessions
   * @returns Array of all agent sessions
   */
  listSessions(): AgentSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * List sessions filtered by status
   * @param status - The status to filter by
   * @returns Array of sessions with the specified status
   */
  listSessionsByStatus(status: "idle" | "thinking" | "responding"): AgentSession[] {
    return Array.from(this.sessions.values()).filter(s => s.status === status);
  }

  /**
   * Remove a session
   * @param sessionID - The session identifier to remove
   */
  removeSession(sessionID: string): void {
    const session = this.sessions.get(sessionID);
    if (session) {
      this.agentToSessionMap.delete(session.agentName);
      this.sessions.delete(sessionID);
    }
  }

  /**
   * Remove session by agent name
   * @param agentName - The name of the agent whose session should be removed
   */
  removeSessionByAgent(agentName: string): void {
    const sessionID = this.agentToSessionMap.get(agentName);
    if (sessionID) {
      this.removeSession(sessionID);
    }
  }

  /**
   * Get the count of active sessions
   * @returns The number of active sessions
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Clear all sessions (useful for testing or reset)
   */
  clearAllSessions(): void {
    this.sessions.clear();
    this.agentToSessionMap.clear();
  }

  /**
   * Get sessions that have been inactive for a specified duration
   * @param inactiveMs - Milliseconds of inactivity threshold
   * @returns Array of inactive sessions
   */
  getInactiveSessions(inactiveMs: number): AgentSession[] {
    const now = new Date();
    return Array.from(this.sessions.values()).filter(
      session => now.getTime() - session.lastActivity.getTime() > inactiveMs
    );
  }
}

// ============================================================================
// SHUTDOWN MANAGER
// ============================================================================

/**
 * Manages shutdown requests between agents with approval workflow.
 * Handles the lifecycle of shutdown requests from creation to response.
 */
class ShutdownManager {
  private requests: Map<string, ShutdownRequest> = new Map();
  private pendingByRecipient: Map<string, Set<string>> = new Map(); // recipient -> Set<requestId>

  /**
   * Create a new shutdown request
   * @param requester - The agent requesting the shutdown
   * @param recipient - The agent being asked to shut down
   * @param reason - The reason for the shutdown request
   * @returns The unique request ID
   */
  createRequest(requester: string, recipient: string, reason: string): string {
    const requestId = `shutdown-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const request: ShutdownRequest = {
      id: requestId,
      requester,
      recipient,
      reason,
      createdAt: new Date()
    };

    this.requests.set(requestId, request);

    // Track pending request by recipient
    if (!this.pendingByRecipient.has(recipient)) {
      this.pendingByRecipient.set(recipient, new Set());
    }
    this.pendingByRecipient.get(recipient)!.add(requestId);

    return requestId;
  }

  /**
   * Respond to a shutdown request
   * @param requestId - The request ID to respond to
   * @param approved - Whether the request is approved
   * @returns True if the response was recorded, false if request not found
   */
  respondToRequest(requestId: string, approved: boolean): boolean {
    const request = this.requests.get(requestId);
    if (!request || request.respondedAt !== undefined) {
      return false;
    }

    request.respondedAt = new Date();
    request.approved = approved;

    // Remove from pending tracking
    const pendingSet = this.pendingByRecipient.get(request.recipient);
    if (pendingSet) {
      pendingSet.delete(requestId);
    }

    return true;
  }

  /**
   * Get all pending requests for a specific recipient
   * @param recipient - The agent name to check for pending requests
   * @returns Array of pending shutdown requests
   */
  getPendingRequests(recipient: string): ShutdownRequest[] {
    const pendingIds = this.pendingByRecipient.get(recipient);
    if (!pendingIds || pendingIds.size === 0) {
      return [];
    }

    const requests: ShutdownRequest[] = [];
    for (const id of pendingIds) {
      const request = this.requests.get(id);
      if (request && request.respondedAt === undefined) {
        requests.push(request);
      }
    }

    // Sort by creation time (oldest first)
    return requests.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  /**
   * Get a specific request by ID
   * @param requestId - The request ID
   * @returns The request or undefined if not found
   */
  getRequest(requestId: string): ShutdownRequest | undefined {
    return this.requests.get(requestId);
  }

  /**
   * Get all requests (pending and responded)
   * @returns Array of all requests
   */
  getAllRequests(): ShutdownRequest[] {
    return Array.from(this.requests.values());
  }

  /**
   * Get all pending requests across all recipients
   * @returns Array of all pending requests
   */
  getAllPendingRequests(): ShutdownRequest[] {
    return Array.from(this.requests.values()).filter(r => r.respondedAt === undefined);
  }

  /**
   * Get requests created by a specific requester
   * @param requester - The agent name who created the requests
   * @returns Array of requests from the specified requester
   */
  getRequesterRequests(requester: string): ShutdownRequest[] {
    return Array.from(this.requests.values())
      .filter(r => r.requester === requester)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Check if a recipient has any pending requests
   * @param recipient - The agent name to check
   * @returns True if there are pending requests
   */
  hasPendingRequests(recipient: string): boolean {
    const pendingSet = this.pendingByRecipient.get(recipient);
    return pendingSet !== undefined && pendingSet.size > 0;
  }

  /**
   * Get the count of pending requests for a recipient
   * @param recipient - The agent name to check
   * @returns The number of pending requests
   */
  getPendingCount(recipient: string): number {
    const pendingSet = this.pendingByRecipient.get(recipient);
    return pendingSet?.size ?? 0;
  }

  /**
   * Cancel a pending request (only if not yet responded)
   * @param requestId - The request ID to cancel
   * @returns True if successfully cancelled
   */
  cancelRequest(requestId: string): boolean {
    const request = this.requests.get(requestId);
    if (!request || request.respondedAt !== undefined) {
      return false;
    }

    // Remove from pending tracking
    const pendingSet = this.pendingByRecipient.get(request.recipient);
    if (pendingSet) {
      pendingSet.delete(requestId);
    }

    // Remove the request
    this.requests.delete(requestId);
    return true;
  }

  /**
   * Clear all requests (useful for testing or reset)
   */
  clearAllRequests(): void {
    this.requests.clear();
    this.pendingByRecipient.clear();
  }

  /**
   * Get statistics about shutdown requests
   * @returns Object containing request statistics
   */
  getStats(): {
    total: number;
    pending: number;
    approved: number;
    denied: number;
  } {
    const all = Array.from(this.requests.values());
    return {
      total: all.length,
      pending: all.filter(r => r.respondedAt === undefined).length,
      approved: all.filter(r => r.approved === true).length,
      denied: all.filter(r => r.approved === false).length
    };
  }
}

// ============================================================================
// TEAM MANAGER (IN-MEMORY STATE)
// ============================================================================

/**
 * Manages teams of agents with integrated session and shutdown management.
 * Extended to include SessionManager and ShutdownManager functionality.
 */
class TeamManager {
  private teams: Map<string, Team> = new Map();
  private sessionManager: SessionManager;
  private shutdownManager: ShutdownManager;

  constructor() {
    this.sessionManager = new SessionManager();
    this.shutdownManager = new ShutdownManager();
  }

  // --- Session Manager Integration ---

  /**
   * Get the session manager instance
   */
  get sessions(): SessionManager {
    return this.sessionManager;
  }

  /**
   * Get the shutdown manager instance
   */
  get shutdown(): ShutdownManager {
    return this.shutdownManager;
  }

  /**
   * Register a session for an agent in a team
   */
  registerAgentSession(
    teamId: string,
    agentName: string,
    sessionID: string,
    initialStatus: "idle" | "thinking" | "responding" = "idle"
  ): void {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new Error(`Team ${teamId} not found`);
    }

    // Register session
    this.sessionManager.registerSession(agentName, sessionID, initialStatus);

    // Update agent in team
    const agent = team.agents.get(agentName);
    if (agent) {
      agent.sessionID = sessionID;
      agent.status = initialStatus;
    }
  }

  /**
   * Update agent status across both team and session manager
   */
  updateAgentStatus(
    agentName: string,
    status: "idle" | "thinking" | "responding",
    task?: string
  ): void {
    // Update in session manager
    this.sessionManager.updateStatusByAgent(agentName, status, task);

    // Update in all teams where this agent exists
    for (const team of this.teams.values()) {
      const agent = team.agents.get(agentName);
      if (agent) {
        agent.status = status;
      }
    }
  }

  /**
   * Get agent session information
   */
  getAgentSessionInfo(agentName: string): AgentSession | undefined {
    return this.sessionManager.getAgentSession(agentName);
  }

  /**
   * List all active sessions across all teams
   */
  listAllSessions(): AgentSession[] {
    return this.sessionManager.listSessions();
  }

  // --- Shutdown Manager Integration ---

  /**
   * Create a shutdown request for an agent
   */
  createAgentShutdownRequest(
    requester: string,
    recipient: string,
    reason: string
  ): string {
    return this.shutdownManager.createRequest(requester, recipient, reason);
  }

  /**
   * Respond to a shutdown request
   */
  respondToShutdownRequest(requestId: string, approved: boolean): boolean {
    const success = this.shutdownManager.respondToRequest(requestId, approved);

    if (success) {
      const request = this.shutdownManager.getRequest(requestId);
      if (request && approved) {
        // Clean up the recipient's session
        this.sessionManager.removeSessionByAgent(request.recipient);

        // Remove agent from all teams
        for (const team of this.teams.values()) {
          team.agents.delete(request.recipient);
        }
      }
    }

    return success;
  }

  /**
   * Get pending shutdown requests for an agent
   */
  getPendingShutdownRequests(agentName: string): ShutdownRequest[] {
    return this.shutdownManager.getPendingRequests(agentName);
  }

  /**
   * Get shutdown request statistics
   */
  getShutdownStats(): {
    total: number;
    pending: number;
    approved: number;
    denied: number;
  } {
    return this.shutdownManager.getStats();
  }

  // --- Original Team Manager Methods ---

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

    // Also register in session manager
    this.sessionManager.registerSession(agentName, sessionID, "idle");
  }

  removeAgent(teamId: string, agentName: string): void {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new Error(`Team ${teamId} not found`);
    }

    team.agents.delete(agentName);

    // Also remove from session manager
    this.sessionManager.removeSessionByAgent(agentName);
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
    const team = this.teams.get(id);
    if (team) {
      // Clean up all agent sessions
      for (const agentName of team.agents.keys()) {
        this.sessionManager.removeSessionByAgent(agentName);
      }
    }
    this.teams.delete(id);
  }
}

const teamManager = new TeamManager();

// ============================================================================
// MESSAGE MANAGER (IN-MEMORY STATE)
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
    if (!recipient) {
      return [...this.messages];
    }
    return this.messages.filter(
      (msg) => msg.to === recipient || msg.to === "all" || msg.from === recipient
    );
  }

  getPendingRequests(recipient: string): Message[] {
    return this.messages.filter(
      (msg) =>
        (msg.to === recipient || msg.to === "all") &&
        msg.type === "shutdown_request" &&
        !this.hasResponse(msg.id, recipient)
    );
  }

  private hasResponse(requestId: string, recipient: string): boolean {
    return this.messages.some(
      (msg) =>
        msg.requestId === requestId &&
        msg.from === recipient &&
        (msg.type === "shutdown_response" || msg.type === "plan_approval_response")
    );
  }

  clear(): void {
    this.messages = [];
  }
}

const messageManager = new MessageManager();

// ============================================================================
// TASK MANAGER (IN-MEMORY STATE)
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

    // Update blockedBy for tasks that this task blocks
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
      if (filters.status) {
        tasks = tasks.filter(t => t.status === filters.status);
      }
      if (filters.assignee) {
        tasks = tasks.filter(t => t.assignee === filters.assignee);
      }
      if (filters.priority) {
        tasks = tasks.filter(t => t.priority === filters.priority);
      }
    }

    // Sort by priority (critical first) then by creation date
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

    // Handle status changes
    if (updates.status === "completed" && task.status !== "completed") {
      updates.completedAt = new Date();
    } else if (updates.status && updates.status !== "completed") {
      updates.completedAt = undefined;
    }

    // Handle blocks updates
    if (updates.blocks !== undefined) {
      // Remove from old blocked tasks
      for (const oldBlockedId of task.blocks) {
        if (!updates.blocks.includes(oldBlockedId)) {
          const oldTask = this.tasks.get(oldBlockedId);
          if (oldTask) {
            oldTask.blockedBy = oldTask.blockedBy.filter(bid => bid !== id);
          }
        }
      }
      // Add to new blocked tasks
      for (const newBlockedId of updates.blocks) {
        const newTask = this.tasks.get(newBlockedId);
        if (newTask && !newTask.blockedBy.includes(id)) {
          newTask.blockedBy.push(id);
        }
      }
    }

    // Apply updates
    Object.assign(task, updates);
    this.tasks.set(id, task);
    return task;
  }

  deleteTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;

    // Remove from blockedBy of tasks this task blocks
    for (const blockedId of task.blocks) {
      const blockedTask = this.tasks.get(blockedId);
      if (blockedTask) {
        blockedTask.blockedBy = blockedTask.blockedBy.filter(bid => bid !== id);
      }
    }

    // Remove from blocks of tasks that block this task
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
        // Update agent status to "thinking" then "responding"
        teamManager.updateAgentStatus(agentName, "thinking", `Round ${round} discussion`);

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

        // Update agent status to "responding"
        teamManager.updateAgentStatus(agentName, "responding", `Round ${round} discussion`);

        // Add to history
        teamManager.addMessage(teamId, {
          from: agentName,
          to: "all",
          content: contribution,
          timestamp: new Date(),
          type: round === 1 ? "statement" : "response"
        });

        // Reset agent status to "idle"
        teamManager.updateAgentStatus(agentName, "idle");
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
    teamId: z.string().optional().describe("Team ID to check (optional - shows all teams if not provided)")
  },
  async execute(args, context) {
    const { teamId } = args;

    if (!teamId) {
      // List all teams with session info
      const teams = teamManager.listTeams();
      const allSessions = teamManager.listAllSessions();

      if (teams.length === 0) {
        return `No active teams. Use team-spawn to create one.`;
      }

      let response = `## Active Teams\n\n`;
      for (const t of teams) {
        response += `- **${t.name}** (${t.id}): ${t.agents.size} agents, ${t.discussionHistory.length} messages\n`;
      }

      response += `\n## Active Sessions\n\n`;
      for (const session of allSessions) {
        const timeSinceActivity = Math.floor((Date.now() - session.lastActivity.getTime()) / 1000);
        response += `- **${session.agentName}** [${session.status}] - last activity ${timeSinceActivity}s ago`;
        if (session.currentTask) {
          response += ` (task: ${session.currentTask})`;
        }
        response += `\n`;
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
      const session = teamManager.getAgentSessionInfo(name);
      const lastActivity = session ? ` (${Math.floor((Date.now() - session.lastActivity.getTime()) / 1000)}s ago)` : "";
      response += `- **${name}**: ${agent.role} [${agent.status}]${lastActivity}\n`;
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
    const agentNames = Array.from(team.agents.keys());

    teamManager.removeTeam(teamId);

    context.metadata({
      title: `Team Shutdown: ${name}`,
      metadata: { teamId, archivedMessages: messageCount, agents: agentNames }
    });

    return `## Team Shutdown\n\nTeam "${name}" (${teamId}) has been shut down.\n- Archived ${messageCount} discussion messages.\n- Closed ${agentNames.length} agent sessions: ${agentNames.join(", ")}.`;
  }
});

// ============================================================================
// SESSION MANAGEMENT TOOLS
// ============================================================================

/**
 * SESSION STATUS - Check agent session status
 */
const sessionStatusTool = tool({
  description: "Get the status of all agent sessions or a specific agent's session.",
  args: {
    agentName: z.string().optional().describe("Specific agent name to check (optional)")
  },
  async execute(args, context) {
    const { agentName } = args;

    if (agentName) {
      const session = teamManager.getAgentSessionInfo(agentName);
      if (!session) {
        return `## Session Status\n\nNo active session found for agent "${agentName}".`;
      }

      const timeSinceActivity = Math.floor((Date.now() - session.lastActivity.getTime()) / 1000);

      let response = `## Session Status: ${session.agentName}\n\n`;
      response += `**Session ID**: ${session.sessionID}\n`;
      response += `**Status**: ${session.status}\n`;
      response += `**Last Activity**: ${timeSinceActivity}s ago\n`;
      if (session.currentTask) {
        response += `**Current Task**: ${session.currentTask}\n`;
      }
      return response;
    }

    // Show all sessions
    const sessions = teamManager.listAllSessions();

    if (sessions.length === 0) {
      return `## Session Status\n\nNo active sessions.`;
    }

    let response = `## Active Sessions (${sessions.length})\n\n`;

    const byStatus: Record<string, AgentSession[]> = {
      idle: [],
      thinking: [],
      responding: []
    };

    for (const session of sessions) {
      byStatus[session.status].push(session);
    }

    for (const [status, statusSessions] of Object.entries(byStatus)) {
      if (statusSessions.length > 0) {
        response += `### ${status.charAt(0).toUpperCase() + status.slice(1)} (${statusSessions.length})\n`;
        for (const session of statusSessions) {
          const timeSinceActivity = Math.floor((Date.now() - session.lastActivity.getTime()) / 1000);
          response += `- **${session.agentName}**: ${timeSinceActivity}s ago`;
          if (session.currentTask) {
            response += ` (${session.currentTask})`;
          }
          response += `\n`;
        }
        response += `\n`;
      }
    }

    return response;
  }
});

// ============================================================================
// SHUTDOWN MANAGEMENT TOOLS
// ============================================================================

/**
 * SHUTDOWN AGENT REQUEST - Create a shutdown request for an agent
 */
const shutdownAgentRequestTool = tool({
  description: "Create a shutdown request for an agent. The recipient agent must approve the request.",
  args: {
    recipient: z.string().describe("The agent to request shutdown for"),
    reason: z.string().describe("Reason for the shutdown request")
  },
  async execute(args, context) {
    const { recipient, reason } = args;
    const requester = "system"; // Default requester

    const requestId = teamManager.createAgentShutdownRequest(requester, recipient, reason);

    context.metadata({
      title: `Shutdown Request Created`,
      metadata: { requestId, recipient, requester }
    });

    return `## Shutdown Request Created\n\n**Request ID**: ${requestId}\n**Recipient**: ${recipient}\n**Reason**: ${reason}\n\nWaiting for ${recipient} to respond. Use \`shutdown-agent-respond\` to approve or deny.`;
  }
});

/**
 * SHUTDOWN AGENT RESPOND - Respond to a shutdown request
 */
const shutdownAgentRespondTool = tool({
  description: "Respond to a pending shutdown request.",
  args: {
    requestId: z.string().describe("The shutdown request ID"),
    approved: z.boolean().describe("Whether to approve the shutdown request")
  },
  async execute(args, context) {
    const { requestId, approved } = args;

    const success = teamManager.respondToShutdownRequest(requestId, approved);

    if (!success) {
      return `## Shutdown Response Failed\n\nRequest "${requestId}" not found or already responded to.`;
    }

    const request = teamManager.shutdown.getRequest(requestId);

    context.metadata({
      title: `Shutdown Response`,
      metadata: { requestId, approved }
    });

    let response = `## Shutdown Response\n\n`;
    response += `**Request ID**: ${requestId}\n`;
    response += `**Status**: ${approved ? "Approved" : "Denied"}\n`;

    if (approved && request) {
      response += `\nAgent "${request.recipient}" has been shut down and removed from all teams.`;
    }

    return response;
  }
});

/**
 * SHUTDOWN AGENT STATUS - Check shutdown request status
 */
const shutdownAgentStatusTool = tool({
  description: "Check pending shutdown requests or get details of a specific request.",
  args: {
    requestId: z.string().optional().describe("Specific request ID to check (optional)"),
    agentName: z.string().optional().describe("Agent name to check pending requests for (optional)")
  },
  async execute(args, context) {
    const { requestId, agentName } = args;

    if (requestId) {
      const request = teamManager.shutdown.getRequest(requestId);
      if (!request) {
        return `## Shutdown Request\n\nRequest "${requestId}" not found.`;
      }

      let response = `## Shutdown Request: ${requestId}\n\n`;
      response += `**Requester**: ${request.requester}\n`;
      response += `**Recipient**: ${request.recipient}\n`;
      response += `**Reason**: ${request.reason}\n`;
      response += `**Created**: ${request.createdAt.toISOString()}\n`;

      if (request.respondedAt) {
        response += `**Responded**: ${request.respondedAt.toISOString()}\n`;
        response += `**Status**: ${request.approved ? "Approved" : "Denied"}\n`;
      } else {
        response += `**Status**: Pending response\n`;
      }

      return response;
    }

    if (agentName) {
      const pendingRequests = teamManager.getPendingShutdownRequests(agentName);
      if (pendingRequests.length === 0) {
        return `## Pending Shutdown Requests\n\nNo pending requests for ${agentName}.`;
      }

      let response = `## Pending Shutdown Requests for ${agentName}\n\n`;
      for (const request of pendingRequests) {
        response += `- **${request.id}**\n`;
        response += `  From: ${request.requester}\n`;
        response += `  Reason: ${request.reason}\n`;
        response += `  Created: ${request.createdAt.toLocaleString()}\n\n`;
      }
      return response;
    }

    // Show overall stats
    const stats = teamManager.getShutdownStats();
    const allPending = teamManager.shutdown.getAllPendingRequests();

    let response = `## Shutdown Request Status\n\n`;
    response += `**Total Requests**: ${stats.total}\n`;
    response += `**Pending**: ${stats.pending}\n`;
    response += `**Approved**: ${stats.approved}\n`;
    response += `**Denied**: ${stats.denied}\n`;

    if (allPending.length > 0) {
      response += `\n### Pending Requests\n`;
      for (const request of allPending) {
        response += `- **${request.id}**: ${request.requester} -> ${request.recipient}\n`;
        response += `  Reason: ${request.reason}\n`;
      }
    }

    return response;
  }
});

// ============================================================================
// MESSAGING TOOLS
// ============================================================================

/**
 * MESSAGE - Send a message to a specific agent
 */
const messageTool = tool({
  description: "Send a direct message to a specific agent.",
  args: {
    from: z.string().describe("Sender agent name"),
    to: z.string().describe("Recipient agent name"),
    content: z.string().describe("Message content"),
    summary: z.string().optional().describe("Optional summary of the message")
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

    let response = `## Message Sent\n\n`;
    response += `**From**: ${from}\n`;
    response += `**To**: ${to}\n`;
    response += `**Message ID**: ${message.id}\n`;
    response += `**Time**: ${message.timestamp.toLocaleString()}\n\n`;
    if (summary) {
      response += `**Summary**: ${summary}\n\n`;
    }
    response += `**Content**:\n${content}\n`;

    return response;
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
    summary: z.string().optional().describe("Optional summary of the broadcast")
  },
  async execute(args, context) {
    const { from, content, summary } = args;

    const message = messageManager.broadcast(from, content);

    context.metadata({
      title: `Broadcast from ${from}`,
      metadata: { messageId: message.id }
    });

    let response = `## Broadcast Sent\n\n`;
    response += `**From**: ${from}\n`;
    response += `**To**: all\n`;
    response += `**Message ID**: ${message.id}\n`;
    response += `**Time**: ${message.timestamp.toLocaleString()}\n\n`;
    if (summary) {
      response += `**Summary**: ${summary}\n\n`;
    }
    response += `**Content**:\n${content}\n`;

    return response;
  }
});

/**
 * SHUTDOWN REQUEST - Request team shutdown
 */
const shutdownRequestTool = tool({
  description: "Request a team shutdown. Requires approval from team members.",
  args: {
    from: z.string().describe("Agent requesting shutdown"),
    teamId: z.string().describe("Team ID to shut down"),
    reason: z.string().optional().describe("Reason for shutdown request")
  },
  async execute(args, context) {
    const { from, teamId, reason } = args;

    const message = messageManager.sendMessage({
      from,
      to: "all",
      content: reason || "Shutdown requested",
      type: "shutdown_request",
      requestId: teamId
    });

    context.metadata({
      title: `Shutdown Requested`,
      metadata: { messageId: message.id, teamId }
    });

    let response = `## Shutdown Request\n\n`;
    response += `**From**: ${from}\n`;
    response += `**Team ID**: ${teamId}\n`;
    response += `**Request ID**: ${message.id}\n`;
    response += `**Time**: ${message.timestamp.toLocaleString()}\n\n`;
    if (reason) {
      response += `**Reason**: ${reason}\n\n`;
    }
    response += `Team members should respond using \`shutdown-response\` to approve or reject.\n`;

    return response;
  }
});

/**
 * SHUTDOWN RESPONSE - Respond to a shutdown request
 */
const shutdownResponseTool = tool({
  description: "Respond to a shutdown request with approval or rejection.",
  args: {
    from: z.string().describe("Agent responding"),
    requestId: z.string().describe("Request ID to respond to"),
    approve: z.boolean().describe("Whether to approve the shutdown"),
    comment: z.string().optional().describe("Optional comment on the decision")
  },
  async execute(args, context) {
    const { from, requestId, approve, comment } = args;

    const message = messageManager.sendMessage({
      from,
      to: "all",
      content: comment || (approve ? "Shutdown approved" : "Shutdown rejected"),
      type: "shutdown_response",
      requestId,
      approve
    });

    context.metadata({
      title: `Shutdown Response`,
      metadata: { messageId: message.id, requestId, approved: approve }
    });

    let response = `## Shutdown Response\n\n`;
    response += `**From**: ${from}\n`;
    response += `**Request ID**: ${requestId}\n`;
    response += `**Response ID**: ${message.id}\n`;
    response += `**Decision**: ${approve ? "APPROVED" : "REJECTED"}\n`;
    response += `**Time**: ${message.timestamp.toLocaleString()}\n\n`;
    if (comment) {
      response += `**Comment**: ${comment}\n`;
    }

    return response;
  }
});

/**
 * PLAN APPROVAL RESPONSE - Respond to a plan approval request
 */
const planApprovalResponseTool = tool({
  description: "Respond to a plan approval request with approval or rejection.",
  args: {
    from: z.string().describe("Agent responding"),
    requestId: z.string().describe("Request ID to respond to"),
    approve: z.boolean().describe("Whether to approve the plan"),
    comment: z.string().optional().describe("Optional comment on the decision")
  },
  async execute(args, context) {
    const { from, requestId, approve, comment } = args;

    const message = messageManager.sendMessage({
      from,
      to: "all",
      content: comment || (approve ? "Plan approved" : "Plan rejected"),
      type: "plan_approval_response",
      requestId,
      approve
    });

    context.metadata({
      title: `Plan Approval Response`,
      metadata: { messageId: message.id, requestId, approved: approve }
    });

    let response = `## Plan Approval Response\n\n`;
    response += `**From**: ${from}\n`;
    response += `**Request ID**: ${requestId}\n`;
    response += `**Response ID**: ${message.id}\n`;
    response += `**Decision**: ${approve ? "APPROVED" : "REJECTED"}\n`;
    response += `**Time**: ${message.timestamp.toLocaleString()}\n\n`;
    if (comment) {
      response += `**Comment**: ${comment}\n`;
    }

    return response;
  }
});

// ============================================================================
// TASK MANAGEMENT TOOLS
// ============================================================================

/**
 * TASK CREATE - Create a new task
 */
const taskCreateTool = tool({
  description: "Create a new task with title, description, assignee, priority, and blocking dependencies.",
  args: {
    title: z.string().describe("Task title"),
    description: z.string().optional().describe("Detailed description of the task"),
    assignee: z.string().optional().describe("Agent or team assigned to this task"),
    priority: z.enum(["low", "medium", "high", "critical"]).optional().describe("Task priority level"),
    blocks: z.array(z.string()).optional().describe("List of task IDs that this task blocks"),
    metadata: z.record(z.string(), z.unknown()).optional().describe("Additional metadata for the task")
  },
  async execute(args, context) {
    const task = taskManager.createTask({
      title: args.title,
      description: args.description,
      assignee: args.assignee,
      priority: args.priority,
      blocks: args.blocks,
      metadata: args.metadata
    });

    context.metadata({
      title: `Task Created: ${task.title}`,
      metadata: { taskId: task.id, priority: task.priority }
    });

    let response = `## Task Created\n\n`;
    response += `**ID**: ${task.id}\n`;
    response += `**Title**: ${task.title}\n`;
    response += `**Status**: ${task.status}\n`;
    response += `**Priority**: ${task.priority}\n`;

    if (task.description) {
      response += `**Description**: ${task.description}\n`;
    }
    if (task.assignee) {
      response += `**Assignee**: ${task.assignee}\n`;
    }
    if (task.blocks.length > 0) {
      response += `**Blocks**: ${task.blocks.join(", ")}\n`;
    }

    response += `\nUse \`task-get taskId="${task.id}"\` to view details.`;

    return response;
  }
});

/**
 * TASK UPDATE - Update an existing task
 */
const taskUpdateTool = tool({
  description: "Update task status, title, description, assignee, priority, or blocking dependencies.",
  args: {
    taskId: z.string().describe("Task ID to update"),
    title: z.string().optional().describe("New task title"),
    description: z.string().optional().describe("New task description"),
    assignee: z.string().optional().describe("New assignee"),
    status: z.enum(["pending", "in_progress", "completed", "deleted"]).optional().describe("New task status"),
    priority: z.enum(["low", "medium", "high", "critical"]).optional().describe("New task priority"),
    blocks: z.array(z.string()).optional().describe("Updated list of task IDs that this task blocks"),
    metadata: z.record(z.string(), z.unknown()).optional().describe("Updated metadata")
  },
  async execute(args, context) {
    const { taskId, ...updates } = args;
    const task = taskManager.updateTask(taskId, updates);

    if (!task) {
      return `Error: Task ${taskId} not found.`;
    }

    context.metadata({
      title: `Task Updated: ${task.title}`,
      metadata: { taskId, status: task.status }
    });

    let response = `## Task Updated\n\n`;
    response += `**ID**: ${task.id}\n`;
    response += `**Title**: ${task.title}\n`;
    response += `**Status**: ${task.status}\n`;
    response += `**Priority**: ${task.priority}\n`;

    if (task.description) {
      response += `**Description**: ${task.description}\n`;
    }
    if (task.assignee) {
      response += `**Assignee**: ${task.assignee}\n`;
    }
    if (task.blocks.length > 0) {
      response += `**Blocks**: ${task.blocks.join(", ")}\n`;
    }
    if (task.blockedBy.length > 0) {
      response += `**Blocked By**: ${task.blockedBy.join(", ")}\n`;
    }
    if (task.completedAt) {
      response += `**Completed At**: ${task.completedAt.toISOString()}\n`;
    }

    return response;
  }
});

/**
 * TASK LIST - List tasks with optional filters
 */
const taskListTool = tool({
  description: "List all tasks with optional filtering by status, assignee, or priority.",
  args: {
    status: z.enum(["pending", "in_progress", "completed", "deleted"]).optional().describe("Filter by status"),
    assignee: z.string().optional().describe("Filter by assignee"),
    priority: z.enum(["low", "medium", "high", "critical"]).optional().describe("Filter by priority")
  },
  async execute(args, context) {
    const tasks = taskManager.listTasks({
      status: args.status,
      assignee: args.assignee,
      priority: args.priority
    });

    if (tasks.length === 0) {
      return `## Task List\n\nNo tasks found matching the specified criteria.`;
    }

    let response = `## Task List (${tasks.length} tasks)\n\n`;

    for (const task of tasks) {
      response += `### ${task.title}\n`;
      response += `- **ID**: ${task.id}\n`;
      response += `- **Status**: ${task.status}\n`;
      response += `- **Priority**: ${task.priority}\n`;
      if (task.assignee) {
        response += `- **Assignee**: ${task.assignee}\n`;
      }
      if (task.blocks.length > 0) {
        response += `- **Blocks**: ${task.blocks.join(", ")}\n`;
      }
      if (task.blockedBy.length > 0) {
        response += `- **Blocked By**: ${task.blockedBy.join(", ")}\n`;
      }
      response += `- **Created**: ${task.createdAt.toISOString()}\n`;
      response += "\n";
    }

    context.metadata({
      title: `Task List`,
      metadata: { count: tasks.length }
    });

    return response;
  }
});

/**
 * TASK GET - Get detailed information about a specific task
 */
const taskGetTool = tool({
  description: "Get detailed information about a specific task including its dependencies.",
  args: {
    taskId: z.string().describe("Task ID to retrieve")
  },
  async execute(args, context) {
    const task = taskManager.getTask(args.taskId);

    if (!task) {
      return `Error: Task ${args.taskId} not found.`;
    }

    let response = `## Task Details\n\n`;
    response += `**ID**: ${task.id}\n`;
    response += `**Title**: ${task.title}\n`;
    response += `**Status**: ${task.status}\n`;
    response += `**Priority**: ${task.priority}\n`;
    response += `**Created**: ${task.createdAt.toISOString()}\n`;

    if (task.description) {
      response += `\n**Description**:\n${task.description}\n`;
    }
    if (task.assignee) {
      response += `\n**Assignee**: ${task.assignee}\n`;
    }
    if (task.completedAt) {
      response += `**Completed At**: ${task.completedAt.toISOString()}\n`;
    }

    // Dependencies
    if (task.blocks.length > 0 || task.blockedBy.length > 0) {
      response += `\n**Dependencies**:\n`;
      if (task.blocks.length > 0) {
        response += `- Blocks: ${task.blocks.join(", ")}\n`;
      }
      if (task.blockedBy.length > 0) {
        response += `- Blocked by: ${task.blockedBy.join(", ")}\n`;
      }
    }

    // Metadata
    if (task.metadata && Object.keys(task.metadata).length > 0) {
      response += `\n**Metadata**:\n`;
      for (const [key, value] of Object.entries(task.metadata)) {
        response += `- ${key}: ${JSON.stringify(value)}\n`;
      }
    }

    context.metadata({
      title: `Task: ${task.title}`,
      metadata: { taskId: task.id, status: task.status, priority: task.priority }
    });

    return response;
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
      "team-shutdown": teamShutdownTool,
      "session-status": sessionStatusTool,
      "shutdown-agent-request": shutdownAgentRequestTool,
      "shutdown-agent-respond": shutdownAgentRespondTool,
      "shutdown-agent-status": shutdownAgentStatusTool,
      "message": messageTool,
      "broadcast": broadcastTool,
      "shutdown-request": shutdownRequestTool,
      "shutdown-response": shutdownResponseTool,
      "plan-approval-response": planApprovalResponseTool,
      "task-create": taskCreateTool,
      "task-update": taskUpdateTool,
      "task-list": taskListTool,
      "task-get": taskGetTool
    }
  };
};

export default plugin;
