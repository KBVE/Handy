//! Pipeline orchestration for agent workflows.
//!
//! This module provides high-level orchestration functions for managing
//! the agent pipeline, including issue assignment, PR detection, and state management.
//! Also provides Epic state persistence for tracking active Epic workflows.

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use super::github::{self, GitHubPullRequest};
use super::operations::epic::{EpicInfo, EpicRecoveryInfo, ExistingSubIssue, PhaseConfig};
use super::orchestrator::{self, SpawnConfig, SpawnResult};
use super::pipeline::{PipelineItem, PipelineState, PipelineStatus};

/// Store path for pipeline state.
pub const PIPELINE_STORE_PATH: &str = "pipeline_store.json";

/// Store path for Epic state.
pub const EPIC_STORE_PATH: &str = "epic_store.json";

/// Configuration for assigning an issue to an agent.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AssignIssueConfig {
    /// Repository where the issue exists (tracking repo)
    pub tracking_repo: String,
    /// Repository where work will be done
    pub work_repo: String,
    /// Issue number to assign
    pub issue_number: u64,
    /// Agent type to use
    pub agent_type: String,
    /// Local path to the work repository
    pub repo_path: String,
    /// Labels to add when work starts
    #[serde(default)]
    pub start_labels: Vec<String>,
    /// Labels to remove when work starts
    #[serde(default)]
    pub remove_labels: Vec<String>,
}

/// Result of assigning an issue to an agent.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AssignIssueResult {
    /// The pipeline item created
    pub pipeline_item: PipelineItem,
    /// The spawn result from orchestrator
    pub spawn_result: SpawnResult,
}

/// Configuration for skipping an issue.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SkipIssueConfig {
    /// Repository where the issue exists
    pub repo: String,
    /// Issue number to skip
    pub issue_number: u64,
    /// Optional reason for skipping
    pub reason: Option<String>,
    /// Labels to add (defaults to "agent-skipped")
    #[serde(default)]
    pub add_labels: Vec<String>,
    /// Labels to remove (defaults to "agent-todo")
    #[serde(default)]
    pub remove_labels: Vec<String>,
}

/// Summary of pipeline items for display.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct PipelineSummary {
    /// Total items in pipeline
    pub total: usize,
    /// Items queued (not started)
    pub queued: usize,
    /// Items in progress
    pub in_progress: usize,
    /// Items with PRs pending review
    pub pr_pending: usize,
    /// Completed items
    pub completed: usize,
    /// Skipped items
    pub skipped: usize,
    /// Failed items
    pub failed: usize,
}

/// Load pipeline state from persistent storage.
pub fn load_pipeline_state(app: &AppHandle) -> PipelineState {
    let store = match app.store(PIPELINE_STORE_PATH) {
        Ok(s) => s,
        Err(_) => return PipelineState::new(),
    };

    if let Some(state_value) = store.get("pipeline") {
        serde_json::from_value::<PipelineState>(state_value)
            .unwrap_or_else(|_| PipelineState::new())
    } else {
        PipelineState::new()
    }
}

/// Save pipeline state to persistent storage.
pub fn save_pipeline_state(app: &AppHandle, state: &PipelineState) {
    if let Ok(store) = app.store(PIPELINE_STORE_PATH) {
        if let Ok(value) = serde_json::to_value(state) {
            let _ = store.set("pipeline", value);
        }
    }
}

/// Assign an issue to an agent.
///
/// This creates a worktree, spawns a tmux session, updates labels,
/// and creates a pipeline item to track the work.
pub fn assign_issue_to_agent(
    app: &AppHandle,
    config: &AssignIssueConfig,
) -> Result<AssignIssueResult, String> {
    // 1. Fetch the issue to ensure it exists
    let issue = github::get_issue(&config.tracking_repo, config.issue_number)?;

    // 2. Create spawn config
    let spawn_config = SpawnConfig {
        repo: config.work_repo.clone(),
        issue_number: config.issue_number,
        agent_type: config.agent_type.clone(),
        session_name: None,
        worktree_prefix: Some("handy".to_string()),
        working_labels: config.start_labels.clone(),
        use_sandbox: false, // TODO: Get from app settings
        sandbox_ports: vec![], // Auto-detect ports from project
    };

    // 3. Spawn the agent (creates worktree and session)
    let spawn_result = orchestrator::spawn_agent(&spawn_config, &config.repo_path)?;

    // 4. Create pipeline item
    let mut pipeline_item = PipelineItem::from_issue(
        &issue,
        &config.tracking_repo,
        &config.work_repo,
        &config.agent_type,
    );

    // 5. Update pipeline item with session details
    pipeline_item.start_work(
        &spawn_result.session_name,
        &spawn_result.worktree.path,
        &spawn_result.worktree.branch,
        &spawn_result.machine_id,
    );

    // 6. Update labels on the issue
    if !config.remove_labels.is_empty() {
        let remove_refs: Vec<&str> = config.remove_labels.iter().map(|s| s.as_str()).collect();
        let _ = github::update_labels(
            &config.tracking_repo,
            config.issue_number,
            vec![],
            remove_refs,
        );
    }

    // 7. Save to pipeline state
    let mut state = load_pipeline_state(app);
    state.add_item(pipeline_item.clone());
    save_pipeline_state(app, &state);

    Ok(AssignIssueResult {
        pipeline_item,
        spawn_result,
    })
}

