#!/bin/bash
# Create Epic #100: CICD Testing Infrastructure
# This uses gh CLI to create the epic issue with proper formatting

set -e

REPO="KBVE/Handy"

echo "Creating Epic #100: CICD Testing Infrastructure"
echo "Repository: $REPO"
echo ""

# Create the epic body
BODY=$(cat <<'EOF'
# CICD Testing Infrastructure

## Goal
Build comprehensive testing and CI/CD infrastructure for the multi-agent DevOps system to ensure production readiness and prevent future breakage.

## Success Metrics
- [ ] 100+ total tests
- [ ] >70% code coverage
- [ ] CI/CD running on all PRs
- [ ] Pre-commit hooks active
- [ ] All phases complete

## Phases

### Phase 1: Foundation
Build test utilities and infrastructure (test mocks, fixtures, helpers)

**Approach**: manual
**Status**: ⏸️ Not Started

### Phase 2: Integration Tests
Comprehensive integration tests for agent workflows (spawning, cleanup, PR creation, session recovery)

**Approach**: agent-assisted
**Status**: ⏸️ Waiting for Phase 1

### Phase 3: CI/CD Integration
GitHub Actions workflow, pre-commit hooks, coverage tracking

**Approach**: agent-assisted
**Status**: ⏸️ Waiting for Phase 2

### Phase 4: Advanced Scenarios
Multi-machine coordination, error handling, resource limits

**Approach**: agent-assisted
**Status**: ⏸️ Waiting for Phase 3

## Progress
0/TBD sub-issues completed (0%)

## Notes
Created via Handy DevOps Epic Workflow
- Phase 1 is manual to ensure solid foundation
- Phases 2-4 use DevOps agents for dogfooding
- Each sub-issue maps to exactly one agent session
EOF
)

echo "Creating epic issue..."
ISSUE_URL=$(gh issue create \
  --repo "$REPO" \
  --title "[EPIC] CICD Testing Infrastructure" \
  --body "$BODY" \
  --label "epic,cicd,testing,high-priority")

echo ""
echo "✅ Epic created successfully!"
echo "URL: $ISSUE_URL"
echo ""
echo "Next steps:"
echo "  1. Create sub-issue for Phase 1 implementation"
echo "  2. Implement test utilities manually"
echo "  3. Create sub-issues for Phase 2-4"
echo "  4. Spawn agents for Phase 2+ tasks"
