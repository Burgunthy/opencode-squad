# Agent Routing Guide

You have 128 specialized subagents. Use this guide to pick the right one(s) for each task.

## Model Tiers

| Tier | Model | Cost | Use for |
|---|---|---|---|
| **Premium** | glm-5 | Highest | Critical decisions: security, architecture, finance, coordination |
| **Standard** | glm-4.7 | Medium | Implementation: coding, debugging, testing, devops |
| **Fast** | glm-4.5-flash | Lowest | Research, docs, analysis, lightweight ops |

## Tool Capability Classes

| Class | Tools | Can do |
|---|---|---|
| **Full** | read, write, edit, bash, glob, grep | Read code, write code, run commands |
| **Full + Web** | Full + webfetch, websearch | Everything + internet access |
| **Read + Write** | read, write, edit, glob, grep | Read/write files but NO bash |
| **Read + Bash** | read, bash, glob, grep | Read files, run commands, but NO write/edit |
| **Read + Web** | read, glob, grep, webfetch, websearch | Read files + internet, but NO write/bash |
| **Read-only** | read, glob, grep | Can only read files, nothing else |

## Selection Rules

1. **Match by language/framework first** - `django-developer` over `python-pro` for Django; `nextjs-developer` over `react-specialist` for Next.js
2. **Use glm-5 for critical decisions** - security audits, architecture reviews, financial systems
3. **Use glm-4.5-flash for research** - they're cheap and often have web access
4. **Prefer specific over general** - `postgres-pro` over `database-administrator` for PostgreSQL tuning
5. **Check tool class before delegating** - read-only agents cannot fix things; `security-auditor` finds issues, `security-engineer` fixes them
6. **Chain agents for complex tasks** - architect designs, then language-specific agent implements
7. **Don't use glm-5 agents for routine coding** - save premium tier for judgment calls

---

## Languages & Frameworks

Pick by the project's language and framework.

| Agent | Model | Tools | When to use |
|---|---|---|---|
| `python-pro` | glm-4.7 | Full | General Python: scripts, packages, type safety, async |
| `django-developer` | glm-4.7 | Full | Django projects: ORM, views, DRF, migrations |
| `javascript-pro` | glm-4.7 | Full | Vanilla JS, ES2023+, Node.js, browser APIs |
| `typescript-pro` | glm-4.7 | Full | TypeScript: advanced types, full-stack TS |
| `nextjs-developer` | glm-4.7 | Full | Next.js 14+: App Router, RSC, server actions |
| `react-specialist` | glm-4.7 | Full | React 18+: hooks, performance, state management |
| `angular-architect` | glm-4.7 | Full | Angular 15+: RxJS, NgRx, micro-frontends |
| `vue-expert` | glm-4.7 | Full | Vue 3: Composition API, Nuxt 3 |
| `golang-pro` | glm-4.7 | Full | Go: concurrency, cloud-native, microservices |
| `rust-engineer` | glm-4.7 | Full | Rust: ownership, async, zero-cost abstractions |
| `cpp-pro` | glm-4.7 | Full | C++20/23: templates, systems programming |
| `java-architect` | glm-4.7 | Full | Java: Spring, reactive, enterprise patterns |
| `kotlin-specialist` | glm-4.7 | Full | Kotlin: coroutines, multiplatform, Android |
| `spring-boot-engineer` | glm-4.7 | Full | Spring Boot 3+: microservices, Spring Cloud |
| `csharp-developer` | glm-4.7 | Full | C# 12: ASP.NET Core, Blazor |
| `dotnet-core-expert` | glm-4.7 | Full | .NET 10: minimal APIs, cross-platform |
| `dotnet-framework-4.8-expert` | glm-4.7 | Full | Legacy .NET: Web Forms, WCF, Windows Services |
| `rails-expert` | glm-4.7 | Full | Rails 8.1: Hotwire, Turbo, Action Cable |
| `php-pro` | glm-4.7 | Full | PHP 8.3+: Laravel, Symfony, strong typing |
| `laravel-specialist` | glm-4.7 | Full | Laravel 10+: Eloquent, queues, enterprise features |
| `wordpress-master` | glm-4.7 | Full + Web | WordPress: themes, plugins, multisite, scaling |
| `swift-expert` | glm-4.7 | Full | Swift 5.9+: SwiftUI, async/await, server-side |
| `elixir-expert` | glm-4.7 | Full | Elixir: OTP, Phoenix, LiveView, BEAM VM |
| `flutter-expert` | glm-4.7 | Full | Flutter 3+: cross-platform, animations, native integrations |
| `mobile-developer` | glm-4.7 | Full | React Native & Flutter: cross-platform mobile |
| `mobile-app-developer` | glm-4.7 | Full | Native iOS/Android: platform-specific excellence |

