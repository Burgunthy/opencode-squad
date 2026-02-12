# Complete Team Workflow for OpenCode

OpenCode의 **opencode-sessions**와 **agent-teams** 플러그인을 연동하여 Claude Code와 완벽히 동일한 팀 협업 시스템을 구현합니다.

## 핵심 차이점

| 구성요소 | 역할 |
|----------|------|
| **team-lead** | 전체 팀을 조율하고 에이전트를 할당 |
| **session()** | 실제로 OpenCode agent를 새 session에서 실행 |
| **task-deps** | blocks/blockedBy로 종속성 추적 |
| **messaging** | 에이전트 간 직접 통신 |
| **handoff** | session 간 context 전달 |

## 워크플로우

```
┌─────────────────────────────────────────────────────────────────┐
│                    BUILD AGENT (Team Lead)                    │
├─────────────────────────────────────────────────────────────────┤
                         │
                         ▼
                         │
            ┌─────────────────────────────────────────┐
            │  session() to SPAWN AGENTS           │
            └──────────────┬──────────────────────┘
                         │
                         ▼
            ┌─────────────────────────────────────────┐
            │  AGENT SESSIONS (Real Work)       │
            │  - backend-developer              │
            │  - frontend-developer              │
            │  - test-automator                 │
            │  - database-optimizer              │
            └─────────────────────────────────────────┘
                         │
                         ▼
            ┌─────────────────────────────────────────┐
            │  TEAM COORDINATION (Task Tracking) │
            │  - Task dependencies (blocks/blockedBy)  │
            │  - Status tracking (pending/working/completed) │
            │  - Inter-agent messaging                │
            └─────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    BUILD AGENT (Results)                    │
└─────────────────────────────────────────────────────────┘
```

## 사용 명령

### 1. 팀 생성 (Team Spawn)
```bash
team-spawn [preset|all] [teamName]
```
- team-lead가 생성되어 모든 agent를 조율
- `session()`으로 실제 agent 실행

**예시:**
```bash
team-spawn feature auth-api
```
→ Creates team with: backend-developer, frontend-developer, test-automator
→ Spawns each via `session(agent, 'new', 'task text')`

### 2. 작업 추가 (Add Task with Dependencies)
```bash
team-add-task <team> "Task Name" "Description" <assignee> <blocks> <blockedBy>
```

**종속성 추적:**
- `blocks`: 이 작업이 차단하는 작업 ID들 (콤마로 구분)
- `blockedBy`: 이 작업을 막고 있는 다른 작업 ID들

**워크플로우:**
```
Task 1: "Design Schema" → database-optimizer
  ↓ (blocks: none)
Task 2: "Build API" → backend-developer (blocks: task-1)
  ↓ (waiting for Task 1)
Task 3: "Write Tests" → test-automator (blocks: task-2)
```

### 3. 에이전트 통신 (Agent Messaging)
```bash
# 1:1 통신
team-send <team> <from> <to> "Message text"

# 전체 방송
team-broadcast <team> <from> "Broadcast to all"
```

**통신 경로:**
```
Agent A → session(agent_a) → session(agent_b)
Agent B → session(agent_a) → session(agent_b)
```

### 4. 상태 확인 (Team Status)
```bash
team-status [teamName]
```

**출력 정보:**
- 팀 이름, 타입
- 전체 agent 수
- 작업 중/유� agent 수
- 보류中的 작업 수
- 완료된 작업 수

### 5. 종료 (Graceful Shutdown)
```bash
# 1단계: 종료 요청
team-shutdown <teamName>

# 2단계: 승인
team-approve-shutdown <teamName>
```

## Claude Code와의 차이점

| 기능 | Claude Code | OpenCode (이 구현) |
|------|--------------|------------------------|
| 팀 리더 | 전용 orchestrator agent | Build agent (조율 역할) |
| Agent 생성 | Task.spawnteams() | session() 함수 |
| 종속성 추적 | TaskList tool | blocks/blockedBy 필드 |
| 통신 | SendMessage (구조화됨) | team-send/broadcast 명령 |
| 상태 저장 | ~/.claude/teams/ | ~/.opencode/team-tasks/ |
| 종료 워크플로우 | shutdown_request/response | team-shutdown/approve-shutdown |

## 실전 예시

### 복잡한 API 개발 (3단계 종속성)

```bash
# 1단계: 팀 생성
team-spawn feature api-team

# 2단계: 종속성 있는 작업 할당
team-add-task api-team "Setup Project" "Initialize Node.js project" build "" task-proj
team-add-task api-team "Design Database" "Create schema with indexes" database-optimizer task-proj
team-add-task api-team "Implement Auth" "JWT authentication system" backend-developer task-proj

# 3단계: 확인
team-status api-team
```

**결과:**
- build은 task-proj를 기다림으로 대기
- database-optimizer는 task-proj가 완료되어야 시작
- backend-developer는 task-proj가 완료되어야 완료

### 협력 패턴 (Collaboration Patterns)

#### 병렬 작업 (Parallel Work)
```bash
# 방법 1: 여러 session에서 독립적으로 실행
session('backend-developer', 'new', 'task1')
session('frontend-developer', 'new', 'task2')

# 방법 2: fork로 분기 실행
session('planner', 'fork', 'Analyze architecture')
session('implementer-1', 'fork', 'Analyze architecture')  # implementer-1은 독립 session
```

#### 순차적 의사결정 (Sequential Decision Making)
```bash
# 1단계: planner가 분석
session('planner', 'new', 'Create implementation plan')

# 2단계: planner가 build에게 위임
session('planner', 'message', 'implementer', 'Implement this design')

# 3단계: implementer가 작업 후 보고
session('implementer', 'message', 'planner', 'Implementation complete, ready for review')
```

## 요약

**OpenCode + agent-teams + opencode-sessions = 완전한 팀 협업 시스템**

이 구현을 통해:
1. **실제 agent 실행**: session() 함수로 OpenCode agent spawn
2. **종속성 관리**: 작업 간의 의존关系 추적
3. **에이전트 통신**: agent 간 직접 메시지 교환
4. **그레이스풀 종료**: 모든 agent가 작업을 완료한 후 종료
5. **파일 소유권**: 각 agent가 독립적으로 파일 접근

Claude Code의 팀 협업 기능을 OpenCode에서 완벽하게 재현했습니다!
