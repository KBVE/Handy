//! Epic creation and management operations.

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::devops::github;

/// Configuration for creating a new epic issue
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct EpicConfig {
    /// Epic title (without [EPIC] prefix - added automatically)
    pub title: String,
    /// Tracking repository where Epic/Sub-issues are created (e.g., "org/Handy")
    pub repo: String,
    /// Work repository where code lives and agents work (e.g., "user/project")
    /// If None, defaults to same as repo
    pub work_repo: Option<String>,
    /// Epic description/goal (1-2 sentences)
    pub goal: String,
    /// Success metrics (checkbox list)
    pub success_metrics: Vec<String>,
    /// Phases with descriptions
    pub phases: Vec<PhaseConfig>,
    /// Labels to add to epic (epic label added automatically)
    pub labels: Vec<String>,
}

/// Phase configuration within an epic
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct PhaseConfig {
    /// Phase name (e.g., "Foundation", "Integration Tests")
    pub name: String,
    /// Phase description
    pub description: String,
    /// Approach: "manual", "agent-assisted", or "automated"
    pub approach: String,
}

/// Information about a created epic
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct EpicInfo {
    /// Epic issue number
    pub epic_number: u32,
    /// Tracking repository (where Epic is created)
    pub repo: String,
    /// Work repository (where code lives)
    pub work_repo: String,
    /// Epic title
    pub title: String,
    /// GitHub issue URL
    pub url: String,
    /// Phases from config
    pub phases: Vec<PhaseConfig>,
}

/// Configuration for creating a sub-issue
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SubIssueConfig {
    /// Sub-issue title (e.g., "Implement test_agent_spawning.rs")
    pub title: String,
    /// Phase number (1-indexed)
    pub phase: u32,
    /// Estimated time (e.g., "6 hours", "2 days")
    pub estimated_time: String,
    /// Dependencies (other sub-issue titles or "None")
    pub dependencies: String,
    /// Goal description (1-2 sentences)
    pub goal: String,
    /// Detailed task breakdown (markdown)
    pub tasks: String,
    /// Acceptance criteria (checkbox list)
    pub acceptance_criteria: Vec<String>,
    /// Recommended agent type
    pub agent_type: String,
    /// Work repository (where agent will work)
    /// If None, inherits from Epic
    pub work_repo: Option<String>,
}

/// Information about a created sub-issue
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SubIssueInfo {
    /// Issue number
    pub issue_number: u32,
    /// Issue title
    pub title: String,
    /// Phase number
    pub phase: u32,
    /// Recommended agent type
    pub agent_type: String,
    /// Work repository (where agent will work)
    pub work_repo: String,
    /// GitHub issue URL
    pub url: String,
}

/// Epic progress statistics
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct EpicProgress {
    /// Total sub-issues
    pub total: usize,
    /// Completed sub-issues
    pub completed: usize,
    /// Percentage complete
    pub percentage: usize,
    /// Remaining sub-issues
    pub remaining: usize,
}

/// Create a new epic issue with standardized structure
pub async fn create_epic(config: EpicConfig) -> Result<EpicInfo, String> {
    // Determine work_repo (default to tracking repo if not specified)
    let work_repo = config
        .work_repo
        .clone()
        .unwrap_or_else(|| config.repo.clone());

    // Format epic body from template (including work_repo info)
    let body = format_epic_body(&config, &work_repo);

    // Create GitHub issue
    let issue_number =
        github::create_issue_async(&config.repo, &format!("[EPIC] {}", config.title), &body)
            .await?;

    // Add labels (include "epic" automatically)
    let mut labels = config.labels.clone();
    if !labels.contains(&"epic".to_string()) {
        labels.push("epic".to_string());
    }
    github::add_labels_async(&config.repo, issue_number, &labels).await?;

    // Return epic info
    Ok(EpicInfo {
        epic_number: issue_number,
        repo: config.repo.clone(),
        work_repo,
        title: config.title,
        url: format!("https://github.com/{}/issues/{}", config.repo, issue_number),
        phases: config.phases,
    })
}

