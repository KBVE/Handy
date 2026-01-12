//! Dependency detection for DevOps features.
//!
//! Checks for required CLI tools: gh (GitHub CLI), tmux, and claude (Claude Code CLI).

use serde::{Deserialize, Serialize};
use specta::Type;
use std::process::Command;

/// Status of a single dependency
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DependencyStatus {
    /// Name of the dependency
    pub name: String,
    /// Whether the dependency is installed
    pub installed: bool,
    /// Version string if installed
    pub version: Option<String>,
    /// Path to the executable if installed
    pub path: Option<String>,
    /// Installation instructions if not installed
    pub install_hint: String,
}

/// Status of all DevOps dependencies
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DevOpsDependencies {
    /// GitHub CLI status (required)
    pub gh: DependencyStatus,
    /// tmux status (required)
    pub tmux: DependencyStatus,
    /// Claude Code CLI status
    pub claude: DependencyStatus,
    /// Aider CLI status
    pub aider: DependencyStatus,
    /// Gemini CLI status (Google AI)
    pub gemini: DependencyStatus,
    /// Ollama status (local LLM server)
    pub ollama: DependencyStatus,
    /// vLLM status (high-performance inference)
    pub vllm: DependencyStatus,
    /// Whether all required dependencies are installed (gh + tmux + at least one agent)
    pub all_satisfied: bool,
    /// List of available agent types that are installed
    pub available_agents: Vec<String>,
}

/// Check if a command exists and get its version
fn check_command(name: &str, version_args: &[&str]) -> (bool, Option<String>, Option<String>) {
    // First check if command exists using `which`
    let which_result = Command::new("which").arg(name).output();

    let path = match which_result {
        Ok(output) if output.status.success() => {
            String::from_utf8_lossy(&output.stdout).trim().to_string()
        }
        _ => return (false, None, None),
    };

    // Get version
    let version_result = Command::new(name).args(version_args).output();

    let version = match version_result {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            // Some tools output to stderr
            let output_str = if stdout.trim().is_empty() {
                stderr.to_string()
            } else {
                stdout.to_string()
            };
            // Extract first line and clean up
            output_str.lines().next().map(|s| s.trim().to_string())
        }
        _ => None,
    };

    (true, version, Some(path))
}

/// Check GitHub CLI (gh) status
fn check_gh() -> DependencyStatus {
    let (installed, version, path) = check_command("gh", &["--version"]);

    // Parse version from "gh version 2.40.0 (2024-01-01)" format
    let version = version.and_then(|v| {
        v.split_whitespace()
            .nth(2)
            .map(|s| s.trim_end_matches(',').to_string())
    });

    DependencyStatus {
        name: "gh".to_string(),
        installed,
        version,
        path,
        install_hint: "brew install gh".to_string(),
    }
}

/// Check tmux status
fn check_tmux() -> DependencyStatus {
    let (installed, version, path) = check_command("tmux", &["-V"]);

    // Parse version from "tmux 3.4" format
    let version = version.and_then(|v| v.split_whitespace().nth(1).map(|s| s.to_string()));

    DependencyStatus {
        name: "tmux".to_string(),
        installed,
        version,
        path,
        install_hint: "brew install tmux".to_string(),
    }
}

/// Check Claude Code CLI status
fn check_claude() -> DependencyStatus {
    let (installed, version, path) = check_command("claude", &["--version"]);

    // Version output format may vary, just use the first line
    let version = version.map(|v| v.trim().to_string());

    DependencyStatus {
        name: "claude".to_string(),
        installed,
        version,
        path,
        install_hint: "npm install -g @anthropic-ai/claude-code".to_string(),
    }
}

/// Check Aider CLI status
fn check_aider() -> DependencyStatus {
    let (installed, version, path) = check_command("aider", &["--version"]);

    // Parse version from aider output
    let version = version.map(|v| v.trim().to_string());

    DependencyStatus {
        name: "aider".to_string(),
        installed,
        version,
        path,
        install_hint: "pip install aider-chat".to_string(),
    }
}

/// Check Gemini CLI status (Google AI Studio)
fn check_gemini() -> DependencyStatus {
    let (installed, version, path) = check_command("gemini", &["--version"]);

    let version = version.map(|v| v.trim().to_string());

    DependencyStatus {
        name: "gemini".to_string(),
        installed,
        version,
        path,
        install_hint: "pip install google-generativeai".to_string(),
    }
}

/// Check Ollama status (local LLM server)
fn check_ollama() -> DependencyStatus {
    let (installed, version, path) = check_command("ollama", &["--version"]);

    // Parse version from ollama output
    let version = version.and_then(|v| {
        v.split_whitespace()
            .find(|s| {
                s.chars()
                    .next()
                    .map(|c| c.is_ascii_digit())
                    .unwrap_or(false)
            })
            .map(|s| s.to_string())
    });

    DependencyStatus {
        name: "ollama".to_string(),
        installed,
        version,
        path,
        install_hint: "brew install ollama".to_string(),
    }
}

/// Check vLLM status (high-performance inference server)
fn check_vllm() -> DependencyStatus {
    // vLLM is typically run as a server, check for python module
    let (installed, version, path) = check_command("vllm", &["--version"]);

    let version = version.map(|v| v.trim().to_string());

    DependencyStatus {
        name: "vllm".to_string(),
        installed,
        version,
        path,
        install_hint: "pip install vllm".to_string(),
    }
}

/// Check all DevOps dependencies
pub fn check_all_dependencies() -> DevOpsDependencies {
    let gh = check_gh();
    let tmux = check_tmux();
    let claude = check_claude();
    let aider = check_aider();
    let gemini = check_gemini();
    let ollama = check_ollama();
    let vllm = check_vllm();

    // Build list of available agents
    let mut available_agents = Vec::new();
    if claude.installed {
        available_agents.push("claude".to_string());
    }
    if aider.installed {
        available_agents.push("aider".to_string());
    }
    if gemini.installed {
        available_agents.push("gemini".to_string());
    }
    if ollama.installed {
        available_agents.push("ollama".to_string());
    }
    if vllm.installed {
        available_agents.push("vllm".to_string());
    }

    // All satisfied if gh + tmux + at least one agent
    let has_agent = !available_agents.is_empty();
    let all_satisfied = gh.installed && tmux.installed && has_agent;

    DevOpsDependencies {
        gh,
        tmux,
        claude,
        aider,
        gemini,
        ollama,
        vllm,
        all_satisfied,
        available_agents,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_check_dependencies() {
        let deps = check_all_dependencies();
        // Just verify it doesn't panic and returns valid structure
        assert!(!deps.gh.name.is_empty());
        assert!(!deps.tmux.name.is_empty());
    }
}