### How to choose
- **Django project?** `django-developer`. **General Python?** `python-pro`
- **Next.js?** `nextjs-developer`. **Pure React?** `react-specialist`. **General JS?** `javascript-pro`
- **Spring Boot?** `spring-boot-engineer`. **General Java?** `java-architect`
- **Laravel?** `laravel-specialist`. **General PHP?** `php-pro`. **WordPress?** `wordpress-master`
- **.NET Core?** `dotnet-core-expert`. **Legacy .NET?** `dotnet-framework-4.8-expert`. **General C#?** `csharp-developer`

---

## Architecture & Design

Pick by scope of the design task.

| Agent | Model | Tools | When to use |
|---|---|---|---|
| `architect-reviewer` | **glm-5** | Full | System design validation, tech stack decisions |
| `microservices-architect` | **glm-5** | Full | Distributed systems, service boundaries |
| `graphql-architect` | **glm-5** | Full | GraphQL schema design, federation |
| `api-designer` | glm-4.7 | Full | REST/GraphQL API design, OpenAPI specs |
| `fullstack-developer` | glm-4.7 | Full | End-to-end features: DB to UI |
| `backend-developer` | glm-4.7 | Full | Server-side: APIs, microservices |
| `frontend-developer` | glm-4.7 | Full | UI: React components, web standards |

### How to choose
- **Reviewing an existing architecture?** `architect-reviewer` (glm-5)
- **Designing a new distributed system?** `microservices-architect` (glm-5)
- **Designing an API?** `api-designer`. **GraphQL specifically?** `graphql-architect` (glm-5)
- **Building a complete feature?** `fullstack-developer`

---

## Infrastructure & DevOps

Pick by platform or operation type.

| Agent | Model | Tools | When to use |
|---|---|---|---|
| `cloud-architect` | **glm-5** | Full | Multi-cloud strategy, AWS/Azure/GCP |
| `platform-engineer` | **glm-5** | Full | Internal dev platforms, golden paths |
| `kubernetes-specialist` | glm-4.7 | Full | K8s: clusters, deployments, security |
| `terraform-engineer` | glm-4.7 | Full | IaC: Terraform modules, state management |
| `devops-engineer` | glm-4.7 | Full | CI/CD, containerization, general ops |
| `deployment-engineer` | glm-4.5-flash | Full | Release strategies: blue-green, canary |
| `sre-engineer` | glm-4.7 | Full | Reliability: SLOs, chaos testing, toil reduction |
| `azure-infra-engineer` | glm-4.7 | Full | Azure: Bicep, Az modules, identity |
| `network-engineer` | glm-4.7 | Full | Cloud/hybrid networking, zero-trust |
| `build-engineer` | glm-4.5-flash | Full | Build systems, compilation, caching |

### How to choose
- **Cloud strategy or multi-cloud?** `cloud-architect` (glm-5)
- **Kubernetes?** `kubernetes-specialist`. **Terraform?** `terraform-engineer`
- **Azure specifically?** `azure-infra-engineer`
- **CI/CD pipelines?** `devops-engineer`. **Release process?** `deployment-engineer`

---

## Database

Pick by engine or task type.

