# Team Status Skill

Display comprehensive team status including members, tasks, and progress.

## Usage

```bash
team-status [teamName]
```

## Output Format

```
═══════════════════════════════════════════════════════
TEAM STATUS: my-feature-team
═══════════════════════════════════════════════════════

Team Info:
  Name: my-feature-team
  Type: feature
  Status: active
  Team Lead: backend-developer
  Created: 2024-02-23 10:30:00

Agents (4):
  ┌────────────────────┬──────────────┬─────────┬─────────────┐
  │ Agent              │ Status       │ Task    │ Files Owned │
  ├────────────────────┼──────────────┼─────────┼─────────────┤
  │ backend-developer  │ working      │ API-001 │ src/api/*   │
  │ frontend-developer │ blocked      │ UI-001  │ -           │
  │ test-automator     │ pending      │ -       │ -           │
  │ devil-s-advocate   │ idle         │ -       │ -           │
  └────────────────────┴──────────────┴─────────┴─────────────┘

Tasks (3):
  ┌────────┬────────────────────┬──────────────┬──────────┐
  │ ID     │ Subject            │ Assignee     │ Status   │
  ├────────┼────────────────────┼──────────────┼──────────┤
  │ API-001│ Build REST API     │ backend-dev  │ in_progress │
  │ UI-001 │ Create Dashboard   │ frontend-dev │ blocked  │
  │ TEST-01│ Write E2E Tests    │ test-autom   │ pending  │
  └────────┴────────────────────┴──────────────┴──────────┘

Dependencies:
  API-001 -> blocks -> UI-001
  UI-001  -> blocks -> TEST-01

Recent Messages:
  [backend-developer → frontend-developer]: API ready for integration
  [devil-s-advocate → team]: Review concern: error handling incomplete

Summary:
  Agents: 4 (1 working, 1 blocked, 1 pending, 1 idle)
  Tasks: 3 (1 in_progress, 1 blocked, 1 pending)
  Completion: 0%
═══════════════════════════════════════════════════════
```

## Status Values

### Agent Status
- `idle`: No task assigned
- `working`: Actively working on task
- `blocked`: Waiting for dependency
- `pending`: Task assigned, not started

### Task Status
- `pending`: Ready to start
- `in_progress`: Currently being worked on
- `blocked`: Waiting for dependency
- `completed`: Finished

## Monitoring Tips

1. Check status frequently during active development
2. Watch for blocked agents that need unblocking
3. Monitor devil-s-advocate feedback
4. Track completion percentage
