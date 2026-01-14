//! Epic plan template parsing from markdown files with frontmatter.
//!
//! This module reads markdown files from `docs/plans/` directory, extracts
//! frontmatter metadata (title, description, labels), and parses the markdown
//! body to extract Epic structure (goal, success metrics, phases).

use gray_matter::engine::YAML;
use gray_matter::{Matter, ParsedEntity};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::fs;
use std::path::Path;

use super::{EpicConfig, PhaseConfig};

/// Metadata from plan template frontmatter
#[derive(Debug, Clone, Serialize, Deserialize)]
struct PlanFrontmatter {
    title: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    labels: Vec<String>,
    /// Repository for tracking issues (e.g., "KBVE/KBVE")
    #[serde(default)]
    tracking_repo: Option<String>,
    /// Repository for working/implementation (e.g., "KBVE/Handy")
    #[serde(default)]
    working_repo: Option<String>,
}

/// Parsed plan template ready for use
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct PlanTemplate {
    /// Template identifier (filename without extension)
    pub id: String,
    /// Template title from frontmatter
    pub title: String,
    /// Template description from frontmatter
    pub description: String,
    /// Labels from frontmatter
    pub labels: Vec<String>,
    /// Repository for tracking issues (e.g., "KBVE/KBVE")
    pub tracking_repo: Option<String>,
    /// Repository for working/implementation (e.g., "KBVE/Handy")
    pub working_repo: Option<String>,
    /// Epic goal extracted from markdown
    pub goal: String,
    /// Success metrics extracted from markdown
    pub success_metrics: Vec<String>,
    /// Phases extracted from markdown
    pub phases: Vec<PhaseConfig>,
}

/// List all available plan templates from docs/plans directory
pub fn list_plan_templates(repo_root: &Path) -> Result<Vec<PlanTemplate>, String> {
    let plans_dir = repo_root.join("docs/plans");

    if !plans_dir.exists() {
        return Ok(Vec::new());
    }

    let mut templates = Vec::new();

    let entries = fs::read_dir(&plans_dir)
        .map_err(|e| format!("Failed to read plans directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        // Only process .md files
        if path.extension().and_then(|s| s.to_str()) != Some("md") {
            continue;
        }

        // Skip README.md
        if path.file_name().and_then(|s| s.to_str()) == Some("README.md") {
            continue;
        }

        match parse_plan_template(&path) {
            Ok(template) => templates.push(template),
            Err(e) => {
                eprintln!("Warning: Failed to parse {}: {}", path.display(), e);
                continue;
            }
        }
    }

    // Sort by title
    templates.sort_by(|a, b| a.title.cmp(&b.title));

    Ok(templates)
}

/// Parse a single plan template markdown file
fn parse_plan_template(path: &Path) -> Result<PlanTemplate, String> {
    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let matter = Matter::<YAML>::new();
    let result: ParsedEntity<PlanFrontmatter> = matter
        .parse(&content)
        .map_err(|e| format!("Failed to parse markdown: {}", e))?;

    // Extract frontmatter
    let frontmatter = result
        .data
        .ok_or_else(|| "No frontmatter found".to_string())?;

    let markdown = result.content;

    // Extract goal, success metrics, and phases from markdown
    let goal = extract_goal(&markdown)?;
    let success_metrics = extract_success_metrics(&markdown);
    let phases = extract_phases(&markdown)?;

    let id = path
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "Invalid filename".to_string())?
        .to_string();

    Ok(PlanTemplate {
        id,
        title: frontmatter.title,
        description: frontmatter.description,
        labels: frontmatter.labels,
        tracking_repo: frontmatter.tracking_repo,
        working_repo: frontmatter.working_repo,
        goal,
        success_metrics,
        phases,
    })
}

/// Extract goal from "## Goal" section
fn extract_goal(markdown: &str) -> Result<String, String> {
    let lines: Vec<&str> = markdown.lines().collect();
    let mut in_goal = false;
    let mut goal_lines = Vec::new();

    for line in lines {
        if line.trim() == "## Goal" {
            in_goal = true;
            continue;
        }

        if in_goal {
            // Stop at next heading
            if line.trim().starts_with("##") {
                break;
            }

            let trimmed = line.trim();
            if !trimmed.is_empty() {
                goal_lines.push(trimmed);
            }
        }
    }

    if goal_lines.is_empty() {
        return Err("No goal found in plan".to_string());
    }

    Ok(goal_lines.join(" "))
}