/// Skip an issue and update its labels.
pub fn skip_issue(app: &AppHandle, config: &SkipIssueConfig) -> Result<PipelineItem, String> {
    // 1. Fetch the issue
    let issue = github::get_issue(&config.repo, config.issue_number)?;

    // 2. Create a pipeline item to record the skip
    let mut pipeline_item = PipelineItem::from_issue(&issue, &config.repo, &config.repo, "none");
    pipeline_item.skip();

    if let Some(reason) = &config.reason {
        pipeline_item.error = Some(reason.clone());
    }

    // 3. Update labels
    let add_labels = if config.add_labels.is_empty() {
        vec!["agent-skipped"]
    } else {
        config.add_labels.iter().map(|s| s.as_str()).collect()
    };

    let remove_labels = if config.remove_labels.is_empty() {
        vec!["agent-todo"]
    } else {
        config.remove_labels.iter().map(|s| s.as_str()).collect()
    };

    github::update_labels(&config.repo, config.issue_number, add_labels, remove_labels)?;

    // 4. Add comment if reason provided
    if let Some(reason) = &config.reason {
        let comment = format!(
            "🚫 **Issue Skipped**\n\n\
            This issue was skipped by the automation system.\n\n\
            **Reason:** {}\n\n\
            The issue has been marked with `agent-skipped` label.",
            reason
        );
        let _ = github::add_comment(&config.repo, config.issue_number, &comment);
    }

    // 5. Save to history
    let mut state = load_pipeline_state(app);
    state.history.push(pipeline_item.clone());
    save_pipeline_state(app, &state);

    Ok(pipeline_item)
}

/// List all pipeline items, aggregating from multiple sources.
pub fn list_pipeline_items(
    app: &AppHandle,
    work_repo: Option<&str>,
) -> Result<Vec<PipelineItem>, String> {
    let mut state = load_pipeline_state(app);

    // Get active sessions
    let sessions = orchestrator::list_agent_statuses().unwrap_or_default();

    // Aggregate pipeline state with session data
    let work_repo = work_repo.unwrap_or("");
    let items = super::pipeline::aggregate_pipeline_state(&state, &sessions, work_repo);

    // Update state with aggregated items
    for item in &items {
        if let Some(existing) = state.items.get_mut(&item.id) {
            existing.session_name = item.session_name.clone();
            existing.worktree_path = item.worktree_path.clone();
            existing.machine_id = item.machine_id.clone();
            existing.status = item.status;
        }
    }

    save_pipeline_state(app, &state);
    Ok(items)
}

/// Get pipeline history (completed items).
pub fn get_pipeline_history(app: &AppHandle, limit: Option<usize>) -> Vec<PipelineItem> {
    let state = load_pipeline_state(app);
    state.get_history(limit).into_iter().cloned().collect()
}

/// Get pipeline summary statistics.
pub fn get_pipeline_summary(app: &AppHandle) -> PipelineSummary {
    let state = load_pipeline_state(app);

    let mut summary = PipelineSummary {
        total: state.items.len(),
        queued: 0,
        in_progress: 0,
        pr_pending: 0,
        completed: 0,
        skipped: 0,
        failed: 0,
    };

    for item in state.items.values() {
        match item.status {
            PipelineStatus::Queued => summary.queued += 1,
            PipelineStatus::InProgress => summary.in_progress += 1,
            PipelineStatus::PrPending | PipelineStatus::PrReview => summary.pr_pending += 1,
            PipelineStatus::Completed => summary.completed += 1,
            PipelineStatus::Skipped => summary.skipped += 1,
            PipelineStatus::Failed => summary.failed += 1,
        }
    }

    summary
}

