---
title: "Agent Orchestration Tab"
description: "Add a unified pipeline view for Issue → Agent → PR workflow as a third DevOps tab"
labels: ["epic", "devops", "orchestration"]
tracking_repo: "KBVE/KBVE"
working_repo: "KBVE/Handy"
---

# Agent Orchestration Tab

## Goal

Add a third tab to DevOps Settings called "Orchestration" that provides a unified pipeline view of the Issue → Agent → PR workflow, serving as the central command center for managing automated development work.

## Success Metrics

- Pipeline visibility: Can see all active work at a glance
- Issue assignment: Can assign agents to issues from one place
- PR traceability: Every PR links back to its originating issue
- Reduced context switching between tabs
- Successful dogfooding: Use this Epic to test the DevOps ecosystem

## Phases

### Phase 1: Core Infrastructure

**Approach**: manual

Build backend infrastructure for pipeline state tracking and issue assignment flow.

**Key Tasks**:

- Create `PipelineItem` struct linking issue → session → worktree → PR
- Add `list_pipeline_items` command to aggregate current state
- Add `get_pipeline_history` command for completed items
- Store pipeline state in persistent storage
- Add `assign_issue_to_agent` command (creates worktree, spawns tmux session)
- Add `skip_issue` command (removes agent-todo label, adds agent-skipped)
- Detect when agent creates a PR and auto-link to pipeline item
- Track PR status (draft, ready, needs-review, approved, merged)

**Files**:

- `src-tauri/src/devops/pipeline.rs` (new)
- `src-tauri/src/devops/orchestration.rs` (new)
- `src-tauri/src/commands/devops.rs` (add commands)

**Dependencies**: None

---

### Phase 2: Frontend - Orchestration Tab

**Approach**: agent-assisted

Build the Orchestration tab UI with three sections: Active Pipeline, Queued Issues, and Completed Work.

**Key Tasks**:

- Add "Orchestration" tab to DevOpsLayout
- Create OrchestrationTab component
- Create ActivePipeline component with flow visualization (Issue → Session → PR)
- Show agent type, duration, and status
- Add action buttons (View Session, Cancel, Complete)
- Create QueuedIssues component with agent selection dropdown
- Add Assign and Skip buttons for issues
- Create CompletedWork component showing merged PRs with linked issues

**Files**:

- `src/components/settings/devops/DevOpsLayout.tsx`
- `src/components/settings/devops/OrchestrationTab.tsx` (new)
- `src/components/settings/devops/orchestration/ActivePipeline.tsx` (new)
- `src/components/settings/devops/orchestration/PipelineCard.tsx` (new)
- `src/components/settings/devops/orchestration/QueuedIssues.tsx` (new)
- `src/components/settings/devops/orchestration/IssueCard.tsx` (new)
- `src/components/settings/devops/orchestration/CompletedWork.tsx` (new)

**Dependencies**: Phase 1 complete

---

### Phase 3: Store Integration

**Approach**: agent-assisted

Create Zustand store for pipeline state management and integrate with existing DevOps store.

**Key Tasks**:

- Create pipelineStore.ts with Zustand
- Track active pipeline items
- Track queued issues
- Track completed history
- Implement polling for updates (or event-driven)
- Integrate pipeline state with existing devopsStore
- Ensure sessions and pipeline stay in sync

**Files**:

- `src/stores/pipelineStore.ts` (new)
- `src/stores/devopsStore.ts` (update)

**Dependencies**: Phase 2 complete

---

### Phase 4: Polish & Integration

**Approach**: agent-assisted

Add real-time updates, error handling, and translations.

**Key Tasks**:

- Add Tauri events for pipeline state changes
- Update UI reactively when state changes
- Handle agent failures gracefully
- Allow retry/reassign on failure
- Show error state in pipeline card
- Add all i18n keys for Orchestration tab
- Update translation.json for en/es/fr/vi

**Files**:

- `src/i18n/locales/*/translation.json`

**Dependencies**: Phase 3 complete

---

## Design

### Tab Structure

```
DevOps → [Settings] [Sessions] [Orchestration]
```

### Orchestration Tab Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  Active Pipeline                                                    │
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
│  Queued Issues (agent-todo label)                                   │
├─────────────────────────────────────────────────────────────────────┤
│  #44 Update README        │ enhancement │ [Assign ▼] [Skip]        │
│  #45 Add unit tests       │ testing     │ [Assign ▼] [Skip]        │
│  #46 Refactor settings    │ refactor    │ [Assign ▼] [Skip]        │
├─────────────────────────────────────────────────────────────────────┤
│  Recently Completed                                                 │
├─────────────────────────────────────────────────────────────────────┤
│  #40 Fix typos        → PR #85 merged 2h ago                        │
│  #39 Add logging      → PR #84 merged 1d ago                        │
└─────────────────────────────────────────────────────────────────────┘
```

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

| Command                  | Description                                 |
| ------------------------ | ------------------------------------------- |
| `list_pipeline_items`    | Get all active and recent pipeline items    |
| `get_queued_issues`      | Get issues with agent-todo label            |
| `assign_issue_to_agent`  | Start work on an issue with specified agent |
| `skip_issue`             | Skip an issue (update labels)               |
| `cancel_pipeline_item`   | Stop work on an item, cleanup               |
| `complete_pipeline_item` | Mark work as done, create PR if needed      |
| `refresh_pipeline_state` | Re-sync state from git/gh/tmux              |

## Dependencies

This feature builds on existing infrastructure:

- GitHub CLI integration (`gh` commands)
- Tmux session management
- Git worktree management
- Agent spawning (claude, aider, gemini, etc.)
- Issue queue component (can reference patterns)
- Session grid component (can reference patterns)

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

- Assign issue to Claude agent
- Verify worktree and session created
- Agent completes work and creates PR
- PR appears linked in pipeline
- Merge PR and verify completed state
- Skip an issue and verify label changes
- Cancel active work and verify cleanup

## Notes

- Consider adding keyboard shortcuts for common actions
- Pipeline visualization could be enhanced later with a true flow diagram
- Could add notifications when agents complete work
- Future: Auto-assign issues based on priority/age
