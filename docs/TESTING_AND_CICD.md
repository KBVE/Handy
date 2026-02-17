# Testing Strategy & CI/CD Integration

This document covers the comprehensive testing strategy and CI/CD setup for Handy's multi-agent DevOps system, plus documentation for the markdown-based Epic planning feature.

## Overview

The DevOps system integrates tmux session management, Git worktree isolation, and GitHub API operations to enable parallel agent execution. This testing strategy ensures production readiness without breaking existing functionality.

### Current State

- **Test Coverage**: ~0.27% (8 trivial tests for 2,942 lines of DevOps code)
- **Integration Tests**: None
- **CI/CD Testing**: Tests not running in GitHub Actions
- **Critical Gaps**: All core workflows untested (spawn_agent, cleanup_agent, worktree management, GitHub operations)

---

## Testing Strategy: Four Phases

### Phase 1: Foundation - Basic Unit Tests

**Goal**: Test individual functions in isolation, establish testing infrastructure

#### Dependencies to Add

Add to `src-tauri/Cargo.toml`:

```toml
[dev-dependencies]
mockall = "0.12"           # Mocking framework for external commands
tempfile = "3.8"           # Temporary directories for test isolation
assert_cmd = "2.0"         # Command execution testing utilities
predicates = "3.0"         # Assertion helpers for tests
serial_test = "3.0"        # Prevent parallel test conflicts with tmux
wiremock = "0.6"           # HTTP mocking for GitHub API (if using REST)
```

#### Test Utilities Setup

Create shared test infrastructure in `src-tauri/tests/common/`:

- **`mod.rs`** - Test utilities module (temp dirs, test repos, tmux socket helpers)
- **`mocks.rs`** - Command mocking (MockGitHub, MockCommandExecutor)
- **`fixtures.rs`** - Test data (issue JSON, metadata comments, tmux output)

#### Core Function Unit Tests

**tmux.rs** (Priority: High):

- `parse_session_name()` - Valid/invalid formats
- `build_session_env()` - Metadata serialization
- `parse_session_metadata()` - Complete/missing fields
- `parse_session_list()` - tmux ls output parsing
- Session name collision detection
- Env var escaping/quoting

**worktree.rs** (Priority: High):

- `parse_branch_name()` - Issue ref to branch name
- `check_worktree_collision()` - Collision detection
- `parse_worktree_list()` - git worktree list parsing
- `build_worktree_path()` - Path construction
- Branch name sanitization

**github.rs** (Priority: Medium):

- `parse_agent_metadata()` - Valid/malformed/missing metadata
- `format_issue_ref()` - URL and number formats
- `build_label_args()` - Empty/multiple labels
- Issue comment parsing

**dependencies.rs** (Priority: Low):

- `parse_version()` - gh/tmux/claude version strings
- Detector functions with mocked output

#### Success Criteria

- [ ] 40+ unit tests covering core parsing/formatting functions
- [ ] Test utilities and mocks available for all external commands
- [ ] All tests pass in local `cargo test`
- [ ] Coverage for Phase 1 functions: >80%

---

### Phase 2: Integration Tests - Critical Workflows

**Goal**: Test end-to-end workflows with real git/tmux operations in isolated test environments

#### Test Environment Setup

Create `src-tauri/tests/integration/` directory:

- `test_agent_spawning.rs` - Agent lifecycle (spawn, cleanup, collision)
- `test_pr_workflow.rs` - PR creation and auto-cleanup after merge
- `test_session_recovery.rs` - Recovery from tmux/GitHub, orphan detection
- `test_worktree_ops.rs` - Worktree creation, removal, listing

Each integration test:

- Creates temporary git repository
- Uses custom tmux socket (`-L handy-test-{pid}`)
- Mocks GitHub API calls (no network requests)
- Cleans up all resources after test

#### Key Test Examples

**Agent Spawning** (`test_agent_spawning.rs`):

