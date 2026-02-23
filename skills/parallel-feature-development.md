# Parallel Feature Development Skill

Coordinate parallel feature development with file ownership strategies.

## Usage

```bash
parallel-feature [teamName] "feature description"
```

## File Ownership Rules

**CRITICAL: Prevent merge conflicts with strict file ownership**

```
┌─────────────────────────────────────────────────────────────┐
│                  FILE OWNERSHIP MATRIX                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Agent               │ Files Owned                          │
│  ────────────────────┼────────────────────────────────────  │
│  backend-developer   │ src/api/**, src/services/**          │
│  frontend-developer  │ src/components/**, src/pages/**      │
│  database-admin      │ src/db/**, migrations/**             │
│  test-automator      │ tests/**, __tests__/**               │
│  devil-s-advocate    │ (review only, no edits)              │
│                                                              │
│  SHARED (read-only):  src/types/**, src/config/**          │
│                                                              │
│  CONFLICT RESOLUTION:                                        │
│  - If agent needs to edit owned file: ASK OWNER             │
│  - Shared files: Team-lead decides                          │
│  - Devil's advocate can comment on any file                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Workflow

```
┌─────────────────────────────────────────────────────────────┐
│              PARALLEL FEATURE WORKFLOW                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. FEATURE SPEC                                            │
│     "Add user authentication with OAuth"                    │
│     ↓                                                        │
│  2. TASK DECOMPOSITION                                      │
│     Team-lead breaks into independent tasks                 │
│     - DB schema for users (database-admin)                  │
│     - OAuth API endpoints (backend-developer)               │
│     - Login UI components (frontend-developer)              │
│     - E2E auth tests (test-automator)                       │
│     ↓                                                        │
│  3. FILE OWNERSHIP ASSIGNMENT                               │
│     Each agent claims their files                           │
│     Coordination points identified                          │
│     ↓                                                        │
│  4. PARALLEL IMPLEMENTATION                                 │
│     All agents work simultaneously                           │
│     Message at integration points                           │
│     ↓                                                        │
│  5. INTEGRATION CHECKPOINTS                                 │
│     - Backend API ready → Frontend can integrate            │
│     - DB schema ready → Backend can implement               │
│     - All complete → Tests can run                          │
│     ↓                                                        │
│  6. DEVIL'S ADVOCATE REVIEW                                 │
│     Security review of auth flow                            │
│     Edge case analysis                                      │
│     ↓                                                        │
│  7. FINAL MERGE                                             │
│     Team-lead coordinates merge order                       │
│     Tests must pass                                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Communication Protocol

### Integration Point Messages

```javascript
// When backend API is ready
backend-developer → frontend-developer: {
  type: "integration_ready",
  endpoint: "/api/auth/oauth",
  contract: { ... }
}

// When DB schema changes
database-admin → backend-developer: {
  type: "schema_updated",
  table: "users",
  changes: ["added oauth_provider column"]
}

// Devil's advocate review request
devil-s-advocate → team: {
  type: "review_concern",
  severity: "high",
  issue: "OAuth state parameter not validated",
  recommendation: "Add CSRF protection"
}
```

## Example Session

```bash
$ parallel-feature auth-team "Add OAuth login"

Team spawned with 5 agents.
Task decomposition complete.

FILE OWNERSHIP:
  database-admin    → src/db/schema.sql, migrations/001_oauth.sql
  backend-developer → src/api/auth.ts, src/services/oauth.ts
  frontend-developer → src/components/Login.tsx, src/pages/Auth.tsx
  test-automator    → tests/auth.test.ts
  devil-s-advocate  → (reviewer)

PARALLEL WORK STARTING...

[database-admin] Created users.oauth_provider column
[database-admin] → [backend-developer]: Schema ready for OAuth fields
[backend-developer] Implementing /api/auth/oauth/callback
[frontend-developer] Creating OAuth button component
[devil-s-advocate] Watching for security issues...

INTEGRATION CHECKPOINT 1:
[backend-developer] → [frontend-developer]: API ready, contract:
  POST /api/auth/oauth/callback
  Body: { provider, code, state }
  Response: { token, user }

[frontend-developer] Integrating with API...

[devil-s-advocate] CONCERN: State parameter not stored server-side
  - Risk: CSRF attack possible
  - Fix: Store state in session before redirect

[backend-developer] Fixing state validation...
[backend-developer] State now stored in Redis session

[test-automator] Running E2E tests...
  ✓ OAuth redirect works
  ✓ Callback handles success
  ✓ Callback handles error
  ✓ State validation prevents CSRF

All tasks complete. Ready for merge.
```

## Key Principles

1. **File ownership is sacred** - Never edit another agent's files
2. **Communicate at integration points** - Message when ready to integrate
3. **Devil's advocate reviews everything** - No merge without approval
4. **Tests gate the merge** - All tests must pass
