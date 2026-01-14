//! Pipeline orchestration for agent workflows.
//!
//! This module provides high-level orchestration functions for managing
//! the agent pipeline, including issue assignment, PR detection, and state management.

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use super::github::{self, GitHubPullRequest};
use super::orchestrator::{self, SpawnConfig, SpawnResult};
use super::pipeline::{PipelineItem, PipelineState, PipelineStatus};

/// Store path for pipeline state.
pub const PIPELINE_STORE_PATH: &str = "pipeline_store.json";

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
            let repo = &item.work_repo;
            if super::pipeline::sync_pr_status(item, repo).unwrap_or(false) {
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
