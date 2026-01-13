# CICD Epic → Agent Workflow Structure

## Overview

One master **Epic Issue** tracks the entire CICD implementation. Each phase/task becomes a **Sub-Issue** that gets assigned to exactly one DevOps agent. This maintains the dual-source-of-truth pattern:

- **GitHub Issue** = Source of truth for what needs to be done
- **tmux Session + Worktree** = Source of truth for active work state
- **Agent Metadata** = Dual-layer (tmux env vars + GitHub comment) for recovery

---

## Epic Issue Structure

### Epic Issue #100: "Implement CICD Testing Infrastructure"

**Location**: `org/Handy` repository (or dedicated tasks repo)

**Epic Body**:

```markdown
# CICD Testing Infrastructure

## Goal

Build comprehensive testing and CI/CD infrastructure for the multi-agent DevOps system to ensure production readiness.

**Work Repository**: org/Handy (code lives here, issues tracked in org/Handy)

## Success Metrics

- [ ] 100+ total tests
- [ ] > 70% code coverage
- [ ] CI/CD running on all PRs
- [ ] Pre-commit hooks active
- [ ] All phases complete

## Phases

### Phase 1: Foundation (Manual)

- Manual implementation by @alappatel
- Build test utilities and infrastructure
- **Status**: ⏸️ Not Started

### Phase 2: Integration Tests (Agent-Assisted)

- [ ] #101 - Implement test_agent_spawning.rs
- [ ] #102 - Implement test_pr_workflow.rs
- [ ] #103 - Implement test_session_recovery.rs
- [ ] #104 - Implement test_worktree_ops.rs
- **Status**: ⏸️ Waiting for Phase 1

### Phase 3: CI/CD Integration (Agent-Assisted)

- [ ] #105 - Set up GitHub Actions workflow
- [ ] #106 - Add pre-commit hooks (manual)
- **Status**: ⏸️ Waiting for Phase 2

### Phase 4: Advanced Scenarios (Agent-Assisted)

- [ ] #107 - Implement test_multi_machine.rs
- [ ] #108 - Implement test_error_handling.rs
- [ ] #109 - Implement test_resource_limits.rs
- **Status**: ⏸️ Waiting for Phase 3

## Progress

3/9 sub-issues completed (33%)

## Notes

- Phase 1 is manual to ensure solid foundation
- Phases 2-4 use DevOps agents for dogfooding
- Each sub-issue maps to exactly one agent session
```

**Labels**: `epic`, `cicd`, `testing`, `high-priority`

---

## Sub-Issue Structure (Example)

### Sub-Issue #101: "Implement test_agent_spawning.rs"

**Location**: Same repo as Epic #100

**Body**:

````markdown
# Implement test_agent_spawning.rs

**Epic**: #100 CICD Testing Infrastructure
**Phase**: 2 - Integration Tests
**Estimated Time**: 6 hours
**Dependencies**: Phase 1 complete (test utilities exist)
**Work Repository**: org/Handy (agent works here)

## Goal

Implement comprehensive integration tests for the agent spawning workflow in `src-tauri/tests/integration/test_agent_spawning.rs`.

## Context

- Parent epic: #100
- Use test utilities from `tests/common/`
- Use custom tmux socket: `get_test_tmux_socket()`
- Use `#[serial]` attribute from serial_test crate
- Follow patterns in existing codebase

## Tests to Implement

### 1. test_spawn_agent_full_workflow

**What**: End-to-end test of spawning an agent for an issue

**Steps**:

1. Create temporary git repository
2. Spawn agent for mock issue #42 (use MockGitHub)
3. Verify worktree created at correct path
4. Verify tmux session exists with correct name
5. Verify metadata stored in session env vars
6. Verify agent appears in `list_agent_statuses()`
7. Cleanup all resources

**Expected**: All assertions pass, no resource leaks

---

### 2. test_cleanup_agent_removes_all_resources

**What**: Verify cleanup removes everything

**Steps**:

1. Spawn agent using setup from test 1
2. Get agent status to confirm it exists
3. Call `cleanup_agent(&session, true, Some(&socket))`
4. Verify tmux session no longer exists
5. Verify worktree directory removed
6. Verify agent not in `list_agent_statuses()`

**Expected**: Complete cleanup, no orphaned resources

---

### 3. test_spawn_agent_collision_detection

**What**: Ensure we can't spawn duplicate agents for same issue

**Steps**:

