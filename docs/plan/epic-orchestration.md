---
title: "Epic: Agent Orchestration Tab"
tracking_repo: KBVE/KBVE
working_repo: KBVE/Handy
labels:
  - epic
  - devops
  - orchestration
---

# Epic: Agent Orchestration Tab

## Overview

Add a third tab to DevOps Settings called "Orchestration" that provides a unified pipeline view of the Issue → Agent → PR workflow. This tab will serve as the central command center for managing automated development work.

## User Story

As a developer using Handy's DevOps features, I want to see the complete pipeline of work flowing through the system—from queued issues, to actively working agents, to completed PRs—so I can monitor progress and manage the automation workflow effectively.

## Design

### Tab Structure

```
DevOps → [Settings] [Sessions] [Orchestration]
```

### Orchestration Tab Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  🔄 Active Pipeline                                                 │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐    ┌──────────────────┐    ┌────────────────┐ │
│  │ #42 Add dark mode│ →  │ claude-42        │ →  │ PR #87         │ │
│  │ [claude] working │    │ 15m active       │    │ needs-review   │ │
│  └──────────────────┘    └──────────────────┘    └────────────────┘ │
│                                                                     │
│  ┌──────────────────┐    ┌──────────────────┐                       │
│  │ #43 Fix auth bug │ →  │ aider-43         │    (awaiting PR)     │
│  │ [aider] working  │    │ 8m active        │                       │
│  └──────────────────┘    └──────────────────┘                       │
├─────────────────────────────────────────────────────────────────────┤
│  📋 Queued Issues (agent-todo label)                                │
├─────────────────────────────────────────────────────────────────────┤
│  #44 Update README        │ enhancement │ [Assign ▼] [Skip]        │
│  #45 Add unit tests       │ testing     │ [Assign ▼] [Skip]        │
│  #46 Refactor settings    │ refactor    │ [Assign ▼] [Skip]        │
├─────────────────────────────────────────────────────────────────────┤
│  ✅ Recently Completed                                              │
├─────────────────────────────────────────────────────────────────────┤
│  #40 Fix typos        → PR #85 merged 2h ago                        │
│  #39 Add logging      → PR #84 merged 1d ago                        │
└─────────────────────────────────────────────────────────────────────┘
```

## Implementation Tasks

### Phase 1: Core Infrastructure

#### 1.1 Backend - Pipeline State Tracking
- [ ] Create `PipelineItem` struct linking issue → session → worktree → PR
- [ ] Add `list_pipeline_items` command to aggregate current state
- [ ] Add `get_pipeline_history` command for completed items
- [ ] Store pipeline state in persistent storage (not just in-memory)

**Files:**
- `src-tauri/src/devops/pipeline.rs` (new)
- `src-tauri/src/commands/devops.rs` (add commands)
- `src-tauri/src/bindings.rs` (types)

#### 1.2 Backend - Issue Assignment Flow
- [ ] Add `assign_issue_to_agent` command
  - Creates worktree from issue branch
  - Spawns tmux session with selected agent
  - Links everything in pipeline state
- [ ] Add `skip_issue` command (removes agent-todo label, adds agent-skipped)
- [ ] Add `get_queued_issues` command (issues with agent-todo label)

**Files:**
- `src-tauri/src/devops/orchestration.rs` (new)
- `src-tauri/src/commands/devops.rs`

#### 1.3 Backend - PR Linking
- [ ] Detect when agent creates a PR (monitor `gh pr list` for branch)
- [ ] Auto-link PR to pipeline item
- [ ] Track PR status (draft, ready, needs-review, approved, merged)

### Phase 2: Frontend - Orchestration Tab

#### 2.1 Tab Navigation
- [ ] Add "Orchestration" tab to DevOpsLayout
- [ ] Create OrchestrationTab component

**Files:**
- `src/components/settings/devops/DevOpsLayout.tsx`
- `src/components/settings/devops/OrchestrationTab.tsx` (new)

#### 2.2 Active Pipeline Section
- [ ] Create ActivePipeline component showing current work
- [ ] Display flow visualization (Issue → Session → PR)
- [ ] Show agent type, duration, and status
- [ ] Add action buttons (View Session, Cancel, Complete)

**Files:**
- `src/components/settings/devops/orchestration/ActivePipeline.tsx` (new)
- `src/components/settings/devops/orchestration/PipelineCard.tsx` (new)

#### 2.3 Queued Issues Section
- [ ] Create QueuedIssues component
- [ ] Fetch issues with `agent-todo` label
- [ ] Agent selection dropdown (claude, aider, gemini, etc.)
- [ ] Assign button to start work
- [ ] Skip button to defer issue

**Files:**
- `src/components/settings/devops/orchestration/QueuedIssues.tsx` (new)
- `src/components/settings/devops/orchestration/IssueCard.tsx` (new)

#### 2.4 Completed Section
- [ ] Create CompletedWork component
- [ ] Show recently merged PRs with linked issues
- [ ] Display merge time and PR link

**Files:**
- `src/components/settings/devops/orchestration/CompletedWork.tsx` (new)

### Phase 3: Store Integration

#### 3.1 Pipeline Store
- [ ] Create pipelineStore.ts with Zustand
- [ ] Track active pipeline items
- [ ] Track queued issues
- [ ] Track completed history
- [ ] Polling for updates (or event-driven)

**Files:**
- `src/stores/pipelineStore.ts` (new)

#### 3.2 DevOps Store Updates
- [ ] Integrate pipeline state with existing store
- [ ] Ensure sessions and pipeline stay in sync

### Phase 4: Polish & Integration

#### 4.1 Real-time Updates
- [ ] Add Tauri events for pipeline state changes
- [ ] Update UI reactively when state changes

#### 4.2 Error Handling
- [ ] Handle agent failures gracefully
- [ ] Allow retry/reassign on failure
- [ ] Show error state in pipeline card

#### 4.3 Translations
- [ ] Add all i18n keys for Orchestration tab
- [ ] Update translation.json for en/es/fr/vi

**Files:**
- `src/i18n/locales/*/translation.json`

## Technical Details

### PipelineItem Type

```typescript
interface PipelineItem {
  id: string;
  issue: {
    number: number;
    title: string;
    labels: string[];
    url: string;
  };
  agent: {
    type: "claude" | "aider" | "gemini" | "ollama" | "vllm";
    sessionName: string;
    worktreePath: string;
    branch: string;
  } | null;
  pr: {
    number: number;
    title: string;
    status: "draft" | "open" | "approved" | "merged" | "closed";
    url: string;
  } | null;
  status: "queued" | "working" | "pr-created" | "completed" | "failed";
  startedAt: string | null;
  completedAt: string | null;
}
```

### Rust Types

```rust
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct PipelineItem {
    pub id: String,
    pub issue_number: i32,
    pub issue_title: String,
    pub issue_labels: Vec<String>,
    pub issue_url: String,
    pub agent_type: Option<String>,
    pub session_name: Option<String>,
    pub worktree_path: Option<String>,
    pub branch: Option<String>,
    pub pr_number: Option<i32>,
    pub pr_title: Option<String>,
    pub pr_status: Option<String>,
    pub pr_url: Option<String>,
    pub status: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}
```

### Commands to Implement

| Command | Description |
|---------|-------------|
| `list_pipeline_items` | Get all active and recent pipeline items |
| `get_queued_issues` | Get issues with agent-todo label |
| `assign_issue_to_agent` | Start work on an issue with specified agent |
| `skip_issue` | Skip an issue (update labels) |
| `cancel_pipeline_item` | Stop work on an item, cleanup |
| `complete_pipeline_item` | Mark work as done, create PR if needed |
| `refresh_pipeline_state` | Re-sync state from git/gh/tmux |

## Dependencies

This feature builds on existing infrastructure:
- ✅ GitHub CLI integration (`gh` commands)
- ✅ Tmux session management
- ✅ Git worktree management
- ✅ Agent spawning (claude, aider, gemini, etc.)
- ✅ Issue queue component (can reference patterns)
- ✅ Session grid component (can reference patterns)

## Testing Strategy

### Dogfooding

This Epic itself can be used to test the DevOps ecosystem:

1. Create issues for each implementation task above
2. Label them with `agent-todo`
3. Use the existing Issue Queue to assign agents
4. Monitor progress in Sessions tab
5. Review generated PRs
6. Once Orchestration tab is built, use it to manage remaining tasks

### Manual Testing Checklist

- [ ] Assign issue to Claude agent
- [ ] Verify worktree and session created
- [ ] Agent completes work and creates PR
- [ ] PR appears linked in pipeline
- [ ] Merge PR and verify completed state
- [ ] Skip an issue and verify label changes
- [ ] Cancel active work and verify cleanup

## Success Metrics

1. **Visibility**: Can see all active work at a glance
2. **Control**: Can assign, skip, and cancel from one place
3. **Traceability**: Every PR links back to its originating issue
4. **Efficiency**: Reduced context switching between tabs

## Estimated Scope

- **Backend**: 4-5 new files, ~500-700 lines Rust
- **Frontend**: 6-8 new components, ~800-1000 lines TypeScript
- **Integration**: Updates to 3-4 existing files

## Notes

- Consider adding keyboard shortcuts for common actions
- Pipeline visualization could be enhanced later with a true flow diagram
- Could add notifications when agents complete work
- Future: Auto-assign issues based on priority/age
