//! Docker and Dev Container management for sandboxed agent execution.
//!
//! This module provides two approaches for running agents in isolation:
//!
//! 1. **Dev Containers** (recommended): Uses VS Code Dev Container spec with
//!    Anthropic's official devcontainer feature for Claude Code. This creates
//!    a reproducible, versioned environment as part of the repo.
//!
//! 2. **Direct Docker**: Simpler approach using Docker directly for quick
//!    sandboxing when a full devcontainer setup isn't needed.
//!
//! The Dev Container approach is preferred because:
//! - Official Anthropic support via `ghcr.io/anthropics/devcontainer-features/claude-code`
//! - Versioned environment (`.devcontainer/devcontainer.json` in repo)
//! - VS Code compatibility
//! - Proper toolchain configuration

use serde::{Deserialize, Serialize};
use specta::Type;
use std::process::Command;

/// Anthropic's official devcontainer feature for Claude Code
const CLAUDE_DEVCONTAINER_FEATURE: &str = "ghcr.io/anthropics/devcontainer-features/claude-code:1.0";

/// Default Docker image for direct Docker mode (Node.js based for Claude Code CLI)
const DEFAULT_AGENT_IMAGE: &str = "node:20-bookworm";

/// Container name prefix for Handy agent containers
const CONTAINER_PREFIX: &str = "handy-sandbox-";

/// Docker network name for inter-agent communication
const AGENT_NETWORK: &str = "handy-agents";

/// Base port for agent port range allocation
const PORT_RANGE_BASE: u16 = 30000;

/// Size of each agent's port range (agent 0 gets 30000-30099, agent 1 gets 30100-30199, etc.)
const PORT_RANGE_SIZE: u16 = 100;

/// Sandbox mode - how to run the isolated agent
#[derive(Debug, Clone, Serialize, Deserialize, Type, Default)]
pub enum SandboxMode {
    /// Use Dev Container (recommended) - creates .devcontainer/devcontainer.json
    /// and uses the official Anthropic devcontainer feature
    #[default]
    DevContainer,
    /// Use direct Docker container (simpler but less integrated)
    DirectDocker,
}

/// Configuration for spawning a sandboxed agent container
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SandboxConfig {
    /// Sandbox mode - DevContainer (recommended) or DirectDocker
    pub mode: SandboxMode,
    /// Docker image to use (for DirectDocker mode)
    pub image: Option<String>,
    /// Working directory to mount (the worktree path)
    pub workdir: String,
    /// GitHub token for API access (passed as env var)
    pub gh_token: Option<String>,
    /// Anthropic API key for Claude (passed as env var)
    pub anthropic_api_key: Option<String>,
    /// Issue reference (org/repo#number)
    pub issue_ref: String,
    /// Agent type (claude, aider, etc.)
    pub agent_type: String,
    /// Whether to auto-accept all operations (safe in sandbox)
    pub auto_accept: bool,
    /// Memory limit (e.g., "4g")
    pub memory_limit: Option<String>,
    /// CPU limit (e.g., "2")
    pub cpu_limit: Option<String>,
    /// Network mode: "bridge" (default), "none" (air-gapped), or "host"
    pub network_mode: Option<String>,
}

/// Result of spawning a sandboxed container
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SandboxResult {
    /// Container ID
    pub container_id: String,
    /// Container name
    pub container_name: String,
    /// Whether the container started successfully
    pub started: bool,
}

/// Status of a running sandbox container
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SandboxStatus {
    /// Container ID
    pub container_id: String,
    /// Container name
    pub container_name: String,
    /// Whether container is running
    pub running: bool,
    /// Exit code if stopped
    pub exit_code: Option<i32>,
    /// Container status string
    pub status: String,
}