```rust
#[test]
#[serial]
fn test_spawn_agent_full_workflow() {
    // Setup: temp repo, custom tmux socket
    // Action: spawn agent for issue #42
    // Assert: worktree created, tmux session exists, metadata stored
    // Assert: agent appears in list_agent_statuses()
    // Cleanup: remove all resources
}
```

**Session Recovery** (`test_session_recovery.rs`):

```rust
#[test]
#[serial]
fn test_recover_sessions_from_tmux_metadata() {
    // Setup: create sessions with metadata manually
    // Action: recover_sessions()
    // Assert: all detected, metadata parsed correctly
}

#[test]
fn test_orphan_detection_github_only() {
    // Setup: GitHub metadata but no tmux session
    // Assert: orphan detected, restart suggested
}
```

#### Success Criteria

- [ ] 20+ integration tests covering all critical workflows
- [ ] All tests use isolated environments (temp repos, custom tmux socket)
- [ ] No reliance on actual GitHub API (mocked)
- [ ] Tests clean up after themselves (no leftover sessions/worktrees)
- [ ] All tests pass consistently

---

### Phase 3: CI/CD Integration

**Goal**: Ensure tests run automatically on every commit/PR

#### GitHub Actions Workflow

Create/update `.github/workflows/test.yml`:

```yaml
name: Test

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test-rust:
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]

    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy

      - name: Cache cargo registry
        uses: actions/cache@v3
        with:
          path: ~/.cargo/registry
          key: ${{ runner.os }}-cargo-registry-${{ hashFiles('**/Cargo.lock') }}

      - name: Install dependencies (Linux)
        if: runner.os == 'Linux'
        run: |
          sudo apt-get update
          sudo apt-get install -y tmux git

      - name: Install dependencies (macOS)
        if: runner.os == 'macOS'
        run: brew install tmux git

      - name: Run formatter check
        run: cargo fmt --all -- --check
        working-directory: src-tauri

      - name: Run clippy
        run: cargo clippy --all-targets --all-features -- -D warnings
        working-directory: src-tauri

      - name: Run unit tests
        run: cargo test --lib --workspace --verbose
        working-directory: src-tauri

      - name: Run integration tests (Unix)
        if: runner.os != 'Windows'
        run: cargo test --test '*' --workspace --verbose
        working-directory: src-tauri

      - name: Generate coverage report (Linux only)
        if: runner.os == 'Linux'
        run: |
          cargo install cargo-tarpaulin
          cargo tarpaulin --out Xml --workspace --timeout 300
        working-directory: src-tauri

      - name: Upload coverage to Codecov
        if: runner.os == 'Linux'
        uses: codecov/codecov-action@v3
        with:
          files: src-tauri/cobertura.xml
```

#### Pre-commit Hooks

Add to `.husky/pre-commit`:

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

echo "Running pre-commit checks..."

# Backend checks
cd src-tauri
cargo fmt --all -- --check || exit 1
cargo clippy --all-targets --all-features -- -D warnings || exit 1
cargo test --lib --quiet || exit 1

echo "✅ Pre-commit checks passed!"
```

#### Branch Protection Rules

Configure in GitHub repository settings:

- Require status checks to pass before merging
- Require branches to be up to date
- Required checks: test-rust (ubuntu, macos, windows)

#### Success Criteria

- [ ] Tests run on every push to main
- [ ] Tests run on every PR
- [ ] Tests pass on all platforms (Linux, macOS, Windows where applicable)
- [ ] Coverage reports generated and tracked
- [ ] Failed tests block PR merges
- [ ] Pre-commit hooks prevent committing broken code

---

### Phase 4: Advanced Scenarios & Edge Cases

**Goal**: Test complex multi-machine scenarios and error recovery

#### Multi-Machine Coordination Tests

**test_multi_machine.rs**:

```rust
#[test]
fn test_remote_agent_detection() {
    // Setup: Mock GitHub comments with different machine_id
    // Assert: Remote agents marked as is_local=false
    // Assert: Cleanup disabled for remote agents
}