/// Extract success metrics from "## Success Metrics" section
fn extract_success_metrics(markdown: &str) -> Vec<String> {
    let lines: Vec<&str> = markdown.lines().collect();
    let mut in_metrics = false;
    let mut metrics = Vec::new();

    for line in lines {
        if line.trim() == "## Success Metrics" {
            in_metrics = true;
            continue;
        }

        if in_metrics {
            // Stop at next heading
            if line.trim().starts_with("##") {
                break;
            }

            let trimmed = line.trim();
            // Extract list items (with or without checkbox)
            if trimmed.starts_with("- ") {
                let metric = trimmed
                    .trim_start_matches("- ")
                    .trim_start_matches("[ ] ")
                    .trim();
                if !metric.is_empty() {
                    metrics.push(metric.to_string());
                }
            }
        }
    }

    metrics
}

/// Extract phases from "## Phases" section
fn extract_phases(markdown: &str) -> Result<Vec<PhaseConfig>, String> {
    let lines: Vec<&str> = markdown.lines().collect();
    let mut in_phases = false;
    let mut phases = Vec::new();
    let mut current_phase: Option<PhaseConfig> = None;
    let mut current_description = Vec::new();

    for line in lines {
        if line.trim() == "## Phases" {
            in_phases = true;
            continue;
        }

        if !in_phases {
            continue;
        }

        // Stop at next top-level heading
        if line.trim().starts_with("## ") && line.trim() != "## Phases" {
            break;
        }

        // Phase heading: "### Phase N: Name" or "### Name"
        if line.trim().starts_with("### ") {
            // Save previous phase if exists
            if let Some(mut phase) = current_phase.take() {
                phase.description = current_description.join(" ").trim().to_string();
                phases.push(phase);
                current_description.clear();
            }

            // Extract phase name
            let name = line
                .trim()
                .trim_start_matches("###")
                .trim()
                .split(':')
                .last()
                .unwrap_or("")
                .trim()
                .to_string();

            current_phase = Some(PhaseConfig {
                name,
                description: String::new(),
                approach: "manual".to_string(), // Default
            });
            continue;
        }

        // Extract approach if specified
        if line.trim().starts_with("**Approach**:") {
            if let Some(ref mut phase) = current_phase {
                let approach = line
                    .trim()
                    .trim_start_matches("**Approach**:")
                    .trim()
                    .to_lowercase();
                phase.approach = approach;
            }
            continue;
        }

        // Skip horizontal rules and empty lines for description
        let trimmed = line.trim();
        if trimmed == "---" || trimmed.is_empty() {
            continue;
        }

        // Skip lines that start with ** (metadata fields)
        if trimmed.starts_with("**") {
            continue;
        }

        // Accumulate description lines
        if current_phase.is_some() && !trimmed.is_empty() {
            current_description.push(trimmed);
        }
    }

    // Save last phase
    if let Some(mut phase) = current_phase {
        phase.description = current_description.join(" ").trim().to_string();
        phases.push(phase);
    }

    if phases.is_empty() {
        return Err("No phases found in plan".to_string());
    }

    Ok(phases)
}

/// Convert a plan template to EpicConfig
///
/// Uses template's tracking_repo and working_repo if specified,
/// otherwise falls back to provided defaults.
pub fn template_to_config(
    template: &PlanTemplate,
    default_repo: String,
    default_work_repo: Option<String>,
) -> EpicConfig {
    // Use template repos if specified, otherwise use defaults
    let repo = template
        .tracking_repo
        .clone()
        .unwrap_or(default_repo);
    let work_repo = template
        .working_repo
        .clone()
        .or(default_work_repo);

    EpicConfig {
        title: template.title.clone(),
        repo,
        work_repo,
        goal: template.goal.clone(),
        success_metrics: template.success_metrics.clone(),
        phases: template.phases.clone(),
        labels: template.labels.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_goal() {
        let markdown = r#"
# Epic Title

## Goal

This is the goal.
It spans multiple lines.

## Success Metrics
"#;
        let goal = extract_goal(markdown).unwrap();
        assert_eq!(goal, "This is the goal. It spans multiple lines.");
    }

    #[test]
    fn test_extract_success_metrics() {
        let markdown = r#"
## Success Metrics

- Metric 1
- [ ] Metric 2
- Metric 3

## Phases
"#;
        let metrics = extract_success_metrics(markdown);
        assert_eq!(metrics, vec!["Metric 1", "Metric 2", "Metric 3"]);
    }

    #[test]
    fn test_extract_phases() {
        let markdown = r#"
## Phases

### Phase 1: Foundation

**Approach**: manual

Build test utilities and infrastructure.

---

### Phase 2: Integration

**Approach**: agent-assisted

Comprehensive tests for workflows.

## Next Section
"#;
        let phases = extract_phases(markdown).unwrap();
        assert_eq!(phases.len(), 2);
        assert_eq!(phases[0].name, "Foundation");
        assert_eq!(phases[0].approach, "manual");
        assert!(phases[0].description.contains("Build test utilities"));
        assert_eq!(phases[1].name, "Integration");
        assert_eq!(phases[1].approach, "agent-assisted");
    }
}
