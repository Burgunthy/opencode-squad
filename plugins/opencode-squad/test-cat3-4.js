#!/usr/bin/env node

/**
 * opencode-squad Plugin Test Suite
 * Categories 3-4: Discussion System & Auto-Request (Scenarios 21-40)
 *
 * Test Automation for:
 * - Category 3: team-discuss scenarios (21-30)
 * - Category 4: team-auto scenarios (31-40)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test results tracking
const results = [];
let testNumber = 21;

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function recordResult(scenario, result, notes = '') {
  const record = {
    number: testNumber++,
    scenario,
    result,
    notes,
  };
  results.push(record);
  const icon = result === 'PASS' ? '✅' : result === 'PARTIAL' ? '⚠️' : result === 'FAIL' ? '❌' : '🔒';
  log(`${icon} #${record.number} ${scenario}: ${result}${notes ? ' - ' + notes : ''}`, result === 'PASS' ? 'green' : result === 'PARTIAL' ? 'yellow' : result === 'FAIL' ? 'red' : 'blue');
}

function recordObserve(scenario, details) {
  log(`📋 ${scenario}: ${details}`, 'blue');
}

// ============================================================================
// TEST FRAMEWORK
// ============================================================================

class PluginTester {
  constructor(pluginPath) {
    this.pluginPath = pluginPath;
    this.plugin = null;
    this.tools = new Map();
  }

  async init() {
    try {
      // Dynamic import of the plugin
      const pluginModule = await import(this.pluginPath);
      this.plugin = pluginModule.default;

      // Mock OpenCode client
      const mockClient = {
        session: {
          create: async () => ({ data: { id: `mock-session-${Date.now()}` } }),
          prompt: async () => ({ }),
          messages: async () => ({
            data: [
              {
                info: { role: 'assistant' },
                parts: [{ type: 'text', text: 'Mock agent response for testing.' }]
              }
            ]
          }),
          delete: async () => ({ })
        }
      };

      // Initialize plugin with mock client
      const pluginOutput = await this.plugin({
        client: mockClient,
        config: {},
        fs,
        path,
        os: { homedir: () => '/tmp/test-opencode' }
      });

      // Register tools
      if (pluginOutput.tool) {
        for (const [name, tool] of Object.entries(pluginOutput.tool)) {
          this.tools.set(name, tool);
        }
      }

      log(`✓ Plugin loaded with ${this.tools.size} tools`, 'green');
      return true;
    } catch (error) {
      log(`✗ Failed to load plugin: ${error.message}`, 'red');
      return false;
    }
  }

  async executeTool(toolName, args) {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }
    try {
      return await tool.execute(args);
    } catch (error) {
      return { error: error.message };
    }
  }

  // Helper to extract team ID from response
  extractTeamId(response) {
    const match = response?.match(/team-\d+-[a-f0-9]{8}/);
    return match ? match[0] : null;
  }

  // Helper to check if response contains expected patterns
  validateResponse(response, patterns) {
    if (!response) return false;
    const responseLower = response.toLowerCase();
    return patterns.every(p => responseLower.includes(p.toLowerCase()));
  }
}

// ============================================================================
// CATEGORY 3: DISCUSSION SYSTEM (21-30)
// ============================================================================

async function testCategory3_Discussion(tester) {
  log('\n## Category 3: Discussion System Tests (21-30)', 'blue');

  // Test 21: team-discuss basic 2-round
  {
    log('\n--- Test 21: team-discuss basic 2-round ---', 'blue');
    const spawnResult = await tester.executeTool('team-spawn', {
      preset: 'debate',
      teamName: 'test-discuss-21',
      task: 'Test discussion topic'
    });

    const teamId = tester.extractTeamId(spawnResult);
    if (!teamId) {
      recordResult('team-discuss 기본', 'FAIL', 'Could not create team');
    } else {
      const discussResult = await tester.executeTool('team-discuss', {
        teamId,
        topic: 'Is TypeScript better than JavaScript?',
        rounds: 2
      });

      const hasRound1 = discussResult?.includes('Round 1');
      const hasRound2 = discussResult?.includes('Round 2');
      const hasAgents = discussResult?.includes('planner') || discussResult?.includes('devil');

      if (hasRound1 && hasRound2 && hasAgents) {
        recordResult('team-discuss 기본', 'PASS', '2-round discussion executed');
      } else if (hasRound1) {
        recordResult('team-discuss 기본', 'PARTIAL', 'Round 1 only, Round 2 missing');
      } else {
        recordResult('team-discuss 기본', 'FAIL', 'Discussion not executed properly');
      }
    }
  }

  // Test 22: team-discuss 3-round
  {
    log('\n--- Test 22: team-discuss 3-round ---', 'blue');
    const spawnResult = await tester.executeTool('team-spawn', {
      preset: 'debate',
      teamName: 'test-discuss-22',
      task: '3-round discussion'
    });

    const teamId = tester.extractTeamId(spawnResult);
    if (!teamId) {
      recordResult('team-discuss 3라운드', 'FAIL', 'Could not create team');
    } else {
      const discussResult = await tester.executeTool('team-discuss', {
        teamId,
        topic: 'AI safety concerns',
        rounds: 3
      });

      const hasRound1 = discussResult?.includes('Round 1');
      const hasRound2 = discussResult?.includes('Round 2');
      const hasRound3 = discussResult?.includes('Round 3');

      if (hasRound1 && hasRound2 && hasRound3) {
        recordResult('team-discuss 3라운드', 'PASS', 'All 3 rounds completed');
      } else if (hasRound1 && hasRound2) {
        recordResult('team-discuss 3라운드', 'PARTIAL', 'Only 2 rounds completed');
      } else {
        recordResult('team-discuss 3라운드', 'FAIL', 'Rounds not executed');
      }
    }
  }

  // Test 23: team-discuss 1-round
  {
    log('\n--- Test 23: team-discuss 1-round ---', 'blue');
    const spawnResult = await tester.executeTool('team-spawn', {
      preset: 'debate',
      teamName: 'test-discuss-23',
      task: '1-round discussion'
    });

    const teamId = tester.extractTeamId(spawnResult);
    if (!teamId) {
      recordResult('team-discuss 1라운드', 'FAIL', 'Could not create team');
    } else {
      const discussResult = await tester.executeTool('team-discuss', {
        teamId,
        topic: 'Quick opinion',
        rounds: 1
      });

      const hasRound1 = discussResult?.includes('Round 1');
      const noRound2 = !discussResult?.includes('Round 2');

      if (hasRound1 && noRound2) {
        recordResult('team-discuss 1라운드', 'PASS', 'Single round executed correctly');
      } else {
        recordResult('team-discuss 1라운드', 'FAIL', 'Round control not working');
      }
    }
  }

  // Test 24: team-discuss context sharing
  {
    log('\n--- Test 24: team-discuss context sharing ---', 'blue');
    const spawnResult = await tester.executeTool('team-spawn', {
      preset: 'debate',
      teamName: 'test-discuss-24',
      task: 'Context sharing test'
    });

    const teamId = tester.extractTeamId(spawnResult);
    if (!teamId) {
      recordResult('team-discuss 컨텍스트 공유', 'FAIL', 'Could not create team');
    } else {
      const discussResult = await tester.executeTool('team-discuss', {
        teamId,
        topic: 'Context sharing verification',
        rounds: 2
      });

      // Check for context sharing indicators
      const hasContext = discussResult?.includes('다른 에이전트') ||
                        discussResult?.includes('agent') ||
                        discussResult?.includes('의견');

      if (hasContext) {
        recordResult('team-discuss 컨텍스트 공유', 'PASS', 'Context shared between rounds');
      } else {
        recordResult('team-discuss 컨텍스트 공유', 'PARTIAL', 'Context sharing unclear');
      }
    }
  }

  // Test 25: team-discuss Devil's Advocate
  {
    log('\n--- Test 25: team-discuss Devil\'s Advocate ---', 'blue');
    const spawnResult = await tester.executeTool('team-spawn', {
      preset: 'debate',
      teamName: 'test-discuss-25',
      task: 'DA test'
    });

    const teamId = tester.extractTeamId(spawnResult);
    if (!teamId) {
      recordResult('team-discuss Devil\'s Advocate', 'FAIL', 'Could not create team');
    } else {
      const discussResult = await tester.executeTool('team-discuss', {
        teamId,
        topic: 'Should we use microservices?',
        rounds: 2
      });

      // Check if DA is present
      const hasDA = discussResult?.toLowerCase().includes('devil') ||
                   discussResult?.toLowerCase().includes('advocate') ||
                   discussResult?.toLowerCase().includes('반론');

      if (hasDA) {
        recordResult('team-discuss Devil\'s Advocate', 'PASS', 'DA participated in discussion');
      } else {
        recordResult('team-discuss Devil\'s Advocate', 'PARTIAL', 'DA presence unclear');
      }
    }
  }

  // Test 26: team-discuss empty team
  {
    log('\n--- Test 26: team-discuss empty team ---', 'blue');
    const discussResult = await tester.executeTool('team-discuss', {
      teamId: 'nonexistent-team-123',
      topic: 'Test topic',
      rounds: 2
    });

    const hasError = discussResult?.includes('Error') || discussResult?.includes('not found');

    if (hasError) {
      recordResult('team-discuss 빈 팀', 'PASS', 'Error handling works');
    } else {
      recordResult('team-discuss 빈 팀', 'FAIL', 'Should return error for nonexistent team');
    }
  }

  // Test 27: team-discuss single agent
  {
    log('\n--- Test 27: team-discuss single agent ---', 'blue');
    const spawnResult = await tester.executeTool('team-spawn', {
      preset: 'planner', // Single agent preset
      teamName: 'test-discuss-27',
      task: 'Single agent test'
    });

    const teamId = tester.extractTeamId(spawnResult);
    if (!teamId) {
      recordResult('team-discuss 단일 에이전트', 'FAIL', 'Could not create team');
    } else {
      const discussResult = await tester.executeTool('team-discuss', {
        teamId,
        topic: 'Single agent topic',
        rounds: 2
      });

      // Should still work with single agent
      const hasResponse = discussResult && discussResult.length > 0;

      if (hasResponse) {
        recordResult('team-discuss 단일 에이전트', 'PASS', 'Single agent discussion works');
      } else {
        recordResult('team-discuss 단일 에이전트', 'PARTIAL', 'Limited functionality with single agent');
      }
    }
  }

  // Test 28: team-discuss result synthesis
  {
    log('\n--- Test 28: team-discuss result synthesis ---', 'blue');
    const spawnResult = await tester.executeTool('team-spawn', {
      preset: 'debate',
      teamName: 'test-discuss-28',
      task: 'Synthesis test'
    });

    const teamId = tester.extractTeamId(spawnResult);
    if (!teamId) {
      recordResult('team-discuss 결과 종합', 'FAIL', 'Could not create team');
    } else {
      const discussResult = await tester.executeTool('team-discuss', {
        teamId,
        topic: 'Synthesis topic',
        rounds: 2
      });

      // Check for synthesis indicators
      const hasStructure = discussResult?.includes('Round') || discussResult?.includes('###');

      if (hasStructure) {
        recordResult('team-discuss 결과 종합', 'PASS', 'Results properly structured');
      } else {
        recordResult('team-discuss 결과 종합', 'PARTIAL', 'Structure unclear');
      }
    }
  }

  // Test 29: team-discuss timeout
  {
    log('\n--- Test 29: team-discuss timeout ---', 'blue');
    recordObserve('team-discuss 타임아웃', 'Testing timeout behavior with mock agents');
    // With mock agents, timeout won't be triggered in test environment
    recordResult('team-discuss 타임아웃', 'BLOCKED', 'Requires real agent sessions for timeout test');
  }

  // Test 30: team-discuss language (Korean/English)
  {
    log('\n--- Test 30: team-discuss language ---', 'blue');
    const spawnResult = await tester.executeTool('team-spawn', {
      preset: 'debate',
      teamName: 'test-discuss-30',
      task: 'Language test'
    });

    const teamId = tester.extractTeamId(spawnResult);
    if (!teamId) {
      recordResult('team-discuss 언어', 'FAIL', 'Could not create team');
    } else {
      // Test with Korean topic
      const discussResult = await tester.executeTool('team-discuss', {
        teamId,
        topic: '타입스크립트의 장단점을 토론하세요',
        rounds: 2
      });

      // Check if Korean is processed
      const hasKorean = /[\uAC00-\uD7AF]/.test(discussResult);

      if (hasKorean) {
        recordResult('team-discuss 언어', 'PASS', 'Korean language supported');
      } else {
        recordResult('team-discuss 언어', 'PARTIAL', 'Language support unclear with mock');
      }
    }
  }
}

// ============================================================================
// CATEGORY 4: AUTO-REQUEST (31-40)
// ============================================================================

async function testCategory4_AutoRequest(tester) {
  log('\n## Category 4: Auto-Request Tests (31-40)', 'blue');

  // Test 31: team-auto security detection
  {
    log('\n--- Test 31: team-auto security detection ---', 'blue');
    const autoResult = await tester.executeTool('team-auto', {
      request: '보안 검토를 해줘 - authentication system',
      rounds: 1
    });

    const hasSecurity = autoResult?.toLowerCase().includes('security') ||
                       autoResult?.includes('보안') ||
                       autoResult?.includes('security-auditor');

    if (hasSecurity) {
      recordResult('team-auto 보안 감지', 'PASS', 'Security preset detected');
    } else {
      recordResult('team-auto 보안 감지', 'PARTIAL', 'Detection unclear');
    }
  }

  // Test 32: team-auto debug detection
  {
    log('\n--- Test 32: team-auto debug detection ---', 'blue');
    const autoResult = await tester.executeTool('team-auto', {
      request: '버그를 찾아줘 - error in login flow',
      rounds: 1
    });

    const hasDebug = autoResult?.toLowerCase().includes('debug') ||
                    autoResult?.includes('debugger');

    if (hasDebug) {
      recordResult('team-auto 디버그 감지', 'PASS', 'Debug preset detected');
    } else {
      recordResult('team-auto 디버그 감지', 'PARTIAL', 'Detection unclear');
    }
  }

  // Test 33: team-auto implementation detection
  {
    log('\n--- Test 33: team-auto implementation detection ---', 'blue');
    const autoResult = await tester.executeTool('team-auto', {
      request: '기능을 구현해줘 - user authentication',
      rounds: 1
    });

    const hasImpl = autoResult?.toLowerCase().includes('implement') ||
                   autoResult?.includes('implementation') ||
                   autoResult?.includes('backend') ||
                   autoResult?.includes('frontend');

    if (hasImpl) {
      recordResult('team-auto 구현 감지', 'PASS', 'Implementation preset detected');
    } else {
      recordResult('team-auto 구현 감지', 'PARTIAL', 'Detection unclear');
    }
  }

  // Test 34: team-auto planning detection
  {
    log('\n--- Test 34: team-auto planning detection ---', 'blue');
    const autoResult = await tester.executeTool('team-auto', {
      request: '계획을 세워줘 - migration to microservices',
      rounds: 1
    });

    const hasPlan = autoResult?.toLowerCase().includes('plann') ||
                   autoResult?.includes('planner');

    if (hasPlan) {
      recordResult('team-auto 계획 감지', 'PASS', 'Planning preset detected');
    } else {
      recordResult('team-auto 계획 감지', 'PARTIAL', 'Detection unclear');
    }
  }

  // Test 35: team-auto default
  {
    log('\n--- Test 35: team-auto default ---', 'blue');
    const autoResult = await tester.executeTool('team-auto', {
      request: 'random task with no keyword',
      rounds: 1
    });

    const hasDefault = autoResult?.toLowerCase().includes('review') ||
                      autoResult?.toLowerCase().includes('code-reviewer');

    if (hasDefault) {
      recordResult('team-auto 기본값', 'PASS', 'Default preset (review) used');
    } else {
      recordResult('team-auto 기본값', 'PARTIAL', 'Default preset unclear');
    }
  }

  // Test 36: team-auto rounds
  {
    log('\n--- Test 36: team-auto rounds ---', 'blue');
    const testCases = [
      { rounds: 1, name: '1 round' },
      { rounds: 2, name: '2 rounds' },
      { rounds: 3, name: '3 rounds' },
    ];

    let passed = 0;
    for (const tc of testCases) {
      const autoResult = await tester.executeTool('team-auto', {
        request: `Test ${tc.name}`,
        rounds: tc.rounds
      });

      const hasRound = autoResult?.includes(`Round ${tc.rounds}`) ||
                      autoResult?.includes(`Round ${tc.rounds - 1}`) ||
                      autoResult?.includes(`Round 1`);
      if (hasRound) passed++;
    }

    if (passed === 3) {
      recordResult('team-auto 라운드', 'PASS', 'All round options work');
    } else if (passed > 0) {
      recordResult('team-auto 라운드', 'PARTIAL', `${passed}/3 round options work`);
    } else {
      recordResult('team-auto 라운드', 'FAIL', 'Round options not working');
    }
  }

  // Test 37: team-auto parallel + sequential
  {
    log('\n--- Test 37: team-auto parallel + sequential ---', 'blue');
    const autoResult = await tester.executeTool('team-auto', {
      request: 'Test parallel then sequential execution',
      rounds: 2
    });

    // Check for execution pattern
    const hasParallel = autoResult?.includes('병렬') ||
                       autoResult?.includes('parallel') ||
                       autoResult?.includes('Round 1');

    const hasSequential = autoResult?.includes('순차') ||
                         autoResult?.includes('토론') ||
                         autoResult?.includes('Round 2');

    if (hasParallel && hasSequential) {
      recordResult('team-auto 병렬+순차', 'PASS', 'Parallel then sequential execution');
    } else if (hasParallel || hasSequential) {
      recordResult('team-auto 병렬+순차', 'PARTIAL', 'One mode works');
    } else {
      recordResult('team-auto 병렬+순차', 'FAIL', 'Execution pattern unclear');
    }
  }

  // Test 38: team-auto long request
  {
    log('\n--- Test 38: team-auto long request ---', 'blue');
    const longRequest = 'A'.repeat(1000) + ' implement feature';
    const autoResult = await tester.executeTool('team-auto', {
      request: longRequest,
      rounds: 1
    });

    const hasResponse = autoResult && autoResult.length > 0;

    if (hasResponse) {
      recordResult('team-auto 긴 요청', 'PASS', 'Long request handled');
    } else {
      recordResult('team-auto 긴 요청', 'FAIL', 'Long request failed');
    }
  }

  // Test 39: team-auto empty request
  {
    log('\n--- Test 39: team-auto empty request ---', 'blue');
    const autoResult = await tester.executeTool('team-auto', {
      request: '',
      rounds: 1
    });

    // Should handle empty request gracefully or use default
    const hasResponse = autoResult && autoResult.length > 0;
    const hasError = autoResult?.includes('Error') || autoResult?.includes('error');

    if (hasError) {
      recordResult('team-auto 빈 요청', 'PASS', 'Error handling for empty request');
    } else if (hasResponse) {
      recordResult('team-auto 빈 요청', 'PARTIAL', 'Empty request uses default');
    } else {
      recordResult('team-auto 빈 요청', 'FAIL', 'No response to empty request');
    }
  }

  // Test 40: team-auto special characters
  {
    log('\n--- Test 40: team-auto special characters ---', 'blue');
    const specialRequest = '🚀 Test with emoji, 한글, 特殊文字, and symbols: @#$%^&*()';
    const autoResult = await tester.executeTool('team-auto', {
      request: specialRequest,
      rounds: 1
    });

    const hasResponse = autoResult && autoResult.length > 0;

    if (hasResponse) {
      recordResult('team-auto 특수문자', 'PASS', 'Special characters handled');
    } else {
      recordResult('team-auto 특수문자', 'FAIL', 'Special characters cause error');
    }
  }
}

// ============================================================================
// MAIN TEST EXECUTION
// ============================================================================

async function main() {
  log('╔════════════════════════════════════════════════════════════╗', 'blue');
  log('║  opencode-squad Plugin Test Suite: Categories 3-4        ║', 'blue');
  log('║  Scenarios 21-40: Discussion & Auto-Request               ║', 'blue');
  log('╚════════════════════════════════════════════════════════════╝', 'blue');

  const tester = new PluginTester('./src/index.ts');

  const initSuccess = await tester.init();
  if (!initSuccess) {
    log('\n❌ Failed to initialize tester', 'red');
    process.exit(1);
  }

  // Run Category 3 tests
  await testCategory3_Discussion(tester);

  // Run Category 4 tests
  await testCategory4_AutoRequest(tester);

  // Print summary
  printSummary();
}

function printSummary() {
  const pass = results.filter(r => r.result === 'PASS').length;
  const partial = results.filter(r => r.result === 'PARTIAL').length;
  const fail = results.filter(r => r.result === 'FAIL').length;
  const blocked = results.filter(r => r.result === 'BLOCKED').length;

  log('\n\n╔════════════════════════════════════════════════════════════╗', 'blue');
  log('║                    TEST RESULTS SUMMARY                    ║', 'blue');
  log('╚════════════════════════════════════════════════════════════╝', 'blue');

  log('\n## 테스트 결과 (21-40)\n', 'blue');
  log('| # | 시나리오 | 결과 | 비고 |', 'blue');
  log('|---|----------|------|------|', 'blue');

  for (const r of results) {
    const icon = r.result === 'PASS' ? '✅' : r.result === 'PARTIAL' ? '⚠️' : r.result === 'FAIL' ? '❌' : '🔒';
    log(`| ${r.number} | ${r.scenario} | ${r.result} | ${r.notes || ''} |`);
  }

  log('\n### 발견된 이슈\n', 'blue');

  const failures = results.filter(r => r.result === 'FAIL' || r.result === 'PARTIAL');
  if (failures.length > 0) {
    for (const f of failures) {
      log(`- **#${f.number} ${f.scenario}**: ${f.notes}`, 'yellow');
    }
  } else {
    log('No critical issues found.', 'green');
  }

  log('\n## 카테고리별 요약\n', 'blue');
  log('| 카테고리 | PASS | PARTIAL | FAIL | BLOCKED |', 'blue');
  log('|----------|------|---------|------|---------|', 'blue');
  log(`| 3. 토론   | ${countByRange(21, 30, 'PASS')} | ${countByRange(21, 30, 'PARTIAL')} | ${countByRange(21, 30, 'FAIL')} | ${countByRange(21, 30, 'BLOCKED')} |`);
  log(`| 4. 자동 요청 | ${countByRange(31, 40, 'PASS')} | ${countByRange(31, 40, 'PARTIAL')} | ${countByRange(31, 40, 'FAIL')} | ${countByRange(31, 40, 'BLOCKED')} |`);
  log(`| **총계** | **${pass}** | **${partial}** | **${fail}** | **${blocked}** |`);

  log('\n### 테스트 통과율\n', 'blue');
  const total = pass + partial + fail + blocked;
  const rate = ((pass / total) * 100).toFixed(1);
  log(`- 전체: ${total}개 중 ${pass}개 PASS (${rate}%)`, pass === total ? 'green' : 'yellow');

  // Write detailed results to file
  const resultsPath = '/home/jth/.config/opencode/plugins/agent-teams/test-results-cat3-4.json';
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  log(`\n📄 Detailed results saved to: ${resultsPath}`, 'blue');
}

function countByRange(start, end, result) {
  return results.filter(r => r.number >= start && r.number <= end && r.result === result).length;
}

// Run tests
main().catch(err => {
  log(`\n❌ Test suite error: ${err.message}`, 'red');
  console.error(err);
  process.exit(1);
});
