# Epic Workflow - Standard Operating Procedure

## Purpose

This document defines the **standard pattern** for organizing large development tasks using the DevOps multi-agent system. Once you understand this pattern, it applies to **all future work** without needing re-explanation.

---

## Core Pattern: Epic → Sub-Issues → Agents

### The One Rule

**Every multi-phase project follows this structure:**

```
1 Epic Issue = 1 Large Project
  ├── N Sub-Issues = N Independent Tasks
  │     ├── 1 Sub-Issue = 1 Agent = 1 Worktree = 1 PR
  │     └── Dual metadata: tmux env + GitHub comment
  └── Progress tracking in Epic body
```

---

## When to Use This Pattern

### ✅ Use Epic Workflow When:

- Task has **3+ subtasks** that can be parallelized
- Task will take **multiple days/weeks**
- Multiple people/agents could work on it simultaneously
- You want **traceability** and progress tracking
- Recovery/resumption is important

**Examples:**

- "Implement CICD Testing Infrastructure" (9 subtasks)
- "Add multi-language support" (5 subtasks for different languages)
- "Refactor authentication system" (4 subtasks for different modules)
- "Build new analytics dashboard" (6 subtasks for different charts)

### ❌ Don't Use Epic Workflow When:

- Single task, single file, <1 hour
- No parallelization possible (sequential dependencies)
- Trivial bug fix or typo correction

**Examples:**

- "Fix typo in README"
- "Update dependency version"
- "Change button color"

---

## Standard Structure

### Epic Issue Template

**Title Format:** `[EPIC] <Project Name>`

**Example:** `[EPIC] Implement CICD Testing Infrastructure`

**Body Template:**

```markdown
# <Project Name>

## Goal

<1-2 sentence description of what this epic achieves>

**Work Repository**: <org/repo> (if different from tracking repo)

## Success Metrics

- [ ] <Quantifiable metric 1>
- [ ] <Quantifiable metric 2>
- [ ] <Quantifiable metric 3>

## Phases

### Phase 1: <Phase Name>

<Description of phase approach>
- [ ] #<issue-number> - <Sub-issue title>
- [ ] #<issue-number> - <Sub-issue title>
- **Status**: ⏸️ Not Started / 🔄 In Progress / ✅ Complete

### Phase 2: <Phase Name>

<Description of phase approach>
- [ ] #<issue-number> - <Sub-issue title>
- [ ] #<issue-number> - <Sub-issue title>
- **Status**: ⏸️ Waiting for Phase 1

### Phase N: <Phase Name>

...

## Progress

<X>/<Total> sub-issues completed (<Y>%)

## Notes

<Any important context, decisions, or dependencies>
```

**Labels:** `epic`, `<project-area>`, `<priority>`

---

### Sub-Issue Template

**Title Format:** `<Action> <specific task>`

**Example:** `Implement test_agent_spawning.rs`

**Body Template:**

```markdown
# <Task Title>

**Epic**: #<epic-number> <Epic Title>
**Phase**: <N> - <Phase Name>
**Estimated Time**: <X hours/days>
**Dependencies**: <What must be done first>
**Work Repository**: <org/repo> (if different from tracking repo)

## Goal

<1-2 sentences describing what this specific task accomplishes>

## Context

- Parent epic: #<epic-number>
- <Any relevant background information>
- <Links to relevant files or documentation>

## Tasks

<Detailed breakdown of what needs to be done>

### Subtask 1: <Name>

**What**: <Description>

**Steps**:

1. <Step 1>
2. <Step 2>
3. <Step 3>

**Expected**: <Expected outcome>

---

### Subtask 2: <Name>

...

## Acceptance Criteria

- [ ] <Criterion 1>
- [ ] <Criterion 2>
- [ ] <Criterion 3>
- [ ] Code follows style guide (cargo fmt, clippy, eslint)
- [ ] Tests passing locally
- [ ] PR created referencing this issue

## Implementation Notes

<Any code snippets, patterns to follow, or gotchas to watch out for>

## Questions/Blockers

- ❓ <Question 1>
- ❓ <Question 2>

## Agent Assignment

**Agent Type**: <claude/aider/gemini/ollama/vllm>
**Session**: handy-agent-<issue-number>
**Worktree**: handy-worktrees/issue-<issue-number>
**Started**: [Will be filled when agent spawns]
```

**Labels:** `agent-ready`, `<project-area>`, `phase-<N>`

---

## Workflow Steps

### Step 1: Create Epic Issue

