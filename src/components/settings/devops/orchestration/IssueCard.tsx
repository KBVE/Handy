import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { commands, PipelineItem } from "@/bindings";
import { toast } from "@/stores/toastStore";
import { useDevOpsStore } from "@/stores/devopsStore";
import {
  GitBranch,
  ExternalLink,
  Play,
  SkipForward,
  Loader2,
  Bot,
  Terminal,
  Wrench,
} from "lucide-react";

interface IssueCardProps {
  item: PipelineItem;
  onRefresh: () => void;
}

const AGENT_TYPES = [
  { id: "claude", label: "Claude", icon: Bot },
  { id: "aider", label: "Aider", icon: Wrench },
  { id: "codex", label: "Codex", icon: Terminal },
];

export const IssueCard: React.FC<IssueCardProps> = ({ item, onRefresh }) => {
  const { t } = useTranslation();
  const [selectedAgent, setSelectedAgent] = useState("claude");
  const [isAssigning, setIsAssigning] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);

  const activeEpic = useDevOpsStore((state) => state.activeEpic);

  const handleAssign = async () => {
    if (!activeEpic?.local_path) {
      toast.error(
        t("devops.orchestration.assignError"),
        t("devops.orchestration.noRepoPath"),
      );
      return;
    }

    setIsAssigning(true);
    try {
      const result = await commands.assignIssueToAgentPipeline({
        tracking_repo: item.tracking_repo,
        work_repo: item.work_repo,
        issue_number: item.issue_number,
        issue_title: item.issue_title,
        issue_url: item.issue_url,
        agent_type: selectedAgent,
        local_repo_path: activeEpic.local_path,
        session_name: null,
        worktree_prefix: null,
        working_labels: [],
      });

      if (result.status === "ok") {
        toast.success(
          t("devops.orchestration.assignSuccess"),
          t("devops.orchestration.assignSuccessMessage", {
            agent: selectedAgent,
            issue: item.issue_number,
          }),
        );
        onRefresh();
      } else {
        toast.error(t("devops.orchestration.assignError"), result.error);
      }
    } catch (err) {
      toast.error(
        t("devops.orchestration.assignError"),
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setIsAssigning(false);
    }
  };

  const handleSkip = async () => {
    setIsSkipping(true);
    try {
      const result = await commands.skipIssue({
        tracking_repo: item.tracking_repo,
        issue_number: item.issue_number,
        reason: null,
      });

      if (result.status === "ok") {
        toast.success(
          t("devops.orchestration.skipSuccess"),
          t("devops.orchestration.skipSuccessMessage", {
            issue: item.issue_number,
          }),
        );
        onRefresh();
      } else {
        toast.error(t("devops.orchestration.skipError"), result.error);
      }
    } catch (err) {
      toast.error(
        t("devops.orchestration.skipError"),
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setIsSkipping(false);
    }
  };

  const openUrl = (url: string) => {
    window.open(url, "_blank");
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="bg-mid-gray/10 rounded-xl border border-mid-gray/20 p-4 hover:border-yellow-500/30 transition-colors">
      {/* Issue info */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1">
          <GitBranch className="w-4 h-4 text-yellow-400 shrink-0" />
          <button
            onClick={() => openUrl(item.issue_url)}
            className="text-sm font-medium hover:text-logo-primary transition-colors truncate text-left"
          >
            #{item.issue_number}: {item.issue_title}
          </button>
          <ExternalLink className="w-3 h-3 text-mid-gray shrink-0" />
        </div>
        <div className="flex items-center gap-2 text-xs text-mid-gray ml-6">
          <span>{item.work_repo}</span>
          <span>·</span>
          <span>{formatDate(item.created_at)}</span>
        </div>
      </div>

      {/* Agent selection */}
      <div className="mb-3">
        <label className="text-xs text-mid-gray mb-1.5 block">
          {t("devops.orchestration.selectAgent")}
        </label>
        <div className="flex items-center gap-2">
          {AGENT_TYPES.map((agent) => {
            const Icon = agent.icon;
            return (
              <button
                key={agent.id}
                onClick={() => setSelectedAgent(agent.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
                  selectedAgent === agent.id
                    ? "bg-logo-primary/20 border-logo-primary/50 text-logo-primary"
                    : "bg-mid-gray/10 border-mid-gray/20 text-mid-gray hover:border-mid-gray/40"
                }`}
              >
                <Icon className="w-3 h-3" />
                {agent.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleAssign}
          disabled={isAssigning || !activeEpic?.local_path}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-logo-primary hover:bg-logo-primary/80 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isAssigning ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Play className="w-3 h-3" />
          )}
          {t("devops.orchestration.assign")}
        </button>
        <button
          onClick={handleSkip}
          disabled={isSkipping}
          className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-mid-gray/20 hover:bg-mid-gray/30 text-mid-gray transition-colors disabled:opacity-50"
        >
          {isSkipping ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <SkipForward className="w-3 h-3" />
          )}
          {t("devops.orchestration.skip")}
        </button>
      </div>

      {/* Warning if no repo path */}
      {!activeEpic?.local_path && (
        <p className="text-xs text-yellow-400/80 mt-2">
          {t("devops.orchestration.noRepoPathHint")}
        </p>
      )}
    </div>
  );
};