/// Detect and link PRs to pipeline items.
///
/// This checks for any PRs that match pipeline item branches
/// and links them automatically.
pub fn detect_and_link_prs(app: &AppHandle, work_repo: &str) -> Result<Vec<PipelineItem>, String> {
    let mut state = load_pipeline_state(app);
    let mut updated_items = Vec::new();

    // Get open PRs for the repo
    let prs = github::list_prs(work_repo, Some("open"), None, Some(100))?;

    // Check each active item without a PR
    for item in state.items.values_mut() {
        if item.pr_number.is_none() && item.branch_name.is_some() {
            if let Some(pr) = super::pipeline::detect_pr_for_item(item, &prs) {
                item.link_pr(&pr);
                updated_items.push(item.clone());
            }
        }
    }

    // Save updated state
    if !updated_items.is_empty() {
        save_pipeline_state(app, &state);
    }

    Ok(updated_items)
}

/// Sync PR status for all pipeline items with PRs.
pub fn sync_all_pr_statuses(app: &AppHandle) -> Result<Vec<PipelineItem>, String> {
    let mut state = load_pipeline_state(app);
    let mut updated_items = Vec::new();

    for item in state.items.values_mut() {
        if item.pr_number.is_some() {
            let repo = item.work_repo.clone();
            if super::pipeline::sync_pr_status(item, &repo).unwrap_or(false) {
                updated_items.push(item.clone());
            }
        }
    }

    // Save updated state
    if !updated_items.is_empty() {
        save_pipeline_state(app, &state);
    }

    // Archive completed items
    state.archive_completed();
    save_pipeline_state(app, &state);

    Ok(updated_items)
}

/// Update a specific pipeline item's PR status.
pub fn update_pipeline_item_pr_status(
    app: &AppHandle,
    item_id: &str,
) -> Result<Option<PipelineItem>, String> {
    let mut state = load_pipeline_state(app);

    if let Some(item) = state.items.get_mut(item_id) {
        if item.pr_number.is_some() {
            let repo = item.work_repo.clone();
            super::pipeline::sync_pr_status(item, &repo)?;
            let updated_item = item.clone();
            save_pipeline_state(app, &state);
            return Ok(Some(updated_item));
        }
    }

    Ok(None)
}

/// Link a PR to a pipeline item.
pub fn link_pr_to_pipeline_item(
    app: &AppHandle,
    item_id: &str,
    pr: &GitHubPullRequest,
) -> Result<PipelineItem, String> {
    let mut state = load_pipeline_state(app);

    if let Some(item) = state.items.get_mut(item_id) {
        item.link_pr(pr);
        let updated_item = item.clone();
        save_pipeline_state(app, &state);
        Ok(updated_item)
    } else {
        Err(format!("Pipeline item not found: {}", item_id))
    }
}

/// Get a pipeline item by ID.
pub fn get_pipeline_item(app: &AppHandle, item_id: &str) -> Option<PipelineItem> {
    let state = load_pipeline_state(app);
    state.get_item(item_id).cloned()
}

/// Find a pipeline item by issue.
pub fn find_pipeline_item_by_issue(
    app: &AppHandle,
    repo: &str,
    issue_number: u64,
) -> Option<PipelineItem> {
    let state = load_pipeline_state(app);
    state.find_by_issue(repo, issue_number).cloned()
}

/// Find a pipeline item by session name.
pub fn find_pipeline_item_by_session(app: &AppHandle, session_name: &str) -> Option<PipelineItem> {
    let state = load_pipeline_state(app);
    state.find_by_session(session_name).cloned()
}

/// Archive a completed pipeline item.
pub fn archive_pipeline_item(
    app: &AppHandle,
    item_id: &str,
) -> Result<Option<PipelineItem>, String> {
    let mut state = load_pipeline_state(app);
    let archived = state.archive_item(item_id);
    save_pipeline_state(app, &state);
    Ok(archived)
}

/// Remove a pipeline item (for cleanup).
pub fn remove_pipeline_item(
    app: &AppHandle,
    item_id: &str,
) -> Result<Option<PipelineItem>, String> {
    let mut state = load_pipeline_state(app);
    let removed = state.remove_item(item_id);
    save_pipeline_state(app, &state);
    Ok(removed)
}

// ========== Epic State Management ==========

/// Status of a phase within an Epic (for persisted tracking)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum TrackedPhaseStatus {
    /// Phase not started
    NotStarted,
    /// Phase is in progress
    InProgress,
    /// Phase is completed
    Completed,
    /// Phase was skipped
    Skipped,
}

impl Default for TrackedPhaseStatus {
    fn default() -> Self {
        Self::NotStarted
    }
}

