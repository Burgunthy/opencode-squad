import { tool } from "@opencode-ai/plugin";
import fs from "fs";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
const z = tool.schema;
// ============================================================================
// CONSTANTS
// ============================================================================
const MAX_TEAMS = 50;
const MAX_TASKS = 200;
const DEFAULT_TIMEOUT_MS = 90000;
const POLL_INTERVAL_MS = 1500;
const MAX_RESULT_LENGTH = 2000;
const MAX_DISCUSSION_RESULT_LENGTH = 1000;
const MAX_CONTEXT_LENGTH = 500;
const DEFAULT_PRESET = "review";
const DEFAULT_TIMEOUT_SECONDS = 120;
const TEAMS_DIR = path.join(os.homedir(), ".opencode", "teams");
// ============================================================================
// DEVIL'S ADVOCATE PROMPT
// ============================================================================
const DEVILS_ADVOCATE_PROMPT = `
당신은 Devil's Advocate입니다. **모든 분석에 대해 반드시 비판적 관점을 제시해야 합니다.**

## 의무 사항
1. **잠재적 위험 지적**: 모든 제안의 위험성을 식별
2. **대안 제시**: 더 나은 접근법이 있다면 제시
3. **검증되지 않은 가정 식별**: 증명되지 않은 전제를 찾아라
4. **엣지 케이스 발견**: 다른 에이전트가 놓친 시나리오

## 출력 형식
### 🚨 What's Wrong
- [문제점]

### 💡 Alternative Approach
- [대안]

### ⚠️ What Others Missed
- [다른 에이전트가 놓친 것]

반드시 비판적이어야 합니다. 무조건적인 승인은 금지입니다.
`;
// Devil's Advocate 이름 매칭 (여러 변형 지원)
const DEVILS_ADVOCATE_NAMES = [
    "devil-s-advocate",
    "devils-advocate",
    "devil_advocate",
    "devilsadvocate",
    "devil-sadvocate"
];
function isDevilsAdvocate(agentName) {
    const normalized = agentName.toLowerCase().replace(/[_-]/g, "");
    return DEVILS_ADVOCATE_NAMES.some(name => normalized === name.replace(/[_-]/g, ""));
}
// ============================================================================
// GLOBAL STATE
// ============================================================================
let globalClient = null;
let opencodeConfig = {};
const teams = new Map();
const messageQueue = new Map();
// ============================================================================
// PERSISTENCE
// ============================================================================
function ensureTeamsDir() {
    if (!fs.existsSync(TEAMS_DIR)) {
        fs.mkdirSync(TEAMS_DIR, { recursive: true });
    }
}
function saveTeam(team) {
    try {
        ensureTeamsDir();
        const teamPath = path.join(TEAMS_DIR, `${team.id}.json`);
        const serialized = {
            id: team.id,
            name: team.name,
            preset: team.preset,
            task: team.task,
            createdAt: team.createdAt.toISOString(),
            agents: Array.from(team.agents.entries()).map(([name, agent]) => ({
                name,
                role: agent.role,
                status: agent.status,
                result: agent.result,
                error: agent.error
            })),
            tasks: Array.from(team.tasks.entries()).map(([id, task]) => ({
                id,
                subject: task.subject,
                description: task.description,
                status: task.status,
                owner: task.owner,
                blockedBy: task.blockedBy,
                blocks: task.blocks,
                result: task.result,
                error: task.error,
                createdAt: task.createdAt.toISOString(),
                completedAt: task.completedAt?.toISOString()
            }))
        };
        fs.writeFileSync(teamPath, JSON.stringify(serialized, null, 2));
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`[agent-teams] Failed to save team: ${errorMessage}`);
    }
}
function loadTeam(teamId) {
    try {
        const teamPath = path.join(TEAMS_DIR, `${teamId}.json`);
        if (!fs.existsSync(teamPath))
            return null;
        const data = JSON.parse(fs.readFileSync(teamPath, "utf-8"));
        const team = {
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
                status: agent.status,
                result: agent.result,
                error: agent.error
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
                result: task.result,
                error: task.error,
                createdAt: new Date(task.createdAt),
                completedAt: task.completedAt ? new Date(task.completedAt) : undefined
            });
        }
        return team;
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`[agent-teams] Failed to load team: ${errorMessage}`);
        return null;
    }
}
// ============================================================================
// MESSAGE PROTOCOL
// ============================================================================
function sendMessage(message) {
    const key = message.recipient || "broadcast";
    const queue = messageQueue.get(key) || [];
    queue.push(message);
    messageQueue.set(key, queue);
}
function getMessages(recipient, since) {
    const queue = messageQueue.get(recipient) || [];
    const broadcast = messageQueue.get("broadcast") || [];
    const all = [...queue, ...broadcast];
    if (since) {
        return all.filter(m => m.timestamp > since);
    }
    return all;
}
// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const truncateText = (text, maxLength) => text.length > maxLength ? text.slice(0, maxLength) + "..." : text;
const extractRoleFromDescription = (description, fallback) => description?.split(".")[0] ?? fallback;
// ============================================================================
// OPENCODE CLIENT & CONFIG
// ============================================================================
function loadOpenCodeAgents() {
    try {
        const configPath = path.join(process.cwd(), "opencode.json");
        const configContent = fs.readFileSync(configPath, "utf-8");
        const config = JSON.parse(configContent);
        opencodeConfig = config.agent ?? {};
        return opencodeConfig;
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`[agent-teams] Failed to load opencode.json: ${errorMessage}`);
        return {};
    }
}
// ============================================================================
// REAL AGENT EXECUTION
// ============================================================================
async function spawnAgentSession(agentName, task) {
    if (!globalClient) {
        throw new Error("OpenCode client not initialized");
    }
    const sessionResponse = await globalClient.session.create({});
    const sessionID = sessionResponse.data?.id;
    if (!sessionID) {
        throw new Error("Failed to create session: no session ID returned");
    }
    const agentConfig = opencodeConfig[agentName];
    // Devil's Advocate면 강제 프롬프트 적용
    const isDA = isDevilsAdvocate(agentName);
    const basePrompt = agentConfig?.prompt_append || "";
    const effectiveSystemPrompt = isDA
        ? basePrompt + "\n\n" + DEVILS_ADVOCATE_PROMPT
        : basePrompt;
    const promptBody = {
        parts: [{ type: "text", text: task }],
        agent: agentName,
    };
    if (effectiveSystemPrompt) {
        promptBody.system = effectiveSystemPrompt;
    }
    if (agentConfig?.model) {
        const parts = agentConfig.model.split("/");
        if (parts.length >= 2) {
            promptBody.model = { providerID: parts[0], modelID: parts.slice(1).join("/") };
        }
        else {
            console.warn(`[agent-teams] Invalid model format "${agentConfig.model}", expected "provider/model"`);
        }
    }
    await globalClient.session.prompt({
        path: { id: sessionID },
        body: promptBody,
    });
    return { sessionID, agent: agentConfig };
}
async function waitForSessionCompletion(sessionID, timeout = DEFAULT_TIMEOUT_MS) {
    const startTime = Date.now();
    let lastError = null;
    let consecutiveErrors = 0;
    // TextPart 타입 가드
    const isTextPart = (p) => p.type === "text" && "text" in p;
    while (Date.now() - startTime < timeout) {
        try {
            const messages = await globalClient.session.messages({
                path: { id: sessionID },
            });
            if (messages.data) {
                const assistantMessages = messages.data.filter((m) => m.info.role === "assistant");
                if (assistantMessages.length > 0) {
                    const lastMessage = assistantMessages[assistantMessages.length - 1];
                    const textParts = (lastMessage.parts ?? []).filter(isTextPart);
                    consecutiveErrors = 0;
                    return textParts.map((p) => p.text).join("\n");
                }
            }
            await sleep(POLL_INTERVAL_MS);
        }
        catch (error) {
            consecutiveErrors++;
            lastError = error instanceof Error ? error : new Error(String(error));
            if (consecutiveErrors >= 5) {
                throw new Error(`Session failed after 5 consecutive errors: ${lastError.message}`);
            }
            await sleep(POLL_INTERVAL_MS);
        }
    }
    throw new Error(`Session timeout after ${timeout / 1000}s. Last error: ${lastError?.message ?? "none"}`);
}
async function cleanupSession(sessionID) {
    if (!globalClient)
        return;
    try {
        await globalClient.session.delete({ path: { id: sessionID } });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`[agent-teams] Failed to cleanup session ${sessionID}: ${errorMessage}`);
    }
}
// ============================================================================
// TEAM MANAGEMENT
// ============================================================================
function enforceMaxTeams() {
    if (teams.size <= MAX_TEAMS)
        return;
    const entries = Array.from(teams.entries());
    entries.sort((a, b) => a[1].createdAt.getTime() - b[1].createdAt.getTime());
    const toRemove = entries.slice(0, teams.size - MAX_TEAMS);
    for (const [id, team] of toRemove) {
        for (const agent of team.agents.values()) {
            if (agent.sessionID) {
                cleanupSession(agent.sessionID).catch(() => { });
            }
        }
        teams.delete(id);
    }
}
// ============================================================================
// TASK MANAGEMENT
// ============================================================================
function createTask(team, subject, description, owner, blockedBy = [], blocks = []) {
    const task = {
        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        subject,
        description,
        status: "pending",
        owner,
        blockedBy,
        blocks,
        createdAt: new Date()
    };
    team.tasks.set(task.id, task);
    // Enforce max tasks
    if (team.tasks.size > MAX_TASKS) {
        const sorted = Array.from(team.tasks.entries())
            .sort((a, b) => a[1].createdAt.getTime() - b[1].createdAt.getTime());
        const toRemove = sorted.slice(0, team.tasks.size - MAX_TASKS);
        for (const [id] of toRemove) {
            team.tasks.delete(id);
        }
    }
    saveTeam(team);
    return task;
}
function canExecuteTask(team, task) {
    return task.blockedBy.every(depId => {
        const depTask = team.tasks.get(depId);
        return depTask?.status === "completed";
    });
}
function getExecutableTasks(team) {
    return Array.from(team.tasks.values())
        .filter(t => t.status === "pending" && canExecuteTask(team, t));
}
// 순환 의존성 감지
function detectCyclicDependency(team, taskId, visited = new Set()) {
    if (visited.has(taskId))
        return true;
    visited.add(taskId);
    const task = team.tasks.get(taskId);
    if (!task)
        return false;
    for (const depId of task.blockedBy) {
        if (detectCyclicDependency(team, depId, visited)) {
            return true;
        }
    }
    visited.delete(taskId);
    return false;
}
// 모든 순환 의존성 감지
function findCyclicDependencies(team) {
    const cyclic = [];
    for (const [id] of team.tasks) {
        if (detectCyclicDependency(team, id)) {
            cyclic.push(id);
        }
    }
    return cyclic;
}
async function executeAgent(name, agent, task, timeout) {
    agent.status = "thinking";
    try {
        const prompt = `${task}\n\n당신은 ${name}(${agent.role}) 역할입니다. 전문성으로 작업을 수행해주세요.`;
        const { sessionID } = await spawnAgentSession(name, prompt);
        agent.sessionID = sessionID;
        agent.status = "responding";
        const result = await waitForSessionCompletion(sessionID, timeout);
        agent.status = "completed";
        agent.result = result;
        return { name, success: true, result };
    }
    catch (error) {
        agent.status = "error";
        agent.error = error instanceof Error ? error.message : String(error);
        return { name, success: false, error: agent.error };
    }
}
function formatExecutionResults(team, results) {
    let response = `---\n\n## Results\n\n`;
    for (const { name, success, result, error } of results) {
        const agent = team.agents.get(name);
        const statusIcon = success ? "[OK]" : "[FAIL]";
        response += `### ${statusIcon} ${name}\n`;
        response += `**Status**: ${agent?.status ?? "unknown"}\n`;
        if (success && result) {
            response += `\n${truncateText(result, MAX_RESULT_LENGTH)}\n`;
        }
        else if (error) {
            response += `**Error**: ${error}\n`;
        }
        response += `\n---\n\n`;
    }
    return response;
}
// ============================================================================
// PRESETS
// ============================================================================
const PRESETS = {
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
const PRESET_KEYWORDS = {
    security: ["security", "보안", "취약점"],
    debug: ["debug", "버그", "에러"],
    planning: ["planning", "계획", "설계"],
    implementation: ["implement", "구현", "개발"],
    research: ["research", "조사", "탐색"],
};
function detectPreset(request) {
    const lowerRequest = request.toLowerCase();
    for (const [preset, keywords] of Object.entries(PRESET_KEYWORDS)) {
        if (keywords.some((kw) => lowerRequest.includes(kw))) {
            return preset;
        }
    }
    return DEFAULT_PRESET;
}
// ============================================================================
// TOOLS
// ============================================================================
const teamSpawnTool = tool({
    description: "Spawn a real agent team with actual OpenCode subagents",
    args: {
        preset: z
            .string()
            .optional()
            .describe("Preset name or comma-separated agent names"),
        teamName: z.string().describe("Name for the team"),
        task: z.string().describe("Task description for the team"),
    },
    async execute(args) {
        if (!globalClient) {
            return "Error: OpenCode client not available";
        }
        const presetValue = args.preset ?? DEFAULT_PRESET;
        const teamId = `team-${Date.now()}-${randomUUID().slice(0, 8)}`;
        const availableAgents = loadOpenCodeAgents();
        const agentNames = PRESETS[presetValue] ??
            presetValue.split(",").map((s) => s.trim()).filter(Boolean);
        if (agentNames.length === 0) {
            return `Error: No agents specified. Available: ${Object.keys(availableAgents).join(", ")}`;
        }
        const team = {
            id: teamId,
            name: args.teamName,
            preset: presetValue,
            agents: new Map(),
            tasks: new Map(),
            createdAt: new Date(),
            task: args.task,
        };
        const missingAgents = [];
        for (const name of agentNames) {
            const agentDef = availableAgents[name];
            if (!agentDef) {
                missingAgents.push(name);
            }
            team.agents.set(name, {
                name,
                sessionID: null,
                role: extractRoleFromDescription(agentDef?.description, name),
                status: "idle",
            });
        }
        teams.set(teamId, team);
        enforceMaxTeams();
        let response = `## Team "${args.teamName}" Created\n\n`;
        response += `**Team ID**: ${teamId}\n`;
        response += `**Preset**: ${presetValue}\n`;
        response += `**Agents**: ${team.agents.size}\n\n`;
        response += `### Agents\n`;
        for (const [name, agent] of team.agents) {
            const defined = availableAgents[name] ? "[OK]" : "[WARN] (not in config)";
            response += `- **${name}** (${agent.role}) ${defined}\n`;
        }
        if (missingAgents.length > 0) {
            response += `\n[WARN] **Warning**: Not in opencode.json: ${missingAgents.join(", ")}\n`;
        }
        response += `\n### Task\n${args.task}\n`;
        response += `\n---\n`;
        response += `Use \`/team-execute teamId="${teamId}"\` to run.\n`;
        return response;
    },
});
const teamExecuteTool = tool({
    description: "Execute team agents in parallel and collect results",
    args: {
        teamId: z.string().describe("Team ID to execute"),
        timeout: z.number().optional().describe("Timeout in seconds per agent"),
    },
    async execute(args) {
        if (!globalClient) {
            return "Error: OpenCode client not available";
        }
        const team = teams.get(args.teamId);
        if (!team) {
            return `Error: Team ${args.teamId} not found`;
        }
        // Initialize tasks if needed
        if (!team.tasks) {
            team.tasks = new Map();
        }
        const timeout = (args.timeout ?? DEFAULT_TIMEOUT_SECONDS) * 1000;
        team.results = new Map();
        let response = `## Executing Team "${team.name}"\n\n`;
        response += `**Task**: ${team.task}\n`;
        response += `**Agents**: ${team.agents.size}\n\n`;
        const executionPromises = Array.from(team.agents.entries()).map(([name, agent]) => executeAgent(name, agent, team.task, timeout));
        const results = await Promise.allSettled(executionPromises);
        const settledResults = results.map((r, index) => {
            const agentName = Array.from(team.agents.keys())[index];
            if (r.status === "fulfilled") {
                return r.value;
            }
            return {
                name: agentName,
                success: false,
                error: r.reason instanceof Error ? r.reason.message : String(r.reason),
            };
        });
        response += formatExecutionResults(team, settledResults);
        return response;
    },
});
const teamDiscussTool = tool({
    description: "Run a discussion between team agents with context sharing",
    args: {
        teamId: z.string().describe("Team ID"),
        topic: z.string().describe("Discussion topic"),
        rounds: z.number().optional().describe("Number of rounds (default: 2, max: 3)"),
    },
    async execute(args) {
        if (!globalClient) {
            return "Error: OpenCode client not available";
        }
        const team = teams.get(args.teamId);
        if (!team) {
            return `Error: Team ${args.teamId} not found`;
        }
        const rounds = Math.min(Math.max(args.rounds ?? 2, 1), 3);
        let contextSoFar = "";
        let response = `## Discussion: ${truncateText(args.topic, 100)}\n\n`;
        response += `**Team**: ${team.name}\n`;
        response += `**Rounds**: ${rounds}\n\n`;
        for (let r = 1; r <= rounds; r++) {
            response += `### Round ${r}\n\n`;
            for (const [name, agent] of team.agents) {
                const prompt = r === 1
                    ? `${args.topic}\n\n당신은 ${name} 역할입니다. 분석해주세요.`
                    : `${args.topic}\n\n## 이전 분석:\n${contextSoFar}\n\n## 추가 분석:\n${name}으로서 새로운 관점을 제시해주세요.`;
                try {
                    agent.status = "thinking";
                    const { sessionID } = await spawnAgentSession(name, prompt);
                    agent.sessionID = sessionID;
                    agent.status = "responding";
                    const result = await waitForSessionCompletion(sessionID, DEFAULT_TIMEOUT_MS);
                    agent.status = "completed";
                    agent.result = result;
                    contextSoFar += `\n### ${name} (Round ${r}):\n${truncateText(result, MAX_CONTEXT_LENGTH)}\n`;
                    response += `**${name}**:\n`;
                    response += `${truncateText(result, MAX_DISCUSSION_RESULT_LENGTH)}\n\n`;
                }
                catch (error) {
                    agent.status = "error";
                    agent.error = error instanceof Error ? error.message : String(error);
                    response += `**${name}**: [FAIL] Error - ${agent.error}\n\n`;
                }
            }
        }
        response += `---\n**Team ID**: ${team.id}`;
        return response;
    },
});
const teamStatusTool = tool({
    description: "Check team status and results",
    args: {
        teamId: z.string().optional().describe("Team ID (omit to list all)"),
    },
    async execute(args) {
        if (!args.teamId) {
            if (teams.size === 0) {
                return "No active teams. Use `/team-spawn` to create one.";
            }
            let r = `## Active Teams (${teams.size})\n\n`;
            for (const [id, t] of teams) {
                const completed = Array.from(t.agents.values()).filter((a) => a.status === "completed").length;
                r += `- **${t.name}** (${id})\n`;
                r += `  - Preset: ${t.preset}\n`;
                r += `  - Progress: ${completed}/${t.agents.size}\n\n`;
            }
            return r;
        }
        const team = teams.get(args.teamId);
        if (!team) {
            return `Error: Team ${args.teamId} not found`;
        }
        let r = `## ${team.name}\n\n`;
        r += `**Team ID**: ${team.id}\n`;
        r += `**Preset**: ${team.preset}\n`;
        r += `**Task**: ${team.task}\n\n`;
        r += `### Agents\n`;
        const statusIcons = {
            idle: "[ ]",
            thinking: "[*]",
            responding: "[>]",
            completed: "[OK]",
            error: "[!]",
        };
        for (const [n, a] of team.agents) {
            r += `- ${statusIcons[a.status]} **${n}**: ${a.status}\n`;
            if (a.sessionID)
                r += `  - Session: ${a.sessionID}\n`;
            if (a.error)
                r += `  - Error: ${a.error}\n`;
        }
        if (team.tasks && team.tasks.size > 0) {
            r += `\n### Tasks (${team.tasks.size})\n`;
            const pending = Array.from(team.tasks.values()).filter(t => t.status === "pending").length;
            const completed = Array.from(team.tasks.values()).filter(t => t.status === "completed").length;
            const blocked = Array.from(team.tasks.values()).filter(t => t.status === "blocked").length;
            r += `- Pending: ${pending}\n`;
            r += `- Completed: ${completed}\n`;
            r += `- Blocked: ${blocked}\n`;
        }
        return r;
    },
});
const teamShutdownTool = tool({
    description: "Shutdown team and cleanup sessions",
    args: {
        teamId: z.string().describe("Team ID to shutdown"),
    },
    async execute(args) {
        const team = teams.get(args.teamId);
        if (!team) {
            return `Error: Team ${args.teamId} not found`;
        }
        // Cleanup all sessions
        const cleanupPromises = [];
        for (const agent of team.agents.values()) {
            if (agent.sessionID) {
                cleanupPromises.push(cleanupSession(agent.sessionID));
            }
        }
        await Promise.allSettled(cleanupPromises);
        const name = team.name;
        teams.delete(args.teamId);
        return `Team "${name}" shut down.`;
    },
});
const teamAutoTool = tool({
    description: "Natural language team request with auto preset detection and execution",
    args: {
        request: z.string().describe("Natural language request"),
    },
    async execute(args) {
        if (!globalClient) {
            return "Error: OpenCode client not available";
        }
        const preset = detectPreset(args.request);
        const teamId = `team-${Date.now()}-${randomUUID().slice(0, 8)}`;
        const agentNames = PRESETS[preset] ?? PRESETS[DEFAULT_PRESET];
        const availableAgents = loadOpenCodeAgents();
        const team = {
            id: teamId,
            name: `auto-${preset}`,
            preset,
            agents: new Map(),
            tasks: new Map(),
            createdAt: new Date(),
            task: args.request,
        };
        for (const name of agentNames) {
            team.agents.set(name, {
                name,
                sessionID: null,
                role: extractRoleFromDescription(availableAgents[name]?.description, name),
                status: "idle",
            });
        }
        teams.set(teamId, team);
        enforceMaxTeams();
        saveTeam(team);
        let r = `## Auto Team Created\n\n`;
        r += `**Detected Preset**: ${preset}\n`;
        r += `**Team ID**: ${teamId}\n\n`;
        r += `### Members\n`;
        for (const [n, a] of team.agents) {
            const isDA = n === "devil-s-advocate" ? " [DEVIL]" : "";
            r += `- **${n}** (${a.role})${isDA}\n`;
        }
        r += `\n### Task\n${args.request}\n\n`;
        r += `---\n\n## Executing...\n\n`;
        const executionPromises = Array.from(team.agents.entries()).map(([name, agent]) => executeAgent(name, agent, args.request, DEFAULT_TIMEOUT_SECONDS * 1000));
        const results = await Promise.allSettled(executionPromises);
        const settledResults = results.map((res, index) => {
            const agentName = Array.from(team.agents.keys())[index];
            if (res.status === "fulfilled") {
                return res.value;
            }
            return {
                name: agentName,
                success: false,
                error: res.reason instanceof Error ? res.reason.message : String(res.reason),
            };
        });
        team.results = new Map(settledResults
            .filter((res) => res.success && res.result !== undefined)
            .map((res) => [res.name, res.result]));
        saveTeam(team);
        for (const { name, success, result, error } of settledResults) {
            const statusIcon = success ? "[OK]" : "[FAIL]";
            r += `### ${statusIcon} ${name}\n`;
            if (success && result) {
                r += `${truncateText(result, 1500)}\n`;
            }
            else if (error) {
                r += `**Error**: ${error}\n`;
            }
            r += `\n---\n\n`;
        }
        r += `**Team ID**: ${teamId}`;
        return r;
    },
});
// ============================================================================
// TASK TOOLS
// ============================================================================
const taskCreateTool = tool({
    description: "Create a task in a team with optional dependencies",
    args: {
        teamId: z.string().describe("Team ID"),
        subject: z.string().describe("Task subject"),
        description: z.string().describe("Task description"),
        owner: z.string().optional().describe("Agent assigned to this task"),
        blockedBy: z.string().optional().describe("Comma-separated task IDs this depends on")
    },
    async execute(args) {
        const team = teams.get(args.teamId);
        if (!team) {
            return `Error: Team ${args.teamId} not found`;
        }
        // Initialize tasks map if needed
        if (!team.tasks) {
            team.tasks = new Map();
        }
        const blockedBy = args.blockedBy
            ? args.blockedBy.split(",").map(s => s.trim()).filter(Boolean)
            : [];
        const task = createTask(team, args.subject, args.description, args.owner, blockedBy, []);
        // Update blocked tasks' blocks array
        for (const depId of blockedBy) {
            const depTask = team.tasks.get(depId);
            if (depTask && !depTask.blocks.includes(task.id)) {
                depTask.blocks.push(task.id);
            }
        }
        saveTeam(team);
        let response = `## Task Created\n\n`;
        response += `**Task ID**: ${task.id}\n`;
        response += `**Subject**: ${task.subject}\n`;
        response += `**Owner**: ${task.owner || "Unassigned"}\n`;
        response += `**Status**: ${task.status}\n`;
        if (task.blockedBy.length > 0) {
            response += `**Blocked By**: ${task.blockedBy.join(", ")}\n`;
        }
        return response;
    }
});
const taskExecuteTool = tool({
    description: "Execute tasks respecting dependencies (blocks/blockedBy)",
    args: {
        teamId: z.string().describe("Team ID"),
        timeout: z.number().optional().describe("Timeout per task in seconds")
    },
    async execute(args) {
        if (!globalClient) {
            return "Error: OpenCode client not available";
        }
        const team = teams.get(args.teamId);
        if (!team) {
            return `Error: Team ${args.teamId} not found`;
        }
        if (!team.tasks || team.tasks.size === 0) {
            return "No tasks to execute. Use `/task-create` to add tasks.";
        }
        // 순환 의존성 감지
        const cyclicDeps = findCyclicDependencies(team);
        if (cyclicDeps.length > 0) {
            return `Error: Cyclic dependencies detected in tasks: ${cyclicDeps.join(", ")}`;
        }
        const timeout = (args.timeout ?? DEFAULT_TIMEOUT_SECONDS) * 1000;
        let response = `## Executing Tasks\n\n`;
        let executable = getExecutableTasks(team);
        let totalCompleted = 0;
        let totalFailed = 0;
        const maxIterations = team.tasks.size * 2;
        let iterations = 0;
        while (executable.length > 0 && iterations < maxIterations) {
            iterations++;
            for (const task of executable) {
                task.status = "in_progress";
                response += `### ${task.subject} (${task.id})\n`;
                if (task.owner && team.agents.has(task.owner)) {
                    const agent = team.agents.get(task.owner);
                    const result = await executeAgent(task.owner, agent, task.description, timeout);
                    if (result.success) {
                        task.status = "completed";
                        task.result = result.result;
                        task.completedAt = new Date();
                        totalCompleted++;
                        response += `**[OK]** Completed\n`;
                    }
                    else {
                        task.status = "error";
                        task.error = result.error;
                        totalFailed++;
                        response += `**[FAIL]** Error: ${result.error}\n`;
                    }
                }
                else {
                    task.status = "completed";
                    task.completedAt = new Date();
                    totalCompleted++;
                    response += `**[OK]** Marked complete (no owner)\n`;
                }
            }
            saveTeam(team);
            executable = getExecutableTasks(team);
        }
        if (iterations >= maxIterations && executable.length > 0) {
            response += `\n[WARN] Maximum iterations reached. Possible deadlock.\n`;
        }
        const remaining = Array.from(team.tasks.values())
            .filter(t => t.status === "pending" || t.status === "blocked").length;
        response += `\n---\n`;
        response += `**Completed**: ${totalCompleted}\n`;
        response += `**Failed**: ${totalFailed}\n`;
        response += `**Remaining**: ${remaining}\n`;
        return response;
    }
});
const taskListTool = tool({
    description: "List all tasks in a team",
    args: {
        teamId: z.string().describe("Team ID")
    },
    async execute(args) {
        const team = teams.get(args.teamId);
        if (!team) {
            return `Error: Team ${args.teamId} not found`;
        }
        if (!team.tasks || team.tasks.size === 0) {
            return "No tasks. Use `/task-create` to add tasks.";
        }
        let response = `## Tasks (${team.tasks.size})\n\n`;
        const statusIcon = {
            pending: "[ ]",
            in_progress: "[>]",
            completed: "[OK]",
            blocked: "[!]",
            error: "[X]"
        };
        for (const [, task] of team.tasks) {
            const icon = statusIcon[task.status];
            response += `${icon} **${task.subject}** (${task.id})\n`;
            response += `   - Status: ${task.status}\n`;
            response += `   - Owner: ${task.owner || "Unassigned"}\n`;
            if (task.blockedBy.length > 0) {
                response += `   - Blocked by: ${task.blockedBy.length} tasks\n`;
            }
        }
        return response;
    }
});
const taskUpdateTool = tool({
    description: "Update task status, owner, or dependencies",
    args: {
        teamId: z.string().describe("Team ID"),
        taskId: z.string().describe("Task ID to update"),
        status: z.enum(["pending", "in_progress", "completed", "blocked", "error"]).optional().describe("New status"),
        owner: z.string().optional().describe("New owner (agent name)"),
        addBlockedBy: z.string().optional().describe("Comma-separated task IDs to add as dependencies"),
        addBlocks: z.string().optional().describe("Comma-separated task IDs that this task blocks")
    },
    async execute(args) {
        const team = teams.get(args.teamId);
        if (!team) {
            return `Error: Team ${args.teamId} not found`;
        }
        if (!team.tasks) {
            team.tasks = new Map();
        }
        const task = team.tasks.get(args.taskId);
        if (!task) {
            return `Error: Task ${args.taskId} not found`;
        }
        // Update status
        if (args.status) {
            task.status = args.status;
            if (args.status === "completed") {
                task.completedAt = new Date();
            }
        }
        // Update owner
        if (args.owner !== undefined) {
            task.owner = args.owner || undefined;
        }
        // Add blockedBy dependencies
        if (args.addBlockedBy) {
            const newDeps = args.addBlockedBy.split(",").map(s => s.trim()).filter(Boolean);
            for (const depId of newDeps) {
                if (!task.blockedBy.includes(depId)) {
                    task.blockedBy.push(depId);
                }
                // Update reverse reference
                const depTask = team.tasks.get(depId);
                if (depTask && !depTask.blocks.includes(task.id)) {
                    depTask.blocks.push(task.id);
                }
            }
        }
        // Add blocks dependencies
        if (args.addBlocks) {
            const newBlocks = args.addBlocks.split(",").map(s => s.trim()).filter(Boolean);
            for (const blockId of newBlocks) {
                if (!task.blocks.includes(blockId)) {
                    task.blocks.push(blockId);
                }
                // Update reverse reference
                const blockTask = team.tasks.get(blockId);
                if (blockTask && !blockTask.blockedBy.includes(task.id)) {
                    blockTask.blockedBy.push(task.id);
                }
            }
        }
        saveTeam(team);
        let response = `## Task Updated\n\n`;
        response += `**Task ID**: ${task.id}\n`;
        response += `**Subject**: ${task.subject}\n`;
        response += `**Status**: ${task.status}\n`;
        response += `**Owner**: ${task.owner || "Unassigned"}\n`;
        response += `**Blocked By**: ${task.blockedBy.length} tasks\n`;
        response += `**Blocks**: ${task.blocks.length} tasks\n`;
        return response;
    }
});
// ============================================================================
// PLUGIN EXPORT
// ============================================================================
const plugin = async (input) => {
    globalClient = input.client;
    loadOpenCodeAgents();
    return {
        tool: {
            "team-spawn": teamSpawnTool,
            "team-execute": teamExecuteTool,
            "team-discuss": teamDiscussTool,
            "team-status": teamStatusTool,
            "team-shutdown": teamShutdownTool,
            "team-auto": teamAutoTool,
            "task-create": taskCreateTool,
            "task-update": taskUpdateTool,
            "task-execute": taskExecuteTool,
            "task-list": taskListTool,
        },
    };
};
export default plugin;