1. Spawn agent for issue #42
2. Attempt to spawn another agent for issue #42
3. Verify second spawn returns error
4. Verify error message mentions "collision" or "already exists"
5. Verify only one agent exists in status list

**Expected**: Error on second spawn, only one agent created

---

### 4. test_spawn_multiple_agents_different_issues

**What**: Ensure multiple agents can work in parallel without conflicts

**Steps**:

1. Spawn agent for issue #1
2. Spawn agent for issue #2
3. Spawn agent for issue #3
4. Verify all three succeeded
5. Verify all three have separate worktrees
6. Verify all three have separate tmux sessions
7. Cleanup all three

**Expected**: All spawns succeed, no collisions

---

## Acceptance Criteria

- [ ] All 4 tests implemented and passing
- [ ] Tests use isolated environments (temp repos, custom tmux socket)
- [ ] All resources cleaned up after each test (no leftover sessions/worktrees)
- [ ] Code follows Rust style guide and passes `cargo fmt`/`cargo clippy`
- [ ] Tests pass locally: `cargo test test_agent_spawning`
- [ ] PR created referencing this issue

## Implementation Notes

### Test Setup Pattern

```rust
use serial_test::serial;
use crate::common::*;

#[test]
#[serial]
fn test_spawn_agent_full_workflow() {
    // Setup
    let (temp_dir, repo_path) = create_test_repo();
    let socket = get_test_tmux_socket();

    // Action
    let result = spawn_agent(...);

    // Assert
    assert!(result.is_ok());

    // Cleanup
    cleanup_test_sessions(Some(&socket));
}
```
````

### Cleanup Pattern

Every test MUST cleanup even on failure:

```rust
// Use defer pattern or explicit cleanup in both success/failure paths
let session = spawn_agent(...).unwrap();
// ... test code ...
cleanup_agent(&session, true, Some(&socket)).unwrap();
```

## Questions/Blockers

- ❓ Should we test with both claude and aider agent types, or just one?
- ❓ How should we handle if tmux isn't installed (skip tests gracefully)?

## Agent Assignment

**Agent Type**: claude
**Session**: handy-agent-101
**Worktree**: handy-worktrees/issue-101
**Started**: [Will be filled when agent spawns]

````

**Labels**: `agent-ready`, `testing`, `integration-test`, `phase-2`

---

## Dual-Layer Metadata (When Agent Spawns)

### Layer 1: tmux Environment Variables
When you run `spawn_agent --issue=101`, the system sets:

```bash
tmux set-environment -t handy-agent-101 HANDY_ISSUE_REF "org/Handy#101"
tmux set-environment -t handy-agent-101 HANDY_EPIC_REF "org/Handy#100"
tmux set-environment -t handy-agent-101 HANDY_WORKTREE "/Users/alappatel/Documents/GitHub/handy-worktrees/issue-101"
tmux set-environment -t handy-agent-101 HANDY_AGENT_TYPE "claude"
tmux set-environment -t handy-agent-101 HANDY_MACHINE_ID "$(hostname)"
tmux set-environment -t handy-agent-101 HANDY_STARTED_AT "2024-01-15T14:30:00Z"
tmux set-environment -t handy-agent-101 HANDY_STATUS "working"
````

### Layer 2: GitHub Issue Comment

The system posts this comment on issue #101:

```markdown
<!-- HANDY_AGENT_METADATA
{
  "session": "handy-agent-101",
  "issue_ref": "org/Handy#101",
  "epic_ref": "org/Handy#100",
  "worktree": "/Users/alappatel/Documents/GitHub/handy-worktrees/issue-101",
  "agent_type": "claude",
  "machine_id": "alappatel-macbook-pro",
  "started_at": "2024-01-15T14:30:00Z",
  "status": "working"
}
-->

🤖 **Agent Assigned**

- **Session**: `handy-agent-101`
- **Type**: claude (Claude Code)
- **Worktree**: `issue-101`
- **Machine**: alappatel-macbook-pro
- **Epic**: #100 CICD Testing Infrastructure
- **Started**: Jan 15, 2024 2:30 PM

Agent is now working on implementing integration tests for agent spawning. Will update with progress.
```

---

## Epic Progress Tracking

As agents complete their work, the Epic issue gets updated:

### After Agent 101 Completes (Issue #101)

**Epic #100 updated**:

```markdown
### Phase 2: Integration Tests (Agent-Assisted)

- [x] #101 - Implement test_agent_spawning.rs ✅ (PR #110 merged)
- [ ] #102 - Implement test_pr_workflow.rs (🤖 Agent working)
- [ ] #103 - Implement test_session_recovery.rs (⏸️ Queued)
- [ ] #104 - Implement test_worktree_ops.rs (⏸️ Queued)