| Agent | Model | Tools | When to use |
|---|---|---|---|
| `postgres-pro` | glm-4.7 | Full | PostgreSQL: admin, HA, internals |
| `sql-pro` | glm-4.7 | Full | Complex SQL across Postgres/MySQL/MSSQL/Oracle |
| `database-administrator` | glm-4.7 | Full | General DBA: any engine, disaster recovery |
| `database-optimizer` | glm-4.7 | Full | Query performance, execution plans, indexing |

### How to choose
- **PostgreSQL?** `postgres-pro`. **Complex SQL across engines?** `sql-pro`
- **Performance tuning?** `database-optimizer`. **General admin?** `database-administrator`

---

## Security

Pick by depth and whether you need fixes or just findings.

| Agent | Model | Tools | When to use |
|---|---|---|---|
| `security-auditor` | **glm-5** | **Read-only** | Compliance audits, vulnerability assessment. **Cannot write fixes** |
| `compliance-auditor` | **glm-5** | **Read-only** | GDPR, HIPAA, PCI DSS, SOC 2. **Cannot write fixes** |
| `security-engineer` | **glm-5** | Full | DevSecOps, can find AND fix security issues |
| `penetration-tester` | **glm-5** | **Read + Bash** | Offensive testing, exploit validation. Can run tools but **cannot edit files** |
| `ad-security-reviewer` | **glm-5** | Full | Active Directory security, identity config |
| `powershell-security-hardening` | **glm-5** | Full | Windows/PowerShell security baselines |

