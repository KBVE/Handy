//! DevOps module for multi-agent coding assistant functionality.
//!
//! This module provides:
//! - Dependency detection (gh, tmux)
//! - tmux session management
//! - Git worktree management
//! - GitHub issue integration
//! - Agent orchestration
//! - Pipeline state tracking

mod dependencies;
pub mod github;
pub mod operations;
pub mod orchestration;
pub mod orchestrator;
pub mod pipeline;
pub mod tmux;
pub mod worktree;

pub use dependencies::*;
