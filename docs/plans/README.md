# Epic Plan Templates

This directory contains markdown templates for creating Epics via the Handy DevOps Epic Workflow.

## Structure

Each plan template is a markdown file with:

1. **Frontmatter** (YAML): Metadata for the template
2. **Markdown Body**: Epic structure (goal, metrics, phases)

## Frontmatter Schema

```yaml
---
title: "Epic Title" # Required: Epic title
description: "Brief description" # Optional: Shown in template preview
labels: ["label1", "label2"] # Optional: GitHub labels to apply
tracking_repo: "KBVE/KBVE" # Optional: Repo for issue tracking
working_repo: "KBVE/Handy" # Optional: Repo for implementation
---
```

**Repository Fields:**

- `tracking_repo`: Where Epic issues are created (defaults to current repo if not specified)
- `working_repo`: Where code implementation happens (can be same as tracking_repo)

## Body Structure

The markdown body should follow this structure:

```markdown
# Epic Title

## Goal

1-2 sentence description of what this epic achieves.

## Success Metrics

- Measurable criterion 1
- Measurable criterion 2

## Phases

### Phase N: Phase Name

**Approach**: manual | agent-assisted | automated

Description of phase.

**Key Tasks**:

- Task 1
- Task 2

**Dependencies**: Previous phase or "None"
**Estimated Time**: X days/weeks

---
```

## Creating a New Template

1. Create a new `.md` file in this directory (e.g., `my-epic.md`)
2. Add frontmatter with title, description, and labels
3. Write the Epic structure following the format above
4. Template will automatically appear in the Epic Creator UI

## Parsing

The GenericEpicCreator component:

1. Lists all `.md` files in `docs/plans/`
2. Parses frontmatter for metadata
3. Extracts phases from `## Phases` section
4. Extracts success metrics from `## Success Metrics` section
5. Populates the Epic Creator wizard with the template data

## Example Templates

- **blank.md**: Empty template for starting from scratch
- **cicd-testing.md**: Comprehensive testing infrastructure epic

## Tips

- Use clear, action-oriented phase names
- Include dependencies between phases
- Provide estimated time for planning
- Use the "Approach" field to indicate if agents can help
- Keep goal and metrics measurable and specific
