# Agent Teams Plugin - Complete Team Collaboration System

OpenCode's **agent-teams** plugin provides Claude Code-compatible multi-agent team coordination with full task management and agent collaboration features.

## Features

### ✅ Team-Lead Orchestrator

When spawning a team, a dedicated **team-lead** agent coordinates all work:

```bash
team-spawn [preset|all] [teamName]
```

**Available Presets:**
| Preset | Agents | Purpose |
|---------|---------|---------|
| `review` | code-reviewer, security-auditor, architect-reviewer | Code review |
| `debug` | debugger, error-detective, security-engineer | Debugging |
| `feature` | backend-developer, frontend-developer, test-automator | Feature development |
| `fullstack` | fullstack-developer, api-designer, database-optimizer | Full-stack |
| `security` | security-auditor, security-engineer, penetration-tester | Security audit |
| `migration` | legacy-modernizer, database-administrator, devops-engineer | Migration |
| `all` | All 128 agents | Ultimate team |

### ✅ Task Dependencies

Tasks can have dependencies using `blocks` and `blockedBy`:

```bash
team-add-task <team> "Build UI" "Create dashboard" frontend-developer "" "task-api-id"
```

| Field | Purpose |
|-------|---------|
| `blocks` | Tasks this task blocks (comma-separated IDs) |
| `blockedBy` | Tasks blocking this task (comma-separated IDs) |

**Workflow:**
1. Backend task creates → UI task is blocked
2. Backend completes → UI task automatically unblocked
3. Frontend agent can now start

### ✅ Agent-to-Agent Messaging

Send messages between agents like Claude Code:

```bash
team-send <team> <from> <to> "<message>"
team-broadcast <team> <from> "<message to all>"
```

**Message Types:**
| Type | Description |
|------|-------------|
| `message` | Direct agent-to-agent communication |
| `broadcast` | Send to all team members |

### ✅ Team Status

Comprehensive team status with all information:

```bash
team-status [teamName]
```

**Output includes:**
- Team name, type, team-lead
- Agent states (working, idle, blocked counts)
- Task summary (pending, completed, blocked)
- Recent messages between agents

### ✅ Graceful Shutdown

Two-step shutdown process:

```bash
team-shutdown <teamName>      # Request shutdown
team-approve-shutdown <teamName>  # Approve and finalize
```

## Comparison: Claude Code vs OpenCode Agent-Teams

| Feature | Claude Code | OpenCode Agent-Teams |
|---------|--------------|----------------------|
| **Team Lead** | ✅ Orchestrator agent | ✅ multi-agent-coordinator as team-lead |
| **Task Dependencies** | ✅ blocks/blockedBy | ✅ blocks/blockedBy |
| **Agent Messaging** | ✅ SendMessage tool | ✅ team-send/team-broadcast |
| **Status Tracking** | ✅ TaskList | ✅ team-status |
| **Graceful Shutdown** | ✅ shutdown_request/response | ✅ shutdown/approve-shutdown |
| **File Ownership** | ✅ Enforced boundaries | ✅ Per-agent file ownership |

## Usage Examples

### Spawn Ultimate Team (All 128 Agents)
```bash
team-spawn all ultimate
```

### Create Dependent Tasks
```bash
# Task 1: Database (no dependencies)
team-add-task ultimate "Design Schema" "Create users table" database-optimizer

# Task 2: API (depends on Task 1)
team-add-task ultimate "Build Auth API" "POST /auth/login" backend-developer "task-1-id"

# Task 3: Tests (depends on Task 2)
team-add-task ultimate "Write Tests" "5+ test cases" test-automator "task-2-id"
```

### Agent Communication
```bash
# Backend tells frontend API is ready
team-send ultimate backend-developer frontend-developer "Auth API complete, ready for integration"

# Broadcast to all agents
team-broadcast ultimate team-lead "Deploying to production in 5 minutes"
```

### Complete Workflow
```bash
# 1. Check status
team-status ultimate

# 2. Complete task
team-complete ultimate task-2-id

# 3. Shutdown team
team-shutdown ultimate
team-approve-shutdown ultimate
```

## Implementation Status

| Component | Status |
|-----------|--------|
| **Plugin** | ✅ Installed (@opencode-ai/plugin-agent-teams) |
| **Commands** | ✅ team-spawn, team-status, team-add-task, team-complete, team-send, team-broadcast, team-shutdown |
| **Task Storage** | ✅ ~/.opencode/team-tasks/[teamName]/ |
| **Team Storage** | ✅ ~/.opencode/teams/[teamName].json |
| **Agent Discovery** | ✅ Reads from ~/.config/opencode/agents/*.md |

## Next Steps

To achieve full Claude Code parity, the following needs to be implemented:

1. **Session Integration**: Integrate with opencode-sessions for actual agent spawning
2. **Plan Approval**: Add ExitPlanMode equivalent workflow
3. **Real-time Updates**: Automatic status broadcasting after each agent turn
4. **File Locking**: Enforce file ownership during editing

Current version provides **task management and team coordination** foundation. Full feature parity requires deeper OpenCode integration.
