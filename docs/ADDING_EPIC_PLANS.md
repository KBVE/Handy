# Adding New Epic Plans

This guide explains how to add new epic templates and create custom Epics in the Handy DevOps Epic Workflow system.

## Overview

The Generic Epic Creator is a **3-step wizard** that lets you:

1. **Select a template** (or start blank)
2. **Edit and customize** everything (title, goal, phases, metrics, labels)
3. **Review and create** the Epic on GitHub

Epic templates are stored in `GenericEpicCreator.tsx` as TypeScript objects, but **everything is editable** before creation!

## Creating an Epic (User Guide)

### Step 1: Choose Template

1. Open DevOps Settings → "Epic Workflow - Predefined Plans"
2. Select a template:
   - **Blank**: Start from scratch
   - **CICD Testing Infrastructure**: Pre-filled testing epic
3. Enter target repositories:
   - **Tracking Repository**: Where Epic/Sub-issues are created (e.g., `KBVE/kbve`)
   - **Work Repository** (optional): Where code lives and agents work (e.g., `KBVE/Handy`)
4. Click "Next: Edit Plan →"

### Step 2: Edit Plan

Customize every aspect:

- **Epic Title**: Required
- **Goal**: 1-2 sentence description (required)
- **Success Metrics**: Add/remove checkboxes
- **Phases**: Add/remove/reorder phases with ↑↓ buttons
  - Each phase has: name, description, approach (manual/agent-assisted/automated)
- **Labels**: Add GitHub labels
- Click "Review Plan →"

### Step 3: Review & Create

- Preview the final Epic structure
- Go back to edit if needed
- Click "Create Epic ✓" to create on GitHub

## Adding Templates (Developer Guide)

To add a new template to the dropdown:

1. Open `src/components/settings/devops/GenericEpicCreator.tsx`
2. Add your template to the `EPIC_TEMPLATES` object
3. Users can select and customize it!

## Epic Plan Structure

```typescript
interface EpicPlan {
  title: string; // Epic title (without [EPIC] prefix)
  goal: string; // 1-2 sentence description
  successMetrics: string[]; // Checkbox list of success criteria
  phases: PhaseConfig[]; // Array of phases
  labels: string[]; // GitHub labels to apply
}

interface PhaseConfig {
  name: string; // Phase name (e.g., "Foundation")
  description: string; // What happens in this phase
  approach: string; // "manual" | "agent-assisted" | "automated"
}
```

## Example: Adding a New Epic Plan

Let's add an epic for implementing multi-language support:

```typescript
const EPIC_PLANS: Record<string, EpicPlan> = {
  // ... existing plans ...

  "multi-language": {
    title: "Multi-Language Support",
    goal: "Add comprehensive i18n support for Spanish, French, German, and Japanese to reach global users.",
    successMetrics: [
      "5 languages fully translated",
      "RTL support for Arabic",
      "Language switcher in UI",
      "Automated translation workflow",
      "All UI strings externalized",
    ],
    phases: [
      {
        name: "Infrastructure",
        description:
          "Set up i18next, create translation files structure, extract all hardcoded strings",
        approach: "manual",
      },
      {
        name: "Spanish Translation",
        description:
          "Translate all strings to Spanish, test UI layout, verify cultural appropriateness",
        approach: "agent-assisted",
      },
      {
        name: "French Translation",
        description:
          "Translate all strings to French, handle Canadian vs European French variants",
        approach: "agent-assisted",
      },
      {
        name: "German Translation",
        description:
          "Translate all strings to German, handle compound words and formal/informal address",
        approach: "agent-assisted",
      },
      {
        name: "Japanese Translation",
        description:
          "Translate all strings to Japanese, implement proper honorifics, test vertical text",
        approach: "agent-assisted",
      },
      {
        name: "Testing & QA",
        description:
          "Test all languages, verify no layout breaks, cultural sensitivity review",
        approach: "manual",
      },
    ],
    labels: ["i18n", "translation", "feature", "high-priority"],
  },
};
```

## Phase Approach Types

### `manual`

- Human implementation required
- Complex decision-making
- Initial setup or final review
- Examples: Architecture decisions, UI/UX design, security review

### `agent-assisted`

- AI agent can implement with human review
- Well-defined requirements
- Repetitive or pattern-based work
- Examples: Translation, test writing, documentation

### `automated`

- Fully automated by scripts/CI
- No human intervention needed
- Examples: Linting, formatting, deployment

## Best Practices

### 1. Clear Success Metrics

- Make them measurable
- Use checkboxes format
- Include both quantitative and qualitative goals

✅ Good:

```typescript
successMetrics: [
  "100+ unit tests",
  ">80% code coverage",
  "All PRs have passing tests",
];
```

❌ Bad:

```typescript
successMetrics: ["Write tests", "Good coverage"];
```

### 2. Logical Phase Ordering

- Order phases by dependency
- Group related work together
- Manual phases often come first (setup) and last (review)

✅ Good:

```typescript
phases: [
  { name: 'Foundation', ... },      // Manual setup
  { name: 'Core Features', ... },   // Agent-assisted
  { name: 'Testing', ... },         // Agent-assisted
  { name: 'Security Review', ... }, // Manual review
]
```

### 3. Descriptive Phase Names

- Use noun phrases
- Keep concise (1-3 words)
- Examples: "Foundation", "Integration Tests", "Database Migration"

### 4. Appropriate Labels

- Use existing repo labels when possible
- Include: priority, type, area
- Examples: `['high-priority', 'feature', 'backend']`

## Workflow After Creating Epic

Once you create an epic using the UI:

1. **Epic issue created on GitHub** with:
   - Title: `[EPIC] Your Title`
   - Body: Formatted with phases, metrics, progress
   - Labels: As specified in your plan

2. **Create sub-issues** for each phase/task:
   - Reference the epic number
   - Assign to agents or team members
   - Track progress in epic

3. **Spawn agents** for agent-assisted phases:
   - Use `spawn_agent_from_issue()` command
   - Agent creates worktree and tmux session
   - Metadata stored in both tmux and GitHub

4. **Monitor progress**:
   - Epic tracks overall completion percentage
   - Sub-issues track individual task status
   - PRs automatically update epic when merged

## Future Enhancements

### Load from Markdown Files

We could extend this to load epic plans from markdown files:

```typescript
// Future: Load from /plans/*.md files
import { readTextFile } from "@tauri-apps/api/fs";

async function loadEpicPlanFromMarkdown(filename: string): Promise<EpicPlan> {
  const content = await readTextFile(`plans/${filename}.md`);
  // Parse markdown and convert to EpicPlan structure
  return parsedPlan;
}
```

### Epic Plan Templates

Create reusable templates for common project types:

- Feature implementation
- Refactoring project
- Documentation overhaul
- Performance optimization
- Security hardening

## Example Epic Plans

See `EPIC_PLANS` in `GenericEpicCreator.tsx` for complete examples:

- `cicd-testing`: Comprehensive testing infrastructure
- _(Add yours here!)_

## Questions?

Refer to:

- `EPIC_WORKFLOW_SOP.md` - Standard operating procedure
- `CICD_EPIC_STRUCTURE.md` - Concrete example
- `src/components/settings/devops/GenericEpicCreator.tsx` - Implementation
