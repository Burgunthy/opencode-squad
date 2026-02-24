# agent-teams 빠른 참조

## 설치 확인

```bash
# 플러그인 빌드
cd ~/.config/opencode/plugins/agent-teams && bun run build

# opencode.json 확인
cat ~/.config/opencode/opencode.json | grep plugin
```

## 도구 목록

| 도구 | 설명 | 예시 |
|------|------|------|
| `team-spawn` | 팀 생성 | `/team-spawn preset="review" teamName="test" task="코드 리뷰"` |
| `team-discuss` | 토론 실행 | `/team-discuss teamId="team-xxx" topic="SQL injection"` |
| `team-status` | 상태 확인 | `/team-status teamId="team-xxx"` |
| `team-shutdown` | 팀 종료 | `/team-shutdown teamId="team-xxx"` |
| `team-auto` | 자연어 요청 | `/team-auto request="보안 검토해줘"` |

## 프리셋

| 프리셋 | 에이전트 | 용도 |
|--------|----------|------|
| `review` | code-reviewer, security-auditor, devil-s-advocate | 코드 리뷰 |
| `security` | security-auditor, devil-s-advocate | 보안 검토 |
| `debug` | debugger, devil-s-advocate | 디버깅 |
| `planning` | planner, devil-s-advocate | 계획 수립 |
| `implementation` | backend-developer, frontend-developer, test-automator, devil-s-advocate | 기능 구현 |
| `fullstack` | fullstack-developer, devil-s-advocate | 풀스택 개발 |

## 자연어 키워드 (team-auto)

| 키워드 | 프리셋 |
|--------|--------|
| 보안, security | security |
| 버그, debug | debug |
| 계획, planning | planning |
| 구현, implement | implementation |
| 그 외 | review |

## 커스텀 에이전트 사용

```
/team-spawn preset="python-pro,security-auditor,devil-s-advocate" teamName="custom" task="..."
```

## oh-my-opencode과 함께 사용

```json
{
  "plugin": [
    "oh-my-opencode",
    "./plugins/agent-teams"
  ]
}
```

```
# 프롬프트 예시
ulw auth.ts 보안 검토 팀 짜서 해줘
```
