import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useDevOpsStore } from "@/stores/devopsStore";
import { Terminal, X, Laptop, Globe } from "lucide-react";

type DevOpsState = "online" | "offline" | "loading";

const getStatusColor = (state: DevOpsState): string => {
  switch (state) {
    case "online":
      return "bg-green-400";
    case "loading":
      return "bg-yellow-400 animate-pulse";
    case "offline":
      return "bg-mid-gray/40";
    default:
      return "bg-mid-gray/40";
  }
};

export const DevOpsStatus: React.FC = () => {
  const { t } = useTranslation();
  const [showPopover, setShowPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const agents = useDevOpsStore((state) => state.agents);
  const agentsLoading = useDevOpsStore((state) => state.agentsLoading);
  const isTmuxRunning = useDevOpsStore((state) => state.isTmuxRunning);
  const currentMachineId = useDevOpsStore((state) => state.currentMachineId);

  // Count local and remote agents
  const localAgents = agents.filter((a) => a.is_local);
  const remoteAgents = agents.filter((a) => !a.is_local);

  // Derive state
  const devopsState: DevOpsState = agentsLoading
    ? "loading"
    : isTmuxRunning || agents.length > 0
      ? "online"
      : "offline";

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        setShowPopover(false);
      }
    };

    if (showPopover) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showPopover]);

  return (
    <div className="flex items-center gap-2 relative" ref={popoverRef}>
      <button
        onClick={() => setShowPopover(!showPopover)}
        className={`flex items-center gap-1 transition-colors cursor-pointer p-1 rounded ${
          showPopover
            ? "text-text/90 bg-mid-gray/20"
            : "text-text/50 hover:text-text/70"
        }`}
      >
        <Terminal className="w-3 h-3" />
        <div
          className={`w-1.5 h-1.5 rounded-full ${getStatusColor(devopsState)}`}
        />
      </button>

      {/* Popover */}
      {showPopover && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-background border border-mid-gray/30 rounded-lg shadow-xl z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-mid-gray/20">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-text/70" />
              <span className="font-medium text-sm">
                {t("footer.devops.title")}
              </span>
            </div>
            <button
              onClick={() => setShowPopover(false)}
              className="text-text/40 hover:text-text/60 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Content */}
          <div className="px-3 py-2 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-text/60">
                {t("footer.devops.tmuxServer")}
              </span>
              <span
                className={isTmuxRunning ? "text-green-400" : "text-text/40"}
              >
                {isTmuxRunning
                  ? t("footer.devops.running")
                  : t("footer.devops.stopped")}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-text/60">
                {t("footer.devops.totalAgents")}
              </span>
              <span className="text-text/80">{agents.length}</span>
            </div>

            {agents.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-text/60 flex items-center gap-1">
                    <Laptop className="w-3 h-3" />
                    {t("footer.devops.localAgents")}
                  </span>
                  <span className="text-text/80">{localAgents.length}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-text/60 flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    {t("footer.devops.remoteAgents")}
                  </span>
                  <span className="text-text/80">{remoteAgents.length}</span>
                </div>
              </>
            )}

            {currentMachineId && (
              <div className="flex items-center justify-between">
                <span className="text-text/60">
                  {t("footer.devops.machineId")}
                </span>
                <span className="text-text/80 truncate max-w-32 font-mono text-[10px]">
                  {currentMachineId.slice(0, 12)}
                </span>
              </div>
            )}

            <p className="text-xs text-text/40 pt-2 border-t border-mid-gray/20">
              {t("footer.devops.description")}
            </p>
          </div>

          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
            <div className="w-2 h-2 bg-background border-r border-b border-mid-gray/30 transform rotate-45" />
          </div>
        </div>
      )}
    </div>
  );
};

export default DevOpsStatus;
