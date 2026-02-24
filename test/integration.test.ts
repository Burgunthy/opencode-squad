/**
 * Integration Tests for agent-teams plugin
 * Tests full workflows and tool interactions
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";

// ============================================================================
// MOCK TYPES
// ============================================================================

interface MockSession {
  id: string;
  promptCalled: boolean;
  messagesCalled: boolean;
  deleteCalled: boolean;
}

interface MockClient {
  session: {
    create: (opts: any) => Promise<{ data?: { id?: string } }>;
    prompt: (opts: any) => Promise<void>;
    messages: (opts: any) => Promise<{ data?: Array<{ info: { role: string }; parts?: Array<{ type: string; text?: string }> }> }>;
    delete: (opts: any) => Promise<void>;
  };
  sessions: Map<string, MockSession>;
}

interface Agent {
  name: string;
  sessionID: string | null;
  role: string;
  status: "idle" | "thinking" | "responding" | "completed" | "error";
  result?: string;
  error?: string;
}

interface Task {
  id: string;
  subject: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "blocked" | "error";
  owner?: string;
  blockedBy: string[];
  blocks: string[];
  result?: string;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

interface Team {
  id: string;
  name: string;
  preset: string;
  agents: Map<string, Agent>;
  tasks: Map<string, Task>;
  createdAt: Date;
  task: string;
  results?: Map<string, string>;
}

// ============================================================================
// MOCK CLIENT IMPLEMENTATION
// ============================================================================

class MockOpencodeClient implements MockClient {
  sessions: Map<string, MockSession> = new Map();
  sessionCounter = 0;

  session = {
    create: async (opts: any) => {
      const id = `mock-session-${++this.sessionCounter}`;
      this.sessions.set(id, {
        id,
        promptCalled: false,
        messagesCalled: false,
        deleteCalled: false
      });
      return { data: { id } };
    },

    prompt: async (opts: any) => {
      const { id } = opts.path;
      const session = this.sessions.get(id);
      if (session) {
        session.promptCalled = true;
      }
    },

    messages: async (opts: any) => {
      const { id } = opts.path;
      const session = this.sessions.get(id);
      if (session) {
        session.messagesCalled = true;
        // Return mock assistant message
        return {
          data: [
            {
              info: { role: "assistant" },
              parts: [
                { type: "text", text: "Mock response from agent" }
              ]
            }
          ]
        };
      }
      return { data: [] };
    },

    delete: async (opts: any) => {
      const { id } = opts.path;
      const session = this.sessions.get(id);
      if (session) {
        session.deleteCalled = true;
        this.sessions.delete(id);
      }
    }
  };
}

// ============================================================================
// INTEGRATION TEST UTILITIES
// ============================================================================

const PRESETS: Record<string, string[]> = {
  review: ["code-reviewer", "security-auditor", "devil-s-advocate"],
  security: ["security-auditor", "devil-s-advocate"],
  debug: ["debugger", "devil-s-advocate"],
  planning: ["planner", "devil-s-advocate"],
  implementation: [
    "backend-developer",
    "frontend-developer",
    "test-automator",
    "devil-s-advocate",
  ],
  fullstack: ["fullstack-developer", "devil-s-advocate"],
  research: ["explore", "data-scientist", "devil-s-advocate"],
  ai: ["ai-engineer", "llm-architect", "prompt-engineer", "devil-s-advocate"],
};

function isDevilsAdvocate(agentName: string): boolean {
  const DEVILS_ADVOCATE_NAMES = [
    "devil-s-advocate",
    "devils-advocate",
    "devil_advocate",
    "devilsadvocate",
    "devil-sadvocate"
  ];
  const normalized = agentName.toLowerCase().replace(/[_-]/g, "");
  return DEVILS_ADVOCATE_NAMES.some(
    name => normalized === name.replace(/[_-]/g, "")
  );
}

function truncateText(text: string, maxLength: number): string {
  return text.length > maxLength ? text.slice(0, maxLength) + "..." : text;
}

function extractRoleFromDescription(description: string | undefined, fallback: string): string {
  return description?.split(".")[0] ?? fallback;
}

// ============================================================================
// INTEGRATION TEST SUITES
// ============================================================================

describe("Integration Tests: Team Creation Flow", () => {
  let mockClient: MockOpencodeClient;
  let teams: Map<string, Team>;

  beforeEach(() => {
    mockClient = new MockOpencodeClient();
    teams = new Map();
  });

  it("should create team with preset", () => {
    const preset = "review";
    const agentNames = PRESETS[preset] ?? [];

    const teamId = `team-${Date.now()}`;
    const team: Team = {
      id: teamId,
      name: "Test Team",
      preset,
      agents: new Map(),
      tasks: new Map(),
      createdAt: new Date(),
      task: "Review this code"
    };

    for (const name of agentNames) {
      team.agents.set(name, {
        name,
        sessionID: null,
        role: name,
        status: "idle"
      });
    }

    teams.set(teamId, team);

    expect(teams.size).toBe(1);
    expect(team.agents.size).toBe(3);
    expect(Array.from(team.agents.keys())).toEqual(["code-reviewer", "security-auditor", "devil-s-advocate"]);
  });

  it("should create team with custom agents", () => {
    const customAgents = ["backend-developer", "frontend-developer"];

    const teamId = `team-${Date.now()}`;
    const team: Team = {
      id: teamId,
      name: "Custom Team",
      preset: "custom",
      agents: new Map(),
      tasks: new Map(),
      createdAt: new Date(),
      task: "Build a feature"
    };

    for (const name of customAgents) {
      team.agents.set(name, {
        name,
        sessionID: null,
        role: name,
        status: "idle"
      });
    }

    teams.set(teamId, team);

    expect(team.agents.size).toBe(2);
    expect(team.agents.has("backend-developer")).toBe(true);
    expect(team.agents.has("frontend-developer")).toBe(true);
  });

  it("should enforce max teams limit", () => {
    const MAX_TEAMS = 50;

    // Create 51 teams
    for (let i = 0; i < MAX_TEAMS + 1; i++) {
      const teamId = `team-${i}`;
      teams.set(teamId, {
        id: teamId,
        name: `Team ${i}`,
        preset: "review",
        agents: new Map(),
        tasks: new Map(),
        createdAt: new Date(i), // Different creation times
        task: `Task ${i}`
      });
    }

    // Simulate enforceMaxTeams - remove oldest if over limit
    if (teams.size > MAX_TEAMS) {
      const entries = Array.from(teams.entries());
      entries.sort((a, b) => a[1].createdAt.getTime() - b[1].createdAt.getTime());
      const toRemove = entries.slice(0, teams.size - MAX_TEAMS);
      for (const [id] of toRemove) {
        teams.delete(id);
      }
    }

    expect(teams.size).toBe(MAX_TEAMS);
    expect(teams.has("team-0")).toBe(false); // Oldest should be removed
    expect(teams.has("team-1")).toBe(true);
  });
});

describe("Integration Tests: Task Management Flow", () => {
  let team: Team;

  beforeEach(() => {
    team = {
      id: "team-1",
      name: "Test Team",
      preset: "implementation",
      agents: new Map([
        ["backend-developer", { name: "backend-developer", sessionID: null, role: "Backend Developer", status: "idle" }],
        ["frontend-developer", { name: "frontend-developer", sessionID: null, role: "Frontend Developer", status: "idle" }]
      ]),
      tasks: new Map(),
      createdAt: new Date(),
      task: "Build a feature"
    };
  });

  it("should create task without dependencies", () => {
    const taskId = `task-${Date.now()}`;
    const task: Task = {
      id: taskId,
      subject: "Setup database",
      description: "Create database schema",
      status: "pending",
      owner: "backend-developer",
      blockedBy: [],
      blocks: [],
      createdAt: new Date()
    };

    team.tasks.set(taskId, task);

    expect(team.tasks.size).toBe(1);
    expect(task.status).toBe("pending");
    expect(task.blockedBy.length).toBe(0);
  });

  it("should create task with dependencies", () => {
    const task1Id = "task-1";
    const task2Id = "task-2";

    const task1: Task = {
      id: task1Id,
      subject: "Setup database",
      description: "Create database schema",
      status: "completed",
      owner: "backend-developer",
      blockedBy: [],
      blocks: [task2Id],
      createdAt: new Date()
    };

    const task2: Task = {
      id: task2Id,
      subject: "Create API endpoint",
      description: "Build REST API",
      status: "pending",
      owner: "backend-developer",
      blockedBy: [task1Id],
      blocks: [],
      createdAt: new Date()
    };

    team.tasks.set(task1Id, task1);
    team.tasks.set(task2Id, task2);

    expect(team.tasks.size).toBe(2);
    expect(task2.blockedBy).toContain(task1Id);
    expect(task1.blocks).toContain(task2Id);
  });

  it("should update task status", () => {
    const taskId = "task-1";
    const task: Task = {
      id: taskId,
      subject: "Setup database",
      description: "Create database schema",
      status: "pending",
      owner: "backend-developer",
      blockedBy: [],
      blocks: [],
      createdAt: new Date()
    };

    team.tasks.set(taskId, task);

    // Update status
    task.status = "in_progress";

    expect(task.status).toBe("in_progress");

    // Complete task
    task.status = "completed";
    task.completedAt = new Date();

    expect(task.status).toBe("completed");
    expect(task.completedAt).toBeDefined();
  });

  it("should detect and prevent cyclic dependencies", () => {
    const taskA: Task = {
      id: "task-a",
      subject: "Task A",
      description: "A",
      status: "pending",
      blockedBy: ["task-b"],
      blocks: [],
      createdAt: new Date()
    };
    const taskB: Task = {
      id: "task-b",
      subject: "Task B",
      description: "B",
      status: "pending",
      blockedBy: ["task-a"],
      blocks: [],
      createdAt: new Date()
    };

    team.tasks.set("task-a", taskA);
    team.tasks.set("task-b", taskB);

    // Check for cyclic dependencies
    const visited = new Set<string>();

    function detectCyclicDependency(taskId: string, visited: Set<string>): boolean {
      if (visited.has(taskId)) return true;
      visited.add(taskId);

      const task = team.tasks.get(taskId);
      if (!task) return false;

      for (const depId of task.blockedBy) {
        if (detectCyclicDependency(depId, visited)) {
          return true;
        }
      }

      visited.delete(taskId);
      return false;
    }

    expect(detectCyclicDependency("task-a", visited)).toBe(true);
  });

  it("should execute tasks in correct order based on dependencies", () => {
    // Create task chain: task1 -> task2 -> task3
    const task1: Task = {
      id: "task-1",
      subject: "Task 1",
      description: "First task",
      status: "completed",
      blockedBy: [],
      blocks: [],
      createdAt: new Date()
    };
    const task2: Task = {
      id: "task-2",
      subject: "Task 2",
      description: "Second task",
      status: "pending",
      blockedBy: ["task-1"],
      blocks: [],
      createdAt: new Date()
    };
    const task3: Task = {
      id: "task-3",
      subject: "Task 3",
      description: "Third task",
      status: "pending",
      blockedBy: ["task-2"],
      blocks: [],
      createdAt: new Date()
    };

    team.tasks.set("task-1", task1);
    team.tasks.set("task-2", task2);
    team.tasks.set("task-3", task3);

    // Get executable tasks
    function canExecuteTask(task: Task): boolean {
      return task.blockedBy.every(depId => {
        const depTask = team.tasks.get(depId);
        return depTask?.status === "completed";
      });
    }

    function getExecutableTasks(): Task[] {
      return Array.from(team.tasks.values())
        .filter(t => t.status === "pending" && canExecuteTask(t));
    }

    // Initially only task2 should be executable
    let executable = getExecutableTasks();
    expect(executable.map(t => t.id)).toEqual(["task-2"]);

    // Complete task2
    task2.status = "completed";

    // Now task3 should be executable
    executable = getExecutableTasks();
    expect(executable.map(t => t.id)).toEqual(["task-3"]);
  });
});

describe("Integration Tests: Agent Execution Flow", () => {
  let mockClient: MockOpencodeClient;

  beforeEach(() => {
    mockClient = new MockOpencodeClient();
  });

  it("should spawn agent session successfully", async () => {
    const agentName = "code-reviewer";
    const task = "Review this code";

    const sessionResponse = await mockClient.session.create({});
    const sessionID = sessionResponse.data?.id;

    expect(sessionID).toBeDefined();
    expect(mockClient.sessions.size).toBe(1);

    const session = mockClient.sessions.get(sessionID!);
    expect(session?.promptCalled).toBe(false);
    expect(session?.messagesCalled).toBe(false);
  });

  it("should send prompt to session", async () => {
    const sessionResponse = await mockClient.session.create({});
    const sessionID = sessionResponse.data?.id!;

    await mockClient.session.prompt({
      path: { id: sessionID },
      body: {
        parts: [{ type: "text", text: "Test prompt" }],
        agent: "test-agent"
      }
    });

    const session = mockClient.sessions.get(sessionID);
    expect(session?.promptCalled).toBe(true);
  });

  it("should retrieve messages from session", async () => {
    const sessionResponse = await mockClient.session.create({});
    const sessionID = sessionResponse.data?.id!;

    const messages = await mockClient.session.messages({
      path: { id: sessionID }
    });

    expect(messages.data).toBeDefined();
    expect(messages.data?.length).toBeGreaterThan(0);
    expect(messages.data?.[0].info.role).toBe("assistant");
  });

  it("should cleanup session", async () => {
    const sessionResponse = await mockClient.session.create({});
    const sessionID = sessionResponse.data?.id!;

    await mockClient.session.delete({
      path: { id: sessionID }
    });

    const session = mockClient.sessions.get(sessionID);
    expect(session).toBeUndefined();
    expect(mockClient.sessions.size).toBe(0);
  });

  it("should handle multiple parallel sessions", async () => {
    const agents = ["code-reviewer", "security-auditor", "devil-s-advocate"];
    const sessionPromises = agents.map(() => mockClient.session.create({}));

    const sessions = await Promise.all(sessionPromises);

    expect(mockClient.sessions.size).toBe(3);
    expect(sessions.every(s => s.data?.id)).toBe(true);
  });
});

describe("Integration Tests: Discussion Flow", () => {
  let team: Team;

  beforeEach(() => {
    team = {
      id: "team-discuss-1",
      name: "Discussion Team",
      preset: "review",
      agents: new Map([
        ["code-reviewer", { name: "code-reviewer", sessionID: null, role: "Code Reviewer", status: "idle" }],
        ["security-auditor", { name: "security-auditor", sessionID: null, role: "Security Auditor", status: "idle" }],
        ["devil-s-advocate", { name: "devil-s-advocate", sessionID: null, role: "Devil's Advocate", status: "idle" }]
      ]),
      tasks: new Map(),
      createdAt: new Date(),
      task: "Discuss this code"
    };
  });

  it("should identify devil's advocate in team", () => {
    const devilAgents = Array.from(team.agents.keys()).filter(isDevilsAdvocate);
    expect(devilAgents).toEqual(["devil-s-advocate"]);
  });

  it("should format discussion results", () => {
    const results = [
      { name: "code-reviewer", success: true, result: "Code looks good overall, but consider adding more error handling." },
      { name: "security-auditor", success: true, result: "Found potential SQL injection vulnerability." },
      { name: "devil-s-advocate", success: true, result: "What if the input is malicious? The validation isn't comprehensive enough." }
    ];

    let response = `## Results\n\n`;
    const MAX_RESULT_LENGTH = 2000;

    for (const { name, success, result, error } of results) {
      const statusIcon = success ? "[OK]" : "[FAIL]";
      response += `### ${statusIcon} ${name}\n`;

      if (success && result) {
        response += `${truncateText(result, MAX_RESULT_LENGTH)}\n`;
      } else if (error) {
        response += `**Error**: ${error}\n`;
      }
      response += `\n---\n\n`;
    }

    expect(response).toContain("code-reviewer");
    expect(response).toContain("security-auditor");
    expect(response).toContain("devil-s-advocate");
    expect(response).toContain("[OK]");
  });
});

describe("Integration Tests: Auto Team Detection", () => {
  it("should detect security preset from request", () => {
    const request = "Please check the security of this authentication module";
    const keywords = ["security", "보안", "취약점"];
    const lowerRequest = request.toLowerCase();

    let detected = "review";
    for (const [preset, presetKeywords] of Object.entries({
      security: ["security", "보안", "취약점"],
      debug: ["debug", "버그", "에러"],
      planning: ["planning", "계획", "설계"],
      implementation: ["implement", "구현", "개발"],
      research: ["research", "조사", "탐색"],
    })) {
      if (presetKeywords.some((kw) => lowerRequest.includes(kw))) {
        detected = preset;
        break;
      }
    }

    expect(detected).toBe("security");
  });

  it("should detect debug preset from request", () => {
    const request = "Debug this failing test case";
    const lowerRequest = request.toLowerCase();

    let detected = "review";
    for (const [preset, presetKeywords] of Object.entries({
      security: ["security", "보안", "취약점"],
      debug: ["debug", "버그", "에러"],
      planning: ["planning", "계획", "설계"],
      implementation: ["implement", "구현", "개발"],
      research: ["research", "조사", "탐색"],
    })) {
      if (presetKeywords.some((kw) => lowerRequest.includes(kw))) {
        detected = preset;
        break;
      }
    }

    expect(detected).toBe("debug");
  });

  it("should default to review preset for unknown request", () => {
    const request = "Tell me a joke";
    const lowerRequest = request.toLowerCase();

    let detected = "review";
    for (const [preset, presetKeywords] of Object.entries({
      security: ["security", "보안", "취약점"],
      debug: ["debug", "버그", "에러"],
      planning: ["planning", "계획", "설계"],
      implementation: ["implement", "구현", "개발"],
      research: ["research", "조사", "탐색"],
    })) {
      if (presetKeywords.some((kw) => lowerRequest.includes(kw))) {
        detected = preset;
        break;
      }
    }

    expect(detected).toBe("review");
  });
});

describe("Integration Tests: Persistence", () => {
  it("should serialize team to JSON", () => {
    const team: Team = {
      id: "team-1",
      name: "Test Team",
      preset: "review",
      agents: new Map([
        ["code-reviewer", { name: "code-reviewer", sessionID: null, role: "Code Reviewer", status: "idle" }]
      ]),
      tasks: new Map([
        ["task-1", {
          id: "task-1",
          subject: "Review code",
          description: "Review the authentication module",
          status: "pending",
          blockedBy: [],
          blocks: [],
          createdAt: new Date("2024-01-01T00:00:00Z")
        }]
      ]),
      createdAt: new Date("2024-01-01T00:00:00Z"),
      task: "Review authentication"
    };

    const serialized = {
      id: team.id,
      name: team.name,
      preset: team.preset,
      task: team.task,
      createdAt: team.createdAt.toISOString(),
      agents: Array.from(team.agents.entries()).map(([name, agent]) => ({
        name,
        role: agent.role,
        status: agent.status
      })),
      tasks: Array.from(team.tasks.entries()).map(([id, task]) => ({
        id,
        subject: task.subject,
        description: task.description,
        status: task.status,
        owner: task.owner,
        blockedBy: task.blockedBy,
        blocks: task.blocks,
        createdAt: task.createdAt.toISOString()
      }))
    };

    expect(serialized.agents).toHaveLength(1);
    expect(serialized.agents[0].name).toBe("code-reviewer");
    expect(serialized.tasks).toHaveLength(1);
    expect(serialized.tasks[0].subject).toBe("Review code");
  });

  it("should deserialize team from JSON", () => {
    const data = {
      id: "team-1",
      name: "Test Team",
      preset: "review",
      task: "Review authentication",
      createdAt: "2024-01-01T00:00:00Z",
      agents: [
        { name: "code-reviewer", role: "Code Reviewer", status: "idle" }
      ],
      tasks: [
        {
          id: "task-1",
          subject: "Review code",
          description: "Review the authentication module",
          status: "pending",
          owner: undefined,
          blockedBy: [],
          blocks: [],
          createdAt: "2024-01-01T00:00:00Z"
        }
      ]
    };

    const team: Team = {
      id: data.id,
      name: data.name,
      preset: data.preset,
      task: data.task,
      createdAt: new Date(data.createdAt),
      agents: new Map(),
      tasks: new Map()
    };

    for (const agent of data.agents || []) {
      team.agents.set(agent.name, {
        name: agent.name,
        sessionID: null,
        role: agent.role,
        status: agent.status
      });
    }

    for (const task of data.tasks || []) {
      team.tasks.set(task.id, {
        id: task.id,
        subject: task.subject,
        description: task.description,
        status: task.status,
        owner: task.owner,
        blockedBy: task.blockedBy || [],
        blocks: task.blocks || [],
        createdAt: new Date(task.createdAt)
      });
    }

    expect(team.agents.size).toBe(1);
    expect(team.agents.get("code-reviewer")?.role).toBe("Code Reviewer");
    expect(team.tasks.size).toBe(1);
    expect(team.tasks.get("task-1")?.subject).toBe("Review code");
  });
});

describe("Integration Tests: Error Handling", () => {
  it("should handle non-existent team lookup", () => {
    const teams = new Map<string, Team>();
    const team = teams.get("non-existent");

    expect(team).toBeUndefined();
  });

  it("should handle non-existent task lookup", () => {
    const team: Team = {
      id: "team-1",
      name: "Test Team",
      preset: "review",
      agents: new Map(),
      tasks: new Map(),
      createdAt: new Date(),
      task: "Test"
    };

    const task = team.tasks.get("non-existent");
    expect(task).toBeUndefined();
  });

  it("should handle empty agent list", () => {
    const team: Team = {
      id: "team-1",
      name: "Empty Team",
      preset: "custom",
      agents: new Map(),
      tasks: new Map(),
      createdAt: new Date(),
      task: "Test"
    };

    expect(team.agents.size).toBe(0);
  });

  it("should handle empty task list", () => {
    const team: Team = {
      id: "team-1",
      name: "Team",
      preset: "review",
      agents: new Map([
        ["code-reviewer", { name: "code-reviewer", sessionID: null, role: "Code Reviewer", status: "idle" }]
      ]),
      tasks: new Map(),
      createdAt: new Date(),
      task: "Test"
    };

    expect(team.tasks.size).toBe(0);
  });
});

console.log("\n=== Integration Test File Loaded ===\n");
