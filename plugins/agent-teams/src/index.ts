import { tool, type Plugin, type PluginInput } from "@opencode-ai/plugin";
import type { OpencodeClient, Part } from "@opencode-ai/sdk";
import fs from "fs";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";

const z = tool.schema;

// ============================================================================
// TYPES
// ============================================================================

type AgentStatus = "idle" | "thinking" | "responding" | "completed" | "error";
type TaskStatus = "pending" | "in_progress" | "completed" | "blocked" | "error";
type PlanStatus = "pending" | "approved" | "rejected";

interface AgentReputation {
  totalTasks: number;
  successfulTasks: number;
  averageScore: number;
  lastUpdated: Date;
}

interface Agent {
  name: string;
  sessionID: string | null;
  role: string;
  status: AgentStatus;
  result?: string;
  error?: string;
  reputation?: AgentReputation;
}

interface AgentScore {
  agentName: string;
  score: number;
  feedback: string;
  scoredBy: string;
  timestamp: Date;
}

interface Task {
  id: string;
  subject: string;
  description: string;
  status: TaskStatus;
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

interface OpenCodeAgent {
  description: string;
  model?: string;
  prompt_append?: string;
  tools?: Record<string, boolean>;
}

interface ExecutionResult {
  name: string;
  success: boolean;
  result?: string;
  error?: string;
}

interface Message {
  type: "message" | "broadcast" | "shutdown_request" | "shutdown_response" | "plan_approval_request" | "plan_approval_response";
  sender: string;
  recipient?: string;
  content: string;
  summary?: string;
  timestamp: Date;
  approved?: boolean;
  requestId?: string;
  teamId?: string;
  read?: boolean;
}

interface Plan {
  id: string;
  agentId: string;
  agentName: string;
  content: string;
  status: PlanStatus;
  feedback?: string;
  submittedAt: Date;
  reviewedAt?: Date;
}

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

function isDevilsAdvocate(agentName: string): boolean {
  const normalized = agentName.toLowerCase().replace(/[_-]/g, "");
  return DEVILS_ADVOCATE_NAMES.some(
    name => normalized === name.replace(/[_-]/g, "")
  );
}

// ============================================================================
// GLOBAL STATE
// ============================================================================

let globalClient: OpencodeClient | null = null;
let opencodeConfig: Record<string, OpenCodeAgent> = {};
const teams = new Map<string, Team>();
const messageQueue = new Map<string, Message[]>();
const plans = new Map<string, Plan>();
const agentReputations = new Map<string, AgentReputation>();
const agentScores = new Map<string, AgentScore[]>();

// ============================================================================
// PERSISTENCE
// ============================================================================

function ensureTeamsDir(): void {
  if (!fs.existsSync(TEAMS_DIR)) {
    fs.mkdirSync(TEAMS_DIR, { recursive: true });
  }
}

function saveTeam(team: Team): void {
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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`[squad] Failed to save team: ${errorMessage}`);
  }
}

function loadTeam(teamId: string): Team | null {
  try {
    const teamPath = path.join(TEAMS_DIR, `${teamId}.json`);
    if (!fs.existsSync(teamPath)) return null;

    const data = JSON.parse(fs.readFileSync(teamPath, "utf-8"));
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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`[squad] Failed to load team: ${errorMessage}`);
    return null;
  }
}

// ============================================================================
// PLAN APPROVAL SYSTEM
// ============================================================================

function createPlan(agentId: string, agentName: string, content: string): Plan {
  const plan: Plan = {
    id: `plan-${Date.now()}-${randomUUID().slice(0, 8)}`,
    agentId,
    agentName,
    content,
    status: "pending",
    submittedAt: new Date(),
  };
  plans.set(plan.id, plan);
  savePlans();
  return plan;
}

function updatePlanStatus(
  planId: string,
  status: PlanStatus,
  feedback?: string
): Plan | null {
  const plan = plans.get(planId);
  if (!plan) return null;

  plan.status = status;
  if (feedback !== undefined) {
    plan.feedback = feedback;
  }
  if (status === "approved" || status === "rejected") {
    plan.reviewedAt = new Date();
  }
  savePlans();
  return plan;
}

function getPendingPlans(): Plan[] {
  return Array.from(plans.values()).filter(p => p.status === "pending");
}

