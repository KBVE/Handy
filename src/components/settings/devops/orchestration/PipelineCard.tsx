import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { commands, PipelineItem } from "@/bindings";
import { toast } from "@/stores/toastStore";
import {
  GitBranch,
  GitPullRequest,
  ExternalLink,
  Terminal,
  Bot,
  Clock,
  Loader2,
  Trash2,
  CheckCircle,
  XCircle,
  ArrowRight,
  Eye,
} from "lucide-react";

interface PipelineCardProps {
  item: PipelineItem;
  onRefresh: () => void;
}

export const PipelineCard: React.FC<PipelineCardProps> = ({
  item,
  onRefresh,
}) => {
  const { t } = useTranslation();
  const [isAttaching, setIsAttaching] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "in_progress":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "pr_pending":
        return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      case "pr_review":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "completed":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "skipped":
        return "bg-gray-500/20 text-gray-400 border-gray-500/30";
      case "failed":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      default:
        return "bg-mid-gray/20 text-mid-gray border-mid-gray/30";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "in_progress":
        return t("devops.orchestration.statusInProgress");
      case "pr_pending":
        return t("devops.orchestration.statusPrPending");
      case "pr_review":
        return t("devops.orchestration.statusPrReview");
      case "completed":
        return t("devops.orchestration.statusCompleted");
      case "skipped":
        return t("devops.orchestration.statusSkipped");
      case "failed":
        return t("devops.orchestration.statusFailed");
      default:
        return status;
    }
  };

  const getPrStatusIcon = (prStatus: string) => {
    switch (prStatus) {
      case "draft":
        return <GitPullRequest className="w-3 h-3 text-gray-400" />;
      case "ready":
        return <GitPullRequest className="w-3 h-3 text-green-400" />;
      case "needs_review":
        return <Eye className="w-3 h-3 text-yellow-400" />;
      case "approved":
        return <CheckCircle className="w-3 h-3 text-green-400" />;
      case "merged":
        return <GitPullRequest className="w-3 h-3 text-purple-400" />;
      case "closed":
        return <XCircle className="w-3 h-3 text-red-400" />;
      default:
        return null;
    }
  };

  const formatDuration = (startedAt: string | null) => {
    if (!startedAt) return null;
    const start = new Date(startedAt);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) {
      return t("devops.orchestration.durationMinutes", { count: diffMins });
    }
    const diffHours = Math.floor(diffMins / 60);
    return t("devops.orchestration.durationHours", { count: diffHours });
  };

  const handleViewSession = async () => {
    if (!item.session_name) return;
    setIsAttaching(true);
    try {
      await commands.attachTmuxSession(item.session_name);
    } catch (err) {
      toast.error(
        t("devops.orchestration.attachError"),
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setIsAttaching(false);
    }
  };

  const handleCancel = async () => {
    if (!item.session_name) return;
    setIsCanceling(true);
    try {
      // Archive the pipeline item
      const result = await commands.archivePipelineItem(item.id);
      if (result.status === "ok") {
        toast.success(
          t("devops.orchestration.cancelSuccess"),
          t("devops.orchestration.cancelSuccessMessage"),
        );
        onRefresh();
      } else {
        toast.error(t("devops.orchestration.cancelError"), result.error);
      }
    } catch (err) {
      toast.error(
        t("devops.orchestration.cancelError"),
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setIsCanceling(false);
    }
  };

  const openUrl = (url: string) => {
    window.open(url, "_blank");
  };

  return (
    <div className="bg-mid-gray/10 rounded-xl border border-mid-gray/20 overflow-hidden hover:border-logo-primary/30 transition-colors">
      {/* Flow visualization header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-mid-gray/5 border-b border-mid-gray/10">
        {/* Issue */}
        <div className="flex items-center gap-1.5 text-sm">
          <GitBranch className="w-4 h-4 text-blue-400" />
          <span className="text-mid-gray">
            {t("devops.orchestration.flowIssue")}
          </span>
        </div>
        <ArrowRight className="w-3 h-3 text-mid-gray/50" />

        {/* Session */}
        <div className="flex items-center gap-1.5 text-sm">
          {item.agent_type === "claude" ? (
            <Bot className="w-4 h-4 text-purple-400" />
          ) : (
            <Terminal className="w-4 h-4 text-green-400" />
          )}
          <span className="text-mid-gray">
            {t("devops.orchestration.flowSession")}
          </span>
        </div>
        <ArrowRight className="w-3 h-3 text-mid-gray/50" />

        {/* PR */}
        <div className="flex items-center gap-1.5 text-sm">
          <GitPullRequest
            className={`w-4 h-4 ${item.pr_number ? "text-green-400" : "text-mid-gray/30"}`}
          />
          <span
            className={item.pr_number ? "text-mid-gray" : "text-mid-gray/50"}
          >
            {t("devops.orchestration.flowPr")}
          </span>
        </div>

        {/* Status badge */}
        <div className="ml-auto">
          <span
            className={`text-xs px-2 py-1 rounded-full border ${getStatusColor(item.status)}`}
          >
            {getStatusLabel(item.status)}
          </span>
        </div>
      </div>

      {/* Main content */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Issue info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <button
                onClick={() => openUrl(item.issue_url)}
                className="text-sm font-medium hover:text-logo-primary transition-colors truncate text-left"
              >
                #{item.issue_number}: {item.issue_title}
              </button>
              <ExternalLink className="w-3 h-3 text-mid-gray shrink-0" />
            </div>

            <div className="flex items-center gap-3 text-xs text-mid-gray">
              {/* Agent type */}
              <span className="flex items-center gap-1">
                {item.agent_type === "claude" ? (
                  <Bot className="w-3 h-3" />
                ) : (
                  <Terminal className="w-3 h-3" />
                )}
                {item.agent_type}
              </span>

              {/* Duration */}
              {item.started_at && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDuration(item.started_at)}
                </span>
              )}

              {/* Session name */}
              {item.session_name && (
                <code className="text-xs bg-mid-gray/20 px-1.5 py-0.5 rounded">
                  {item.session_name}
                </code>
              )}

              {/* PR info */}
              {item.pr_number && (
                <button
                  onClick={() => item.pr_url && openUrl(item.pr_url)}
                  className="flex items-center gap-1 hover:text-logo-primary transition-colors"
                >
                  {getPrStatusIcon(item.pr_status)}
                  <span>
                    {t("devops.orchestration.prNumber", {
                      number: item.pr_number,
                    })}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {item.session_name && (
              <button
                onClick={handleViewSession}
                disabled={isAttaching}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-logo-primary/20 hover:bg-logo-primary/30 text-logo-primary transition-colors disabled:opacity-50"
              >
                {isAttaching ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <ExternalLink className="w-3 h-3" />
                )}
                {t("devops.orchestration.viewSession")}
              </button>
            )}
            <button
              onClick={handleCancel}
              disabled={isCanceling}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors disabled:opacity-50"
            >
              {isCanceling ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Trash2 className="w-3 h-3" />
              )}
              {t("devops.orchestration.cancel")}
            </button>
          </div>
        </div>

        {/* Error message */}
        {item.error && (
          <div className="mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
            {item.error}
          </div>
        )}
      </div>
    </div>
  );
};
