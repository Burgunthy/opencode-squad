/**
 * Unit Tests for agent-teams plugin
 * Tests individual functions and utilities in isolation
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";

// Import the functions we need to test
// Since we're testing internal functions, we need to either:
// 1. Export them for testing, or
// 2. Test them through the public API
// For now, we'll recreate the test scenarios

// ============================================================================
// TEST UTILITIES
// ============================================================================

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
// RECREATE FUNCTIONS FOR TESTING (since they're internal)
// ============================================================================

const DEVILS_ADVOCATE_NAMES = [
  "devil-s-advocate",
  "devils-advocate",
  "devil_advocate",
  "devilsadvocate",
  "devil-sadvocate"
];

function isDevilsAdvocate(agentName: string): boolean {
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

function canExecuteTask(team: Team, task: Task): boolean {
  return task.blockedBy.every(depId => {
    const depTask = team.tasks.get(depId);
    return depTask?.status === "completed";
  });
}

function detectCyclicDependency(team: Team, taskId: string, visited: Set<string> = new Set()): boolean {
  if (visited.has(taskId)) return true;
  visited.add(taskId);

  const task = team.tasks.get(taskId);
  if (!task) return false;

  for (const depId of task.blockedBy) {
    if (detectCyclicDependency(team, depId, visited)) {
      return true;
    }
  }

  visited.delete(taskId);
  return false;
}

function findCyclicDependencies(team: Team): string[] {
  const cyclic: string[] = [];
  for (const [id] of team.tasks) {
    if (detectCyclicDependency(team, id)) {
      cyclic.push(id);
    }
  }
  return cyclic;
}

function detectPreset(request: string): string {
  const PRESET_KEYWORDS: Record<string, string[]> = {
    security: ["security", "보안", "취약점"],
    debug: ["debug", "버그", "에러"],
    planning: ["planning", "계획", "설계"],
    implementation: ["implement", "구현", "개발"],
    research: ["research", "조사", "탐색"],
  };

  const lowerRequest = request.toLowerCase();

  for (const [preset, keywords] of Object.entries(PRESET_KEYWORDS)) {
    if (keywords.some((kw) => lowerRequest.includes(kw))) {
      return preset;
    }
  }

  return "review";
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe("Unit Tests: isDevilsAdvocate", () => {
  it("should detect devil-s-advocate", () => {
    expect(isDevilsAdvocate("devil-s-advocate")).toBe(true);
  });

  it("should detect devils-advocate", () => {
    expect(isDevilsAdvocate("devils-advocate")).toBe(true);
  });

  it("should detect devil_advocate", () => {
    expect(isDevilsAdvocate("devil_advocate")).toBe(true);
  });

  it("should detect devilsadvocate", () => {
    expect(isDevilsAdvocate("devilsadvocate")).toBe(true);
  });

  it("should be case insensitive", () => {
    expect(isDevilsAdvocate("DEVIL-S-ADVOCATE")).toBe(true);
    expect(isDevilsAdvocate("Devil-s-Advocate")).toBe(true);
    expect(isDevilsAdvocate("DevilsAdvocate")).toBe(true);
  });

  it("should reject non-devils-advocate names", () => {
    expect(isDevilsAdvocate("code-reviewer")).toBe(false);
    expect(isDevilsAdvocate("security-auditor")).toBe(false);
    expect(isDevilsAdvocate("devil-advocate")).toBe(false); // Missing 's'
    expect(isDevilsAdvocate("advocate")).toBe(false);
  });

  it("should handle empty string", () => {
    expect(isDevilsAdvocate("")).toBe(false);
  });
});

describe("Unit Tests: truncateText", () => {
  it("should not truncate short text", () => {
    const text = "Hello World";
    const result = truncateText(text, 20);
    expect(result).toBe("Hello World");
  });

  it("should not truncate text exactly at max length", () => {
    const text = "Hello World!";
    const result = truncateText(text, 12);
    expect(result).toBe("Hello World!");
  });

  it("should truncate long text and add ellipsis", () => {
    const text = "This is a very long text that should be truncated";
    const result = truncateText(text, 20);
    expect(result).toBe("This is a very long ...");
    expect(result.length).toBe(24); // 20 + "..." length
  });

  it("should handle empty string", () => {
    const result = truncateText("", 10);
    expect(result).toBe("");
  });

  it("should handle zero max length", () => {
    const result = truncateText("Hello", 0);
    expect(result).toBe("...");
  });

  it("should handle negative max length", () => {
    const result = truncateText("Hello", -1);
    expect(result).toBe("...");
  });
});

describe("Unit Tests: extractRoleFromDescription", () => {
  it("should extract first sentence from description", () => {
    const description = "Expert code reviewer. Finds bugs and issues.";
    const result = extractRoleFromDescription(description, "fallback");
    expect(result).toBe("Expert code reviewer");
  });

  it("should return fallback when description is undefined", () => {
    const result = extractRoleFromDescription(undefined, "fallback");
    expect(result).toBe("fallback");
  });

  it("should return fallback when description is empty", () => {
    const result = extractRoleFromDescription("", "fallback");
    expect(result).toBe("fallback");
  });

  it("should handle description without period", () => {
    const description = "Expert code reviewer";
    const result = extractRoleFromDescription(description, "fallback");
    expect(result).toBe("Expert code reviewer");
  });

  it("should handle description with multiple periods", () => {
    const description = "Expert code reviewer. Finds bugs. Reports issues.";
    const result = extractRoleFromDescription(description, "fallback");
    expect(result).toBe("Expert code reviewer");
  });

  it("should return fallback for null description", () => {
    const result = extractRoleFromDescription(null as any, "fallback");
    expect(result).toBe("fallback");
  });
});

describe("Unit Tests: canExecuteTask", () => {
  let team: Team;

  beforeEach(() => {
    team = {
      id: "team-1",
      name: "Test Team",
      preset: "review",
      agents: new Map(),
      tasks: new Map(),
      createdAt: new Date(),
      task: "Test task"
    };
  });

  it("should return true for task with no dependencies", () => {
    const task: Task = {
      id: "task-1",
      subject: "Test Task",
      description: "Test description",
      status: "pending",
      blockedBy: [],
      blocks: [],
      createdAt: new Date()
    };

    expect(canExecuteTask(team, task)).toBe(true);
  });

  it("should return true when all dependencies are completed", () => {
    const depTask: Task = {
      id: "task-dep",
      subject: "Dependency Task",
      description: "Dependency",
      status: "completed",
      blockedBy: [],
      blocks: [],
      createdAt: new Date()
    };
    team.tasks.set("task-dep", depTask);

    const task: Task = {
      id: "task-1",
      subject: "Test Task",
      description: "Test description",
      status: "pending",
      blockedBy: ["task-dep"],
      blocks: [],
      createdAt: new Date()
    };

    expect(canExecuteTask(team, task)).toBe(true);
  });

  it("should return false when dependency is pending", () => {
    const depTask: Task = {
      id: "task-dep",
      subject: "Dependency Task",
      description: "Dependency",
      status: "pending",
      blockedBy: [],
      blocks: [],
      createdAt: new Date()
    };
    team.tasks.set("task-dep", depTask);

    const task: Task = {
      id: "task-1",
      subject: "Test Task",
      description: "Test description",
      status: "pending",
      blockedBy: ["task-dep"],
      blocks: [],
      createdAt: new Date()
    };

    expect(canExecuteTask(team, task)).toBe(false);
  });

  it("should return false when dependency is in_progress", () => {
    const depTask: Task = {
      id: "task-dep",
      subject: "Dependency Task",
      description: "Dependency",
      status: "in_progress",
      blockedBy: [],
      blocks: [],
      createdAt: new Date()
    };
    team.tasks.set("task-dep", depTask);

    const task: Task = {
      id: "task-1",
      subject: "Test Task",
      description: "Test description",
      status: "pending",
      blockedBy: ["task-dep"],
      blocks: [],
      createdAt: new Date()
    };

    expect(canExecuteTask(team, task)).toBe(false);
  });

  it("should return false when dependency is blocked", () => {
    const depTask: Task = {
      id: "task-dep",
      subject: "Dependency Task",
      description: "Dependency",
      status: "blocked",
      blockedBy: [],
      blocks: [],
      createdAt: new Date()
    };
    team.tasks.set("task-dep", depTask);

    const task: Task = {
      id: "task-1",
      subject: "Test Task",
      description: "Test description",
      status: "pending",
      blockedBy: ["task-dep"],
      blocks: [],
      createdAt: new Date()
    };

    expect(canExecuteTask(team, task)).toBe(false);
  });

  it("should return false when dependency is error", () => {
    const depTask: Task = {
      id: "task-dep",
      subject: "Dependency Task",
      description: "Dependency",
      status: "error",
      blockedBy: [],
      blocks: [],
      createdAt: new Date()
    };
    team.tasks.set("task-dep", depTask);

    const task: Task = {
      id: "task-1",
      subject: "Test Task",
      description: "Test description",
      status: "pending",
      blockedBy: ["task-dep"],
      blocks: [],
      createdAt: new Date()
    };

    expect(canExecuteTask(team, task)).toBe(false);
  });

  it("should return false when dependency does not exist", () => {
    const task: Task = {
      id: "task-1",
      subject: "Test Task",
      description: "Test description",
      status: "pending",
      blockedBy: ["non-existent-dep"],
      blocks: [],
      createdAt: new Date()
    };

    expect(canExecuteTask(team, task)).toBe(false);
  });

  it("should return true only when all multiple dependencies are completed", () => {
    const depTask1: Task = {
      id: "task-dep-1",
      subject: "Dependency Task 1",
      description: "Dependency 1",
      status: "completed",
      blockedBy: [],
      blocks: [],
      createdAt: new Date()
    };
    const depTask2: Task = {
      id: "task-dep-2",
      subject: "Dependency Task 2",
      description: "Dependency 2",
      status: "completed",
      blockedBy: [],
      blocks: [],
      createdAt: new Date()
    };
    team.tasks.set("task-dep-1", depTask1);
    team.tasks.set("task-dep-2", depTask2);

    const task: Task = {
      id: "task-1",
      subject: "Test Task",
      description: "Test description",
      status: "pending",
      blockedBy: ["task-dep-1", "task-dep-2"],
      blocks: [],
      createdAt: new Date()
    };

    expect(canExecuteTask(team, task)).toBe(true);
  });

  it("should return false when one of multiple dependencies is incomplete", () => {
    const depTask1: Task = {
      id: "task-dep-1",
      subject: "Dependency Task 1",
      description: "Dependency 1",
      status: "completed",
      blockedBy: [],
      blocks: [],
      createdAt: new Date()
    };
    const depTask2: Task = {
      id: "task-dep-2",
      subject: "Dependency Task 2",
      description: "Dependency 2",
      status: "pending",
      blockedBy: [],
      blocks: [],
      createdAt: new Date()
    };
    team.tasks.set("task-dep-1", depTask1);
    team.tasks.set("task-dep-2", depTask2);

    const task: Task = {
      id: "task-1",
      subject: "Test Task",
      description: "Test description",
      status: "pending",
      blockedBy: ["task-dep-1", "task-dep-2"],
      blocks: [],
      createdAt: new Date()
    };

    expect(canExecuteTask(team, task)).toBe(false);
  });
});

describe("Unit Tests: detectCyclicDependency", () => {
  let team: Team;

  beforeEach(() => {
    team = {
      id: "team-1",
      name: "Test Team",
      preset: "review",
      agents: new Map(),
      tasks: new Map(),
      createdAt: new Date(),
      task: "Test task"
    };
  });

  it("should return false for task with no dependencies", () => {
    const task: Task = {
      id: "task-1",
      subject: "Test Task",
      description: "Test description",
      status: "pending",
      blockedBy: [],
      blocks: [],
      createdAt: new Date()
    };
    team.tasks.set("task-1", task);

    expect(detectCyclicDependency(team, "task-1")).toBe(false);
  });

  it("should return false for linear dependency chain", () => {
    const task1: Task = {
      id: "task-1",
      subject: "Task 1",
      description: "First task",
      status: "pending",
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

    expect(detectCyclicDependency(team, "task-3")).toBe(false);
  });

  it("should detect direct cycle (task A depends on task B, B depends on A)", () => {
    const taskA: Task = {
      id: "task-a",
      subject: "Task A",
      description: "Task A",
      status: "pending",
      blockedBy: ["task-b"],
      blocks: [],
      createdAt: new Date()
    };
    const taskB: Task = {
      id: "task-b",
      subject: "Task B",
      description: "Task B",
      status: "pending",
      blockedBy: ["task-a"],
      blocks: [],
      createdAt: new Date()
    };
    team.tasks.set("task-a", taskA);
    team.tasks.set("task-b", taskB);

    expect(detectCyclicDependency(team, "task-a")).toBe(true);
    expect(detectCyclicDependency(team, "task-b")).toBe(true);
  });

  it("should detect indirect cycle (A -> B -> C -> A)", () => {
    const taskA: Task = {
      id: "task-a",
      subject: "Task A",
      description: "Task A",
      status: "pending",
      blockedBy: ["task-c"],
      blocks: [],
      createdAt: new Date()
    };
    const taskB: Task = {
      id: "task-b",
      subject: "Task B",
      description: "Task B",
      status: "pending",
      blockedBy: ["task-a"],
      blocks: [],
      createdAt: new Date()
    };
    const taskC: Task = {
      id: "task-c",
      subject: "Task C",
      description: "Task C",
      status: "pending",
      blockedBy: ["task-b"],
      blocks: [],
      createdAt: new Date()
    };
    team.tasks.set("task-a", taskA);
    team.tasks.set("task-b", taskB);
    team.tasks.set("task-c", taskC);

    expect(detectCyclicDependency(team, "task-a")).toBe(true);
    expect(detectCyclicDependency(team, "task-b")).toBe(true);
    expect(detectCyclicDependency(team, "task-c")).toBe(true);
  });

  it("should return false for non-existent task", () => {
    expect(detectCyclicDependency(team, "non-existent")).toBe(false);
  });

  it("should handle complex DAG without cycles", () => {
    const task1: Task = {
      id: "task-1",
      subject: "Task 1",
      description: "First",
      status: "pending",
      blockedBy: [],
      blocks: [],
      createdAt: new Date()
    };
    const task2: Task = {
      id: "task-2",
      subject: "Task 2",
      description: "Second",
      status: "pending",
      blockedBy: ["task-1"],
      blocks: [],
      createdAt: new Date()
    };
    const task3: Task = {
      id: "task-3",
      subject: "Task 3",
      description: "Third",
      status: "pending",
      blockedBy: ["task-1"],
      blocks: [],
      createdAt: new Date()
    };
    const task4: Task = {
      id: "task-4",
      subject: "Task 4",
      description: "Fourth",
      status: "pending",
      blockedBy: ["task-2", "task-3"],
      blocks: [],
      createdAt: new Date()
    };
    team.tasks.set("task-1", task1);
    team.tasks.set("task-2", task2);
    team.tasks.set("task-3", task3);
    team.tasks.set("task-4", task4);

    expect(detectCyclicDependency(team, "task-4")).toBe(false);
  });
});

describe("Unit Tests: findCyclicDependencies", () => {
  let team: Team;

  beforeEach(() => {
    team = {
      id: "team-1",
      name: "Test Team",
      preset: "review",
      agents: new Map(),
      tasks: new Map(),
      createdAt: new Date(),
      task: "Test task"
    };
  });

  it("should return empty array for team with no cycles", () => {
    const task1: Task = {
      id: "task-1",
      subject: "Task 1",
      description: "First",
      status: "pending",
      blockedBy: [],
      blocks: [],
      createdAt: new Date()
    };
    const task2: Task = {
      id: "task-2",
      subject: "Task 2",
      description: "Second",
      status: "pending",
      blockedBy: ["task-1"],
      blocks: [],
      createdAt: new Date()
    };
    team.tasks.set("task-1", task1);
    team.tasks.set("task-2", task2);

    const cycles = findCyclicDependencies(team);
    expect(cycles).toEqual([]);
  });

  it("should find all tasks involved in cycles", () => {
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
    const taskC: Task = {
      id: "task-c",
      subject: "Task C",
      description: "C (no cycle)",
      status: "pending",
      blockedBy: [],
      blocks: [],
      createdAt: new Date()
    };
    team.tasks.set("task-a", taskA);
    team.tasks.set("task-b", taskB);
    team.tasks.set("task-c", taskC);

    const cycles = findCyclicDependencies(team);
    expect(cycles).toContain("task-a");
    expect(cycles).toContain("task-b");
    expect(cycles).not.toContain("task-c");
    expect(cycles.length).toBe(2);
  });

  it("should handle empty team", () => {
    const cycles = findCyclicDependencies(team);
    expect(cycles).toEqual([]);
  });
});

describe("Unit Tests: detectPreset", () => {
  it("should return 'review' as default", () => {
    expect(detectPreset("just some random text")).toBe("review");
  });

  it("should detect security preset", () => {
    expect(detectPreset("Check security")).toBe("security");
    expect(detectPreset("보안 검사")).toBe("security");
    expect(detectPreset("Find 취약점")).toBe("security");
  });

  it("should detect debug preset", () => {
    expect(detectPreset("Debug this code")).toBe("debug");
    expect(detectPreset("Fix the 버그")).toBe("debug");
    expect(detectPreset("There's an 에러")).toBe("debug");
  });

  it("should detect planning preset", () => {
    expect(detectPreset("Create a planning document")).toBe("planning");
    expect(detectPreset("Make a 계획")).toBe("planning");
    expect(detectPreset("Design and 설계")).toBe("planning");
  });

  it("should detect implementation preset", () => {
    expect(detectPreset("Implement this feature")).toBe("implementation");
    expect(detectPreset("구현 the code")).toBe("implementation");
    expect(detectPreset("개발 new feature")).toBe("implementation");
  });

  it("should detect research preset", () => {
    expect(detectPreset("Research this topic")).toBe("research");
    expect(detectPreset("조사 the data")).toBe("research");
    expect(detectPreset("탐색 new options")).toBe("research");
  });

  it("should be case insensitive", () => {
    expect(detectPreset("SECURITY check")).toBe("security");
    expect(detectPreset("DEBUG this")).toBe("debug");
  });

  it("should return first matching preset", () => {
    // Order in PRESET_KEYWORDS determines priority
    expect(detectPreset("security planning")).toBe("security");
  });
});

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

describe("Unit Tests: Edge Cases", () => {
  it("should handle special characters in truncateText", () => {
    const text = "Hello!@#$%^&*()_+ World";
    const result = truncateText(text, 10);
    expect(result).toBe("Hello!@#$%...");
  });

  it("should handle unicode characters in truncateText", () => {
    const text = "Hello World 안녕하세요";
    const result = truncateText(text, 12);
    expect(result).toBe("Hello World ...");
  });

  it("should handle empty dependency list", () => {
    const team: Team = {
      id: "team-1",
      name: "Test Team",
      preset: "review",
      agents: new Map(),
      tasks: new Map(),
      createdAt: new Date(),
      task: "Test task"
    };
    const task: Task = {
      id: "task-1",
      subject: "Test Task",
      description: "Test",
      status: "pending",
      blockedBy: [],
      blocks: [],
      createdAt: new Date()
    };
    expect(canExecuteTask(team, task)).toBe(true);
  });

  it("should handle very long agent names in isDevilsAdvocate", () => {
    expect(isDevilsAdvocate("very-long-prefix-devils-advocate-very-long-suffix")).toBe(false);
  });

  it("should handle description with only whitespace", () => {
    const result = extractRoleFromDescription("   ", "fallback");
    expect(result).toBe("   ");
  });
});

console.log("\n=== Unit Test File Loaded ===\n");