#[test]
fn test_concurrent_agents_no_collision() {
    // Action: Spawn 5 agents for different issues concurrently
    // Assert: All succeed, no worktree/session collisions
}
```

#### Error Recovery Tests

**test_error_handling.rs**:

```rust
#[test]
fn test_spawn_agent_when_gh_cli_missing() {
    // Setup: Mock gh command to fail
    // Assert: Proper error, no partial state created
}

#[test]
fn test_recovery_with_corrupted_metadata() {
    // Setup: Session with malformed JSON in env
    // Assert: Session detected as orphan
}
```

#### Success Criteria

- [ ] 15+ tests for edge cases and error scenarios
- [ ] Multi-machine scenarios verified
- [ ] All error paths tested
- [ ] Resource limits respected
- [ ] Overall test suite: >100 tests, >70% coverage

---

## Risk Mitigation

### Tests interfere with developer's local tmux sessions

**Mitigation**: Always use custom socket (`-L handy-test-{pid}`)

### Integration tests are slow

**Mitigation**: Parallelize where possible, use `#[ignore]` for expensive tests, only run quick tests in pre-commit

### Platform-specific failures (Windows tmux issues)

**Mitigation**: Conditional compilation `#[cfg(not(windows))]`, skip tmux tests on Windows

### Flaky tests due to timing issues

**Mitigation**: Proper wait/retry logic, avoid hard-coded sleeps, deterministic mocks, `serial_test` crate

### Tests create real GitHub issues/PRs during development

**Mitigation**: Mock all GitHub API calls, never use real tokens in tests

---

## Markdown-Based Epic Planning

AI-assisted Epic planning that analyzes markdown plan files and automatically generates Epic issues with Sub-issues on GitHub.

### Overview

This feature allows you to:

1. Write a detailed project plan in markdown
2. Let an AI agent (Claude or Aider) analyze it
3. Automatically create an Epic issue with all Sub-issues on GitHub

### How It Works

```
Markdown Plan → AI Agent Analysis → Epic Structure → GitHub Issues Created
```

### Prerequisites

**For Claude agent** (recommended):

- Set environment variable: `ANTHROPIC_API_KEY=your-api-key`
- Uses Claude Sonnet 4.5 via API

**For Aider agent**:

- Install Aider: `pip install aider-chat`
- Ensure `aider` command is in PATH

### Using the UI

1. Open DevOps Settings in Handy
2. Find "Epic Workflow - From Markdown" section
3. Enter:
   - **File Path**: Path to your markdown plan (e.g., `/Users/you/.claude/plans/my-plan.md`)
   - **Repository**: Tracking repo (e.g., `KBVE/kbve`)
   - **Work Repository**: (Optional) Code repo if different (e.g., `KBVE/Handy`)
   - **Title Override**: (Optional) Override the epic title
   - **Planning Agent**: `claude` or `aider`
4. Click "Plan Epic from Markdown"
5. Wait for AI analysis and issue creation
6. View Epic and Sub-issues on GitHub

### Markdown Plan Format

Your markdown plan should include:

**Essential Information:**

- **Epic Title**: Main heading or explicit title
- **Goal**: 1-2 sentence description
- **Success Metrics**: Measurable outcomes
- **Phases**: Major stages with approach (manual/agent-assisted/automated)

**For Each Sub-Issue:**

- Title, goal/objective
- Tasks breakdown
- Acceptance criteria
- Recommended agent type
- Estimated time
- Dependencies

### Example Plan Structure

```markdown
# CI/CD Testing Infrastructure

## Goal

Build comprehensive testing and CI/CD infrastructure for the multi-agent DevOps system.

## Success Metrics

- [ ] 100+ total tests
- [ ] > 70% code coverage
- [ ] CI/CD running on all PRs

## Phase 1: Foundation

**Approach**: manual

Build test utilities and infrastructure (test mocks, fixtures, helpers).

**Tasks**:

- Create test utilities module
- Set up mock framework
- Build test fixtures

**Estimated Time**: 1-2 days

## Phase 2: Integration Tests

**Approach**: agent-assisted

Comprehensive integration tests for agent workflows.

**Tasks**:

- Test agent spawning
- Test worktree management
- Test PR creation

**Dependencies**: Phase 1 complete
**Estimated Time**: 2-3 days
```

