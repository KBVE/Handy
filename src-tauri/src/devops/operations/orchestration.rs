//! Epic orchestration operations.
//!
//! This module handles the automated workflow of starting epic execution:
//! - Creating sub-issues from phase tasks
//! - Spawning agents for agent-assisted phases
//! - Managing phase progression

use super::{
    create_sub_issues, EpicInfo, PhaseConfig, SubIssueConfig, SubIssueInfo,
};
use crate::devops::orchestrator;

/// Maximum length for issue titles - keep them concise and readable
const MAX_TITLE_LENGTH: usize = 100;

/// Truncate a title to be concise, breaking at word boundaries
fn truncate_title(title: &str) -> String {
    let title = title.trim();
    if title.len() <= MAX_TITLE_LENGTH {
        return title.to_string();
    }

    // Find last space before the limit to break at word boundary
    let truncate_at = title[..MAX_TITLE_LENGTH - 3]
        .rfind(' ')
        .unwrap_or(MAX_TITLE_LENGTH - 3);

    format!("{}...", &title[..truncate_at])
}

/// Result of starting orchestration for an epic
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct OrchestrationResult {
    /// Epic number
    pub epic_number: u32,
    /// Created sub-issues
    pub sub_issues: Vec<SubIssueInfo>,
    /// Spawned agents (for agent-assisted phases)
    pub spawned_agents: Vec<SpawnedAgentInfo>,
    /// Phases that were started
    pub started_phases: Vec<u32>,
    /// Any warnings during orchestration
    pub warnings: Vec<String>,
}

/// Information about a spawned agent
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct SpawnedAgentInfo {
    /// Issue number the agent is working on
    pub issue_number: u32,
    /// Session name (tmux)
    pub session_name: String,
    /// Worktree path
    pub worktree_path: String,
    /// Agent type (claude, aider, etc.)
    pub agent_type: String,
}

/// Configuration for starting orchestration
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct StartOrchestrationConfig {
    /// Which phases to start (1-indexed). If empty, starts Phase 1.
    pub phases: Vec<u32>,
    /// Whether to auto-spawn agents for agent-assisted phases
    pub auto_spawn_agents: bool,
    /// Default agent type for spawning
    pub default_agent_type: String,
    /// Local filesystem path to git repository for creating worktrees.
    /// Must be a valid git repository path (e.g., "/Users/me/projects/MyRepo").
    /// If empty or invalid, agent spawning will be skipped but issues will still be created.
    pub worktree_base: String,
}

