import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDevOpsStore } from "@/stores/devopsStore";
import { toast } from "@/stores/toastStore";
import {
  Eye,
  Play,
  Square,
  Loader2,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Clock,
  CheckCheck,
  Pause,
  SkipForward,
} from "lucide-react";

export const EpicMonitor: React.FC = () => {
  const { t } = useTranslation();
  const {
    activeEpic,
    epicLoading,
    epicMonitor,
    epicMonitorChecking,
    startEpicMonitoring,
    stopEpicMonitoring,
    checkEpicCompletions,
    setEpicMonitorAutoUpdate,
    markPhaseStatus,
  } = useDevOpsStore();

  const [markingPhase, setMarkingPhase] = useState<number | null>(null);

  const handleStartMonitoring = () => {
    startEpicMonitoring();
    toast.info(
      t("devops.epicMonitor.started"),
      t("devops.epicMonitor.startedMessage")
    );
  };

  const handleStopMonitoring = () => {
    stopEpicMonitoring();
    toast.info(t("devops.epicMonitor.stopped"));
  };

  const handleMarkPhase = async (phaseNumber: number, status: string) => {
    setMarkingPhase(phaseNumber);
    try {
      await markPhaseStatus(phaseNumber, status);
      toast.success(
        t("devops.epicMonitor.phaseUpdated"),
        t("devops.epicMonitor.phaseUpdatedMessage", { phase: phaseNumber, status })
      );
    } catch (err) {
      toast.error(t("devops.epicMonitor.phaseUpdateFailed"));
    } finally {
      setMarkingPhase(null);
    }
  };

  // Get phase status icon and color
  const getPhaseStatusInfo = (status: string) => {
    switch (status) {
      case "completed":
        return { icon: CheckCircle, color: "text-green-400", bgColor: "bg-green-500/10" };
      case "in_progress":
        return { icon: Clock, color: "text-blue-400", bgColor: "bg-blue-500/10" };
      case "skipped":
        return { icon: SkipForward, color: "text-gray-400", bgColor: "bg-gray-500/10" };
      default:
        return { icon: Pause, color: "text-mid-gray", bgColor: "bg-mid-gray/10" };
    }
  };

  // Count active agents (sessions working on Epic sub-issues)
  const activeAgentCount = activeEpic
    ? activeEpic.sub_issues.filter((s) => s.has_agent_working).length
    : 0;

  const inProgressCount = activeEpic
    ? activeEpic.sub_issues.filter((s) => s.state === "open" && s.has_agent_working).length
    : 0;

  const readyCount = activeEpic
    ? activeEpic.sub_issues.filter((s) => s.state === "open" && !s.has_agent_working).length
    : 0;

  const completedCount = activeEpic
    ? activeEpic.sub_issues.filter((s) => s.state === "closed").length
    : 0;

  if (!activeEpic) {
    return (
      <div className="p-4 bg-mid-gray/10 border border-mid-gray/20 rounded-lg">
        <div className="flex items-center gap-3 text-mid-gray">
          <Eye className="w-5 h-5" />
          <div>
            <p className="font-medium">{t("devops.epicMonitor.title")}</p>
            <p className="text-xs">{t("devops.epicMonitor.linkHint")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with status and controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-lg ${
              epicMonitor.isMonitoring
                ? "bg-green-500/20 text-green-400"
                : "bg-mid-gray/20 text-mid-gray"
            }`}
          >
            <Eye className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-medium">
              {t("devops.epicMonitor.title")}
              {activeEpic && (
                <span className="ml-2 text-xs text-mid-gray font-normal">
                  #{activeEpic.epic_number}
                </span>
              )}
            </h3>
            <p className="text-xs text-mid-gray">
              {epicMonitor.isMonitoring
                ? t("devops.epicMonitor.watching")
                : t("devops.epicMonitor.description")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {epicMonitor.isMonitoring ? (
            <>
              <button
                onClick={checkEpicCompletions}
                disabled={epicMonitorChecking}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-mid-gray/20 hover:bg-mid-gray/30 transition-colors disabled:opacity-50"
                title={t("devops.epicMonitor.checkNow")}
              >
                {epicMonitorChecking ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                {t("devops.epicMonitor.check")}
              </button>
              <button
                onClick={handleStopMonitoring}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors"
              >
                <Square className="w-4 h-4" />
                {t("devops.epicMonitor.stop")}
              </button>
            </>
          ) : (
            <button
              onClick={handleStartMonitoring}
              disabled={epicLoading}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-logo-primary hover:bg-logo-primary/80 text-white transition-colors disabled:opacity-50"
            >
              {epicLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {t("devops.epicMonitor.startMonitoring")}
            </button>
          )}
        </div>
      </div>

      {/* Status dashboard */}
      <div className="grid grid-cols-4 gap-3">
        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <div className="flex items-center gap-2 text-blue-400">
            <Clock className="w-4 h-4" />
            <span className="text-xs">{t("devops.epicMonitor.inProgress")}</span>
          </div>
          <p className="text-xl font-bold text-white mt-1">{inProgressCount}</p>
        </div>

        <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <div className="flex items-center gap-2 text-yellow-400">
            <AlertCircle className="w-4 h-4" />
            <span className="text-xs">{t("devops.epicMonitor.ready")}</span>
          </div>
          <p className="text-xl font-bold text-white mt-1">{readyCount}</p>
        </div>

        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
          <div className="flex items-center gap-2 text-green-400">
            <CheckCircle className="w-4 h-4" />
            <span className="text-xs">{t("devops.epicMonitor.completed")}</span>
          </div>
          <p className="text-xl font-bold text-white mt-1">{completedCount}</p>
        </div>

        <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
          <div className="flex items-center gap-2 text-purple-400">
            <Eye className="w-4 h-4" />
            <span className="text-xs">{t("devops.epicMonitor.thisSession")}</span>
          </div>
          <p className="text-xl font-bold text-white mt-1">
            {epicMonitor.completedSinceStart}
          </p>
        </div>
      </div>

      {/* Options */}
      <div className="flex items-center justify-between p-3 bg-mid-gray/10 border border-mid-gray/20 rounded-lg">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={epicMonitor.autoUpdateGithub}
            onChange={(e) => setEpicMonitorAutoUpdate(e.target.checked)}
            className="rounded border-mid-gray/30 bg-mid-gray/10 text-logo-primary focus:ring-logo-primary"
          />
          {t("devops.epicMonitor.autoUpdateGithub")}
        </label>

        {epicMonitor.lastCheck && (
          <span className="text-xs text-mid-gray">
            {t("devops.epicMonitor.lastCheck", {
              time: epicMonitor.lastCheck.toLocaleTimeString(),
            })}
          </span>
        )}
      </div>

      {/* Phase status list */}
      {activeEpic.phases.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-mid-gray">
            {t("devops.epicMonitor.phases")}
          </h4>
          <div className="space-y-2">
            {activeEpic.phases.map((phase) => {
              const { icon: StatusIcon, color, bgColor } = getPhaseStatusInfo(phase.status);
              const isMarking = markingPhase === phase.phase_number;

              return (
                <div
                  key={phase.phase_number}
                  className={`flex items-center justify-between p-3 rounded-lg border border-mid-gray/20 ${bgColor}`}
                >
                  <div className="flex items-center gap-3">
                    <StatusIcon className={`w-5 h-5 ${color}`} />
                    <div>
                      <p className="text-sm font-medium text-white">
                        {t("devops.epicMonitor.phaseNumber", { number: phase.phase_number })}: {phase.name}
                      </p>
                      <p className="text-xs text-mid-gray capitalize">
                        {phase.status.replace("_", " ")}
                        {phase.total_count > 0 && ` (${phase.completed_count}/${phase.total_count})`}
                      </p>
                    </div>
                  </div>

                  {/* Mark as complete button (only show if not already completed) */}
                  {phase.status !== "completed" && (
                    <button
                      onClick={() => handleMarkPhase(phase.phase_number, "completed")}
                      disabled={isMarking || epicLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-400 transition-colors disabled:opacity-50"
                      title={t("devops.epicMonitor.markComplete")}
                    >
                      {isMarking ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <CheckCheck className="w-3 h-3" />
                      )}
                      {t("devops.epicMonitor.markComplete")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Active agents list */}
      {activeAgentCount > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-mid-gray">
            {t("devops.epicMonitor.activeAgents")}
          </h4>
          <div className="space-y-1">
            {activeEpic.sub_issues
              .filter((s) => s.has_agent_working)
              .map((subIssue) => (
                <div
                  key={subIssue.issue_number}
                  className="flex items-center gap-2 p-2 bg-mid-gray/10 rounded text-sm"
                >
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <a
                    href={subIssue.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300"
                  >
                    #{subIssue.issue_number}
                  </a>
                  <span className="text-mid-gray">-</span>
                  <span className="text-white truncate flex-1">{subIssue.title}</span>
                  {subIssue.session_name && (
                    <span className="text-xs text-mid-gray bg-mid-gray/20 px-2 py-0.5 rounded">
                      {subIssue.session_name}
                    </span>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};
