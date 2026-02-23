# Team Shutdown Skill

Gracefully shut down an agent team with approval workflow.

## Usage

```bash
# Step 1: Request shutdown
team-shutdown [teamName]

# Step 2: Approve shutdown (after confirmation)
team-shutdown [teamName] --approve
```

## Shutdown Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                    SHUTDOWN WORKFLOW                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. team-shutdown my-team                                   │
│     ↓                                                        │
│  2. System requests shutdown from all agents                 │
│     ↓                                                        │
│  3. Each agent can:                                         │
│     - APPROVE: Ready to shutdown                            │
│     - REJECT: Still working (with reason)                   │
│     ↓                                                        │
│  4. If all approved:                                        │
│     team-shutdown my-team --approve                         │
│     ↓                                                        │
│  5. Team archived, resources cleaned up                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Shutdown Request Output

```
═══════════════════════════════════════════════════════
SHUTDOWN REQUEST: my-feature-team
═══════════════════════════════════════════════════════

Requesting shutdown from 4 agents...

Agent Responses:
  ✓ backend-developer: APPROVED (Task completed)
  ✓ frontend-developer: APPROVED (Ready to hand off)
  ✓ test-automator: APPROVED (Tests passing)
  ✓ devil-s-advocate: APPROVED (No outstanding concerns)

All agents approved. Run with --approve to complete shutdown.

═══════════════════════════════════════════════════════
```

## Rejection Example

```
Agent Responses:
  ✓ backend-developer: APPROVED
  ✗ frontend-developer: REJECTED
      Reason: "Still refactoring component library, need 10 more minutes"
  ✓ devil-s-advocate: APPROVED

Cannot shutdown: 1 agent rejected. Wait and retry.
```

## Final Shutdown Output

```
═══════════════════════════════════════════════════════
TEAM SHUTDOWN COMPLETE: my-feature-team
═══════════════════════════════════════════════════════

Summary:
  Duration: 2 hours 34 minutes
  Agents: 4
  Tasks Completed: 12
  Files Modified: 23

Final Report:
  - Backend API: Implemented and tested
  - Frontend Dashboard: Complete with responsive design
  - Test Coverage: 87%
  - Security Review: Passed (devil-s-advocate)

Team archived to: ~/.opencode/archive/my-feature-team/

═══════════════════════════════════════════════════════
```

## Important Notes

- Never force shutdown without agent approval
- Devil's advocate must approve (ensures quality check)
- Archive contains all task history and messages
- Sessions are properly closed
