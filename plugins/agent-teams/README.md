# Agent Teams Plugin for OpenCode

A plugin that enables multi-agent team collaboration with structured discussions.

## Features

- **Team Spawning**: Create teams with preset configurations or custom agents
- **Structured Discussions**: Run multi-round discussions between agents
- **Devil's Advocate**: Every team includes a critical thinker to challenge assumptions
- **Team Management**: Monitor status and manage team lifecycle

## Installation

### Option 1: Local Plugin

1. Build the plugin:
```bash
cd plugins/agent-teams
bun install
bun run build
```

2. Add to your `opencode.json`:
```json
{
  "plugin": [
    "./plugins/agent-teams"
  ]
}
```

### Option 2: Copy to OpenCode plugins directory

```bash
cp -r plugins/agent-teams ~/.opencode/plugins/
```

## Usage

### Team Spawn

Create a new agent team:

```
/team-spawn preset="review" teamName="code-review-team" task="Review the authentication module"
```

Available presets:
- `review` - code-reviewer, security-auditor, devil-s-advocate
- `debug` - debugger, devil-s-advocate
- `architecture` - architect, devil-s-advocate
- `feature` - frontend-developer, backend-developer, test-automator, devil-s-advocate
- `security` - security-auditor, devil-s-advocate

Or use custom agents:
```
/team-spawn preset="code-reviewer,debugger,devil-s-advocate" teamName="custom-team" task="..."
```

### Team Discuss

Start a discussion:

```
/team-discuss teamId="team-1234567890" topic="Should we use microservices?" rounds=2
```

### Team Status

Check team status:

```
/team-status teamId="team-1234567890"
```

### Team Shutdown

Shutdown a team:

```
/team-shutdown teamId="team-1234567890"
```

## Example Session

```
User: /team-spawn preset="review" teamName="auth-review" task="Review the login API"

Agent: ## Team "auth-review" Created

**Team ID**: team-1708123456789
**Preset**: review

### Agents Spawned (3)
- **code-reviewer** (Code Quality Specialist)
- **security-auditor** (Security Specialist)
- **devil-s-advocate** (Critical Thinker)

### Task
Review the login API

---
Use `team-discuss` to start the discussion.

User: /team-discuss teamId="team-1708123456789" topic="Security of the login endpoint" rounds=2

Agent: ## Discussion: Security of the login endpoint

**Team**: auth-review
**Rounds**: 2

### Round 1

**code-reviewer** (Code Quality Specialist):
From a code quality perspective:
...

**security-auditor** (Security Specialist):
Security Assessment:
...

**devil-s-advocate** (Critical Thinker):
As Devil's Advocate, I want to ensure we've considered all angles.
...

### Round 2
...
```

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Watch mode
bun run dev
```

## License

MIT
