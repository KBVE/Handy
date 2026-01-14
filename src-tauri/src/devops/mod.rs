//! DevOps module for multi-agent coding assistant functionality.
//!
//! This module provides:
//! - Dependency detection (gh, tmux, docker)
//! - tmux session management
//! - Docker sandbox containers for isolated agent execution
//! - Git worktree management
//! - GitHub issue integration
//! - Agent orchestration

mod dependencies;
pub mod docker;
pub mod github;
pub mod operations;
pub mod orchestrator;
pub mod tmux;
pub mod worktree;

pub use dependencies::*;
