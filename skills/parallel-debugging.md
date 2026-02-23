# Parallel Debugging Skill

Debug complex issues using competing hypotheses with parallel investigation.

## Usage

```bash
parallel-debug [teamName] "issue description"
```

## Preset Team

The debug preset includes:
- `debugger`: Main investigation lead
- `error-detective`: Pattern analysis specialist
- `devil-s-advocate`: Critical hypothesis challenger

## Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                PARALLEL DEBUGGING WORKFLOW                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. ISSUE REPORTED                                          │
│     "API returns 500 error intermittently"                  │
│     ↓                                                        │
│  2. HYPOTHESIS GENERATION (Each agent proposes)             │
│     - debugger: "Database connection pool exhaustion"       │
│     - error-detective: "Race condition in auth middleware"  │
│     - devil-s-advocate: "Memory leak in session handler"    │
│     ↓                                                        │
│  3. PARALLEL INVESTIGATION                                  │
│     Each agent investigates their hypothesis                │
│     Gathering evidence: code, logs, metrics                 │
│     ↓                                                        │
│  4. EVIDENCE SYNTHESIS                                      │
│     Team-lead collects all findings                         │
│     Confidence scores assigned                              │
│     ↓                                                        │
│  5. ROOT CAUSE DETERMINATION                                │
│     Most likely hypothesis selected                         │
│     Devil's advocate challenges conclusion                  │
│     ↓                                                        │
│  6. FIX IMPLEMENTATION                                      │
│     Targeted fix applied                                    │
│     Tests added                                             │
│     Devil's advocate reviews                                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Example Session

```bash
$ parallel-debug debug-team "Payment API timeouts after 30s"

Spawning debug team with 3 agents...
Team spawned. Starting parallel investigation.

HYPOTHESIS GENERATION:

[debugger] Hypothesis 1: Database query timeout
  - Evidence needed: Slow query logs, DB metrics
  - Confidence: 60%

[error-detective] Hypothesis 2: External payment gateway timeout
  - Evidence needed: Gateway response times, error logs
  - Confidence: 75%

[devil-s-advocate] Hypothesis 3: Memory pressure causing GC pauses
  - Evidence needed: Memory metrics, GC logs
  - Confidence: 40%

PARALLEL INVESTIGATION (5 minutes)...

EVIDENCE SYNTHESIS:

[debugger] Finding: Database queries averaging 150ms, max 2s
  - Evidence: Query logs show no 30s queries
  - Hypothesis 1 REJECTED

[error-detective] Finding: Gateway timeout set to 25s in config
  - Evidence: Config file, gateway logs confirm 25s cutoff
  - Hypothesis 2 CONFIRMED (90% confidence)

[devil-s-advocate] Finding: Memory stable at 60%, no GC issues
  - Evidence: Prometheus metrics
  - Hypothesis 3 REJECTED

ROOT CAUSE: External gateway timeout (25s) + API timeout (30s) mismatch

FIX PROPOSED:
  1. Increase gateway timeout to 35s OR
  2. Decrease API timeout to 20s with fallback

[devil-s-advocate] Review: Option 2 better - fail fast, retry
  - Concern: Option 1 may mask upstream issues
  - Recommendation: Implement circuit breaker

APPLYING FIX: Circuit breaker + 20s timeout
Tests added: 3
Status: RESOLVED
```

## Benefits of Parallel Debugging

1. **Speed**: Multiple hypotheses investigated simultaneously
2. **Coverage**: Different perspectives reduce blind spots
3. **Quality**: Devil's advocate ensures critical review
4. **Learning**: Evidence-based decisions documented