1. Open GitHub → Issues → New Issue
2. Title: `[EPIC] <Project Name>`
3. Use Epic template above
4. Add labels: `epic`, `<area>`, `<priority>`
5. Create issue → Note the issue number (e.g., #100)

### Step 2: Break Down into Sub-Issues

1. Identify all independent tasks (aim for 2-8 hours each)
2. For each task, create sub-issue using template
3. Reference epic in body: `**Epic**: #100`
4. Add labels: `agent-ready`, `phase-<N>`
5. Note sub-issue numbers (e.g., #101, #102, #103...)

### Step 3: Update Epic with Sub-Issue Numbers

Edit epic body to link all sub-issues:

```markdown
### Phase 2: Integration Tests

- [ ] #101 - Implement test_agent_spawning.rs
- [ ] #102 - Implement test_pr_workflow.rs
- [ ] #103 - Implement test_session_recovery.rs
```

### Step 4: Spawn Agents (Parallel or Sequential)

**For parallel tasks** (no dependencies):

```bash
spawn_agent --issue=101 --agent-type=claude
spawn_agent --issue=102 --agent-type=claude
spawn_agent --issue=103 --agent-type=aider
```

**For sequential tasks** (dependencies):

```bash
spawn_agent --issue=101 --agent-type=claude
# Wait for #101 to complete, then:
spawn_agent --issue=102 --agent-type=claude
```

### Step 5: Monitor Progress

**In Handy DevOps UI:**

- View "Active Agents" dashboard
- Filter by local/remote/all
- See which agents are working on which issues

**In GitHub:**

- Epic issue shows checkboxes for completion
- Sub-issues show agent metadata in comments
- PRs reference sub-issues via "Closes #X"

### Step 6: Review & Merge Agent PRs

When agent completes work:

1. Agent creates PR with "Closes #X" in body
2. You review code quality
3. Run tests locally if needed
4. Request changes → Agent fixes in same worktree
5. Approve & merge
6. Sub-issue auto-closes
7. Update epic progress manually or via automation

### Step 7: Epic Completion

When all sub-issues closed:

1. Verify all acceptance criteria met
2. Update epic status to ✅ Complete
3. Close epic issue
4. Celebrate! 🎉

---

## Dual-Layer Metadata (Automatic)

When you spawn an agent, the system **automatically** creates dual metadata:

### Layer 1: tmux Environment (Local, Fast Recovery)

```bash
HANDY_ISSUE_REF="org/Handy#101"
HANDY_EPIC_REF="org/Handy#100"
HANDY_WORKTREE="/path/to/handy-worktrees/issue-101"
HANDY_AGENT_TYPE="claude"
HANDY_MACHINE_ID="your-hostname"
HANDY_STARTED_AT="2024-01-15T14:30:00Z"
```

### Layer 2: GitHub Comment (Persistent, Cross-Machine)

```markdown
<!-- HANDY_AGENT_METADATA
{
  "session": "handy-agent-101",
  "issue_ref": "org/Handy#101",
  "epic_ref": "org/Handy#100",
  ...
}
-->

🤖 **Agent Assigned**

- Session: `handy-agent-101`
- Type: claude
- Epic: #100
  ...
```

**You don't create this manually** - the spawn_agent command does it automatically.

---

## Recovery Patterns (Automatic)

### App Crash

1. System checks tmux for `handy-agent-*` sessions
2. Reads metadata from tmux env vars
3. Restores agent status in UI
4. **Action:** Resume monitoring or attach to session

### Machine Reboot

1. System checks GitHub for `agent-assigned` label
2. Reads metadata from issue comments
3. Checks if worktree still exists
4. **Action:** Restart agent or manual recovery

### Cross-Machine

1. System detects `machine_id` != current machine
2. Marks agent as "Remote"
3. Shows in UI with 🌐 icon
4. **Action:** Monitor only (cannot cleanup remote agents)

---

## File Naming Conventions

### Issues

- Epic: `#<number>` (e.g., #100)
- Sub-issue: `#<number>` (e.g., #101, #102...)

### Branches

- Format: `issue-<number>` (e.g., `issue-101`)
- Auto-created by spawn_agent

### Worktrees

- Path: `handy-worktrees/issue-<number>`
- Lives in parent directory of repo

### tmux Sessions

- Name: `handy-agent-<number>` (e.g., `handy-agent-101`)
- Socket: `-L handy` (production) or `-L handy-test` (testing)

### PRs

- Title: Matches sub-issue title (e.g., "Implement test_agent_spawning.rs")
- Body: Contains "Closes #101"
- Labels: `agent-created`, `<project-area>`

---

## Common Patterns

### Pattern 1: Parallel Feature Development

```
Epic #200: Add Multi-Language Support
├── #201: Add Spanish translations (Agent 1)
├── #202: Add French translations (Agent 2)
├── #203: Add German translations (Agent 3)
└── #204: Update language selector UI (Agent 4)

All 4 agents work simultaneously, no conflicts.
```

### Pattern 2: Sequential with Dependencies

```
Epic #300: Refactor Authentication
├── #301: Extract auth types to shared module (Agent 1)
│   └── Must complete before #302
├── #302: Update frontend to use new types (Agent 2)
│   └── Waits for #301
└── #303: Update backend to use new types (Agent 3)
    └── Can run parallel with #302

Spawn #301 first, then #302 + #303 in parallel.
```

### Pattern 3: Mixed Manual + Agent Work

```
Epic #400: Build Analytics Dashboard
├── #401: Design data schema (Manual - you do this)
├── #402: Implement data collection (Agent 1)
├── #403: Create chart components (Agent 2)
└── #404: Build dashboard layout (Manual - design decisions)

Manual tasks for design, agents for implementation.
```

---

## Quick Reference Commands

```bash
# Create epic and sub-issues in GitHub UI first

# Spawn single agent
spawn_agent --issue=101 --agent-type=claude

# Spawn multiple agents in parallel
spawn_agent --issue=101 --agent-type=claude
spawn_agent --issue=102 --agent-type=claude
spawn_agent --issue=103 --agent-type=aider

# List all active agents
list_agents

# Attach to agent session (monitor progress)
tmux attach -t handy-agent-101

# Cleanup completed agent
cleanup_agent --session=handy-agent-101 --remove-worktree

# Recover sessions after crash/reboot
recover_sessions
```

---

## Epic Workflow Checklist

Use this for every new epic:

- [ ] Create epic issue in GitHub with template
- [ ] Break down into sub-issues (2-8 hours each)
- [ ] Link sub-issues in epic body
- [ ] Label all sub-issues with `agent-ready`
- [ ] Identify dependencies (parallel vs sequential)
- [ ] Spawn agents as appropriate
- [ ] Monitor progress in DevOps UI
- [ ] Review and merge agent PRs
- [ ] Update epic progress as sub-issues close
- [ ] Close epic when all sub-issues complete

---

## Why This Works

1. **Traceability**: Every piece of work ties to a GitHub issue
2. **Parallelization**: Multiple agents work simultaneously without conflicts
3. **Recovery**: Dual metadata survives crashes and reboots
4. **Progress Tracking**: Epic shows overall status at a glance
5. **Accountability**: Clear ownership (which agent did what)
6. **Cross-Machine**: GitHub metadata enables work across multiple computers
7. **Automation**: spawn_agent handles all the boilerplate

---

## Future Enhancements

### Planned Features

- **Auto-epic creation**: CLI command to scaffold epic + sub-issues from template
- **Epic dashboard**: Visual progress tracker in Handy UI
- **Auto-progress updates**: Webhooks to update epic when sub-issues close
- **Dependency graphs**: Visual representation of task dependencies
- **Agent recommendations**: System suggests which agent type for each task

### Template Library

Store common epic templates:

- `templates/epic-testing.md` → Testing infrastructure projects
- `templates/epic-feature.md` → New feature development
- `templates/epic-refactor.md` → Large refactoring projects
- `templates/epic-i18n.md` → Internationalization work

---

## Summary: The One Pattern

**Remember this:**

```
1 Epic = 1 Big Project
  ├── N Sub-Issues = N Independent Tasks
  │     └── 1 Agent per Sub-Issue (1:1 mapping)
  │           └── 1 Worktree per Agent (isolation)
  │                 └── 1 PR per Agent (completion)
  └── Dual metadata (tmux + GitHub) for recovery
```

That's it. This pattern applies to **all future work**. You should never have to explain this architecture again - just reference this SOP.

---

## Next Steps for CICD Epic

Now that the pattern is documented:

1. **Create Epic #100** in GitHub: "Implement CICD Testing Infrastructure"
2. **Create Sub-Issues #101-109** for each phase/task
3. **Start Phase 1** (manual test utilities)
4. **Spawn agents for Phase 2-4** when ready
5. **Watch the magic happen** 🚀

Ready to create Epic #100?