### AI Agent Prompt

The agent receives a structured prompt asking it to extract:

1. Epic title, goal, success metrics, phases, labels
2. Sub-issues for each phase with detailed breakdown

The agent returns JSON in a specific format that the system uses to create GitHub issues.

### Output Structure

```typescript
{
  epic: {
    epic_number: 100,
    repo: "KBVE/kbve",
    work_repo: "KBVE/Handy",
    title: "CI/CD Testing Infrastructure",
    url: "https://github.com/KBVE/kbve/issues/100",
    phases: [...]
  },
  sub_issues: [
    {
      issue_number: 101,
      title: "Phase 1: Foundation - Test utilities",
      url: "https://github.com/KBVE/kbve/issues/101",
      work_repo: "KBVE/Handy"
    }
  ],
  planning_agent: "claude",
  summary: "Created Epic #100 with 2 sub-issues using claude agent"
}
```

### Common Errors

**ANTHROPIC_API_KEY not set**:

```
ANTHROPIC_API_KEY not set. Set it in your environment or use 'aider' agent type.
```

Solution: `export ANTHROPIC_API_KEY=your-key` or use Aider

**File not found**:

```
Failed to read plan file: No such file or directory
```

Solution: Check file path is absolute and file exists

**Invalid JSON from agent**:

```
Failed to parse agent output as JSON
```

Solution: Agent didn't return valid JSON - check plan complexity or try different agent

**GitHub API errors**:

```
API error: 401 Unauthorized
```

Solution: Ensure `gh` CLI is authenticated: `gh auth login`

### Best Practices

1. **Write Clear Plans**: Use specific, measurable success metrics, break work into logical phases
2. **Choose the Right Agent**: Claude for complex plans (requires API key), Aider for simpler plans (free, local CLI)
3. **Review Before Spawning Agents**: Check Epic and Sub-issues on GitHub, verify phase ordering
4. **Iterative Planning**: Start with high-level plan, add details after Epic is created

### Integration with Agent Workflow

After creating Epic + Sub-issues:

1. **Manual phases**: Implement directly
2. **Agent-assisted phases**: Spawn agents for sub-issues
3. **Monitor progress** in Epic issue
4. **Complete agents** to create PRs
5. **Update Epic** as Sub-issues close

### Architecture

**Backend (Rust)**: `src-tauri/src/devops/operations/plan.rs`

- `plan_from_markdown()`: Main entry point
- `spawn_planning_agent()`: Spawns Claude/Aider with prompt
- `parse_agent_output()`: Extracts JSON from agent response
- Creates Epic + Sub-issues via operations module

**Frontend (TypeScript)**: `src/components/settings/devops/MarkdownEpicPlanner.tsx`

- Form for file path, repo, agent selection
- Invokes `plan_epic_from_markdown` command
- Displays results with links to GitHub

### Costs

**Claude API**: ~4000-8000 tokens per plan (~$0.01-0.02 per Epic)
**Aider**: Free alternative (local CLI)

---

## Success Metrics

### Phase 1 Complete:

- ✅ 40+ unit tests
- ✅ Test utilities established
- ✅ >80% coverage for parsing functions

### Phase 2 Complete:

- ✅ 20+ integration tests
- ✅ All critical workflows tested
- ✅ End-to-end scenarios verified

### Phase 3 Complete:

- ✅ CI/CD running tests automatically
- ✅ Coverage >50%
- ✅ Pre-commit hooks active

### Phase 4 Complete:

- ✅ 100+ total tests
- ✅ Coverage >70%
- ✅ All edge cases covered
- ✅ Production-ready confidence

---

## Related Documentation

- [Epic Workflow SOP](../EPIC_WORKFLOW_SOP.md) - Standard operating procedure
- [CICD Epic Structure](../CICD_EPIC_STRUCTURE.md) - Concrete example
- [Adding Epic Plans](./ADDING_EPIC_PLANS.md) - Predefined templates