function getPlan(planId: string): Plan | null {
  return plans.get(planId) ?? null;
}

function getPlansByAgent(agentId: string): Plan[] {
  return Array.from(plans.values()).filter(p => p.agentId === agentId);
}

// Plan persistence
const PLANS_FILE = path.join(TEAMS_DIR, "plans.json");

function savePlans(): void {
  try {
    ensureTeamsDir();
    const serialized = Array.from(plans.entries()).map(([id, plan]) => ({
      id,
      agentId: plan.agentId,
      agentName: plan.agentName,
      content: plan.content,
      status: plan.status,
      feedback: plan.feedback,
      submittedAt: plan.submittedAt.toISOString(),
      reviewedAt: plan.reviewedAt?.toISOString(),
    }));
    fs.writeFileSync(PLANS_FILE, JSON.stringify(serialized, null, 2));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`[squad] Failed to save plans: ${errorMessage}`);
  }
}

function loadPlans(): void {
  try {
    if (!fs.existsSync(PLANS_FILE)) return;

    const data = JSON.parse(fs.readFileSync(PLANS_FILE, "utf-8"));
    for (const item of data) {
      const plan: Plan = {
        id: item.id,
        agentId: item.agentId,
        agentName: item.agentName,
        content: item.content,
        status: item.status,
        feedback: item.feedback,
        submittedAt: new Date(item.submittedAt),
        reviewedAt: item.reviewedAt ? new Date(item.reviewedAt) : undefined,
      };
      plans.set(plan.id, plan);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`[squad] Failed to load plans: ${errorMessage}`);
  }
}

// ============================================================================
// MESSAGE PROTOCOL
// ============================================================================

/**
 * SendMessage 구현 - 에이전트 간 메시지 교환
 * @param message 전송할 메시지
 */
function sendMessage(message: Message): void {
  // 팀별 메시지 큐 키 생성
  const baseKey = message.recipient || "broadcast";
  const key = message.teamId ? `${message.teamId}:${baseKey}` : baseKey;

  const queue = messageQueue.get(key) || [];
  queue.push(message);
  messageQueue.set(key, queue);

  // 브로드캐스트 메시지는 팀 브로드캐스트 큐에도 저장
  if (message.type === "broadcast" && message.teamId) {
    const broadcastKey = `${message.teamId}:broadcast`;
    const broadcastQueue = messageQueue.get(broadcastKey) || [];
    broadcastQueue.push(message);
    messageQueue.set(broadcastKey, broadcastQueue);
  }
}

/**
 * 에이전트 실행 결과를 팀원들에게 방송
 * @param teamId 팀 ID
 * @param senderName 발신자 에이전트 이름
 * @param result 실행 결과
 * @param success 성공 여부
 */
function broadcastAgentResult(
  teamId: string,
  senderName: string,
  result: string | undefined,
  success: boolean
): void {
  const summary = success && result
    ? `Completed: ${result.slice(0, 100)}...`
    : `Failed: ${senderName} encountered an error`;

  sendMessage({
    type: "broadcast",
    sender: senderName,
    content: result || "No result",
    summary,
    timestamp: new Date(),
    teamId,
  });
}

/**
 * 특정 에이전트에게 메시지 전송 (DM)
 * @param teamId 팀 ID
 * @param senderName 발신자
 * @param recipientName 수신자
 * @param content 메시지 내용
 */
function sendDirectMessage(
  teamId: string,
  senderName: string,
  recipientName: string,
  content: string
): void {
  sendMessage({
    type: "message",
    sender: senderName,
    recipient: recipientName,
    content,
    summary: content.slice(0, 50),
    timestamp: new Date(),
    teamId,
  });
}

/**
 * 팀 메시지 가져오기
 * @param teamId 팀 ID
 * @param recipient 수신자 (broadcast 포함)
 * @param since 이후 시간부터의 메시지만
 */
function getTeamMessages(
  teamId: string,
  recipient: string = "broadcast",
  since?: Date
): Message[] {
  const key = `${teamId}:${recipient}`;
  const queue = messageQueue.get(key) || [];

  // 브로드캐스트 메시지도 포함
  let all = queue;
  if (recipient !== "broadcast") {
    const broadcastKey = `${teamId}:broadcast`;
    const broadcast = messageQueue.get(broadcastKey) || [];
    all = [...queue, ...broadcast];
  }

  if (since) {
    return all.filter(m => m.timestamp > since);
  }
  return all;
}

