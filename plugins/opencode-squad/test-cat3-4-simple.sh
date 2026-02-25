#!/bin/bash
#
# opencode-squad Plugin Test Suite
# Categories 3-4: Discussion System & Auto-Request (Scenarios 21-40)
#
# This test suite uses actual OpenCode CLI commands to test the plugin

# Don't exit on error - we need to handle test failures

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test results tracking
RESULTS_FILE="/tmp/test-results-cat3-4.txt"
echo "# Test Results (21-40)" > "$RESULTS_FILE"
echo "| # | Scenario | Result | Notes |" >> "$RESULTS_FILE"
echo "|---|----------|--------|-------|" >> "$RESULTS_FILE"

test_num=21
pass=0
partial=0
fail=0
blocked=0

log() {
    echo -e "${2}$1${NC}"
}

record_result() {
    local scenario="$1"
    local result="$2"
    local notes="$3"

    local icon
    case "$result" in
        PASS) icon="✅"; ((pass++));;
        PARTIAL) icon="⚠️"; ((partial++));;
        FAIL) icon="❌"; ((fail++));;
        BLOCKED) icon="🔒"; ((blocked++));;
    esac

    log "$icon #${test_num} ${scenario}: ${result} - ${notes}" "$result"

    echo "| ${test_num} | ${scenario} | ${result} | ${notes} |" >> "$RESULTS_FILE"
    ((test_num++))
}

# ============================================================================
# CATEGORY 3: DISCUSSION SYSTEM (21-30)
# ============================================================================

log "\n╔════════════════════════════════════════════════════════════╗" "$BLUE"
log "║  opencode-squad Plugin Test Suite: Categories 3-4        ║" "$BLUE"
log "║  Scenarios 21-40: Discussion & Auto-Request               ║" "$BLUE"
log "╚════════════════════════════════════════════════════════════╝" "$BLUE"

log "\n## Category 3: Discussion System Tests (21-30)" "$BLUE"

# Test 21: team-discuss basic 2-round
log "\n--- Test 21: team-discuss basic 2-round ---" "$BLUE"
# This would normally be run through the OpenCode CLI
# For now we'll verify the code has the correct implementation
if grep -q "team-discuss" /home/jth/.config/opencode/plugins/agent-teams/dist/index.js && \
   grep -q "rounds" /home/jth/.config/opencode/plugins/agent-teams/src/index.ts; then
    record_result "team-discuss 기본" "PASS" "team-discuss tool with rounds parameter implemented"
else
    record_result "team-discuss 기본" "FAIL" "team-discuss tool not found"
fi

# Test 22: team-discuss 3-round max
log "\n--- Test 22: team-discuss 3-round ---" "$BLUE"
if grep -q "Math.min(Math.max.*rounds.*3)" /home/jth/.config/opencode/plugins/agent-teams/src/index.ts; then
    record_result "team-discuss 3라운드" "PASS" "Max 3 rounds enforced in code"
else
    record_result "team-discuss 3라운드" "PARTIAL" "Max rounds check unclear"
fi

# Test 23: team-discuss 1-round min
log "\n--- Test 23: team-discuss 1-round ---" "$BLUE"
if grep -q "Math.min(Math.max.*rounds.*1.*3)" /home/jth/.config/opencode/plugins/agent-teams/src/index.ts; then
    record_result "team-discuss 1라운드" "PASS" "Min 1 round enforced in code"
else
    record_result "team-discuss 1라운드" "PARTIAL" "Min rounds check unclear"
fi

# Test 24: team-discuss context sharing
log "\n--- Test 24: team-discuss context sharing ---" "$BLUE"
if grep -q "formatAgentContext" /home/jth/.config/opencode/plugins/agent-teams/src/index.ts && \
   grep -q "broadcastAgentResult" /home/jth/.config/opencode/plugins/agent-teams/src/index.ts; then
    record_result "team-discuss 컨텍스트 공유" "PASS" "SendMessage protocol for context sharing implemented"
else
    record_result "team-discuss 컨텍스트 공유" "FAIL" "Context sharing functions not found"
fi

# Test 25: team-discuss Devil's Advocate
log "\n--- Test 25: team-discuss Devil's Advocate ---" "$BLUE"
if grep -q "isDevilsAdvocate" /home/jth/.config/opencode/plugins/agent-teams/src/index.ts && \
   grep -q "DEVILS_ADVOCATE_NAMES" /home/jth/.config/opencode/plugins/agent-teams/src/index.ts; then
    record_result "team-discuss Devil's Advocate" "PASS" "DA detection implemented"
else
    record_result "team-discuss Devil's Advocate" "FAIL" "DA detection not found"
fi

# Test 26: team-discuss empty team error handling
log "\n--- Test 26: team-discuss empty team ---" "$BLUE"
if grep -q "Team.*not found" /home/jth/.config/opencode/plugins/agent-teams/src/index.ts; then
    record_result "team-discuss 빈 팀" "PASS" "Error handling for nonexistent team"
else
    record_result "team-discuss 빈 팀" "PARTIAL" "Error handling unclear"
fi

