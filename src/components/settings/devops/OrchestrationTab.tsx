import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { commands, PipelineItem, PipelineSummary } from "@/bindings";
import { useDevOpsStore } from "@/stores/devopsStore";
import { RefreshCcw, Loader2, AlertCircle } from "lucide-react";
import { ActivePipeline } from "./orchestration/ActivePipeline";
import { QueuedIssues } from "./orchestration/QueuedIssues";
import { CompletedWork } from "./orchestration/CompletedWork";

export const OrchestrationTab: React.FC = () => {
  const { t } = useTranslation();
  const [pipelineItems, setPipelineItems] = useState<PipelineItem[]>([]);
  const [summary, setSummary] = useState<PipelineSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeEpic = useDevOpsStore((state) => state.activeEpic);

  const fetchPipelineData = useCallback(async () => {
    try {
      setError(null);

      // Get work repo from active epic if available
      const workRepo = activeEpic?.work_repo || null;

      const [itemsResult, summaryResult] = await Promise.all([
        commands.listPipelineItems(workRepo),
        commands.getPipelineSummary(),
      ]);

      if (itemsResult.status === "ok") {
        setPipelineItems(itemsResult.data);
      } else {
        setError(itemsResult.error);
      }

      setSummary(summaryResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [activeEpic?.work_repo]);

  // Initial fetch
  useEffect(() => {
    fetchPipelineData();
  }, [fetchPipelineData]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const interval = setInterval(fetchPipelineData, 15000);
    return () => clearInterval(interval);
  }, [fetchPipelineData]);

  const handleRefresh = async () => {
    setIsLoading(true);
    await fetchPipelineData();
  };

  // Categorize pipeline items
  const activeItems = pipelineItems.filter(
    (item) =>
      item.status === "in_progress" ||
      item.status === "pr_pending" ||
      item.status === "pr_review",
  );
  const queuedItems = pipelineItems.filter((item) => item.status === "queued");
  const completedItems = pipelineItems.filter(
    (item) => item.status === "completed" || item.status === "skipped",
  );

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <p className="text-red-400 mb-4">{error}</p>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 px-4 py-2 rounded bg-mid-gray/20 hover:bg-mid-gray/30 transition-colors"
        >
          <RefreshCcw className="w-4 h-4" />
          {t("devops.refresh")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">
            {t("devops.orchestration.title")}
          </h2>
          {summary && (
            <div className="flex items-center gap-3 text-sm text-mid-gray">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                {t("devops.orchestration.summaryActive", {
                  count: summary.in_progress,
                })}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-yellow-400" />
                {t("devops.orchestration.summaryQueued", {
                  count: summary.queued,
                })}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                {t("devops.orchestration.summaryCompleted", {
                  count: summary.completed,
                })}
              </span>
            </div>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded hover:bg-mid-gray/20 transition-colors disabled:opacity-50"
        >
          <RefreshCcw
            className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
          />
          {t("devops.refresh")}
        </button>
      </div>

      {/* Loading state */}
      {isLoading && pipelineItems.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-logo-primary" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Active Pipeline */}
          <ActivePipeline items={activeItems} onRefresh={handleRefresh} />

          {/* Queued Issues */}
          <QueuedIssues items={queuedItems} onRefresh={handleRefresh} />

          {/* Completed Work */}
          <CompletedWork items={completedItems} onRefresh={handleRefresh} />
        </div>
      )}
    </div>
  );
};