/**
 * 에이전트 간 컨텍스트 형식화 (프롬프트용)
 * @param teamId 팀 ID
 * @param excludeAgent 제외할 에이전트 이름
 */
function formatAgentContext(teamId: string, excludeAgent?: string): string {
  const messages = getTeamMessages(teamId, "broadcast");

  if (messages.length === 0) {
    return "(다른 에이전트의 결과가 아직 없습니다)";
  }

  const filtered = excludeAgent
    ? messages.filter(m => m.sender !== excludeAgent)
    : messages;

  if (filtered.length === 0) {
    return "(다른 에이전트의 결과가 아직 없습니다)";
  }

  return filtered
    .map(m => `### ${m.sender}:\n${m.summary || m.content.slice(0, 300)}`)
    .join("\n\n");
}

/**
 * 팀 메시지 큐 정리
 * @param teamId 팀 ID
 */
function clearTeamMessages(teamId: string): void {
  const keysToDelete: string[] = [];

  for (const [key] of messageQueue) {
    if (key.startsWith(`${teamId}:`)) {
      keysToDelete.push(key);
    }
  }

  for (const key of keysToDelete) {
    messageQueue.delete(key);
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

const truncateText = (text: string, maxLength: number): string =>
  text.length > maxLength ? text.slice(0, maxLength) + "..." : text;

const extractRoleFromDescription = (description: string | undefined, fallback: string): string =>
  description?.split(".")[0] ?? fallback;

// ============================================================================
// OPENCODE CLIENT & CONFIG
// ============================================================================

function loadOpenCodeAgents(): Record<string, OpenCodeAgent> {
  try {
    const configPath = path.join(process.cwd(), "opencode.json");
    const configContent = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(configContent);
    opencodeConfig = config.agent ?? {};
    return opencodeConfig;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`[squad] Failed to load opencode.json: ${errorMessage}`);
    return {};
  }
}

// ============================================================================
// REAL AGENT EXECUTION
// ============================================================================

async function spawnAgentSession(
  agentName: string,
  task: string,
  teamId?: string
): Promise<{ sessionID: string; agent: OpenCodeAgent | undefined }> {
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

  // SendMessage: 다른 에이전트의 결과를 컨텍스트에 추가
  let fullTask = task;
  if (teamId) {
    const agentContext = formatAgentContext(teamId, agentName);
    if (agentContext && !agentContext.includes("아직 없습니다")) {
      fullTask = `${task}\n\n## 다른 팀원들의 결과:\n${agentContext}\n\n이 정보를 고려하여 작업을 수행하세요.`;
    }
  }

  const promptBody: {
    parts: Array<{ type: "text"; text: string }>;
    agent: string;
    system?: string;
    model?: { providerID: string; modelID: string };
  } = {
    parts: [{ type: "text" as const, text: fullTask }],
    agent: agentName,
  };

  if (effectiveSystemPrompt) {
    promptBody.system = effectiveSystemPrompt;
  }

  if (agentConfig?.model) {
    const parts = agentConfig.model.split("/");
    if (parts.length >= 2) {
      promptBody.model = { providerID: parts[0], modelID: parts.slice(1).join("/") };
    } else {
      console.warn(`[squad] Invalid model format "${agentConfig.model}", expected "provider/model"`);
    }
  }

  await globalClient.session.prompt({
    path: { id: sessionID },
    body: promptBody,
  });

  return { sessionID, agent: agentConfig };
}

async function waitForSessionCompletion(
  sessionID: string,
  timeout: number = DEFAULT_TIMEOUT_MS
): Promise<string> {
  const startTime = Date.now();
  let lastError: Error | null = null;
  let consecutiveErrors = 0;

  // TextPart 타입 가드
  const isTextPart = (p: Part): p is Part & { type: "text"; text: string } =>
    p.type === "text" && "text" in p;

  while (Date.now() - startTime < timeout) {
    try {
      const messages = await globalClient!.session.messages({
        path: { id: sessionID },
      });

      if (messages.data) {
        const assistantMessages = messages.data.filter(
          (m) => m.info.role === "assistant"
        );

        if (assistantMessages.length > 0) {
          const lastMessage = assistantMessages[assistantMessages.length - 1];
          const textParts = (lastMessage.parts ?? []).filter(isTextPart);
          consecutiveErrors = 0;
          return textParts.map((p) => p.text).join("\n");
        }
      }

      await sleep(POLL_INTERVAL_MS);
    } catch (error) {
      consecutiveErrors++;
      lastError = error instanceof Error ? error : new Error(String(error));

      if (consecutiveErrors >= 5) {
        throw new Error(
          `Session failed after 5 consecutive errors: ${lastError.message}`
        );
      }

      await sleep(POLL_INTERVAL_MS);
    }
  }

  throw new Error(
    `Session timeout after ${timeout / 1000}s. Last error: ${lastError?.message ?? "none"}`
  );
}

async function cleanupSession(sessionID: string): Promise<void> {
  if (!globalClient) return;

  try {
    await globalClient.session.delete({ path: { id: sessionID } });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`[squad] Failed to cleanup session ${sessionID}: ${errorMessage}`);
  }
}