/// Check if Docker is available and daemon is running
pub fn is_docker_available() -> bool {
    Command::new("docker")
        .args(["info"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Check if the handy-agents network exists
pub fn network_exists() -> bool {
    Command::new("docker")
        .args(["network", "inspect", AGENT_NETWORK])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Create the handy-agents Docker network for inter-container communication
///
/// This network allows sandboxed agents to communicate with each other using
/// container names as hostnames (e.g., `handy-sandbox-123:3000`).
pub fn ensure_agent_network() -> Result<(), String> {
    if network_exists() {
        return Ok(());
    }

    let output = Command::new("docker")
        .args(["network", "create", "--driver", "bridge", AGENT_NETWORK])
        .output()
        .map_err(|e| format!("Failed to create network: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Ignore "already exists" error (race condition)
        if !stderr.contains("already exists") {
            return Err(format!("Failed to create network: {}", stderr));
        }
    }

    log::info!("Created Docker network: {}", AGENT_NETWORK);
    Ok(())
}

/// Get the Docker network name for agent containers
pub fn get_agent_network_name() -> &'static str {
    AGENT_NETWORK
}

/// Allocate a unique port range for an agent based on issue number
///
/// Each agent gets a range of PORT_RANGE_SIZE ports to avoid conflicts.
/// Port ranges are deterministic based on issue number modulo 100.
///
/// Returns (base_port, end_port) tuple, e.g., (30000, 30099) for slot 0
pub fn allocate_port_range(issue_number: u64) -> (u16, u16) {
    // Use issue number modulo 100 to determine slot (supports 100 concurrent agents)
    let slot = (issue_number % 100) as u16;
    let base = PORT_RANGE_BASE + (slot * PORT_RANGE_SIZE);
    let end = base + PORT_RANGE_SIZE - 1;
    (base, end)
}

/// Remap a container port to a unique host port within the agent's allocated range
///
/// For example, if an agent needs port 3000 and has range 30100-30199,
/// this maps container:3000 -> host:30100
pub fn remap_port_to_range(container_port: u16, issue_number: u64) -> u16 {
    let (base, _end) = allocate_port_range(issue_number);
    // Map container port to range: 3000 -> base + (3000 % PORT_RANGE_SIZE)
    // This keeps relative port offsets consistent
    base + (container_port % PORT_RANGE_SIZE)
}

/// Information about an agent's network configuration
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AgentNetworkInfo {
    /// The Docker network name
    pub network_name: String,
    /// Container hostname (can be used by other containers to connect)
    pub container_hostname: String,
    /// Allocated host port range (base, end)
    pub host_port_range: (u16, u16),
    /// Port mappings from container port to host port
    pub port_mappings: Vec<(u16, u16)>,
}

/// Get network info for a sandboxed agent
pub fn get_agent_network_info(issue_number: u64, container_ports: &[u16]) -> AgentNetworkInfo {
    let container_name = container_name_for_issue(issue_number);
    let (base, end) = allocate_port_range(issue_number);

    let port_mappings: Vec<(u16, u16)> = container_ports
        .iter()
        .map(|&cp| (cp, remap_port_to_range(cp, issue_number)))
        .collect();

    AgentNetworkInfo {
        network_name: AGENT_NETWORK.to_string(),
        container_hostname: container_name,
        host_port_range: (base, end),
        port_mappings,
    }
}

/// List all containers on the handy-agents network
pub fn list_network_containers() -> Result<Vec<String>, String> {
    if !network_exists() {
        return Ok(vec![]);
    }

    let output = Command::new("docker")
        .args([
            "network", "inspect", AGENT_NETWORK,
            "--format", "{{range .Containers}}{{.Name}} {{end}}"
        ])
        .output()
        .map_err(|e| format!("Failed to inspect network: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to inspect network: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let containers: Vec<String> = stdout
        .split_whitespace()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect();

    Ok(containers)
}

/// Get the GitHub token from gh CLI
fn get_gh_token() -> Option<String> {
    Command::new("gh")
        .args(["auth", "token"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Get the Anthropic API key from environment
fn get_anthropic_key() -> Option<String> {
    std::env::var("ANTHROPIC_API_KEY").ok().filter(|s| !s.is_empty())
}

/// Generate a container name for an issue
pub fn container_name_for_issue(issue_number: u64) -> String {
    format!("{}{}", CONTAINER_PREFIX, issue_number)
}

/// Spawn a sandboxed agent container
///
/// This creates and starts a Docker container with:
/// - The worktree mounted at /workspace
/// - GitHub and Anthropic credentials passed as env vars
/// - Resource limits applied
/// - The agent command started with auto-accept flags
pub fn spawn_sandbox(config: &SandboxConfig) -> Result<SandboxResult, String> {
    // Parse issue number from issue_ref
    let issue_number = config
        .issue_ref
        .split('#')
        .last()
        .and_then(|n| n.parse::<u64>().ok())
        .ok_or("Invalid issue reference format")?;

    let container_name = container_name_for_issue(issue_number);
    let image = config
        .image
        .clone()
        .unwrap_or_else(|| DEFAULT_AGENT_IMAGE.to_string());

    // Build docker run command
    let mut args = vec![
        "run".to_string(),
        "-d".to_string(), // Detached
        "--name".to_string(),
        container_name.clone(),
        // Mount worktree as /workspace
        "-v".to_string(),
        format!("{}:/workspace", config.workdir),
        "-w".to_string(),
        "/workspace".to_string(),
    ];

    // Add resource limits
    if let Some(ref mem) = config.memory_limit {
        args.push("-m".to_string());
        args.push(mem.clone());
    }
    if let Some(ref cpu) = config.cpu_limit {
        args.push("--cpus".to_string());
        args.push(cpu.clone());
    }

    // Add network mode
    let network = config
        .network_mode
        .clone()
        .unwrap_or_else(|| "bridge".to_string());
    args.push("--network".to_string());
    args.push(network);

    // Add GitHub token
    let gh_token = config.gh_token.clone().or_else(get_gh_token);
    if let Some(token) = gh_token {
        args.push("-e".to_string());
        args.push(format!("GH_TOKEN={}", token));
        args.push("-e".to_string());
        args.push(format!("GITHUB_TOKEN={}", token));
    }

    // Add Anthropic API key
    let anthropic_key = config.anthropic_api_key.clone().or_else(get_anthropic_key);
    if let Some(key) = anthropic_key {
        args.push("-e".to_string());
        args.push(format!("ANTHROPIC_API_KEY={}", key));
    }

    // Add issue context as env vars
    args.push("-e".to_string());
    args.push(format!("HANDY_ISSUE_REF={}", config.issue_ref));
    args.push("-e".to_string());
    args.push(format!("HANDY_AGENT_TYPE={}", config.agent_type));

    // Add the image
    args.push(image);

    // Build the agent command based on type
    let agent_cmd = build_sandboxed_agent_command(&config.agent_type, &config.issue_ref, config.auto_accept)?;

    // Add command as shell execution
    args.push("sh".to_string());
    args.push("-c".to_string());
    args.push(agent_cmd);

    // Run docker command
    let output = Command::new("docker")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run docker: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Docker failed: {}", stderr));
    }

    let container_id = String::from_utf8_lossy(&output.stdout).trim().to_string();

    Ok(SandboxResult {
        container_id,
        container_name,
        started: true,
    })
}

/// Build the command to run inside the sandbox container
fn build_sandboxed_agent_command(
    agent_type: &str,
    issue_ref: &str,
    auto_accept: bool,
) -> Result<String, String> {
    let (repo, issue_number) = parse_issue_ref(issue_ref)?;

    let command = match agent_type.to_lowercase().as_str() {
        "claude" => {
            if auto_accept {
                // In sandbox, we can safely use --dangerously-skip-permissions
                format!(
                    "claude --dangerously-skip-permissions 'Work on GitHub issue {}#{}: Implement the requirements described in the issue. When done, commit your changes and create a PR.'",
                    repo, issue_number
                )
            } else {
                format!(
                    "claude 'Work on GitHub issue {}#{}: Implement the requirements described in the issue. When done, commit your changes and create a PR.'",
                    repo, issue_number
                )
            }
        }
        "aider" => {
            if auto_accept {
                format!(
                    "aider --yes-always --message 'Work on GitHub issue {}#{}. Implement the requirements and commit when done.'",
                    repo, issue_number
                )
            } else {
                format!(
                    "aider --message 'Work on GitHub issue {}#{}. Implement the requirements and commit when done.'",
                    repo, issue_number
                )
            }
        }
        _ => {
            return Err(format!(
                "Agent type '{}' is not supported for sandboxed execution. Supported: claude, aider",
                agent_type
            ));
        }
    };

    Ok(command)
}

/// Parse issue reference like "org/repo#123" into (repo, number)
fn parse_issue_ref(issue_ref: &str) -> Result<(String, u64), String> {
    let parts: Vec<&str> = issue_ref.split('#').collect();
    if parts.len() != 2 {
        return Err(format!(
            "Invalid issue reference: {}. Expected format: org/repo#123",
            issue_ref
        ));
    }

    let repo = parts[0].to_string();
    let number = parts[1]
        .parse::<u64>()
        .map_err(|_| format!("Invalid issue number: {}", parts[1]))?;

    Ok((repo, number))
}

/// Get status of a sandbox container
pub fn get_sandbox_status(container_name: &str) -> Result<SandboxStatus, String> {
    let output = Command::new("docker")
        .args([
            "inspect",
            "--format",
            "{{.Id}}\t{{.State.Running}}\t{{.State.ExitCode}}\t{{.State.Status}}",
            container_name,
        ])
        .output()
        .map_err(|e| format!("Failed to inspect container: {}", e))?;

    if !output.status.success() {
        return Err(format!("Container '{}' not found", container_name));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let parts: Vec<&str> = stdout.trim().split('\t').collect();

    if parts.len() < 4 {
        return Err("Invalid docker inspect output".to_string());
    }

    Ok(SandboxStatus {
        container_id: parts[0].to_string(),
        container_name: container_name.to_string(),
        running: parts[1] == "true",
        exit_code: parts[2].parse().ok(),
        status: parts[3].to_string(),
    })
}

/// Get logs from a sandbox container
pub fn get_sandbox_logs(container_name: &str, tail: Option<u32>) -> Result<String, String> {
    let mut args = vec!["logs".to_string()];

    if let Some(n) = tail {
        args.push("--tail".to_string());
        args.push(n.to_string());
    }

    args.push(container_name.to_string());

    let output = Command::new("docker")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to get logs: {}", e))?;

    // Docker logs outputs to stderr for stderr, stdout for stdout
    // Combine both
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    Ok(format!("{}{}", stdout, stderr))
}

/// Stop a sandbox container
pub fn stop_sandbox(container_name: &str) -> Result<(), String> {
    let output = Command::new("docker")
        .args(["stop", container_name])
        .output()
        .map_err(|e| format!("Failed to stop container: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to stop container: {}", stderr));
    }

    Ok(())
}

/// Remove a sandbox container
pub fn remove_sandbox(container_name: &str, force: bool) -> Result<(), String> {
    let mut args = vec!["rm".to_string()];
    if force {
        args.push("-f".to_string());
    }
    args.push(container_name.to_string());

    let output = Command::new("docker")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to remove container: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to remove container: {}", stderr));
    }

    Ok(())
}

/// List all Handy sandbox containers
pub fn list_sandboxes() -> Result<Vec<SandboxStatus>, String> {
    let output = Command::new("docker")
        .args([
            "ps",
            "-a",
            "--filter",
            &format!("name={}", CONTAINER_PREFIX),
            "--format",
            "{{.ID}}\t{{.Names}}\t{{.State}}\t{{.Status}}",
        ])
        .output()
        .map_err(|e| format!("Failed to list containers: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Docker failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut sandboxes = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 4 {
            sandboxes.push(SandboxStatus {
                container_id: parts[0].to_string(),
                container_name: parts[1].to_string(),
                running: parts[2] == "running",
                exit_code: None, // Would need separate inspect call
                status: parts[3].to_string(),
            });
        }
    }

    Ok(sandboxes)
}

/// Configuration for a devcontainer.json file
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DevContainerConfig {
    /// Name for the devcontainer
    pub name: String,
    /// Base image to use
    pub image: String,
    /// Features to include (like claude-code)
    pub features: Vec<DevContainerFeature>,
    /// Environment variables
    pub container_env: std::collections::HashMap<String, String>,
    /// Post-create command to run
    pub post_create_command: Option<String>,
}

/// A devcontainer feature reference
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DevContainerFeature {
    /// Feature identifier (e.g., "ghcr.io/anthropics/devcontainer-features/claude-code:1.0")
    pub id: String,
    /// Feature options as key-value string pairs (values are JSON strings)
    pub options: std::collections::HashMap<String, String>,
}

impl Default for DevContainerConfig {
    fn default() -> Self {
        let mut features = Vec::new();

        // Add the official Anthropic Claude Code feature
        features.push(DevContainerFeature {
            id: CLAUDE_DEVCONTAINER_FEATURE.to_string(),
            options: std::collections::HashMap::new(),
        });

        Self {
            name: "Handy Agent Sandbox".to_string(),
            image: "mcr.microsoft.com/devcontainers/base:ubuntu".to_string(),
            features,
            container_env: std::collections::HashMap::new(),
            post_create_command: None,
        }
    }
}

/// Generate devcontainer.json content for a sandboxed agent
pub fn generate_devcontainer_json(config: &DevContainerConfig) -> String {
    let mut features_map = serde_json::Map::new();
    for feature in &config.features {
        if feature.options.is_empty() {
            features_map.insert(feature.id.clone(), serde_json::json!({}));
        } else {
            // Convert string options to JSON values
            let options_obj: serde_json::Map<String, serde_json::Value> = feature.options.iter()
                .map(|(k, v)| (k.clone(), serde_json::Value::String(v.clone())))
                .collect();
            features_map.insert(feature.id.clone(), serde_json::Value::Object(options_obj));
        }
    }

    let devcontainer = serde_json::json!({
        "name": config.name,
        "image": config.image,
        "features": features_map,
        "containerEnv": config.container_env,
        "postCreateCommand": config.post_create_command,
        "customizations": {
            "vscode": {
                "extensions": [
                    "anthropics.claude-code"
                ]
            }
        }
    });

    serde_json::to_string_pretty(&devcontainer).unwrap_or_default()
}

/// Create a devcontainer configuration for an issue worktree
///
/// This creates a .devcontainer/devcontainer.json in the worktree directory
/// with the official Anthropic Claude Code feature configured.
pub fn setup_devcontainer_for_worktree(
    worktree_path: &str,
    issue_ref: &str,
    gh_token: Option<&str>,
    anthropic_key: Option<&str>,
) -> Result<String, String> {
    use std::fs;
    use std::path::Path;

    let devcontainer_dir = Path::new(worktree_path).join(".devcontainer");
    let devcontainer_file = devcontainer_dir.join("devcontainer.json");

    // Create .devcontainer directory if it doesn't exist
    fs::create_dir_all(&devcontainer_dir)
        .map_err(|e| format!("Failed to create .devcontainer directory: {}", e))?;

    // Build the config
    let mut config = DevContainerConfig::default();
    config.name = format!("Handy Agent - {}", issue_ref);

    // Add environment variables for credentials
    if let Some(token) = gh_token {
        config.container_env.insert("GH_TOKEN".to_string(), token.to_string());
        config.container_env.insert("GITHUB_TOKEN".to_string(), token.to_string());
    }
    if let Some(key) = anthropic_key {
        config.container_env.insert("ANTHROPIC_API_KEY".to_string(), key.to_string());
    }

    // Add issue context
    config.container_env.insert("HANDY_ISSUE_REF".to_string(), issue_ref.to_string());

    // Generate and write the devcontainer.json
    let json_content = generate_devcontainer_json(&config);
    fs::write(&devcontainer_file, &json_content)
        .map_err(|e| format!("Failed to write devcontainer.json: {}", e))?;

    Ok(devcontainer_file.to_string_lossy().to_string())
}

/// Check if devcontainer CLI is available
pub fn is_devcontainer_cli_available() -> bool {
    Command::new("devcontainer")
        .args(["--version"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Start a devcontainer for the given workspace
///
/// Uses the devcontainer CLI to build and start the container.
/// Falls back to VS Code if CLI is not available.
pub fn start_devcontainer(worktree_path: &str) -> Result<String, String> {
    if !is_devcontainer_cli_available() {
        return Err(
            "devcontainer CLI not found. Install with: npm install -g @devcontainers/cli".to_string()
        );
    }

    // Start the devcontainer
    let output = Command::new("devcontainer")
        .args(["up", "--workspace-folder", worktree_path])
        .output()
        .map_err(|e| format!("Failed to start devcontainer: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to start devcontainer: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.to_string())
}

/// Execute a command inside a running devcontainer
pub fn exec_in_devcontainer(worktree_path: &str, command: &str) -> Result<String, String> {
    if !is_devcontainer_cli_available() {
        return Err("devcontainer CLI not found".to_string());
    }

    let output = Command::new("devcontainer")
        .args(["exec", "--workspace-folder", worktree_path, "sh", "-c", command])
        .output()
        .map_err(|e| format!("Failed to exec in devcontainer: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !output.status.success() {
        return Err(format!("Command failed: {}{}", stdout, stderr));
    }

    Ok(format!("{}{}", stdout, stderr))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_container_name_for_issue() {
        assert_eq!(container_name_for_issue(123), "handy-sandbox-123");
    }

    #[test]
    fn test_parse_issue_ref() {
        let (repo, num) = parse_issue_ref("org/repo#456").unwrap();
        assert_eq!(repo, "org/repo");
        assert_eq!(num, 456);
    }

    #[test]
    fn test_parse_issue_ref_invalid() {
        assert!(parse_issue_ref("invalid").is_err());
        assert!(parse_issue_ref("org/repo").is_err());
    }
}
