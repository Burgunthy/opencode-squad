# Team Spawn Skill

Spawn an agent team using presets or custom composition.

## Usage

```bash
team-spawn [preset|agents] [teamName]
```

## Presets

| Preset | Agents | Purpose |
|--------|--------|---------|
| `review` | code-reviewer, security-auditor, devil-s-advocate | Code review with critical analysis |
| `debug` | debugger, error-detective, devil-s-advocate | Debugging with hypothesis testing |
| `feature` | backend-developer, frontend-developer, test-automator, devil-s-advocate | Full feature development |
| `fullstack` | fullstack-developer, api-designer, database-administrator, devil-s-advocate | Full-stack implementation |
| `security` | security-auditor, devil-s-advocate | Security audit |
| `migration` | refactoring-specialist, database-administrator, devil-s-advocate | Code/database migration |
| `research` | explore, data-scientist, devil-s-advocate | Research and analysis |
| `ai` | ai-engineer, llm-architect, prompt-engineer, devil-s-advocate | AI/ML development |
| `all` | All available agents | Ultimate team |

## IMPORTANT: Devil's Advocate Inclusion

**Every preset MUST include `devil-s-advocate`** to ensure:
- Critical review of all decisions
- Identification of potential issues
- Alternative approach proposals
- Quality assurance

## Custom Composition

```bash
team-spawn "python-pro,backend-developer,devil-s-advocate" my-api-team
```

## Output

```
Team "my-api-team" spawned with 3 agents:
  - python-pro (session: sess-abc123)
  - backend-developer (session: sess-def456)
  - devil-s-advocate (session: sess-ghi789) [CRITICAL REVIEWER]

Team Lead: python-pro
Status: Active
```

## Workflow After Spawn

1. Use `team-add-task` to assign work
2. Use `team-send` for inter-agent communication
3. Use `team-status` to monitor progress
4. Use `team-shutdown` when complete