/// Start orchestration for an epic
///
/// This creates sub-issues for the specified phases and optionally spawns agents.
/// If a phase already has an issue, it will skip creation and reuse the existing one.
pub async fn start_orchestration(
    epic: &EpicInfo,
    config: StartOrchestrationConfig,
) -> Result<OrchestrationResult, String> {
    use crate::devops::github;

    let mut result = OrchestrationResult {
        epic_number: epic.epic_number,
        sub_issues: Vec::new(),
        spawned_agents: Vec::new(),
        started_phases: Vec::new(),
        warnings: Vec::new(),
    };

    // Determine which phases to process (default to Phase 1)
    let phases_to_start: Vec<u32> = if config.phases.is_empty() {
        vec![1]
    } else {
        config.phases.clone()
    };

    // First, check for existing sub-issues for this epic
    let existing_issues = github::list_issues_async(&epic.repo, vec![]).await.unwrap_or_default();
    let existing_phase_issues: std::collections::HashMap<u32, _> = existing_issues
        .iter()
        .filter(|issue| {
            issue.body.as_ref()
                .map(|b| b.contains(&format!("Epic**: #{}", epic.epic_number)))
                .unwrap_or(false)
        })
        .filter_map(|issue| {
            // Extract phase number from body
            issue.body.as_ref().and_then(|body| {
                body.lines()
                    .find(|line| line.contains("**Phase**:"))
                    .and_then(|line| {
                        line.split("**Phase**:")
                            .nth(1)
                            .and_then(|s| s.trim().parse::<u32>().ok())
                    })
            }).map(|phase| (phase, issue))
        })
        .collect();

    // Generate ONE sub-issue per phase (agent will break down further if needed)
    let mut sub_issue_configs: Vec<SubIssueConfig> = Vec::new();

    for phase_num in &phases_to_start {
        let phase_idx = (*phase_num as usize).saturating_sub(1);
        if phase_idx >= epic.phases.len() {
            result.warnings.push(format!(
                "Phase {} does not exist (epic has {} phases)",
                phase_num,
                epic.phases.len()
            ));
            continue;
        }

        // Check if issue already exists for this phase
        if let Some(existing) = existing_phase_issues.get(phase_num) {
            result.warnings.push(format!(
                "Phase {} already has issue #{} - skipping creation",
                phase_num, existing.number
            ));
            result.started_phases.push(*phase_num);
            // Add existing issue to result
            result.sub_issues.push(SubIssueInfo {
                issue_number: existing.number as u32,
                title: existing.title.clone(),
                phase: *phase_num,
                agent_type: config.default_agent_type.clone(),
                work_repo: epic.work_repo.clone(),
                url: existing.url.clone(),
            });
            continue;
        }

        let phase = &epic.phases[phase_idx];

        // Check dependencies
        if !phase.dependencies.is_empty() {
            result.warnings.push(format!(
                "Phase {} has dependencies: {:?}. Proceeding anyway.",
                phase_num, phase.dependencies
            ));
        }

        // Create a single issue for the phase - agent will handle task breakdown
        let phase_issue = create_phase_issue(
            *phase_num,
            phase,
            &epic.work_repo,
            &config.default_agent_type,
        );

        sub_issue_configs.push(phase_issue);
        result.started_phases.push(*phase_num);
    }

    // Create sub-issues in GitHub
    if !sub_issue_configs.is_empty() {
        match create_sub_issues(
            epic.epic_number,
            epic.repo.clone(),
            epic.work_repo.clone(),
            sub_issue_configs,
        )
        .await
        {
            Ok(created) => {
                result.sub_issues = created;
            }
            Err(e) => {
                return Err(format!("Failed to create sub-issues: {}", e));
            }
        }
    }

    // Spawn agents for agent-assisted sub-issues if requested
    if config.auto_spawn_agents {
        // Validate worktree_base is a valid git repository path
        let worktree_path = std::path::Path::new(&config.worktree_base);
        let is_valid_git_repo = worktree_path.exists()
            && worktree_path.is_dir()
            && worktree_path.join(".git").exists();

        if !is_valid_git_repo {
            result.warnings.push(format!(
                "Cannot spawn agents: worktree_base '{}' is not a valid git repository. \
                 Please provide a local filesystem path to a git repo (e.g., '/Users/me/projects/MyRepo').",
                config.worktree_base
            ));
        } else {
            for sub_issue in &result.sub_issues {
                // Only spawn for agent-assisted (not "manual")
                if sub_issue.agent_type == "manual" {
                    continue;
                }

                // Spawn agent
                match spawn_agent_for_issue(
                    &epic.repo,
                    sub_issue.issue_number,
                    &sub_issue.agent_type,
                    &sub_issue.work_repo,
                    &config.worktree_base,
                ) {
                    Ok(agent_info) => {
                        result.spawned_agents.push(agent_info);
                    }
                    Err(e) => {
                        result.warnings.push(format!(
                            "Failed to spawn agent for issue #{}: {}",
                            sub_issue.issue_number, e
                        ));
                    }
                }
            }
        }
    }

    Ok(result)
}

/// Create a single issue for a phase
///
/// Instead of creating many small issues from tasks, we create one issue per phase.
/// The agent working on this phase will handle task breakdown and can create
/// follow-up issues if needed.
fn create_phase_issue(
    phase_num: u32,
    phase: &PhaseConfig,
    work_repo: &str,
    default_agent_type: &str,
) -> SubIssueConfig {
    // Create a concise title: "Phase N: Name"
    let title = truncate_title(&format!("Phase {}: {}", phase_num, phase.name));

    // Determine agent type based on approach
    let agent_type = match phase.approach.as_str() {
        "agent-assisted" => default_agent_type.to_string(),
        "automated" => "automated".to_string(),
        _ => "manual".to_string(),
    };

    // Build comprehensive tasks list from phase
    let tasks_text = if phase.tasks.is_empty() {
        phase.description.clone()
    } else {
        let task_list = phase
            .tasks
            .iter()
            .map(|t| format!("- {}", t))
            .collect::<Vec<_>>()
            .join("\n");

        if phase.files.is_empty() {
            task_list
        } else {
            let files_list = phase
                .files
                .iter()
                .map(|f| format!("- `{}`", f))
                .collect::<Vec<_>>()
                .join("\n");
            format!("{}\n\n**Relevant files**:\n{}", task_list, files_list)
        }
    };

    // Build acceptance criteria
    let mut criteria = vec![
        "All tasks completed".to_string(),
        "Tests pass".to_string(),
        "Code reviewed".to_string(),
    ];
    if !phase.tasks.is_empty() {
        criteria.insert(0, format!("{} tasks completed", phase.tasks.len()));
    }

    SubIssueConfig {
        title,
        phase: phase_num,
        estimated_time: estimate_phase_time(phase),
        dependencies: if phase.dependencies.is_empty() {
            "None".to_string()
        } else {
            phase.dependencies.join(", ")
        },
        goal: phase.description.clone(),
        tasks: tasks_text,
        acceptance_criteria: criteria,
        agent_type,
        work_repo: Some(work_repo.to_string()),
    }
}