## Progress

4/9 sub-issues completed (44%)
```

**Issue #101 gets**:

- Comment: "✅ Implementation complete - 4 tests passing, PR #110 created"
- PR link: https://github.com/org/Handy/pull/110
- Label added: `completed`
- Status: Closed (automatically when PR merges via "Closes #101" in PR body)

---

## Complete Workflow Example

### Day 1: Manual Phase 1

You implement test utilities manually (no agents yet).

### Day 4: Start Phase 2 - Create Sub-Issues

**Create 4 sub-issues** in GitHub UI:

```
Issue #101: Implement test_agent_spawning.rs
Issue #102: Implement test_pr_workflow.rs
Issue #103: Implement test_session_recovery.rs
Issue #104: Implement test_worktree_ops.rs
```

All reference Epic #100 in their body.

### Day 4: Spawn Agents in Parallel

**Terminal**:

```bash
# Check current directory
pwd  # /Users/alappatel/Documents/GitHub/Handy

# Spawn Agent 1 for Issue #101
handy spawn-agent \
  --issue="org/Handy#101" \
  --agent-type="claude" \
  --title="Implement test_agent_spawning.rs"

# System creates:
# 1. Worktree: /Users/alappatel/Documents/GitHub/handy-worktrees/issue-101
# 2. Branch: issue-101
# 3. tmux session: handy-agent-101
# 4. Metadata in tmux env + GitHub comment
# 5. Agent starts working in worktree

# Spawn Agent 2 for Issue #102 (parallel)
handy spawn-agent \
  --issue="org/Handy#102" \
  --agent-type="claude" \
  --title="Implement test_pr_workflow.rs"

# Spawn Agent 3 for Issue #103 (parallel)
handy spawn-agent \
  --issue="org/Handy#103" \
  --agent-type="aider" \
  --title="Implement test_session_recovery.rs"

# Spawn Agent 4 for Issue #104 (parallel)
handy spawn-agent \
  --issue="org/Handy#104" \
  --agent-type="claude" \
  --title="Implement test_worktree_ops.rs"
```

### Day 4: Monitor Agents

**Check status** in Handy DevOps UI or terminal:

```bash
handy list-agents

# Output:
# handy-agent-101 | claude | issue-101 | working | org/Handy#101
# handy-agent-102 | claude | issue-102 | working | org/Handy#102
# handy-agent-103 | aider  | issue-103 | working | org/Handy#103
# handy-agent-104 | claude | issue-104 | working | org/Handy#104
```

**Attach to agent** to see progress:

```bash
tmux attach -t handy-agent-101

# See Claude Code working:
# - Reading test utilities
# - Writing test_spawn_agent_full_workflow()
# - Running cargo test
# - Fixing compilation errors
# - Committing changes
```

### Day 5: Agent Completes Work

**Agent 101 finishes**, runs:

````bash
# Agent commits changes
git add tests/integration/test_agent_spawning.rs
git commit -m "feat: implement agent spawning integration tests

- Add test_spawn_agent_full_workflow
- Add test_cleanup_agent_removes_all_resources
- Add test_spawn_agent_collision_detection
- Add test_spawn_multiple_agents_different_issues

All tests passing locally.

Closes #101"

# Agent pushes branch
git push origin issue-101

# Agent creates PR via gh CLI
gh pr create \
  --title "feat: implement agent spawning integration tests" \
  --body "$(cat <<'EOF'
## Summary
Implements comprehensive integration tests for agent spawning workflow.

## Changes
- Added `test_agent_spawning.rs` with 4 integration tests
- Tests cover full workflow, cleanup, collision detection, parallel spawning
- All tests use isolated environments (temp repos, custom tmux socket)
- Resources properly cleaned up after each test

## Testing
```bash
cargo test test_agent_spawning
````

All 4 tests passing.

## Related Issues

Closes #101
Part of Epic #100

---

🤖 Generated by Claude Code agent `handy-agent-101`
EOF
)" \
 --label "testing,integration-test,agent-created"