/// Format epic issue body using standard template
fn format_epic_body(config: &EpicConfig, work_repo: &str) -> String {
    let metrics = config
        .success_metrics
        .iter()
        .map(|m| format!("- [ ] {}", m))
        .collect::<Vec<_>>()
        .join("\n");

    let phases = config
        .phases
        .iter()
        .enumerate()
        .map(|(i, phase)| {
            format!(
                "### Phase {}: {}\n{}\n\n**Approach**: {}\n**Status**: ⏸️ Not Started\n",
                i + 1,
                phase.name,
                phase.description,
                phase.approach
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    // Show work repo if different from tracking repo
    let work_repo_line = if work_repo != config.repo {
        format!("\n**Work Repository**: {}\n", work_repo)
    } else {
        String::new()
    };

    format!(
        r#"# {}

## Goal
{}
{}
## Success Metrics
{}

## Phases

{}

## Progress
0/TBD sub-issues completed (0%)

## Notes
Created via Handy DevOps Epic Workflow
"#,
        config.title, config.goal, work_repo_line, metrics, phases
    )
}

/// Create multiple sub-issues for an epic in batch
pub async fn create_sub_issues(
    epic_number: u32,
    epic_repo: String,
    epic_work_repo: String,
    sub_issues: Vec<SubIssueConfig>,
) -> Result<Vec<SubIssueInfo>, String> {
    let mut created = Vec::new();

    for config in sub_issues.iter() {
        // Determine work_repo for this sub-issue (inherit from epic if not specified)
        let work_repo = config
            .work_repo
            .clone()
            .unwrap_or_else(|| epic_work_repo.clone());

        // Format sub-issue body (including work_repo)
        let body = format_sub_issue_body(epic_number, &epic_repo, &work_repo, config);

        // Create GitHub issue
        let issue_number = github::create_issue_async(&epic_repo, &config.title, &body).await?;

        // Add labels
        let labels = vec!["agent-ready".to_string(), format!("phase-{}", config.phase)];
        github::add_labels_async(&epic_repo, issue_number, &labels).await?;

        created.push(SubIssueInfo {
            issue_number,
            title: config.title.clone(),
            phase: config.phase,
            agent_type: config.agent_type.clone(),
            work_repo,
            url: format!("https://github.com/{}/issues/{}", epic_repo, issue_number),
        });
    }

    Ok(created)
}

/// Format sub-issue body using standard template
fn format_sub_issue_body(
    epic_number: u32,
    epic_repo: &str,
    work_repo: &str,
    config: &SubIssueConfig,
) -> String {
    let criteria = config
        .acceptance_criteria
        .iter()
        .map(|c| format!("- [ ] {}", c))
        .collect::<Vec<_>>()
        .join("\n");

    // Show work repo if different from tracking repo
    let work_repo_line = if work_repo != epic_repo {
        format!("**Work Repository**: {}\n", work_repo)
    } else {
        String::new()
    };

    format!(
        r#"# {}

**Epic**: #{}
**Phase**: {}
**Estimated Time**: {}
**Dependencies**: {}
{}
## Goal
{}

## Tasks
{}

## Acceptance Criteria
{}
- [ ] Code follows style guide (cargo fmt, clippy, eslint)
- [ ] Tests passing locally
- [ ] PR created referencing this issue

## Agent Assignment
**Agent Type**: {}
**Session**: handy-agent-TBD
**Worktree**: handy-worktrees/issue-TBD
**Started**: [Will be filled when agent spawns]
"#,
        config.title,
        epic_number,
        config.phase,
        config.estimated_time,
        config.dependencies,
        work_repo_line,
        config.goal,
        config.tasks,
        criteria,
        config.agent_type,
    )
}

/// Update epic issue progress section based on sub-issue completion
pub async fn update_epic_progress(
    epic_number: u32,
    epic_repo: String,
) -> Result<EpicProgress, String> {
    // Get epic issue
    let epic = github::get_issue_async(&epic_repo, epic_number).await?;

    // Find all sub-issues (issues that reference this epic)
    let all_issues = github::list_issues_async(&epic_repo, vec![]).await?;
    let sub_issues: Vec<_> = all_issues
        .into_iter()
        .filter(|issue| {
            issue
                .body
                .as_ref()
                .map(|b| b.contains(&format!("Epic**: #{}", epic_number)))
                .unwrap_or(false)
        })
        .collect();

    // Count completed (state == "closed")
    let total = sub_issues.len();
    let completed = sub_issues.iter().filter(|i| i.state == "closed").count();
    let percentage = if total > 0 {
        (completed * 100) / total
    } else {
        0
    };

    // Update epic body (replace progress section)
    let epic_body = epic.body.as_deref().unwrap_or("");
    let updated_body = update_progress_section(epic_body, completed, total, percentage);
    github::update_issue_body_async(&epic_repo, epic_number, &updated_body).await?;

    Ok(EpicProgress {
        total,
        completed,
        percentage,
        remaining: total - completed,
    })
}

/// Replace progress section in epic body with updated stats
fn update_progress_section(
    body: &str,
    completed: usize,
    total: usize,
    percentage: usize,
) -> String {
    // Find and replace "## Progress\n<line>" with updated stats
    let lines: Vec<&str> = body.lines().collect();
    let mut result = Vec::new();
    let mut skip_next = false;

    for line in lines.iter() {
        if skip_next {
            skip_next = false;
            // Replace this line with updated progress
            result.push(format!(
                "{}/{} sub-issues completed ({}%)",
                completed, total, percentage
            ));
            continue;
        }

        if line.starts_with("## Progress") {
            result.push(line.to_string());
            skip_next = true;
        } else {
            result.push(line.to_string());
        }
    }

    result.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_epic_body() {
        let config = EpicConfig {
            title: "Test Epic".to_string(),
            repo: "org/repo".to_string(),
            work_repo: None,
            goal: "Test goal".to_string(),
            success_metrics: vec!["Metric 1".to_string(), "Metric 2".to_string()],
            phases: vec![PhaseConfig {
                name: "Phase 1".to_string(),
                description: "Test phase".to_string(),
                approach: "manual".to_string(),
            }],
            labels: vec![],
        };

        let body = format_epic_body(&config, "org/repo");

        assert!(body.contains("# Test Epic"));
        assert!(body.contains("## Goal"));
        assert!(body.contains("Test goal"));
        assert!(body.contains("- [ ] Metric 1"));
        assert!(body.contains("- [ ] Metric 2"));
        assert!(body.contains("### Phase 1: Phase 1"));
        assert!(body.contains("**Approach**: manual"));
    }

    #[test]
    fn test_format_sub_issue_body() {
        let config = SubIssueConfig {
            title: "Test Task".to_string(),
            phase: 1,
            estimated_time: "2 hours".to_string(),
            dependencies: "None".to_string(),
            goal: "Test goal".to_string(),
            tasks: "- Task 1\n- Task 2".to_string(),
            acceptance_criteria: vec!["Criterion 1".to_string()],
            agent_type: "claude".to_string(),
            work_repo: None,
        };

        let body = format_sub_issue_body(100, "org/repo", "org/repo", &config);

        assert!(body.contains("**Epic**: #100"));
        assert!(body.contains("**Phase**: 1"));
        assert!(body.contains("**Estimated Time**: 2 hours"));
        assert!(body.contains("- [ ] Criterion 1"));
        assert!(body.contains("**Agent Type**: claude"));
    }

    #[test]
    fn test_update_progress_section() {
        let original = r#"# Epic Title

## Progress
0/10 sub-issues completed (0%)

## Notes
Some notes
"#;

        let updated = update_progress_section(original, 5, 10, 50);

        assert!(updated.contains("5/10 sub-issues completed (50%)"));
        assert!(updated.contains("## Notes"));
    }
}
