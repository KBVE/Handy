import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { commands, DevOpsDependencies } from "@/bindings";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { DependencyStatus } from "./DependencyStatus";
import { SessionManager } from "./SessionManager";
import { WorktreeManager } from "./WorktreeManager";
import { IssueQueue } from "./IssueQueue";
import { PullRequestPanel } from "./PullRequestPanel";
import { AgentDashboard } from "./AgentDashboard";
import { initializeDevOpsStore, cleanupDevOpsStore } from "@/stores/devopsStore";
import {
  Terminal,
  GitBranch,
  RefreshCcw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Bot,
  Sparkles,
  Code2,
  Server,
  Cpu,
} from "lucide-react";

export const DevOpsSettings: React.FC = () => {
  const { t } = useTranslation();
  const [dependencies, setDependencies] = useState<DevOpsDependencies | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enabledAgents, setEnabledAgents] = useState<string[]>([]);
  const [isTogglingAgent, setIsTogglingAgent] = useState<string | null>(null);

  const checkDependencies = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const deps = await commands.checkDevopsDependencies();
      setDependencies(deps);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const loadEnabledAgents = async () => {
      try {
        const agents = await commands.getEnabledAgents();
        setEnabledAgents(agents);
      } catch (err) {
        console.error("Failed to load enabled agents:", err);
      }
    };

    checkDependencies();
    loadEnabledAgents();

    // Initialize DevOps store for agents and sessions
    initializeDevOpsStore();

    // Cleanup on unmount
    return () => {
      cleanupDevOpsStore();
    };
  }, []);

  const handleAgentToggle = async (agentType: string, enabled: boolean) => {
    setIsTogglingAgent(agentType);
    try {
      const result = await commands.toggleAgentEnabled(agentType, enabled);
      if (result.status === "ok") {
        setEnabledAgents(result.data);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsTogglingAgent(null);
    }
  };

  const isAgentEnabled = (agentType: string) =>
    enabledAgents.includes(agentType);

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-logo-primary" />
          <h2 className="text-lg font-semibold">{t("devops.title")}</h2>
        </div>
        <button
          onClick={checkDependencies}
          disabled={isLoading}
          className="flex items-center gap-1 px-2 py-1 text-sm rounded hover:bg-mid-gray/20 transition-colors disabled:opacity-50"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCcw className="w-4 h-4" />
          )}
          {t("devops.refresh")}
        </button>
      </div>

      {/* Description */}
      <p className="text-sm text-mid-gray">{t("devops.description")}</p>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-500/10 rounded-lg text-red-400">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Dependencies Section */}
      <SettingsGroup
        title={t("devops.dependencies.title")}
        description={t("devops.dependencies.description")}
      >
        {isLoading ? (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="w-6 h-6 animate-spin text-logo-primary" />
          </div>
        ) : dependencies ? (
          <div className="flex flex-col gap-3">
            {/* Overall status */}
            <div className="flex items-center gap-2 p-4 border-b border-mid-gray/20">
              {dependencies.all_satisfied ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                  <span className="text-sm text-green-400">
                    {t("devops.dependencies.allSatisfied")}
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-5 h-5 text-yellow-400" />
                  <span className="text-sm text-yellow-400">
                    {t("devops.dependencies.missing")}
                  </span>
                </>
              )}
            </div>

            {/* Required dependencies */}
            <div className="text-xs text-mid-gray/70 mb-3 mt-3 px-1">
              {t("devops.dependencies.required")}
            </div>
            <DependencyStatus
              name="gh"
              displayName="GitHub CLI"
              icon={<GitBranch className="w-4 h-4" />}
              status={dependencies.gh}
            />
            <DependencyStatus
              name="tmux"
              displayName="tmux"
              icon={<Terminal className="w-4 h-4" />}
              status={dependencies.tmux}
            />

            {/* AI Agents (at least one required) */}
            <div className="text-xs text-mid-gray/70 mb-3 mt-5 px-1">
              {t("devops.dependencies.agents")}
            </div>
            <DependencyStatus
              name="claude"
              displayName="Claude Code"
              icon={<Bot className="w-4 h-4" />}
              status={dependencies.claude}
              showToggle
              isEnabled={isAgentEnabled("claude")}
              onToggle={(enabled) => handleAgentToggle("claude", enabled)}
              toggleDisabled={isTogglingAgent === "claude"}
            />
            <DependencyStatus
              name="aider"
              displayName="Aider"
              icon={<Code2 className="w-4 h-4" />}
              status={dependencies.aider}
              showToggle
              isEnabled={isAgentEnabled("aider")}
              onToggle={(enabled) => handleAgentToggle("aider", enabled)}
              toggleDisabled={isTogglingAgent === "aider"}
            />
            <DependencyStatus
              name="gemini"
              displayName="Gemini"
              icon={<Sparkles className="w-4 h-4" />}
              status={dependencies.gemini}
              showToggle
              isEnabled={isAgentEnabled("gemini")}
              onToggle={(enabled) => handleAgentToggle("gemini", enabled)}
              toggleDisabled={isTogglingAgent === "gemini"}
            />

            {/* Local LLM Servers */}
            <div className="text-xs text-mid-gray/70 mb-3 mt-5 px-1">
              {t("devops.dependencies.localLlm")}
            </div>
            <DependencyStatus
              name="ollama"
              displayName="Ollama"
              icon={<Server className="w-4 h-4" />}
              status={dependencies.ollama}
              showToggle
              isEnabled={isAgentEnabled("ollama")}
              onToggle={(enabled) => handleAgentToggle("ollama", enabled)}
              toggleDisabled={isTogglingAgent === "ollama"}
            />
            <DependencyStatus
              name="vllm"
              displayName="vLLM"
              icon={<Cpu className="w-4 h-4" />}
              status={dependencies.vllm}
              showToggle
              isEnabled={isAgentEnabled("vllm")}
              onToggle={(enabled) => handleAgentToggle("vllm", enabled)}
              toggleDisabled={isTogglingAgent === "vllm"}
            />

            {/* Enabled agents summary */}
            {enabledAgents.length > 0 && (
              <div className="mt-4 pt-4 px-4 border-t border-mid-gray/20 text-xs text-mid-gray">
                {t("devops.dependencies.enabledAgents")}:{" "}
                {enabledAgents.join(", ")}
              </div>
            )}
          </div>
        ) : null}
      </SettingsGroup>

      {/* Active Agents Dashboard */}
      {dependencies?.all_satisfied && (
        <SettingsGroup
          title={t("devops.orchestrator.title")}
          description={t("devops.orchestrator.description")}
        >
          <AgentDashboard />
        </SettingsGroup>
      )}

      {/* Agent Sessions */}
      {dependencies?.all_satisfied && (
        <SettingsGroup
          title={t("devops.sessions.title")}
          description={t("devops.sessions.description")}
        >
          <SessionManager onSessionsChange={checkDependencies} />
        </SettingsGroup>
      )}

      {/* Git Worktrees */}
      {dependencies?.all_satisfied && (
        <SettingsGroup
          title={t("devops.worktrees.title")}
          description={t("devops.worktrees.description")}
        >
          <WorktreeManager />
        </SettingsGroup>
      )}

      {/* GitHub Issues */}
      {dependencies?.gh?.installed && (
        <SettingsGroup
          title={t("devops.issues.title")}
          description={t("devops.issues.description")}
        >
          <IssueQueue />
        </SettingsGroup>
      )}

      {/* GitHub Pull Requests */}
      {dependencies?.gh?.installed && (
        <SettingsGroup
          title={t("devops.prs.title")}
          description={t("devops.prs.description")}
        >
          <PullRequestPanel />
        </SettingsGroup>
      )}
    </div>
  );
};
