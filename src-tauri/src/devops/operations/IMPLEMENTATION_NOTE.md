# Implementation Note

The operations.rs module was designed to implement high-level Epic Workflow operations, but after implementation we discovered that it conflicts with the existing architecture:

## Issues Found

1. **Function Signatures Don't Match**:
   - Existing `github::create_issue()` is synchronous, takes 4 args (repo, title, body, labels)
   - My code expected async with 3 args

2. **AgentMetadata Structure Different**:
   - tmux::AgentMetadata doesn't have `epic_ref`, `is_attached`, `is_local`, `pr_url`
   - orchestrator::AgentStatus has most of these but different structure

3. **Worktree Return Type Different**:
   - `worktree::create_worktree()` returns `WorktreeCreateResult`, not `PathBuf`
   - Need to extract actual path from the struct

## Recommended Fix

Rather than completely rewriting operations.rs to match existing signatures, we should:

**Option 1**: Add missing helper functions to github.rs and tmux.rs

- `github::add_labels(repo, issue_num, labels)`
- `github::update_issue_body(repo, issue_num, body)`
- `github::add_issue_comment(repo, issue_num, comment)`
- `github::add_pr_labels(repo, pr_url, labels)`
- `tmux::set_session_metadata(session, metadata)`

**Option 2**: Use existing orchestrator functions

- `orchestrator::spawn_agent()` already does most of what spawn_agent_from_issue() does
- `orchestrator::complete_agent_work()` already handles PR creation
- Just need to add Epic-specific wrapper logic

## Recommendation

**Go with Option 2** - Use existing orchestrator functions and add Epic-specific logic on top:

```rust
pub async fn spawn_agent_from_issue(config: SpawnAgentConfig) -> Result<AgentSpawnResult, String> {
    // Parse issue ref
    let (repo, issue_number) = parse_issue_ref(&config.issue_ref)?;

    // Extract epic ref from issue body
    let issue = github::get_issue(&repo, issue_number, None, None)?;
    let epic_ref = extract_epic_ref(&issue.body);

    // Use existing spawn_agent
    let spawn_config = orchestrator::SpawnConfig {
        repo,
        issue_number: issue_number as u64,
        agent_type: config.agent_type.unwrap_or_else(|| extract_agent_type(&issue.body).unwrap()),
        session_name: config.session_name,
        worktree_prefix: None,
        working_labels: vec!["staging".to_string()],
    };

    let result = orchestrator::spawn_agent(&spawn_config)?;

    // Add epic metadata to GitHub comment if epic exists
    if let Some(epic_ref) = epic_ref {
        // Post comment with epic ref
    }

    Ok(AgentSpawnResult {
        session: result.session_name,
        issue_number: issue_number as u32,
        worktree: result.worktree.worktree_path,
        agent_type: spawn_config.agent_type,
        metadata: ...,
    })
}
```

This way we leverage existing tested code and just add Epic-specific enhancements.