// ============================================================================
// TEAM MANAGEMENT
// ============================================================================

function enforceMaxTeams(): void {
  if (teams.size <= MAX_TEAMS) return;

  const entries = Array.from(teams.entries());
  entries.sort((a, b) => a[1].createdAt.getTime() - b[1].createdAt.getTime());

  const toRemove = entries.slice(0, teams.size - MAX_TEAMS);
  for (const [id, team] of toRemove) {
    for (const agent of team.agents.values()) {
      if (agent.sessionID) {
        cleanupSession(agent.sessionID).catch(() => {});
      }
    }
    teams.delete(id);
  }
}

// ============================================================================
// TASK MANAGEMENT
// ============================================================================

function createTask(
  team: Team,
  subject: string,
  description: string,
  owner?: string,
  blockedBy: string[] = [],
  blocks: string[] = []
): Task {
  const task: Task = {
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

function canExecuteTask(team: Team, task: Task): boolean {
  return task.blockedBy.every(depId => {
    const depTask = team.tasks.get(depId);
    return depTask?.status === "completed";
  });
}

function getExecutableTasks(team: Team): Task[] {
  return Array.from(team.tasks.values())
    .filter(t => t.status === "pending" && canExecuteTask(team, t));
}

// 순환 의존성 감지
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

// 모든 순환 의존성 감지
function findCyclicDependencies(team: Team): string[] {
  const cyclic: string[] = [];
  for (const [id] of team.tasks) {
    if (detectCyclicDependency(team, id)) {
      cyclic.push(id);
    }
  }
  return cyclic;
}

/**
 * 에이전트 실행 함수 - SendMessage 프로토콜 지원
 * @param name 에이전트 이름
 * @param agent 에이전트 객체
 * @param task 작업 내용
 * @param timeout 타임아웃(ms)
 * @param teamId 팀 ID (메시지 방송용)
 */
async function executeAgent(
  name: string,
  agent: Agent,
  task: string,
  timeout: number,
  teamId?: string
): Promise<ExecutionResult> {
  agent.status = "thinking";

  try {
    const prompt = `${task}\n\n당신은 ${name}(${agent.role}) 역할입니다. 전문성으로 작업을 수행해주세요.`;
    const { sessionID } = await spawnAgentSession(name, prompt, teamId);
    agent.sessionID = sessionID;
    agent.status = "responding";

    const result = await waitForSessionCompletion(sessionID, timeout);
    agent.status = "completed";
    agent.result = result;

    // SendMessage: 팀원들에게 결과 방송
    if (teamId) {
      broadcastAgentResult(teamId, name, result, true);
    }

    return { name, success: true, result };
  } catch (error) {
    agent.status = "error";
    agent.error = error instanceof Error ? error.message : String(error);

    // SendMessage: 실패 메시지도 방송
    if (teamId) {
      broadcastAgentResult(teamId, name, agent.error, false);
    }

    return { name, success: false, error: agent.error };
  }
}

function formatExecutionResults(
  team: Team,
  results: ExecutionResult[]
): string {
  let response = `---\n\n## Results\n\n`;

  for (const { name, success, result, error } of results) {
    const agent = team.agents.get(name);
    const statusIcon = success ? "[OK]" : "[FAIL]";

    response += `### ${statusIcon} ${name}\n`;
    response += `**Status**: ${agent?.status ?? "unknown"}\n`;

    if (success && result) {
      response += `\n${truncateText(result, MAX_RESULT_LENGTH)}\n`;
    } else if (error) {
      response += `**Error**: ${error}\n`;
    }
    response += `\n---\n\n`;
  }

  return response;
}

// ============================================================================
// PRESETS
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

const PRESET_KEYWORDS: Record<string, string[]> = {
  security: ["security", "보안", "취약점"],
  debug: ["debug", "버그", "에러"],
  planning: ["planning", "계획", "설계"],
  implementation: ["implement", "구현", "개발"],
  research: ["research", "조사", "탐색"],
};

function detectPreset(request: string): string {
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

    const agentNames =
      PRESETS[presetValue] ??
      presetValue.split(",").map((s) => s.trim()).filter(Boolean);

    if (agentNames.length === 0) {
      return `Error: No agents specified. Available: ${Object.keys(availableAgents).join(", ")}`;
    }

    const team: Team = {
      id: teamId,
      name: args.teamName,
      preset: presetValue,
      agents: new Map(),
      tasks: new Map(),
      createdAt: new Date(),
      task: args.task,
    };

    const missingAgents: string[] = [];
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
  description: "Execute team agents in parallel and collect results with SendMessage protocol",
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

    // 팀 메시지 큐 정리
    clearTeamMessages(args.teamId);

    let response = `## Executing Team "${team.name}"\n\n`;
    response += `**Task**: ${team.task}\n`;
    response += `**Agents**: ${team.agents.size}\n\n`;

    // SendMessage 프로토콜 사용: teamId 전달
    const executionPromises = Array.from(team.agents.entries()).map(
      ([name, agent]) => executeAgent(name, agent, team.task, timeout, args.teamId)
    );

    const results = await Promise.allSettled(executionPromises);

    const settledResults: ExecutionResult[] = results.map((r, index) => {
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

    // 결과 저장
    for (const result of settledResults) {
      if (result.success && result.result) {
        team.results.set(result.name, result.result);
      }
    }

    response += formatExecutionResults(team, settledResults);

    return response;
  },
});

const teamDiscussTool = tool({
  description: "Run a discussion between team agents with context sharing via SendMessage protocol",
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

    let response = `## Discussion: ${truncateText(args.topic, 100)}\n\n`;
    response += `**Team**: ${team.name}\n`;
    response += `**Rounds**: ${rounds}\n\n`;

    // 팀 메시지 큐 정리 (새 토론 시작)
    clearTeamMessages(args.teamId);

    for (let r = 1; r <= rounds; r++) {
      response += `### Round ${r}\n\n`;

      for (const [name, agent] of team.agents) {
        // SendMessage 프로토콜을 사용한 컨텍스트 수집
        const agentContext = formatAgentContext(args.teamId, name);

        const prompt = r === 1
          ? `${args.topic}\n\n당신은 ${name} 역할입니다. 분석해주세요.`
          : `${args.topic}\n\n## 다른 에이전트 의견:\n${agentContext}\n\n## 추가 분석:\n${name}으로서 새로운 관점이나 반론을 제시하세요. 다른 에이전트가 놓친 점을 찾아주세요.`;

        try {
          agent.status = "thinking";
          const { sessionID } = await spawnAgentSession(name, prompt);
          agent.sessionID = sessionID;
          agent.status = "responding";

          const result = await waitForSessionCompletion(sessionID, DEFAULT_TIMEOUT_MS);
          agent.status = "completed";
          agent.result = result;

          // SendMessage: 결과를 팀원들에게 방송
          broadcastAgentResult(args.teamId, name, result, true);

          response += `**${name}**:\n`;
          response += `${truncateText(result, MAX_DISCUSSION_RESULT_LENGTH)}\n\n`;
        } catch (error) {
          agent.status = "error";
          agent.error = error instanceof Error ? error.message : String(error);

          // SendMessage: 실패 메시지도 방송
          broadcastAgentResult(args.teamId, name, agent.error, false);

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
        const completed = Array.from(t.agents.values()).filter(
          (a) => a.status === "completed"
        ).length;
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

    const statusIcons: Record<AgentStatus, string> = {
      idle: "[ ]",
      thinking: "[*]",
      responding: "[>]",
      completed: "[OK]",
      error: "[!]",
    };

    for (const [n, a] of team.agents) {
      r += `- ${statusIcons[a.status]} **${n}**: ${a.status}\n`;
      if (a.sessionID) r += `  - Session: ${a.sessionID}\n`;
      if (a.error) r += `  - Error: ${a.error}\n`;
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
    const cleanupPromises: Promise<void>[] = [];
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
  description: "Natural language team request with auto preset detection, parallel execution, and discussion via SendMessage protocol",
  args: {
    request: z.string().describe("Natural language request"),
    rounds: z.number().optional().describe("Discussion rounds (default: 2, max: 3)"),
  },
  async execute(args) {
    if (!globalClient) {
      return "Error: OpenCode client not available";
    }

    const preset = detectPreset(args.request);
    const teamId = `team-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const agentNames = PRESETS[preset] ?? PRESETS[DEFAULT_PRESET];
    const availableAgents = loadOpenCodeAgents();
    const rounds = Math.min(Math.max(args.rounds ?? 2, 1), 3);

    const team: Team = {
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
        role: extractRoleFromDescription(
          availableAgents[name]?.description,
          name
        ),
        status: "idle",
      });
    }

    teams.set(teamId, team);
    enforceMaxTeams();
    saveTeam(team);

    let r = `## Auto Team Created\n\n`;
    r += `**Detected Preset**: ${preset}\n`;
    r += `**Team ID**: ${teamId}\n`;
    r += `**Rounds**: ${rounds}\n\n`;
    r += `### Members\n`;
    for (const [n, a] of team.agents) {
      const isDA = isDevilsAdvocate(n) ? " [DEVIL]" : "";
      r += `- **${n}** (${a.role})${isDA}\n`;
    }
    r += `\n### Task\n${args.request}\n\n`;
    r += `---\n\n`;

    // 라운드별 실행
    for (let round = 1; round <= rounds; round++) {
      r += `## Round ${round}\n\n`;

      if (round === 1) {
        // 라운드 1: 병렬 실행 (SendMessage 프로토콜 사용)
        r += `*병렬 분석*\n\n`;

        const executionPromises = Array.from(team.agents.entries()).map(
          ([name, agent]) => executeAgent(name, agent, args.request, DEFAULT_TIMEOUT_SECONDS * 1000, teamId)
        );

        const results = await Promise.allSettled(executionPromises);

        const settledResults: ExecutionResult[] = results.map((res, index) => {
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

        // 결과 저장
        for (const { name, success, result, error } of settledResults) {
          const statusIcon = success ? "[OK]" : "[FAIL]";
          r += `### ${statusIcon} ${name}\n`;
          if (success && result) {
            r += `${truncateText(result, MAX_RESULT_LENGTH)}\n`;
          } else if (error) {
            r += `**Error**: ${error}\n`;
          }
          r += `\n`;
        }

        team.results = new Map(
          settledResults
            .filter((res): res is ExecutionResult & { success: true; result: string } =>
              res.success && res.result !== undefined
            )
            .map((res) => [res.name, res.result])
        );

      } else {
        // 라운드 2+: 순차 토론 (SendMessage 프로토콜로 컨텍스트 공유)
        r += `*토론 (다른 에이전트 결과 공유)*\n\n`;

        for (const [name, agent] of team.agents) {
          // SendMessage 프로토콜을 사용한 컨텍스트 수집
          const agentContext = formatAgentContext(teamId, name);

          const discussPrompt = `${args.request}

## 다른 에이전트 분석 결과:
${agentContext || "(아직 없음)"}

## 당신의 추가 분석:
이전 분석을 바탕으로 새로운 관점이나 반론을 제시하세요. 중복을 피하고, 다른 에이전트가 놓친 점을 찾으세요.`;

          try {
            agent.status = "thinking";
            const { sessionID } = await spawnAgentSession(name, discussPrompt);
            agent.sessionID = sessionID;
            agent.status = "responding";

            const result = await waitForSessionCompletion(sessionID, DEFAULT_TIMEOUT_MS);
            agent.status = "completed";
            agent.result = result;

            // SendMessage: 결과를 팀원들에게 방송
            broadcastAgentResult(teamId, name, result, true);

            r += `**${name}**:\n${truncateText(result, MAX_DISCUSSION_RESULT_LENGTH)}\n\n`;

            // 컨텍스트 업데이트
            if (team.results) {
              team.results.set(name, result);
            }
          } catch (error) {
            agent.status = "error";
            agent.error = error instanceof Error ? error.message : String(error);

            // SendMessage: 실패 메시지도 방송
            broadcastAgentResult(teamId, name, agent.error, false);

            r += `**${name}**: [FAIL] ${agent.error}\n\n`;
          }
        }
      }

      r += `---\n\n`;
    }

    saveTeam(team);
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

    const task = createTask(
      team,
      args.subject,
      args.description,
      args.owner,
      blockedBy,
      []
    );

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
          const agent = team.agents.get(task.owner)!;
          const result = await executeAgent(task.owner, agent, task.description, timeout);

          if (result.success) {
            task.status = "completed";
            task.result = result.result;
            task.completedAt = new Date();
            totalCompleted++;
            response += `**[OK]** Completed\n`;
          } else {
            task.status = "error";
            task.error = result.error;
            totalFailed++;
            response += `**[FAIL]** Error: ${result.error}\n`;
          }
        } else {
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

    const statusIcon: Record<TaskStatus, string> = {
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
// PLAN APPROVAL TOOLS
// ============================================================================

const planSubmitTool = tool({
  description: "Submit a plan for leader approval before execution",
  args: {
    agentId: z.string().describe("Agent ID submitting the plan"),
    agentName: z.string().describe("Agent name submitting the plan"),
    content: z.string().describe("Plan content/description"),
  },
  async execute(args) {
    const plan = createPlan(args.agentId, args.agentName, args.content);

    let response = `## Plan Submitted for Approval\n\n`;
    response += `**Plan ID**: ${plan.id}\n`;
    response += `**Agent**: ${plan.agentName} (${plan.agentId})\n`;
    response += `**Status**: ${plan.status}\n`;
    response += `**Submitted**: ${plan.submittedAt.toISOString()}\n\n`;
    response += `### Plan Content\n`;
    response += `${plan.content}\n\n`;
    response += `---\n`;
    response += `Waiting for leader approval. Use \`/plan-approve planId="${plan.id}"\` or \`/plan-reject planId="${plan.id}"\`\n`;

    return response;
  },
});

const planApproveTool = tool({
  description: "Approve a submitted plan, allowing the agent to proceed with execution",
  args: {
    planId: z.string().describe("Plan ID to approve"),
  },
  async execute(args) {
    const plan = updatePlanStatus(args.planId, "approved");
    if (!plan) {
      return `Error: Plan ${args.planId} not found`;
    }

    let response = `## Plan Approved\n\n`;
    response += `**Plan ID**: ${plan.id}\n`;
    response += `**Agent**: ${plan.agentName}\n`;
    response += `**Status**: ${plan.status}\n`;
    response += `**Approved At**: ${plan.reviewedAt?.toISOString()}\n\n`;
    response += `### Approved Plan\n`;
    response += `${plan.content}\n\n`;
    response += `---\n`;
    response += `The agent may now proceed with execution.\n`;

    return response;
  },
});

const planRejectTool = tool({
  description: "Reject a submitted plan with feedback, requiring the agent to revise",
  args: {
    planId: z.string().describe("Plan ID to reject"),
    feedback: z.string().describe("Reason for rejection and improvement suggestions"),
  },
  async execute(args) {
    const plan = updatePlanStatus(args.planId, "rejected", args.feedback);
    if (!plan) {
      return `Error: Plan ${args.planId} not found`;
    }

    let response = `## Plan Rejected\n\n`;
    response += `**Plan ID**: ${plan.id}\n`;
    response += `**Agent**: ${plan.agentName}\n`;
    response += `**Status**: ${plan.status}\n`;
    response += `**Rejected At**: ${plan.reviewedAt?.toISOString()}\n\n`;
    response += `### Feedback\n`;
    response += `${args.feedback}\n\n`;
    response += `---\n`;
    response += `The agent should revise the plan and resubmit.\n`;

    return response;
  },
});

const planListTool = tool({
  description: "List all plans with their status",
  args: {
    status: z.enum(["pending", "approved", "rejected"]).optional().describe("Filter by status"),
    agentId: z.string().optional().describe("Filter by agent ID"),
  },
  async execute(args) {
    let filteredPlans = Array.from(plans.values());

    if (args.status) {
      filteredPlans = filteredPlans.filter(p => p.status === args.status);
    }
    if (args.agentId) {
      filteredPlans = filteredPlans.filter(p => p.agentId === args.agentId);
    }

    if (filteredPlans.length === 0) {
      return "No plans found.";
    }

    let response = `## Plans (${filteredPlans.length})\n\n`;

    for (const plan of filteredPlans) {
      const statusIcon: Record<PlanStatus, string> = {
        pending: "[PENDING]",
        approved: "[APPROVED]",
        rejected: "[REJECTED]",
      };

      response += `${statusIcon[plan.status]} **${plan.id}**\n`;
      response += `- Agent: ${plan.agentName} (${plan.agentId})\n`;
      response += `- Status: ${plan.status}\n`;
      response += `- Submitted: ${plan.submittedAt.toISOString()}\n`;

      if (plan.feedback) {
        response += `- Feedback: ${plan.feedback}\n`;
      }

      response += `\n### Content\n`;
      response += `${truncateText(plan.content, 300)}\n\n`;
      response += `---\n\n`;
    }

    return response;
  },
});

const planStatusTool = tool({
  description: "Get detailed status of a specific plan",
  args: {
    planId: z.string().describe("Plan ID"),
  },
  async execute(args) {
    const plan = getPlan(args.planId);
    if (!plan) {
      return `Error: Plan ${args.planId} not found`;
    }

    let response = `## Plan Details\n\n`;
    response += `**Plan ID**: ${plan.id}\n`;
    response += `**Agent**: ${plan.agentName} (${plan.agentId})\n`;
    response += `**Status**: ${plan.status}\n`;
    response += `**Submitted**: ${plan.submittedAt.toISOString()}\n`;

    if (plan.reviewedAt) {
      response += `**Reviewed**: ${plan.reviewedAt.toISOString()}\n`;
    }

    response += `\n### Plan Content\n`;
    response += `${plan.content}\n`;

    if (plan.feedback) {
      response += `\n### Feedback\n`;
      response += `${plan.feedback}\n`;
    }

    return response;
  },
});

const planResubmitTool = tool({
  description: "Resubmit a rejected plan with revisions",
  args: {
    planId: z.string().describe("Original plan ID to resubmit"),
    content: z.string().describe("Revised plan content"),
  },
  async execute(args) {
    const originalPlan = getPlan(args.planId);
    if (!originalPlan) {
      return `Error: Plan ${args.planId} not found`;
    }

    if (originalPlan.status !== "rejected") {
      return `Error: Can only resubmit rejected plans. Current status: ${originalPlan.status}`;
    }

    const newPlan = createPlan(originalPlan.agentId, originalPlan.agentName, args.content);

    let response = `## Plan Resubmitted\n\n`;
    response += `**New Plan ID**: ${newPlan.id}\n`;
    response += `**Original Plan ID**: ${originalPlan.id}\n`;
    response += `**Agent**: ${newPlan.agentName}\n`;
    response += `**Status**: ${newPlan.status}\n`;
    response += `**Previous Feedback**: ${originalPlan.feedback || "None"}\n\n`;
    response += `### Revised Content\n`;
    response += `${newPlan.content}\n\n`;
    response += `---\n`;
    response += `Waiting for leader approval.\n`;

    return response;
  },
});

// ============================================================================
// PLUGIN EXPORT
// ============================================================================

const plugin: Plugin = async (input: PluginInput) => {
  globalClient = input.client;
  loadOpenCodeAgents();
  loadPlans();

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
      "plan-submit": planSubmitTool,
      "plan-approve": planApproveTool,
      "plan-reject": planRejectTool,
      "plan-list": planListTool,
      "plan-status": planStatusTool,
      "plan-resubmit": planResubmitTool,
    },
  };
};

export default plugin;
