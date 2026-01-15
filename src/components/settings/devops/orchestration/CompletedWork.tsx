import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { PipelineItem } from "@/bindings";
import {
  CheckCircle,
  AlertCircle,
  ExternalLink,
  GitPullRequest,
  GitBranch,
  ChevronDown,
  ChevronUp,
  Bot,
  Terminal,
  SkipForward,
} from "lucide-react";

interface CompletedWorkProps {
  items: PipelineItem[];
  onRefresh: () => void;
}

export const CompletedWork: React.FC<CompletedWorkProps> = ({ items }) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  // Only show first 5 items unless expanded
  const displayItems = isExpanded ? items : items.slice(0, 5);
  const hasMore = items.length > 5;

  const openUrl = (url: string) => {
    window.open(url, "_blank");
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CheckCircle className="w-5 h-5 text-green-400" />
        <h3 className="font-semibold">
          {t("devops.orchestration.completedWork")}
        </h3>
        <span className="text-sm text-mid-gray">({items.length})</span>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center bg-mid-gray/5 rounded-xl border border-mid-gray/10">
          <AlertCircle className="w-8 h-8 text-mid-gray/30 mb-2" />
          <p className="text-sm text-mid-gray">
            {t("devops.orchestration.noCompletedWork")}
          </p>
          <p className="text-xs text-mid-gray/70 mt-1">
            {t("devops.orchestration.noCompletedWorkHint")}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-4 p-3 bg-mid-gray/5 rounded-lg border border-mid-gray/10 hover:border-mid-gray/20 transition-colors"
            >
              {/* Status icon */}
              <div className="shrink-0">
                {item.status === "completed" ? (
                  <CheckCircle className="w-5 h-5 text-green-400" />
                ) : (
                  <SkipForward className="w-5 h-5 text-gray-400" />
                )}
              </div>

              {/* Issue info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openUrl(item.issue_url)}
                    className="text-sm font-medium hover:text-logo-primary transition-colors truncate text-left"
                  >
                    #{item.issue_number}: {item.issue_title}
                  </button>
                </div>
                <div className="flex items-center gap-3 text-xs text-mid-gray mt-0.5">
                  <span className="flex items-center gap-1">
                    {item.agent_type === "claude" ? (
                      <Bot className="w-3 h-3" />
                    ) : (
                      <Terminal className="w-3 h-3" />
                    )}
                    {item.agent_type}
                  </span>
                  {item.completed_at && (
                    <span>{formatDate(item.completed_at)}</span>
                  )}
                </div>
              </div>

              {/* PR link */}
              {item.pr_number && item.pr_url && (
                <button
                  onClick={() => item.pr_url && openUrl(item.pr_url)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors shrink-0"
                >
                  <GitPullRequest className="w-3 h-3" />
                  <span>#{item.pr_number}</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}

              {/* Issue link if no PR */}
              {!item.pr_number && (
                <button
                  onClick={() => openUrl(item.issue_url)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg bg-mid-gray/10 text-mid-gray hover:bg-mid-gray/20 transition-colors shrink-0"
                >
                  <GitBranch className="w-3 h-3" />
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}

          {/* Expand/collapse button */}
          {hasMore && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center justify-center gap-1.5 w-full py-2 text-xs text-mid-gray hover:text-white transition-colors"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  {t("devops.orchestration.showLess")}
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  {t("devops.orchestration.showMore", {
                    count: items.length - 5,
                  })}
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
