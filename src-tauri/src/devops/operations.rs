//! High-level Epic Workflow operations.
//!
//! This module implements the Epic → Sub-Issue → Agent pattern defined in EPIC_WORKFLOW_SOP.md.
//! It provides reusable operations for:
//! - Creating and managing epics
//! - Creating sub-issues in batch
//! - Spawning agents from GitHub issues
//! - Completing agent work with PR creation
//! - Recovery from crashes/reboots
//! - Planning epics from markdown files (AI-assisted)

pub mod agent_lifecycle;
pub mod epic;
pub mod plan;
pub mod plan_parser;

// Re-export for convenience
pub use agent_lifecycle::*;
pub use epic::*;
pub use plan::*;
pub use plan_parser::*;
