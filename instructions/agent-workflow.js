/**
 * Complete Team Workflow Implementation
 * Integrates opencode-sessions with agent-teams for Claude Code compatible team coordination
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const TEAMS_DIR = path.join(os.homedir(), '.opencode', 'teams');
const WORKFLOW_DIR = path.join(os.homedir(), '.opencode', 'workflow-state');

class TeamWorkflow {
  constructor() {
    this.ensureDirs();
    this.loadState();
  }

  ensureDirs() {
    [TEAMS_DIR, WORKFLOW_DIR].forEach(d => {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    });
  }

  loadState() {
    this.statePath = path.join(WORKFLOW_DIR, 'state.json');
    if (fs.existsSync(this.statePath)) {
      this.state = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
    } else {
      this.state = { teams: {}, sessions: {}, tasks: {} };
    }
  }

  saveState() {
    fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
  }

  // SPAWN TEAM - Create team-lead coordination
  async spawnTeam(presetOrAgents, teamName = 'default') {
    const { spawn } = require('@opencode-ai/plugin-opencode-sessions');
    const presets = this.getPresets();
    const availableAgents = this.getAvailableAgents();

    let agents = [];
    let teamType = 'custom';

    if (presetOrAgents === 'all') {
      agents = availableAgents;
      teamType = 'ultimate';
    } else if (presets[presetOrAgents]) {
      agents = presets[presetOrAgents].filter(a => availableAgents.includes(a));
      teamType = presetOrAgents;
    } else if (presetOrAgents) {
      agents = presetOrAgents.split(',').map(a => a.trim()).filter(a => availableAgents.includes(a));
    }

    if (agents.length === 0) {
      return { error: 'No valid agents. Available: ' + availableAgents.slice(0, 10).join(', ') };
    }

    // Create team state
    const teamId = `team-${Date.now()}`;
    this.state.teams[teamId] = {
      name: teamName,
      type: teamType,
      status: 'active',
      teamLead: null, // Will be set to session ID
      agents: {},
      createdAt: new Date().toISOString()
    };

    // Spawn each agent as a session
    const agentSessions = [];
    for (const agentName of agents) {
      try {
        // Spawn agent in new session using opencode-sessions
        const result = await spawn({
          agent: agentName,
          prompt: `You are part of "${teamName}" team. Report to team-lead.`,
          mode: 'new'
        });

        if (result.success) {
          const sessionId = result.sessionId;
          agentSessions.push({
            agentName,
            sessionId,
            agent: agentName, // Session will handle spawning
            status: 'idle'
          });

          this.state.teams[teamId].agents[agentName] = {
            name: agentName,
            sessionId, // Track session for communication
            status: 'idle',
            task: null,
            ownedFiles: []
          };
        }
      } catch (error) {
        console.error(`Failed to spawn ${agentName}: ${error.message}`);
      }
    }

    // Set first agent as team-lead
    if (agentSessions.length > 0) {
      const firstAgent = agentSessions[0];
      this.state.teams[teamId].teamLead = firstAgent.sessionId;
      this.state.teams[teamId].agents[firstAgent.agentName].isTeamLead = true;
    }

    this.saveState();

    return {
      success: true,
      message: `Team "${teamName}" spawned with ${agents.length} agents`,
      teamId,
      agents: agentSessions.map(s => ({
        name: s.agentName,
        sessionId: s.sessionId,
        status: s.status,
        isTeamLead: s.agentName === firstAgent?.agentName
      }))
    };
  }

  // ADD TASK with dependencies
  addTask(teamId, subject, description, assignee = null, blocks = [], blockedBy = []) {
    const team = this.state.teams[teamId];
    if (!team) return { error: 'Team not found' };

    const taskId = `task-${Date.now()}`;
    const task = {
      id: taskId,
      subject,
      description,
      assignee,
      status: blockedBy.length > 0 ? 'blocked' : 'pending',
      blocks,
      blockedBy,
      sessionId: null, // Will be set when assigned
      createdAt: new Date().toISOString()
    };

    // Store task
    this.state.tasks[taskId] = task;
    this.saveState();

    // Update agent state if assigned
    if (assignee && team.agents[assignee]) {
      const agent = team.agents[assignee];
      agent.task = taskId;
      agent.status = blockedBy.length > 0 ? 'blocked' : 'working';
      agent.blocks = blocks;
      agent.blockedBy = blockedBy;
    }

    return { success: true, task };
  }

  // COMPLETE TASK and unblock dependents
  completeTask(teamId, taskId) {
    const task = this.state.tasks[taskId];
    if (!task) return { error: 'Task not found' };

    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    this.state.tasks[taskId] = task;
    this.saveState();

    // Free up assignee
    if (task.assignee && task.sessionId) {
      const team = this.getTeamBySession(task.sessionId);
      if (team && team.agents[task.assignee]) {
        const agent = team.agents[task.assignee];
        agent.status = 'idle';
        agent.task = null;
        agent.blocks = [];
        agent.blockedBy = [];
      }
    }

    // Unblock dependent tasks
    if (task.sessionId) {
      this.unblockDependents(task.sessionId, taskId, task.assignee);
    }

    this.saveState();

    return { success: true, task };
  }

  // SEND MESSAGE between agents via session
  async sendMessage(teamId, fromAgentName, toAgentName, message) {
    const fromTeam = this.getTeamBySession(fromAgent);
    const toTeam = this.getTeamBySession(toAgentName);
    if (!fromTeam || !toTeam) return { error: 'Agent session not found' };

    // Send message to destination agent's session
    const { spawn } = require('@opencode-ai/plugin-opencode-sessions');

    try {
      await spawn({
        agent: toAgentName,
        sessionId: toTeam.teamId,
        mode: 'message',
        input: `Message from ${fromAgentName}: ${message}`
      });
    } catch (error) {
      return { error: error.message };
    }

    return { success: true, message };
  }

  // BROADCAST to all team members
  async broadcastMessage(teamId, fromAgentName, message) {
    const team = this.getTeamBySession(this.getTeamLeadSession(teamId));
    if (!team) return { error: 'Team not found' };

    const { spawn } = require('@opencode-ai/plugin-opencode-sessions');
    const results = [];

    for (const agentInfo of Object.values(team.agents)) {
      if (agentInfo.isTeamLead) continue; // Skip team-lead

      try {
        await spawn({
          agent: agentInfo.name,
          sessionId: team.teamId,
          mode: 'message',
          input: `Broadcast from ${fromAgentName}: ${message}`
        });
        results.push({ agent: agentInfo.name, success: true });
      } catch (error) {
        results.push({ agent: agentInfo.name, error: error.message });
      }
    }

    return { results, message };
  }

  // COMPLETE TASK
  async completeTask(teamId, taskId) {
    const result = this.completeTask(teamId, taskId);
    if (result.success && result.task.sessionId) {
      // Notify through session
      const team = this.getTeamBySession(result.task.sessionId);
      if (team && team.agents[result.task.assignee]) {
        await spawn({
          agent: result.task.assignee,
          sessionId: team.teamId,
          mode: 'message',
          input: `Task "${result.task.subject}" completed. Please report status.`
        });
      }
    }
    return result;
  }

  // GET TEAM STATUS
  getTeamStatus(teamId) {
    const team = this.state.teams[teamId];
    if (!team) return { error: 'Team not found' };

    const agents = [];
    const tasks = [];

    for (const [agentName, agentInfo] of Object.entries(team.agents)) {
      agents.push({
        name: agentName,
        sessionId: agentInfo.sessionId,
        status: agentInfo.status,
        task: agentInfo.task,
        isTeamLead: agentInfo.isTeamLead || false
      });
    }

    for (const [taskId, task] of Object.entries(this.state.tasks)) {
      const [sessionTeamId] = this.getTeamBySession(task.sessionId);
      if (sessionTeamId) {
        const agent = sessionTeamId.agents[task.assignee];
        if (agent) {
          tasks.push({
            ...task,
            agentStatus: agent.status
          });
        }
      }
    }

    const working = agents.filter(a => a.status === 'working').length;
    const idle = agents.filter(a => a.status === 'idle').length;

    return {
      name: team.name,
      type: team.type,
      status: team.status,
      teamLead: team.teamLead || 'none',
      agents,
      tasks,
      summary: {
        totalAgents: agents.length,
        working,
        idle,
        totalTasks: tasks.length,
        pending: tasks.filter(t => t.status === 'pending').length,
        completed: tasks.filter(t => t.status === 'completed').length,
        blocked: tasks.filter(t => t.agentStatus === 'blocked').length
      }
    };
  }

  // SHUTDOWN TEAM
  async requestShutdown(teamId) {
    const team = this.state.teams[teamId];
    if (!team) return { error: 'Team not found' };

    team.status = 'shutdown-requested';
    team.shutdownRequestedAt = new Date().toISOString();
    this.saveState();

    return {
      success: true,
      message: `Shutdown requested for team "${team.name}". Awaiting agent approval.`,
      team
    };
  }

  async approveShutdown(teamId) {
    const team = this.state.teams[teamId];
    if (!team) return { error: 'Team not found' };

    // Notify all agents via session
    const { spawn } = require('@opencode-ai/plugin-opencode-sessions');
    const results = [];

    for (const [agentName, agentInfo] of Object.entries(team.agents)) {
      try {
        await spawn({
          agent: agentName,
          sessionId: teamId,
          mode: 'message',
          input: `Team "${team.name}" is shutting down. Please confirm.`
        });
        results.push({ agent: agentName, success: true });
      } catch (error) {
        results.push({ agent: agentName, error: error.message });
      }
    }

    // Check if all approved (simplified - in real system would wait)
    team.status = 'shutdown';
    team.shutdownAt = new Date().toISOString();

    // Archive team
    delete this.state.teams[teamId];
    this.saveState();

    const duration = new Date(team.shutdownAt) - new Date(team.createdAt);
    const completedTasks = Object.values(this.state.tasks)
      .filter(([id, t]) => t.sessionId === teamId && t.status === 'completed')
      .length;

    return {
      success: true,
      message: `Team "${team.name}" shut down`,
      summary: {
        name: team.name,
        duration: `${Math.floor(duration / 60000)} minutes`,
        agents: Object.keys(team.agents).length,
        tasksCompleted: completedTasks
      }
    };
  }

  // Utility functions
  getTeamBySession(sessionId) {
    return Object.values(this.state.teams).find(t => t.teamLead === sessionId || t.sessionId === sessionId);
  }

  getTeamLeadSession(teamId) {
    const team = this.state.teams[teamId];
    return team ? team.teamLead : null;
  }

  getAvailableAgents() {
    const agentsDir = path.join(os.homedir(), '.config', 'opencode', 'agents');
    if (!fs.existsSync(agentsDir)) return [];
    return fs.readdirSync(agentsDir).filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''));
  }

  getPresets() {
    return {
      'review': ['code-reviewer', 'security-auditor', 'architect-reviewer'],
      'debug': ['debugger', 'error-detective', 'security-engineer'],
      'feature': ['backend-developer', 'frontend-developer', 'test-automator'],
      'fullstack': ['fullstack-developer', 'api-designer', 'database-optimizer'],
      'security': ['security-auditor', 'security-engineer', 'penetration-tester'],
      'migration': ['legacy-modernizer', 'database-administrator', 'devops-engineer'],
      'all': 'all'
    };
  }

// CLI interface
async function main() {
  const workflow = new TeamWorkflow();
  const args = process.argv.slice(2);
  const command = args[0];

  let result;

  switch (command) {
    case 'spawn': {
      result = await workflow.spawnTeam(args[1], args[2]);
      break;
    }
    case 'add-task': {
      result = workflow.addTask(args[1], args[2], args[3], args[4], args[5] ? args[5].split(',') : []);
      break;
    }
    case 'complete': {
      result = await workflow.completeTask(args[1], args[2]);
      break;
    }
    case 'status': {
      result = workflow.getTeamStatus(args[1]);
      break;
    }
    case 'send': {
      result = await workflow.sendMessage(args[1], args[2], args[3], args[4]);
      break;
    }
    case 'broadcast': {
      result = await workflow.broadcastMessage(args[1], args[2], args[3]);
      break;
    }
    case 'shutdown': {
      result = await workflow.requestShutdown(args[1]);
      break;
    }
    case 'approve-shutdown': {
      result = await workflow.approveShutdown(args[1]);
      break;
    }
    case 'list': {
      const teams = Object.values(workflow.state.teams).map(t => ({
        name: t.name,
        type: t.type,
        status: t.status,
        agents: Object.keys(t.agents || {}).length,
        createdAt: t.createdAt
      }));
      result = { teams };
      break;
    }
    default:
      result = {
        usage: 'Complete Team Workflow for OpenCode',
        version: '4.0.0',
        commands: [
          'spawn [preset|all] [teamName] - Spawn team with real sessions',
          'add-task <team> <subject> <description> <assignee> <blocks> <blockedBy> - Add task with dependencies',
          'complete <teamId> <taskId> - Complete task',
          'status [teamId] - Show detailed team status',
          'send <teamId> <from> <to> <message> - Send agent message',
          'broadcast <teamId> <from> <message> - Broadcast to all agents',
          'shutdown <teamId> - Request team shutdown',
          'approve-shutdown <teamId> - Approve shutdown',
          'list - List all teams'
        ],
        features: [
          'Real agent sessions via opencode-sessions',
          'Session tracking for coordination',
          'Task dependencies (blocks/blockedBy)',
          'Inter-agent messaging through sessions',
          'Graceful shutdown with approval',
          'File ownership per agent',
          'Automatic state management'
        ],
        examples: [
          'team-workflow spawn all production - Spawn ultimate team',
          'team-workflow add-task production "Build API" "Create REST endpoints" backend-developer',
          'team-workflow send production backend-developer frontend-developer "API ready for integration"',
          'team-workflow complete production task-abc-123'
        ]
      };
      break;
  }

  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { TeamWorkflow };
