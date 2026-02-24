# @opencode-ai/squad

A production-ready multi-agent team collaboration plugin for [OpenCode](https://opencode.ai) that spawns real subagents and executes them in parallel.

## Features

- **Real Subagent Execution**: Uses OpenCode SDK to spawn actual sessions
- **Parallel Execution**: All agents execute in parallel via `Promise.allSettled()`
- **Task Dependencies**: Full blocks/blockedBy dependency management with cycle detection
- **Devil's Advocate**: Critical thinking agent included in every team preset
- **Natural Language**: Auto-detect team preset from keywords
- **Persistence**: Team state saved to `~/.opencode/teams/`
- **10 Tools**: Complete team and task management

## Installation

### Option 1: Local Plugin (Recommended)

```bash
# Clone the repository
git clone https://github.com/Burgunthy/opencode-squad.git ~/.config/opencode/plugins/squad

# Install dependencies and build
cd ~/.config/opencode/plugins/squad
bun install && bun run build
```

### Option 2: npm (Coming Soon)

```bash
bun add @opencode-ai/squad
```

## Configuration

Add to your `opencode.json`:

```json
{
  "plugin": [
    "./plugins/squad"
  ]
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `team-spawn` | Create a team with preset or custom agents |
| `team-execute` | Execute all agents in parallel |
| `team-discuss` | Sequential discussion with context sharing |
| `team-status` | Check team status and results |
| `team-shutdown` | Cleanup and remove team |
| `team-auto` | Natural language team request |
| `task-create` | Create a task with dependencies |
| `task-update` | Update task status, owner, dependencies |
| `task-execute` | Execute tasks respecting dependencies |
| `task-list` | List all tasks in a team |

## Team Presets

| Preset | Agents |
|--------|--------|
| `review` | code-reviewer, security-auditor, devil-s-advocate |
| `security` | security-auditor, devil-s-advocate |
| `debug` | debugger, devil-s-advocate |
| `planning` | planner, devil-s-advocate |
| `implementation` | backend-developer, frontend-developer, test-automator, devil-s-advocate |
| `fullstack` | fullstack-developer, devil-s-advocate |
| `research` | explore, data-scientist, devil-s-advocate |
| `ai` | ai-engineer, llm-architect, prompt-engineer, devil-s-advocate |

## Usage Examples

### Natural Language (Easiest)

```
/team-auto request="auth.ts 보안 검토해줘"
```

Auto-detects "보안" → uses `security` preset → spawns agents → parallel execution → results.

### Manual Workflow

```
# 1. Create team
/team-spawn preset="review" teamName="auth-review" task="auth.ts 코드 리뷰"

# 2. Execute in parallel
/team-execute teamId="team-xxx"

# 3. Check status
/team-status teamId="team-xxx"

# 4. Cleanup
/team-shutdown teamId="team-xxx"
```

### Task Dependencies

```
# Create tasks with dependencies
/task-create teamId="team-xxx" subject="Design API" description="..." owner="planner"

/task-create teamId="team-xxx" subject="Implement API" description="..." owner="backend-developer" blockedBy="task-xxx"

/task-create teamId="team-xxx" subject="Write Tests" description="..." owner="test-automator" blockedBy="task-yyy"

# Execute respecting dependencies
/task-execute teamId="team-xxx"
```

### Discussion Mode

```
/team-discuss teamId="team-xxx" topic="SQL injection 검토" rounds=2
```

Sequential execution with context sharing between rounds.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Plugin Initialization                     │
│  globalClient = input.client                                 │
│  loadOpenCodeAgents()                                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      team-spawn                              │
│  1. Load agents from opencode.json                          │
│  2. Create Team object with Map<string, Agent>              │
│  3. Initialize tasks Map                                     │
│  4. Save to ~/.opencode/teams/{teamId}.json                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      team-execute                            │
│  Promise.allSettled([                                        │
│    spawnAgentSession("security-auditor", task)              │
│    spawnAgentSession("devil-s-advocate", task)              │
│    ...                                                       │
│  ])                                                          │
│                                                              │
│  Each: session.create() -> session.prompt() -> waitFor()    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       Results                                │
│  - Aggregate all agent responses                            │
│  - Store in team.results Map                                │
│  - Save persisted state                                      │
│  - Return formatted output                                   │
└─────────────────────────────────────────────────────────────┘
```

## Devil's Advocate

Every team includes a Devil's Advocate agent that:

- Challenges assumptions
- Identifies edge cases
- Proposes alternatives
- Finds what others missed

The Devil's Advocate prompt is automatically injected for any agent with "devil" in the name.

## Task Dependencies

```typescript
interface Task {
  id: string;
  subject: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "blocked" | "error";
  owner?: string;
  blockedBy: string[];  // Tasks this depends on
  blocks: string[];     // Tasks that depend on this
}
```

Features:
- **Cycle Detection**: Automatically detects circular dependencies
- **Execution Order**: Tasks execute only when all dependencies are completed
- **Deadlock Prevention**: Maximum iteration limit with warning

## Comparison with Claude Code

| Feature | Claude Code | This Plugin |
|---------|-------------|-------------|
| Team Creation | TeamCreate | team-spawn |
| Parallel Execution | Promise.all | Promise.allSettled |
| Real Subagents | Task tool | session API |
| Devil's Advocate | Required | In all presets |
| Task Dependencies | blocks/blockedBy | blocks/blockedBy |
| Task Update | TaskUpdate | task-update |
| Persistence | Memory | File-based |
| Inter-agent Messaging | SendMessage | Planned |

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Run tests
bun test

# Run specific tests
bun test test/unit.test.ts
bun test test/integration.test.ts
```

## Test Coverage

| Category | Tests | Pass Rate |
|----------|-------|-----------|
| Unit Tests | 50 | 92% |
| Integration Tests | 24 | 100% |
| E2E Tests | 19 | 100% |
| **Total** | **93** | **91.4%** |

## Security

- No hardcoded secrets or API keys
- Session cleanup on shutdown
- Maximum team/task limits to prevent resource exhaustion
- Cyclic dependency detection prevents infinite loops
- All file paths are safely constructed

## Requirements

- OpenCode >= 1.1.60
- Bun runtime

## License

MIT

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

## Credits

Inspired by Claude Code's squad functionality. Built for the OpenCode ecosystem.