### How to choose
- **Need a security report?** `security-auditor` (read-only, finds issues)
- **Need security fixes applied?** `security-engineer` (full access, finds AND fixes)
- **Penetration test?** `penetration-tester` (can run exploit tools, can't edit code)
- **Compliance check?** `compliance-auditor` (read-only)
- **Chain them**: `security-auditor` audits, then `security-engineer` fixes what was found

---

## Quality & Testing

| Agent | Model | Tools | When to use |
|---|---|---|---|
| `code-reviewer` | **glm-5** | Full | Code quality, design patterns, tech debt |
| `test-automator` | glm-4.7 | Full | Test framework setup, automation |
| `qa-expert` | glm-4.7 | **Read + Bash** | Test strategy, quality processes. Can run tests but **cannot edit** |
| `debugger` | glm-4.7 | Full | Systematic debugging, root cause analysis |
| `error-detective` | glm-4.7 | Full | Error pattern analysis, distributed debugging |
| `refactoring-specialist` | glm-4.7 | Full | Safe code transformation, design patterns |
| `dx-optimizer` | glm-4.7 | Full | Build performance, dev tooling, workflow |
| `dependency-manager` | glm-4.5-flash | Full | Package management, supply chain security |
| `legacy-modernizer` | glm-4.7 | Full | Incremental migration, legacy refactoring |
| `accessibility-tester` | glm-4.5-flash | **Read + Bash** | WCAG compliance, screen reader testing. **Cannot edit** |

### How to choose
- **Code review?** `code-reviewer` (glm-5, thorough)
- **Writing tests?** `test-automator`. **Test strategy?** `qa-expert` (can't edit)
- **Bug hunting?** `debugger` for systematic, `error-detective` for pattern analysis
- **Refactoring safely?** `refactoring-specialist`. **Modernizing legacy?** `legacy-modernizer`

---

## Data & ML

| Agent | Model | Tools | When to use |
|---|---|---|---|
| `data-engineer` | glm-4.7 | Full | Pipelines, ETL/ELT, Spark, Airflow |
| `data-scientist` | glm-4.7 | Full | Statistical analysis, predictive modeling |
| `data-analyst` | glm-4.5-flash | Full | BI, dashboards, SQL analysis |
| `machine-learning-engineer` | glm-4.7 | Full | Model deployment, serving, edge inference |
| `ml-engineer` | glm-4.7 | Full | ML lifecycle: training to serving |
| `mlops-engineer` | glm-4.7 | Full | ML infrastructure, CI/CD for ML |

### How to choose
- **Building data pipelines?** `data-engineer`. **Analyzing data?** `data-analyst` (cheap) or `data-scientist` (deeper)
- **Deploying models?** `machine-learning-engineer`. **ML infrastructure?** `mlops-engineer`

---

## AI & LLM

| Agent | Model | Tools | When to use |
|---|---|---|---|
| `ai-engineer` | **glm-5** | Full | AI system design, multi-framework |
| `llm-architect` | **glm-5** | Full | LLM deployment, fine-tuning, serving |
| `prompt-engineer` | glm-4.7 | Full | Prompt optimization, evaluation |
| `nlp-engineer` | glm-4.7 | Full | NLP pipelines, transformers, multilingual |
| `mcp-developer` | glm-4.7 | Full | MCP server/client development |

### How to choose
- **Designing an AI system?** `ai-engineer` (glm-5). **LLM specifically?** `llm-architect` (glm-5)
- **Prompt work?** `prompt-engineer`. **NLP pipeline?** `nlp-engineer`
- **Building MCP integrations?** `mcp-developer`

---

## Research & Web

All have web access. Use for information gathering, NOT implementation.

| Agent | Model | Tools | When to use |
|---|---|---|---|
| `search-specialist` | glm-4.5-flash | **Read + Web** | General information retrieval |
| `data-researcher` | glm-4.5-flash | **Read + Web** | Data mining, pattern discovery |
| `market-researcher` | glm-4.5-flash | **Read + Web** | Market sizing, consumer insights |
| `competitive-analyst` | glm-4.5-flash | **Read + Web** | Competitor intelligence, SWOT |
| `trend-analyst` | glm-4.5-flash | **Read + Web** | Emerging patterns, forecasting |
| `research-analyst` | glm-4.7 | **Read + Web** | General research synthesis |
| `seo-specialist` | glm-4.5-flash | **Read + Web** | Technical SEO, content optimization |
| `ux-researcher` | glm-4.7 | **Read + Web** | User insights, usability |

### How to choose
- **General web research?** `search-specialist` (cheapest)
- **Market/competitor intel?** `market-researcher` or `competitive-analyst`
- **Need deeper analysis?** `research-analyst` (glm-4.7, more capable)
- None of these can write code. Chain with an implementation agent if needed.

---

## Business & Product

| Agent | Model | Tools | When to use |
|---|---|---|---|
| `business-analyst` | glm-4.7 | Full + Web | Requirements, process improvement |
| `product-manager` | glm-4.5-flash | Read/Write + Web | Product strategy, roadmaps |
| `project-manager` | glm-4.5-flash | Read/Write + Web | Project delivery, resource planning |
| `scrum-master` | glm-4.5-flash | Read/Write + Web | Agile processes, team facilitation |
| `sales-engineer` | glm-4.7 | Read/Write + Web | Technical pre-sales, demos |
| `customer-success-manager` | glm-4.7 | Read/Write + Web | Customer retention, account health |
| `legal-advisor` | glm-4.7 | Read/Write + Web | Tech law, compliance, contracts |
| `content-marketer` | glm-4.5-flash | Read/Write + Web | Content strategy, SEO marketing |

---

## Documentation

| Agent | Model | Tools | When to use |
|---|---|---|---|
| `documentation-engineer` | glm-4.5-flash | Read/Write + Web | Doc systems, doc-as-code |
| `api-documenter` | glm-4.5-flash | Read/Write + Web | OpenAPI specs, API portals |
| `technical-writer` | glm-4.5-flash | Read/Write + Web | Guides, tutorials, general writing |

---

## Coordination & Orchestration

Use these to manage multi-agent workflows. None have bash access.

| Agent | Model | Tools | When to use |
|---|---|---|---|
| `multi-agent-coordinator` | **glm-5** | **Read + Write** | Complex multi-agent orchestration |
| `workflow-orchestrator` | **glm-5** | **Read + Write** | Process automation, state machines |
| `agent-organizer` | glm-4.7 | **Read + Write** | Team assembly, task decomposition |
| `task-distributor` | glm-4.5-flash | **Read + Write** | Work allocation, load balancing |
| `context-manager` | glm-4.7 | **Read + Write** | State management across agents |
| `error-coordinator` | glm-4.7 | **Read + Write** | Distributed error handling, recovery |
| `knowledge-synthesizer` | glm-4.7 | **Read + Write** | Cross-agent learning, pattern extraction |
| `performance-monitor` | glm-4.5-flash | **Read + Write** | System metrics, agent performance |

---

## Windows & PowerShell

| Agent | Model | Tools | When to use |
|---|---|---|---|
| `windows-infra-admin` | glm-4.7 | Full | AD, DNS, DHCP, GPO, server admin |
| `powershell-7-expert` | glm-4.7 | Full | Cross-platform PS7+, cloud automation |
| `powershell-5.1-expert` | glm-4.7 | Full | Legacy Windows PS, RSAT modules |
| `powershell-module-architect` | glm-4.7 | Full | PS module design, cross-version compat |
| `powershell-security-hardening` | **glm-5** | Full | PS security baselines, compliance |
| `powershell-ui-architect` | glm-4.7 | Full | WinForms, WPF, TUI frameworks |
| `m365-admin` | glm-4.7 | Full | Exchange Online, Teams, SharePoint, Graph API |
| `it-ops-orchestrator` | glm-4.7 | Full | IT ops routing across PS/.NET/Azure/M365 |

### How to choose
- **Windows server/AD?** `windows-infra-admin`. **M365?** `m365-admin`
- **PowerShell 7?** `powershell-7-expert`. **Legacy PS 5.1?** `powershell-5.1-expert`
- **PS module design?** `powershell-module-architect`. **PS security?** `powershell-security-hardening` (glm-5)

---

## Specialty

| Agent | Model | Tools | When to use |
|---|---|---|---|
| `fintech-engineer` | **glm-5** | Full | Financial systems, regulatory compliance |
| `payment-integration` | **glm-5** | Full | Payment gateways, PCI compliance |
| `quant-analyst` | **glm-5** | Full | Algorithmic trading, derivatives, risk analytics |
| `risk-manager` | **glm-5** | Full | Risk assessment, stress testing |
| `blockchain-developer` | glm-4.7 | Full | Smart contracts, DeFi, Web3 |
| `game-developer` | glm-4.7 | Full | Game engines, graphics, multiplayer |
| `embedded-systems` | glm-4.7 | Full | Microcontrollers, RTOS, firmware |
| `iot-engineer` | glm-4.7 | Full | Connected devices, edge computing |
| `electron-pro` | glm-4.7 | Full | Desktop apps: Electron, native OS integration |
| `websocket-engineer` | glm-4.7 | Full | Real-time: WebSockets, event-driven |
| `slack-expert` | glm-4.7 | Full + Web | Slack apps: Bolt, Block Kit, events |
| `chaos-engineer` | glm-4.7 | Full | Failure injection, resilience testing |
| `cli-developer` | glm-4.7 | Full | CLI tools, terminal applications |
| `tooling-engineer` | glm-4.7 | Full | Developer tools, plugin systems |
| `devops-incident-responder` | glm-4.7 | Full | Production incidents, root cause analysis |
| `incident-responder` | glm-4.7 | Full | Security incidents, forensics |

---

## Common Multi-Agent Patterns

### Security Review + Fix
1. `security-auditor` (glm-5, read-only) - finds vulnerabilities
2. `security-engineer` (glm-5, full) - applies fixes

### Architecture + Implementation
1. `architect-reviewer` (glm-5) - designs the approach
2. Language-specific agent (glm-4.7) - implements it

### Research + Build
1. `search-specialist` or `research-analyst` - gathers context
2. Implementation agent - builds the solution

### Code Review + Refactor
1. `code-reviewer` (glm-5) - identifies issues
2. `refactoring-specialist` (glm-4.7) - applies improvements

### Full-Stack Feature
1. `api-designer` - defines the API contract
2. `backend-developer` - implements the API
3. `frontend-developer` - builds the UI
4. `test-automator` - writes tests