/// Estimate time for a phase based on number of tasks
fn estimate_phase_time(phase: &PhaseConfig) -> String {
    let task_count = phase.tasks.len();
    if task_count == 0 {
        "2-4 hours".to_string()
    } else if task_count <= 3 {
        "4-8 hours".to_string()
    } else if task_count <= 6 {
        "1-2 days".to_string()
    } else {
        "2-3 days".to_string()
    }
}

/// Spawn an agent for a specific issue
fn spawn_agent_for_issue(
    repo: &str,
    issue_number: u32,
    agent_type: &str,
    work_repo: &str,
    worktree_base: &str,
) -> Result<SpawnedAgentInfo, String> {
    // Use the orchestrator to spawn the agent
    let config = orchestrator::SpawnConfig {
        repo: repo.to_string(),
        issue_number: issue_number as u64,
        agent_type: agent_type.to_string(),
        session_name: None,
        worktree_prefix: Some("handy-agent".to_string()),
        working_labels: vec!["staging".to_string()],
        use_sandbox: false, // TODO: Pass from config
        sandbox_ports: vec![], // Auto-detect ports from project
    };

    let spawn_result = orchestrator::spawn_agent(&config, worktree_base)?;

    Ok(SpawnedAgentInfo {
        issue_number,
        session_name: spawn_result.session_name,
        worktree_path: spawn_result.worktree.path,
        agent_type: agent_type.to_string(),
    })
}

/// Get phase status for an epic (how many sub-issues complete per phase)
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct PhaseStatus {
    pub phase_number: u32,
    pub phase_name: String,
    pub approach: String,
    pub total_issues: u32,
    pub completed_issues: u32,
    pub in_progress_issues: u32,
    pub status: String, // "not_started", "in_progress", "completed"
}

/// Get detailed status of all phases in an epic
pub async fn get_epic_phase_status(
    epic_number: u32,
    epic_repo: &str,
    phases: &[PhaseConfig],
) -> Result<Vec<PhaseStatus>, String> {
    use crate::devops::github;

    // Get all issues that reference this epic
    let all_issues = github::list_issues_async(epic_repo, vec![]).await?;

    let mut phase_statuses = Vec::new();

    for (idx, phase) in phases.iter().enumerate() {
        let phase_num = (idx + 1) as u32;

        // Filter issues for this phase by checking body content
        let phase_issues: Vec<_> = all_issues
            .iter()
            .filter(|issue| {
                let body = issue.body.as_deref().unwrap_or("");

                // Must reference the epic
                let refs_epic = body.contains(&format!("Epic**: #{}", epic_number));

                // Must be for this phase (check body for "**Phase**: N")
                let is_this_phase = body.contains(&format!("**Phase**: {}", phase_num));

                refs_epic && is_this_phase
            })
            .collect();

        let total = phase_issues.len() as u32;
        let completed = phase_issues
            .iter()
            .filter(|i| i.state == "closed")
            .count() as u32;
        let in_progress = phase_issues
            .iter()
            .filter(|i| {
                i.state == "open"
                    && i.labels.iter().any(|l| l == "staging")
            })
            .count() as u32;

        let status = if total == 0 {
            "not_started".to_string()
        } else if completed == total {
            "completed".to_string()
        } else {
            "in_progress".to_string()
        };

        phase_statuses.push(PhaseStatus {
            phase_number: phase_num,
            phase_name: phase.name.clone(),
            approach: phase.approach.clone(),
            total_issues: total,
            completed_issues: completed,
            in_progress_issues: in_progress,
            status,
        });
    }

    Ok(phase_statuses)
}
