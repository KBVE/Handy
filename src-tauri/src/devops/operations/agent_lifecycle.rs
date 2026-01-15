//! Agent lifecycle operations: spawn, complete, cleanup.

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::devops::{github, tmux, worktree};

/// Configuration for spawning an agent from a GitHub issue
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SpawnAgentConfig {
    /// Issue reference (e.g., "org/Handy#101")
    pub issue_ref: String,
    /// Override agent type (if not specified in issue body)
    pub agent_type: Option<String>,
    /// Custom session name (if not auto-generated)
    pub session_name: Option<String>,
    /// Work repository (where code lives and agent works)
    /// If None, extracts from issue body or uses issue_ref repo
    pub work_repo: Option<String>,
}

/// Result of spawning an agent
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AgentSpawnResult {
    /// tmux session name
    pub session: String,
    /// Issue number
    pub issue_number: u32,
    /// Worktree path
    pub worktree: String,
    /// Agent type used
    pub agent_type: String,
    /// Agent metadata
    pub metadata: tmux::AgentMetadata,
}

/// Result of completing agent work
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AgentCompletionResult {
    /// PR URL
    pub pr_url: String,
    /// Issue number
    pub issue_number: u32,
    /// Session name
    pub session: String,
    /// Status
    pub status: String,
}

/// Result of PR detection for an agent session
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct PrDetectionResult {
    /// tmux session name
    pub session: String,
    /// Issue number the agent is working on
    pub issue_number: u32,
    /// Repository (org/repo format)
    pub repo: String,
    /// PR URL if found
    pub pr_url: Option<String>,
    /// PR number if found
    pub pr_number: Option<u64>,
    /// Branch name that was checked
    pub branch_name: String,
    /// Whether this is a newly detected PR (first time seeing it)
    pub is_new: bool,
}

