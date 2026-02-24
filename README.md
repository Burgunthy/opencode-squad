# OpenCode Agent Teams Plugin

A **real** multi-agent team collaboration plugin for [OpenCode](https://opencode.ai) that actually spawns subagents and executes them in parallel.

## ⚡ Key Difference from v1

| Feature | v1 (Fake) | v2 (Real) |
|---------|-----------|-----------|
| Session Creation | Fake ID string | `client.session.create()` |
| Prompt Delivery | None | `client.session.prompt()` |
| Result Waiting | Hardcoded text | `waitForSessionCompletion()` |
| Parallel Execution | for loop | `Promise.all()` |
| Error Handling | None | Retry logic + timeout |

## Installation

```bash
cd ~/.config/opencode/plugins/agent-teams
bun install && bun run build
```

## Configuration

```json
{
  "plugin": ["./plugins/agent-teams"]
}
```

## Tools

| Tool | Description |
|------|-------------|
| `team-spawn` | Create a team with agents from opencode.json |
| `team-execute` | Execute all agents in parallel and collect results |
| `team-discuss` | Sequential discussion with context sharing |
| `team-status` | Check team status |
| `team-shutdown` | Cleanup and remove team |
| `team-auto` | Natural language → auto preset → parallel execution |

## Usage

### Natural Language (Recommended)

```
/team-auto request="auth.ts 보안 검토해줘"
```

Auto-detects "보안" → uses `security` preset → spawns security-auditor + devil-s-advocate → parallel execution → results.

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

### Discussion Mode

```
/team-discuss teamId="team-xxx" topic="SQL injection 검토" rounds=2
```

Sequential execution with context sharing between rounds.

## Presets

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

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Plugin Init                         │
│  globalClient = input.client                            │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    team-spawn                            │
│  1. Load agents from opencode.json                      │
│  2. Create Team object in Map                           │
│  3. Return team info                                    │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    team-execute                          │
│  Promise.all([                                           │
│    spawnAgentSession("security-auditor", task)          │
│    spawnAgentSession("devil-s-advocate", task)          │
│    ...                                                   │
│  ])                                                      │
│  Each: session.create() → session.prompt() → wait       │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    Results                               │
│  - Aggregate all agent responses                        │
│  - Store in team.results                                │
│  - Return formatted output                               │
└─────────────────────────────────────────────────────────┘
```

## Implementation Details

### Real Session Spawning

```typescript
async function spawnAgentSession(agentName: string, task: string) {
  // 1. Create real OpenCode session
  const sessionResponse = await globalClient.session.create({});
  const sessionID = sessionResponse.data.id;

  // 2. Send prompt to agent
  await globalClient.session.prompt({
    path: { id: sessionID },
    body: {
      parts: [{ type: "text", text: task }],
      agent: agentName,  // Uses agent from opencode.json
      system: agentConfig?.prompt_append  // Custom system prompt
    }
  });

  return { sessionID };
}
```

### Parallel Execution

```typescript
const results = await Promise.all(
  team.agents.map(agent => spawnAndExecute(agent, task))
);
```

### Error Handling

- Consecutive error limit (5 max)
- Per-agent timeout (90s default)
- Detailed error messages

### Memory Management

- Maximum 50 teams stored
- Auto-cleanup of oldest teams
- Session deletion on shutdown

## Comparison with Claude Code

| Feature | Claude Code | This Plugin |
|---------|-------------|-------------|
| Team Creation | ✅ TeamCreate | ✅ team-spawn |
| Parallel Execution | ✅ Promise.all | ✅ Promise.all |
| Real Subagents | ✅ Task tool | ✅ session API |
| Devil's Advocate | ✅ Required | ✅ In all presets |
| Task Dependencies | ✅ blocks/blockedBy | ❌ Planned |
| Message Protocol | ✅ SendMessage | ❌ Planned |

## Known Limitations

1. **Polling**: Uses polling instead of SSE (1.5s interval)
2. **No Dependencies**: No blocks/blockedBy system yet
3. **Session Isolation**: Each agent gets isolated session (no shared context)

## Future Work

- [ ] SSE-based completion detection
- [ ] Task dependencies (blocks/blockedBy)
- [ ] Inter-agent messaging
- [ ] Progress streaming
- [ ] oh-my-opencode `call_omo_agent` integration

## License

MIT