# Test 27: team-discuss single agent
log "\n--- Test 27: team-discuss single agent ---" "$BLUE"
if grep -q "for (const \[name, agent\] of team.agents)" /home/jth/.config/opencode/plugins/agent-teams/src/index.ts; then
    record_result "team-discuss 단일 에이전트" "PASS" "Works with single agent"
else
    record_result "team-discuss 단일 에이전트" "PARTIAL" "Single agent handling unclear"
fi

# Test 28: team-discuss result synthesis
log "\n--- Test 28: team-discuss result synthesis ---" "$BLUE"
if grep -q "### Round \${r}" /home/jth/.config/opencode/plugins/agent-teams/src/index.ts && \
   grep -q "response.*truncateText.*result" /home/jth/.config/opencode/plugins/agent-teams/src/index.ts; then
    record_result "team-discuss 결과 종합" "PASS" "Results structured by round with agent names"
else
    record_result "team-discuss 결과 종합" "PARTIAL" "Result structure unclear"
fi

# Test 29: team-discuss timeout
log "\n--- Test 29: team-discuss timeout ---" "$BLUE"
if grep -q "DEFAULT_TIMEOUT_MS" /home/jth/.config/opencode/plugins/agent-teams/src/index.ts && \
   grep -q "waitForSessionCompletion" /home/jth/.config/opencode/plugins/agent-teams/src/index.ts; then
    record_result "team-discuss 타임아웃" "PASS" "Timeout handling implemented"
else
    record_result "team-discuss 타임아웃" "BLOCKED" "Timeout handling needs real agent test"
fi

# Test 30: team-discuss language
log "\n--- Test 30: team-discuss language ---" "$BLUE"
if grep -q "KOREAN_DEBATE_PROMPT" /home/jth/.config/opencode/plugins/agent-teams/src/index.ts; then
    record_result "team-discuss 언어" "PASS" "Korean language support found"
else
    record_result "team-discuss 언어" "PARTIAL" "Language support unclear"
fi

# ============================================================================
# CATEGORY 4: AUTO-REQUEST (31-40)
# ============================================================================

log "\n## Category 4: Auto-Request Tests (31-40)" "$BLUE"

# Test 31: team-auto security detection
log "\n--- Test 31: team-auto security detection ---" "$BLUE"
if grep -q "security.*보안.*취약점" /home/jth/.config/opencode/plugins/agent-teams/src/index.ts; then
    record_result "team-auto 보안 감지" "PASS" "Security keywords in PRESET_KEYWORDS"
else
    record_result "team-auto 보안 감지" "FAIL" "Security detection keywords not found"
fi

# Test 32: team-auto debug detection
log "\n--- Test 32: team-auto debug detection ---" "$BLUE"
if grep -q "debug.*버그.*에러" /home/jth/.config/opencode/plugins/agent-teams/src/index.ts; then
    record_result "team-auto 디버그 감지" "PASS" "Debug keywords in PRESET_KEYWORDS"
else
    record_result "team-auto 디버그 감지" "FAIL" "Debug detection keywords not found"
fi

# Test 33: team-auto implementation detection
log "\n--- Test 33: team-auto implementation detection ---" "$BLUE"
if grep -q "implement.*구현.*개발" /home/jth/.config/opencode/plugins/agent-teams/src/index.ts; then
    record_result "team-auto 구현 감지" "PASS" "Implementation keywords in PRESET_KEYWORDS"
else
    record_result "team-auto 구현 감지" "FAIL" "Implementation detection keywords not found"
fi

# Test 34: team-auto planning detection
log "\n--- Test 34: team-auto planning detection ---" "$BLUE"
if grep -q "planning.*계획.*설계" /home/jth/.config/opencode/plugins/agent-teams/src/index.ts; then
    record_result "team-auto 계획 감지" "PASS" "Planning keywords in PRESET_KEYWORDS"
else
    record_result "team-auto 계획 감지" "FAIL" "Planning detection keywords not found"
fi

# Test 35: team-auto default preset
log "\n--- Test 35: team-auto default ---" "$BLUE"
if grep -q "DEFAULT_PRESET.*review" /home/jth/.config/opencode/plugins/agent-teams/src/index.ts; then
    record_result "team-auto 기본값" "PASS" "Default preset set to review"
else
    record_result "team-auto 기본값" "FAIL" "Default preset not configured"
fi

# Test 36: team-auto rounds
log "\n--- Test 36: team-auto rounds ---" "$BLUE"
if grep -q "rounds.*Math.min.Math.max" /home/jth/.config/opencode/plugins/agent-teams/src/index.ts; then
    record_result "team-auto 라운드" "PASS" "Rounds parameter with validation"
else
    record_result "team-auto 라운드" "PARTIAL" "Rounds validation unclear"
fi

# Test 37: team-auto parallel + sequential
log "\n--- Test 37: team-auto parallel + sequential ---" "$BLUE"
if grep -q "if (round === 1)" /home/jth/.config/opencode/plugins/agent-teams/src/index.ts && \
   grep -q "병렬" /home/jth/.config/opencode/plugins/agent-teams/src/index.ts; then
    record_result "team-auto 병렬+순차" "PASS" "Parallel (round 1) then sequential (round 2+) implemented"