/// Tracked state for a phase
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TrackedPhase {
    /// Phase number (1-indexed)
    pub phase_number: u32,
    /// Phase name
    pub name: String,
    /// Phase status
    pub status: TrackedPhaseStatus,
    /// Sub-issue numbers assigned to this phase
    pub sub_issues: Vec<u32>,
    /// Count of completed sub-issues
    pub completed_count: usize,
    /// Total sub-issues for this phase
    pub total_count: usize,
}

/// Persisted state for an active Epic workflow
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ActiveEpicState {
    /// Epic issue number
    pub epic_number: u32,
    /// Tracking repository (where Epic issue lives)
    pub tracking_repo: String,
    /// Work repository (where code is written)
    pub work_repo: String,
    /// Epic title
    pub title: String,
    /// Epic URL
    pub url: String,
    /// Phases with their tracked state
    pub phases: Vec<TrackedPhase>,
    /// All sub-issues for this epic
    pub sub_issues: Vec<TrackedSubIssue>,
    /// When this Epic was linked/loaded
    pub linked_at: String,
    /// Last time state was synced with GitHub
    pub last_synced_at: Option<String>,
}

/// Tracked state for a sub-issue
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TrackedSubIssue {
    /// Issue number
    pub issue_number: u32,
    /// Issue title
    pub title: String,
    /// Phase number this belongs to
    pub phase: Option<u32>,
    /// Current state (open/closed)
    pub state: String,
    /// Agent type assigned
    pub agent_type: Option<String>,
    /// Session name if agent is working
    pub session_name: Option<String>,
    /// Whether an agent is currently working
    pub has_agent_working: bool,
    /// URL to the issue
    pub url: String,
}

/// Full Epic store state (can track multiple epics, though typically one active)
#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
pub struct EpicStoreState {
    /// Currently active Epic (the one being orchestrated)
    pub active_epic: Option<ActiveEpicState>,
    /// History of completed epics (for reference)
    pub history: Vec<ActiveEpicState>,
    /// Maximum history to keep
    #[serde(default = "default_epic_history")]
    pub max_history: usize,
}

fn default_epic_history() -> usize {
    10
}

impl EpicStoreState {
    pub fn new() -> Self {
        Self {
            active_epic: None,
            history: Vec::new(),
            max_history: default_epic_history(),
        }
    }
}

/// Load Epic state from persistent storage.
pub fn load_epic_state(app: &AppHandle) -> EpicStoreState {
    let store = match app.store(EPIC_STORE_PATH) {
        Ok(s) => s,
        Err(_) => return EpicStoreState::new(),
    };

    if let Some(state_value) = store.get("epic_state") {
        serde_json::from_value::<EpicStoreState>(state_value)
            .unwrap_or_else(|_| EpicStoreState::new())
    } else {
        EpicStoreState::new()
    }
}

/// Save Epic state to persistent storage.
pub fn save_epic_state(app: &AppHandle, state: &EpicStoreState) {
    if let Ok(store) = app.store(EPIC_STORE_PATH) {
        if let Ok(value) = serde_json::to_value(state) {
            let _ = store.set("epic_state", value);
        }
    }
}

/// Set the active Epic from an EpicInfo (when first linking an Epic).
pub fn set_active_epic(app: &AppHandle, epic_info: &EpicInfo) -> ActiveEpicState {
    let mut state = load_epic_state(app);

    // Convert phases to tracked phases
    let tracked_phases: Vec<TrackedPhase> = epic_info
        .phases
        .iter()
        .enumerate()
        .map(|(i, phase)| TrackedPhase {
            phase_number: (i + 1) as u32,
            name: phase.name.clone(),
            status: TrackedPhaseStatus::NotStarted,
            sub_issues: Vec::new(),
            completed_count: 0,
            total_count: 0,
        })
        .collect();

    let active = ActiveEpicState {
        epic_number: epic_info.epic_number,
        tracking_repo: epic_info.repo.clone(),
        work_repo: epic_info.work_repo.clone(),
        title: epic_info.title.clone(),
        url: epic_info.url.clone(),
        phases: tracked_phases,
        sub_issues: Vec::new(),
        linked_at: chrono::Utc::now().to_rfc3339(),
        last_synced_at: None,
    };

    state.active_epic = Some(active.clone());
    save_epic_state(app, &state);

    active
}