```

**GitHub automatically**:
- Creates PR #110
- Links to issue #101
- Agent posts comment on #101: "✅ PR #110 created: [link]"

### Day 5: You Review PR

**PR Review**:
1. Check code quality
2. Verify tests are correct
3. Run locally: `cargo test test_agent_spawning`
4. Request changes if needed (agent addresses in same worktree/branch)
5. Approve and merge

**When merged**:
- Issue #101 auto-closes (via "Closes #101" in PR)
- Epic #100 progress updates
- Agent session auto-cleanup (via webhook or manual)

### Repeat for Issues #102-104

Agents work in parallel, you review and merge PRs as they come in.

---

## Recovery Scenarios

### Scenario 1: Handy App Crashes Mid-Work

**Before crash**:
- Agent 101 is writing tests
- Agent 102 is running cargo test
- Agent 103 just committed changes

**After restart** (you open Handy DevOps UI):

System runs `recover_sessions()`:
1. **Check tmux** for `handy-agent-*` sessions
   - Finds: `handy-agent-101`, `handy-agent-102`, `handy-agent-103`
2. **Read metadata** from tmux env vars
3. **Verify GitHub comments** match (dual-layer validation)
4. **Display recovered agents**:
```

✅ handy-agent-101 | Recovered from tmux
✅ handy-agent-102 | Recovered from tmux
✅ handy-agent-103 | Recovered from tmux

```

You can resume monitoring or attach to any session.

---

### Scenario 2: Machine Reboot (tmux killed)

**Before reboot**:
- Agent 101 had committed but not pushed

**After reboot**:

System runs `recover_sessions()`:
1. **Check tmux** - finds nothing (tmux server killed on reboot)
2. **Fallback to GitHub** - queries issues with `agent-assigned` label
3. **Parse metadata comments** from issues #101-104
4. **Check worktrees** - finds `/handy-worktrees/issue-101` still exists
5. **Display orphaned work**:
```

⚠️ handy-agent-101 | Orphaned (session crashed, worktree exists)
Recommendation: Restart agent or manually push changes

```

You can:
- **Restart agent**: `spawn_agent --issue=101` (resumes from worktree)
- **Manual recovery**: Go to worktree, push changes, create PR manually

---

### Scenario 3: Cross-Machine Coordination

**Setup**:
- You spawn Agent 101 on MacBook (machine-1)
- You spawn Agent 102 on Linux server (machine-2)

**DevOps UI shows**:
```

Local Agents:
handy-agent-101 | claude | issue-101 | 💻 Local

Remote Agents:
handy-agent-102 | aider | issue-102 | 🌐 Remote (machine-2)

```

**Actions**:
- ✅ Can view remote agent status (via GitHub metadata)
- ✅ Can see remote agent's PR when created
- ❌ Cannot cleanup remote agent (only owner machine can)
- ✅ Can see when remote agent completes (GitHub webhook/polling)

---

## Visual Representation

```

Epic #100: CICD Testing
├── Phase 1 (Manual)
│ └── [You implement test utilities]
│
├── Phase 2 (Agents)
│ ├── Issue #101 → Agent 101 → Worktree issue-101 → PR #110 ✅
│ ├── Issue #102 → Agent 102 → Worktree issue-102 → PR #111 ✅
│ ├── Issue #103 → Agent 103 → Worktree issue-103 → PR #112 🔄
│ └── Issue #104 → Agent 104 → Worktree issue-104 → PR #113 ⏸️
│
├── Phase 3 (Agents + Manual)
│ ├── Issue #105 → Agent 105 → PR #114
│ └── Issue #106 → [You implement manually]
│
└── Phase 4 (Agents)
├── Issue #107 → Agent 107 → PR #115
├── Issue #108 → Agent 108 → PR #116
└── Issue #109 → Agent 109 → PR #117

```

---

## Summary

### The Pattern
1. **One Epic** tracks entire CICD implementation
2. **One Sub-Issue per task** (e.g., implement one test file)
3. **One Agent per sub-issue** (1:1 mapping)
4. **One Worktree per agent** (isolation)
5. **Dual metadata** (tmux + GitHub) for recovery
6. **One PR per agent** when work complete

### Why This Works
- ✅ **Traceability**: Every agent maps to exactly one issue
- ✅ **Recovery**: Dual-layer metadata (tmux + GitHub) survives crashes
- ✅ **Parallelization**: Agents work in separate worktrees, no conflicts
- ✅ **Progress Tracking**: Epic shows overall progress, sub-issues show details
- ✅ **Cross-Machine**: GitHub metadata enables multi-machine coordination
- ✅ **Accountability**: Each PR clearly shows which agent created it
- ✅ **Dogfooding**: We test the DevOps system by using it to build itself!

### Next Action
Ready to create Epic #100 and start Phase 1? 🚀
```