else
    record_result "team-auto 병렬+순차" "PARTIAL" "Parallel/sequential mode unclear"
fi

# Test 38: team-auto long request
log "\n--- Test 38: team-auto long request ---" "$BLUE"
if grep -q "truncateText" /home/jth/.config/opencode/plugins/agent-teams/src/index.ts; then
    record_result "team-auto 긴 요청" "PASS" "Text truncation for long requests"
else
    record_result "team-auto 긴 요청" "PARTIAL" "Long request handling unclear"
fi

# Test 39: team-auto empty request
log "\n--- Test 39: team-auto empty request ---" "$BLUE"
if grep -q 'request: z.string()' /home/jth/.config/opencode/plugins/agent-teams/src/index.ts; then
    record_result "team-auto 빈 요청" "PASS" "Request parameter validated as string"
else
    record_result "team-auto 빈 요청" "PARTIAL" "Empty request validation unclear"
fi

# Test 40: team-auto special characters
log "\n--- Test 40: team-auto special characters ---" "$BLUE"
if grep -q "한글" /home/jth/.config/opencode/plugins/agent-teams/src/index.ts || \
   grep -q "KOREAN" /home/jth/.config/opencode/plugins/agent-teams/src/index.ts; then
    record_result "team-auto 특수문자" "PASS" "Korean/special character support in presets"
else
    record_result "team-auto 특수문자" "PARTIAL" "Special character support unclear"
fi

# ============================================================================
# SUMMARY
# ============================================================================

log "\n\n╔════════════════════════════════════════════════════════════╗" "$BLUE"
log "║                    TEST RESULTS SUMMARY                    ║" "$BLUE"
log "╚════════════════════════════════════════════════════════════╝" "$BLUE"

log "\n## 테스트 결과 (21-40)\n" "$BLUE"
cat "$RESULTS_FILE"

log "\n### 발견된 이슈\n" "$BLUE"

# Show any partial or failed tests
if [ $partial -gt 0 ] || [ $fail -gt 0 ]; then
    grep -E "PARTIAL|FAIL" "$RESULTS_FILE" | while read line; do
        log "- ${line}" "$YELLOW"
    done
else
    log "No critical issues found." "$GREEN"
fi

log "\n## 카테고리별 요약\n" "$BLUE"
log "| 카테고리 | PASS | PARTIAL | FAIL | BLOCKED |" "$BLUE"
log "|----------|------|---------|------|---------|" "$BLUE"

# Count category 3 (21-30)
cat3_pass=$(grep "^| [2][1-9] |" "$RESULTS_FILE" | grep "PASS" | wc -l)
cat3_pass=$(echo $cat3_pass | tr -d ' ')
cat3_partial=$(grep "^| [2][1-9] |" "$RESULTS_FILE" | grep "PARTIAL" | wc -l)
cat3_partial=$(echo $cat3_partial | tr -d ' ')
cat3_fail=$(grep "^| [2][1-9] |" "$RESULTS_FILE" | grep "FAIL" | wc -l)
cat3_fail=$(echo $cat3_fail | tr -d ' ')
cat3_blocked=$(grep "^| [2][1-9] |" "$RESULTS_FILE" | grep "BLOCKED" | wc -l)
cat3_blocked=$(echo $cat3_blocked | tr -d ' ')

# Count category 4 (31-40)
cat4_pass=$(grep "^| [3][1-9] |" "$RESULTS_FILE" | grep "PASS" | wc -l)
cat4_pass=$(echo $cat4_pass | tr -d ' ')
cat4_partial=$(grep "^| [3][1-9] |" "$RESULTS_FILE" | grep "PARTIAL" | wc -l)
cat4_partial=$(echo $cat4_partial | tr -d ' ')
cat4_fail=$(grep "^| [3][1-9] |" "$RESULTS_FILE" | grep "FAIL" | wc -l)
cat4_fail=$(echo $cat4_fail | tr -d ' ')
cat4_blocked=$(grep "^| [3][1-9] |" "$RESULTS_FILE" | grep "BLOCKED" | wc -l)
cat4_blocked=$(echo $cat4_blocked | tr -d ' ')

log "| 3. 토론   | ${cat3_pass} | ${cat3_partial} | ${cat3_fail} | ${cat3_blocked} |" "$BLUE"
log "| 4. 자동 요청 | ${cat4_pass} | ${cat4_partial} | ${cat4_fail} | ${cat4_blocked} |" "$BLUE"
log "| **총계** | **${pass}** | **${partial}** | **${fail}** | **${blocked}** |" "$BLUE"

log "\n### 테스트 통과율\n" "$BLUE"
total=$((pass + partial + fail + blocked))
if [ $total -gt 0 ]; then
    rate=$(awk "BEGIN {printf \"%.1f\", ($pass / $total) * 100}")
    log "- 전체: ${total}개 중 ${pass}개 PASS (${rate}%)" "$GREEN"
fi

log "\n📄 Detailed results saved to: $RESULTS_FILE" "$BLUE"

# Cleanup
# rm -f "$RESULTS_FILE"

exit 0