/// Set the active Epic from recovery info (more complete data).
pub fn set_active_epic_from_recovery(
    app: &AppHandle,
    recovery: &EpicRecoveryInfo,
) -> ActiveEpicState {
    let mut state = load_epic_state(app);

    // Group sub-issues by phase
    let mut phase_issues: std::collections::HashMap<u32, Vec<&ExistingSubIssue>> =
        std::collections::HashMap::new();
    for sub in &recovery.sub_issues {
        if let Some(phase) = sub.phase {
            phase_issues.entry(phase).or_default().push(sub);
        }
    }

    // Build tracked phases with sub-issue info
    let tracked_phases: Vec<TrackedPhase> = recovery
        .epic
        .phases
        .iter()
        .enumerate()
        .map(|(i, phase)| {
            let phase_num = (i + 1) as u32;
            let phase_subs = phase_issues.get(&phase_num).map(|v| v.as_slice()).unwrap_or(&[]);
            let completed = phase_subs.iter().filter(|s| s.state == "closed").count();
            let in_progress = phase_subs.iter().any(|s| s.has_agent_working || s.state == "open");

            TrackedPhase {
                phase_number: phase_num,
                name: phase.name.clone(),
                status: if completed == phase_subs.len() && !phase_subs.is_empty() {
                    TrackedPhaseStatus::Completed
                } else if in_progress {
                    TrackedPhaseStatus::InProgress
                } else {
                    TrackedPhaseStatus::NotStarted
                },
                sub_issues: phase_subs.iter().map(|s| s.issue_number).collect(),
                completed_count: completed,
                total_count: phase_subs.len(),
            }
        })
        .collect();

    // Convert sub-issues to tracked format
    let tracked_sub_issues: Vec<TrackedSubIssue> = recovery
        .sub_issues
        .iter()
        .map(|s| TrackedSubIssue {
            issue_number: s.issue_number,
            title: s.title.clone(),
            phase: s.phase,
            state: s.state.clone(),
            agent_type: None, // Will be filled when agent is assigned
            session_name: None,
            has_agent_working: s.has_agent_working,
            url: s.url.clone(),
        })
        .collect();

    let active = ActiveEpicState {
        epic_number: recovery.epic.epic_number,
        tracking_repo: recovery.epic.repo.clone(),
        work_repo: recovery.epic.work_repo.clone(),
        title: recovery.epic.title.clone(),
        url: recovery.epic.url.clone(),
        phases: tracked_phases,
        sub_issues: tracked_sub_issues,
        linked_at: chrono::Utc::now().to_rfc3339(),
        last_synced_at: Some(chrono::Utc::now().to_rfc3339()),
    };

    state.active_epic = Some(active.clone());
    save_epic_state(app, &state);

    active
}

/// Get the currently active Epic state.
pub fn get_active_epic(app: &AppHandle) -> Option<ActiveEpicState> {
    let state = load_epic_state(app);
    state.active_epic
}

/// Clear the active Epic (move to history if completed).
pub fn clear_active_epic(app: &AppHandle, archive: bool) -> Option<ActiveEpicState> {
    let mut state = load_epic_state(app);

    if let Some(active) = state.active_epic.take() {
        if archive {
            state.history.push(active.clone());
            // Trim history
            while state.history.len() > state.max_history {
                state.history.remove(0);
            }
        }
        save_epic_state(app, &state);
        return Some(active);
    }

    None
}

/// Update a sub-issue's agent assignment in the active Epic.
pub fn update_epic_sub_issue_agent(
    app: &AppHandle,
    issue_number: u32,
    session_name: Option<&str>,
    agent_type: Option<&str>,
) -> Result<(), String> {
    let mut state = load_epic_state(app);

    if let Some(ref mut active) = state.active_epic {
        if let Some(sub) = active
            .sub_issues
            .iter_mut()
            .find(|s| s.issue_number == issue_number)
        {
            sub.session_name = session_name.map(|s| s.to_string());
            sub.agent_type = agent_type.map(|s| s.to_string());
            sub.has_agent_working = session_name.is_some();
            save_epic_state(app, &state);
            return Ok(());
        }
    }

    Err(format!(
        "Sub-issue {} not found in active epic",
        issue_number
    ))
}

/// Sync the active Epic state with GitHub.
pub async fn sync_active_epic(app: &AppHandle) -> Result<Option<ActiveEpicState>, String> {
    let state = load_epic_state(app);

    if let Some(active) = &state.active_epic {
        // Reload from GitHub
        let recovery = super::operations::epic::load_epic_for_recovery(
            active.tracking_repo.clone(),
            active.epic_number,
        )
        .await?;

        // Update with fresh data
        let updated = set_active_epic_from_recovery(app, &recovery);
        Ok(Some(updated))
    } else {
        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_skip_issue_config_defaults() {
        let config = SkipIssueConfig {
            repo: "test/repo".to_string(),
            issue_number: 123,
            reason: None,
            add_labels: vec![],
            remove_labels: vec![],
        };

        assert!(config.add_labels.is_empty());
        assert!(config.remove_labels.is_empty());
    }
}