/// Spawn an agent for a GitHub issue
///
/// This function:
/// 1. Fetches the issue from GitHub
/// 2. Extracts agent type and epic reference
/// 3. Creates a git worktree
/// 4. Creates a tmux session
/// 5. Sets metadata in tmux env vars
/// 6. Posts metadata comment to GitHub
/// 7. Adds "agent-assigned" label
pub async fn spawn_agent_from_issue(config: SpawnAgentConfig) -> Result<AgentSpawnResult, String> {
    // Parse issue reference
    let (repo, issue_number) = parse_issue_ref(&config.issue_ref)?;

    // Fetch issue from GitHub
    let issue = github::get_issue_async(&repo, issue_number).await?;

    // Extract agent type from issue body or use override
    let issue_body = issue.body.as_deref().unwrap_or("");
    let agent_type = config
        .agent_type
        .or_else(|| extract_agent_type(issue_body))
        .ok_or_else(|| {
            "Agent type not specified in config or issue body. \
             Add '**Agent Type**: <type>' to issue or provide agent_type in config"
                .to_string()
        })?;

    // Extract epic reference from issue body (optional)
    let epic_ref = extract_epic_ref(issue_body);

    // Extract work_repo from config, issue body, or default to issue_ref repo
    let work_repo = config
        .work_repo
        .or_else(|| extract_work_repo(issue_body))
        .unwrap_or_else(|| repo.clone());

    // Generate session name
    let session_name = config
        .session_name
        .unwrap_or_else(|| format!("handy-agent-{}", issue_number));

    // Get repo path from current directory
    // NOTE: This assumes we're running from the work_repo directory
    // In the future, we may want to clone work_repo if it's different from tracking repo
    let repo_path = std::env::current_dir().map_err(|e| e.to_string())?;

    // Create worktree (blocking operation)
    let branch_name = format!("issue-{}", issue_number);
    let repo_path_str = repo_path.to_string_lossy().to_string();
    let worktree_result = tokio::task::spawn_blocking({
        let repo_path = repo_path_str.clone();
        let branch_name = branch_name.clone();
        move || {
            let config = worktree::WorktreeConfig::default();
            worktree::create_worktree(&repo_path, &branch_name, &config, None)
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| format!("Failed to create worktree: {}", e))?;

    let worktree_path = worktree_result.path.clone();

    // Build metadata
    let machine_id = get_machine_id()?;
    let metadata = tmux::AgentMetadata {
        session: session_name.clone(),
        issue_ref: Some(config.issue_ref.clone()),
        repo: Some(repo.clone()),
        worktree: Some(worktree_path.clone()),
        agent_type: agent_type.clone(),
        machine_id: machine_id.clone(),
        started_at: chrono::Utc::now().to_rfc3339(),
    };

    // Create tmux session in the worktree (blocking operation)
    tokio::task::spawn_blocking({
        let session_name = session_name.clone();
        let worktree_path = worktree_path.clone();
        let metadata = metadata.clone();
        move || tmux::create_session(&session_name, Some(&worktree_path), &metadata)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| format!("Failed to create tmux session: {}", e))?;

    // Start the agent in the tmux session (blocking operation)
    let issue_title_for_agent = issue.title.clone();
    tokio::task::spawn_blocking({
        let session_name = session_name.clone();
        let agent_type = agent_type.clone();
        let repo = repo.clone();
        move || {
            tmux::start_agent_in_session(
                &session_name,
                &agent_type,
                &repo,
                issue_number as u64,
                Some(&issue_title_for_agent),
            )
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| format!("Failed to start agent in session: {}", e))?;

    // Post metadata comment to GitHub
    let comment_body = format_agent_metadata_comment(&metadata, &issue.title, epic_ref.as_deref());
    github::add_issue_comment_async(&repo, issue_number, &comment_body)
        .await
        .map_err(|e| format!("Failed to add GitHub comment: {}", e))?;

    // Add "agent-assigned" label
    github::add_labels_async(&repo, issue_number, &vec!["agent-assigned".to_string()])
        .await
        .map_err(|e| format!("Failed to add labels: {}", e))?;

    Ok(AgentSpawnResult {
        session: session_name,
        issue_number,
        worktree: worktree_path,
        agent_type,
        metadata,
    })
}

/// Complete agent work by creating a PR
///
/// This function:
/// 1. Gets agent status from tmux
/// 2. Pushes the branch to remote
/// 3. Creates a PR via GitHub CLI
/// 4. Adds labels to PR
/// 5. Comments on issue with PR link
/// 6. Updates epic progress if applicable
pub async fn complete_agent_work(
    session: String,
    pr_title: Option<String>,
) -> Result<AgentCompletionResult, String> {
    // Get agent metadata from tmux (blocking operation)
    let metadata = tokio::task::spawn_blocking({
        let session = session.clone();
        move || tmux::get_session_metadata(&session)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| format!("Failed to get session metadata: {}", e))?;

    // Clone values from metadata that we'll use later
    let issue_ref = metadata
        .issue_ref
        .as_ref()
        .ok_or_else(|| "Agent has no issue reference".to_string())?
        .clone();
    let worktree_path = metadata
        .worktree
        .as_ref()
        .ok_or_else(|| "Agent has no worktree path".to_string())?
        .clone();

    let (repo, issue_number) = parse_issue_ref(&issue_ref)?;

    // Get issue details
    let issue = github::get_issue_async(&repo, issue_number).await?;

    let branch_name = format!("issue-{}", issue_number);

    // Push branch (blocking operation)
    tokio::task::spawn_blocking({
        let worktree_path = worktree_path.clone();
        let branch_name = branch_name.clone();
        move || push_branch(&worktree_path, &branch_name)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| format!("Failed to push branch: {}", e))?;

    // Create PR
    let pr_title = pr_title.unwrap_or_else(|| issue.title.clone());
    let pr_body = format_pr_body(&issue.title, issue_number, &metadata);

    let pr_url = github::create_pr_async(&repo, &pr_title, &pr_body, "main", &branch_name)
        .await
        .map_err(|e| format!("Failed to create PR: {}", e))?;

    // Add labels to PR
    github::add_pr_labels_async(&repo, &pr_url, vec!["agent-created".to_string()])
        .await
        .ok(); // Non-critical, continue even if fails

    // Comment on issue
    let completion_comment = format!(
        "✅ **Work Complete**\n\nPR created: {}\n\nAgent `{}` has finished implementation.",
        pr_url, session
    );
    github::add_issue_comment_async(&repo, issue_number, &completion_comment)
        .await
        .ok(); // Non-critical

    // Update epic progress if epic exists
    // Epic ref is stored in GitHub comment metadata, would need to parse from issue comments
    // For now, skip this feature - will implement when adding epic tracking

    Ok(AgentCompletionResult {
        pr_url,
        issue_number,
        session,
        status: "completed".to_string(),
    })
}

/// Detect if a PR exists for an agent's branch
///
/// This function:
/// 1. Gets agent metadata from the tmux session
/// 2. Extracts the issue number to determine the branch name (issue-{number})
/// 3. Queries GitHub for PRs with that head branch
/// 4. Returns PR info if found
pub async fn detect_pr_for_agent(session: &str) -> Result<Option<PrDetectionResult>, String> {
    // Get agent metadata from tmux (blocking operation)
    let metadata = tokio::task::spawn_blocking({
        let session = session.to_string();
        move || tmux::get_session_metadata(&session)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| format!("Failed to get session metadata: {}", e))?;

    // Get issue reference from metadata
    let issue_ref = metadata
        .issue_ref
        .as_ref()
        .ok_or_else(|| "Agent has no issue reference".to_string())?;

    let (repo, issue_number) = parse_issue_ref(issue_ref)?;

    // Branch name follows our convention: issue-{number}
    let branch_name = format!("issue-{}", issue_number);

    // Check GitHub for a PR with this branch
    let pr = github::find_pr_by_branch_async(&repo, &branch_name).await?;

    match pr {
        Some(pr_info) => Ok(Some(PrDetectionResult {
            session: session.to_string(),
            issue_number,
            repo,
            pr_url: Some(pr_info.url),
            pr_number: Some(pr_info.number),
            branch_name,
            is_new: false, // Caller will determine if it's new
        })),
        None => Ok(Some(PrDetectionResult {
            session: session.to_string(),
            issue_number,
            repo,
            pr_url: None,
            pr_number: None,
            branch_name,
            is_new: false,
        })),
    }
}

/// Parse issue reference like "org/repo#123" into (repo, number)
fn parse_issue_ref(issue_ref: &str) -> Result<(String, u32), String> {
    let parts: Vec<&str> = issue_ref.split('#').collect();
    if parts.len() != 2 {
        return Err(format!(
            "Invalid issue reference: {}. Expected format: org/repo#123",
            issue_ref
        ));
    }

    let repo = parts[0].to_string();
    let number = parts[1]
        .parse::<u32>()
        .map_err(|_| format!("Invalid issue number: {}", parts[1]))?;

    Ok((repo, number))
}

/// Extract agent type from issue body
/// Looks for pattern: "**Agent Type**: <type>"
fn extract_agent_type(issue_body: &str) -> Option<String> {
    let re = regex::Regex::new(r"\*\*Agent Type\*\*:\s*(\w+)").ok()?;
    re.captures(issue_body)?
        .get(1)
        .map(|m| m.as_str().to_string())
}

/// Extract epic reference from issue body
/// Looks for pattern: "**Epic**: #<number>"
fn extract_epic_ref(issue_body: &str) -> Option<String> {
    let re = regex::Regex::new(r"\*\*Epic\*\*:\s*#(\d+)").ok()?;
    re.captures(issue_body)?
        .get(1)
        .map(|m| format!("#{}", m.as_str()))
}

/// Extract work repository from issue body
/// Looks for pattern: "**Work Repository**: <org/repo>"
fn extract_work_repo(issue_body: &str) -> Option<String> {
    let re = regex::Regex::new(r"\*\*Work Repository\*\*:\s*([\w-]+/[\w-]+)").ok()?;
    re.captures(issue_body)?
        .get(1)
        .map(|m| m.as_str().to_string())
}

/// Get machine ID (hostname)
fn get_machine_id() -> Result<String, String> {
    hostname::get()
        .map_err(|e| format!("Failed to get hostname: {}", e))?
        .to_string_lossy()
        .to_string()
        .pipe(Ok)
}

/// Format agent metadata comment for GitHub
fn format_agent_metadata_comment(
    metadata: &tmux::AgentMetadata,
    issue_title: &str,
    epic_ref: Option<&str>,
) -> String {
    let metadata_json = serde_json::to_string_pretty(metadata).unwrap_or_else(|_| "{}".to_string());

    let epic_line = if let Some(epic) = epic_ref {
        format!("- **Epic**: {}\n", epic)
    } else {
        String::new()
    };

    format!(
        r#"<!-- HANDY_AGENT_METADATA
{}
-->

🤖 **Agent Assigned**
- **Session**: `{}`
- **Type**: {}
- **Worktree**: `{}`
- **Machine**: {}
{}- **Started**: {}

Agent is now working on: {}

Will update with progress.
"#,
        metadata_json,
        metadata.session,
        metadata.agent_type,
        metadata
            .worktree
            .as_ref()
            .and_then(|w| w.split('/').last())
            .unwrap_or("unknown"),
        metadata.machine_id,
        epic_line,
        metadata.started_at,
        issue_title,
    )
}

/// Format PR body with standard template
fn format_pr_body(issue_title: &str, issue_number: u32, metadata: &tmux::AgentMetadata) -> String {
    format!(
        r#"## Summary
{}

## Changes
Implementation of #{} via DevOps agent.

## Testing
```bash
# Run tests to verify changes
cargo test  # For Rust
bun run test  # For TypeScript
```

## Related Issues
Closes #{}

---

🤖 Generated by {} agent `{}`
"#,
        issue_title, issue_number, issue_number, metadata.agent_type, metadata.session,
    )
}

/// Push git branch to remote
fn push_branch(worktree_path: &str, branch_name: &str) -> Result<(), String> {
    use std::process::Command;

    let output = Command::new("git")
        .args(&["push", "-u", "origin", branch_name])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to execute git push: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "git push failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(())
}

// Helper trait for .pipe()
trait Pipe: Sized {
    fn pipe<F, R>(self, f: F) -> R
    where
        F: FnOnce(Self) -> R,
    {
        f(self)
    }
}

impl<T> Pipe for T {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_issue_ref() {
        let (repo, number) = parse_issue_ref("org/Handy#101").unwrap();
        assert_eq!(repo, "org/Handy");
        assert_eq!(number, 101);
    }

    #[test]
    fn test_parse_issue_ref_invalid() {
        assert!(parse_issue_ref("invalid").is_err());
        assert!(parse_issue_ref("org/repo").is_err());
        assert!(parse_issue_ref("org/repo#abc").is_err());
    }

    #[test]
    fn test_extract_agent_type() {
        let body = "Some text\n**Agent Type**: claude\nMore text";
        assert_eq!(extract_agent_type(body), Some("claude".to_string()));
    }

    #[test]
    fn test_extract_agent_type_not_found() {
        let body = "Some text without agent type";
        assert_eq!(extract_agent_type(body), None);
    }

    #[test]
    fn test_extract_epic_ref() {
        let body = "Some text\n**Epic**: #100\nMore text";
        assert_eq!(extract_epic_ref(body), Some("#100".to_string()));
    }

    #[test]
    fn test_extract_epic_ref_not_found() {
        let body = "Some text without epic";
        assert_eq!(extract_epic_ref(body), None);
    }

    #[test]
    fn test_extract_work_repo() {
        let body = "Some text\n**Work Repository**: user/my-project\nMore text";
        assert_eq!(extract_work_repo(body), Some("user/my-project".to_string()));
    }

    #[test]
    fn test_extract_work_repo_not_found() {
        let body = "Some text without work repo";
        assert_eq!(extract_work_repo(body), None);
    }
}
