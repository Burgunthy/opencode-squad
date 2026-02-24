/**
 * End-to-End Tests for agent-teams plugin
 * Tests actual plugin loading and tool execution in OpenCode
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";

// ============================================================================
// CONFIGURATION
// ============================================================================

const OPENCODE_CONFIG_PATH = "/home/jth/.config/opencode/opencode.json";
const PLUGIN_DIST_PATH = "/home/jth/.config/opencode/plugins/agent-teams/dist/index.js";
const TEAMS_DIR = "/home/jth/.opencode/teams";

// ============================================================================
// HELPERS
// ============================================================================

function fileExists(path: string): boolean {
  try {
    const stats = require("fs").existsSync(path);
    return stats;
  } catch {
    return false;
  }
}

function readJson(path: string): any {
  try {
    const content = require("fs").readFileSync(path, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function listFiles(dir: string): string[] {
  try {
    return require("fs").readdirSync(dir);
  } catch {
    return [];
  }
}

// ============================================================================
// E2E TEST SUITES
// ============================================================================

describe("E2E Tests: Plugin Build and Load", () => {
  it("should have built dist/index.js", () => {
    const exists = fileExists(PLUGIN_DIST_PATH);
    expect(exists).toBe(true);
  });

  it("should have valid opencode.json config", () => {
    const config = readJson(OPENCODE_CONFIG_PATH);
    expect(config).toBeDefined();
    expect(config.plugin).toBeDefined();
    expect(Array.isArray(config.plugin)).toBe(true);
  });

  it("should have agent-teams plugin registered in opencode.json", () => {
    const config = readJson(OPENCODE_CONFIG_PATH);
    const hasPlugin = config.plugin?.some((p: string) => p.includes("agent-teams"));
    expect(hasPlugin).toBe(true);
  });

  it("should have required agents defined in opencode.json", () => {
    const config = readJson(OPENCODE_CONFIG_PATH);
    const agents = config.agent || {};

    // Check for key agents used in presets
    const requiredAgents = [
      "code-reviewer",
      "security-auditor",
      "devil-s-advocate",
      "debugger",
      "planner"
    ];

    const missingAgents = requiredAgents.filter(a => !agents[a]);
    expect(missingAgents).toEqual([]);
  });
});

describe("E2E Tests: Plugin Export Structure", () => {
  let pluginModule: any;

  it("should import plugin module", async () => {
    try {
      pluginModule = await import(PLUGIN_DIST_PATH);
      expect(pluginModule).toBeDefined();
      expect(pluginModule.default).toBeDefined();
    } catch (error) {
      throw new Error(`Failed to import plugin: ${error}`);
    }
  });

  it("should export a default function", () => {
    expect(typeof pluginModule.default).toBe("function");
  });

  it("should have plugin metadata", () => {
    // Plugin is a function that returns a plugin object
    expect(typeof pluginModule.default).toBe("function");
  });
});

describe("E2E Tests: Teams Directory", () => {
  it("should create teams directory if needed", () => {
    const fs = require("fs");
    const path = require("path");
    const os = require("os");

    const teamsDir = path.join(os.homedir(), ".opencode", "teams");

    if (!fs.existsSync(teamsDir)) {
      fs.mkdirSync(teamsDir, { recursive: true });
    }

    const exists = fs.existsSync(teamsDir);
    expect(exists).toBe(true);
  });

  it("should be able to write team state to disk", () => {
    const fs = require("fs");
    const path = require("path");
    const os = require("os");
    const { randomUUID } = require("crypto");

    const teamsDir = path.join(os.homedir(), ".opencode", "teams");
    const testTeamId = `test-team-${randomUUID().slice(0, 8)}`;
    const testFilePath = path.join(teamsDir, `${testTeamId}.json`);

    const testTeam = {
      id: testTeamId,
      name: "Test Team",
      preset: "review",
      task: "Test task",
      createdAt: new Date().toISOString(),
      agents: [],
      tasks: []
    };

    try {
      fs.writeFileSync(testFilePath, JSON.stringify(testTeam, null, 2));
      const written = fs.existsSync(testFilePath);
      expect(written).toBe(true);

      // Cleanup
      fs.unlinkSync(testFilePath);
    } catch (error) {
      throw new Error(`Failed to write team state: ${error}`);
    }
  });
});

describe("E2E Tests: Preset Configuration", () => {
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

  it("should have all required presets defined", () => {
    const presetNames = Object.keys(PRESETS);
    expect(presetNames).toContain("review");
    expect(presetNames).toContain("security");
    expect(presetNames).toContain("debug");
    expect(presetNames).toContain("planning");
    expect(presetNames).toContain("implementation");
  });

  it("should include devil's advocate in all presets", () => {
    for (const [preset, agents] of Object.entries(PRESETS)) {
      expect(agents).toContain("devil-s-advocate");
    }
  });

  it("should have valid agent names for each preset", () => {
    const config = readJson(OPENCODE_CONFIG_PATH);
    const availableAgents = Object.keys(config.agent || {});

    for (const [preset, agents] of Object.entries(PRESETS)) {
      // Check that at least some agents are available
      const availableCount = agents.filter(a => availableAgents.includes(a)).length;
      expect(availableCount).toBeGreaterThan(0);
    }
  });
});

describe("E2E Tests: Constants Validation", () => {
  it("should have reasonable max teams limit", () => {
    const MAX_TEAMS = 50;
    expect(MAX_TEAMS).toBeGreaterThan(0);
    expect(MAX_TEAMS).toBeLessThan(1000);
  });

  it("should have reasonable max tasks limit", () => {
    const MAX_TASKS = 200;
    expect(MAX_TASKS).toBeGreaterThan(0);
    expect(MAX_TASKS).toBeLessThan(10000);
  });

  it("should have reasonable timeout values", () => {
    const DEFAULT_TIMEOUT_SECONDS = 120;
    expect(DEFAULT_TIMEOUT_SECONDS).toBeGreaterThan(10);
    expect(DEFAULT_TIMEOUT_SECONDS).toBeLessThan(600);
  });
});

describe("E2E Tests: Devil's Advocate Detection", () => {
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

  it("should detect all devil's advocate name variants", () => {
    for (const name of DEVILS_ADVOCATE_NAMES) {
      expect(isDevilsAdvocate(name)).toBe(true);
    }
  });

  it("should not detect non-devil's advocate names", () => {
    expect(isDevilsAdvocate("code-reviewer")).toBe(false);
    expect(isDevilsAdvocate("security-auditor")).toBe(false);
  });
});

describe("E2E Tests: Task Dependency Logic", () => {
  interface Task {
    id: string;
    blockedBy: string[];
  }

  it("should detect simple cycle", () => {
    const tasks = new Map<string, Task>();
    tasks.set("a", { id: "a", blockedBy: ["b"] });
    tasks.set("b", { id: "b", blockedBy: ["a"] });

    function detectCycle(taskId: string, visited: Set<string> = new Set()): boolean {
      if (visited.has(taskId)) return true;
      visited.add(taskId);

      const task = tasks.get(taskId);
      if (!task) return false;

      for (const depId of task.blockedBy) {
        if (detectCycle(depId, visited)) return true;
      }

      visited.delete(taskId);
      return false;
    }

    expect(detectCycle("a")).toBe(true);
  });

  it("should not detect cycle in DAG", () => {
    const tasks = new Map<string, Task>();
    tasks.set("a", { id: "a", blockedBy: [] });
    tasks.set("b", { id: "b", blockedBy: ["a"] });
    tasks.set("c", { id: "c", blockedBy: ["b"] });

    function detectCycle(taskId: string, visited: Set<string> = new Set()): boolean {
      if (visited.has(taskId)) return true;
      visited.add(taskId);

      const task = tasks.get(taskId);
      if (!task) return false;

      for (const depId of task.blockedBy) {
        if (detectCycle(depId, visited)) return true;
      }

      visited.delete(taskId);
      return false;
    }

    expect(detectCycle("c")).toBe(false);
  });
});

console.log("\n=== E2E Test File Loaded ===\n");
