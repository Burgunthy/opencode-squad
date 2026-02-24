# OpenCode Agent Teams Plugin

A powerful plugin for [OpenCode](https://opencode.ai) that enables multi-agent team collaboration, matching Claude Code's agent-teams functionality.

## Features

- 🔀 **Parallel Execution**: All agents execute in parallel using `Promise.all()`
- 🎯 **Multiple Presets**: review, security, debug, feature, architecture
- 😈 **Devil's Advocate**: Every team includes a critical thinker
- 💬 **Inter-Agent Communication**: Agents share findings with each other
- 🗣️ **Natural Language Support**: Request teams with plain language

## Installation

```bash
# Clone the repository
git clone https://github.com/Burgunthy/opencode-agent-team.git ~/.config/opencode

# Build the plugin
cd ~/.config/opencode/plugins/agent-teams
bun install && bun run build
```

## Usage

### Natural Language Request

```
/team-auto request="이 코드를 팀을 짜서 보안 검토해줘"
/team-auto request="버그를 디버그 팀으로 찾아줘"
```

### Manual Commands

```bash
# Create a team
/team-spawn preset="review" teamName="my-review" task="코드 리뷰"

# Run discussion
/team-discuss teamId="team-xxx" topic="SQL injection 검토"

# Check status
/team-status teamId="team-xxx"

# Shutdown
/team-shutdown teamId="team-xxx"
```

## Presets

| Preset | Agents | Use Case |
|--------|--------|----------|
| `review` | code-reviewer, security-auditor, devil-s-advocate | Code review |
| `security` | security-auditor, devil-s-advocate | Security audit |
| `debug` | debugger, devil-s-advocate | Debugging |
| `feature` | frontend-dev, backend-dev, test-automator, devil-s-advocate | Feature development |
| `architecture` | architect, devil-s-advocate | System design |

## Custom Teams

```
/team-spawn preset="code-reviewer,security-auditor,devil-s-advocate" teamName="custom" task="..."
```

## Available Agents

| Agent | Role |
|-------|------|
| `code-reviewer` | Code Quality Specialist |
| `security-auditor` | Security Specialist |
| `devil-s-advocate` | Critical Thinker |
| `debugger` | Debugging Specialist |
| `architect` | System Architect |

## How It Works

```
┌─────────────────────────────────────────────────────┐
│                    Team Workflow                     │
├─────────────────────────────────────────────────────┤
│                                                      │
│  1. /team-spawn                                      │
│     └─ Create team with preset agents               │
│                                                      │
│  2. /team-discuss                                    │
│     └─ Round 1: Each agent analyzes independently   │
│     └─ Round 2: Agents see others' findings         │
│     └─ Devil's Advocate challenges all              │
│                                                      │
│  3. /team-status                                     │
│     └─ View team progress                           │
│                                                      │
│  4. /team-shutdown                                   │
│     └─ Clean up team                                │
│                                                      │
└─────────────────────────────────────────────────────┘
```

## Example Output

```
## Team "auth-review" Created

**Team ID**: team-1708765432100
**Preset**: review

### Agents Spawned (3)
- **code-reviewer** (Code Quality Specialist)
- **security-auditor** (Security Specialist)
- **devil-s-advocate** (Critical Thinker)

### Task
Review authentication code for security vulnerabilities

---

## Discussion: SQL Injection Review

### Round 1

**security-auditor**:
- **CRITICAL**: SQL Injection in line 14
- **CRITICAL**: MD5 hashing (cryptographically broken)
- **HIGH**: Weak token generation

**code-reviewer**:
- **HIGH**: No error handling
- **MEDIUM**: Magic numbers used
- Score: 2.5/10

**devil-s-advocate**:
### What Others Missed
1. No email validation
2. No password complexity requirements
3. No session expiration
```

## Comparison with Claude Code

| Feature | Claude Code | OpenCode Plugin |
|---------|-------------|-----------------|
| Team Creation | ✅ | ✅ |
| Parallel Execution | ✅ | ✅ |
| Devil's Advocate | ✅ | ✅ |
| Inter-Agent Communication | ✅ | ✅ |
| Natural Language | ✅ | ✅ |

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Test
opencode run "/team-spawn preset='review' teamName='test' task='test'"
```

## License

MIT

## Credits

Developed for OpenCode platform compatibility with Claude Code's agent-teams system.
