import React from "react";
import { useTranslation } from "react-i18next";
import { DependencyStatus as DependencyStatusType } from "@/bindings";
import {
  CheckCircle2,
  XCircle,
  Copy,
  AlertTriangle,
  ExternalLink,
  Terminal,
} from "lucide-react";

interface DependencyStatusProps {
  name: string;
  displayName: string;
  icon: React.ReactNode;
  status: DependencyStatusType;
  showToggle?: boolean;
  isEnabled?: boolean;
  onToggle?: (enabled: boolean) => void;
  toggleDisabled?: boolean;
  onLaunchAuth?: () => void;
  launchAuthDisabled?: boolean;
}

export const DependencyStatus: React.FC<DependencyStatusProps> = ({
  name,
  displayName,
  icon,
  status,
  showToggle = false,
  isEnabled = false,
  onToggle,
  toggleDisabled = false,
  onLaunchAuth,
  launchAuthDisabled = false,
}) => {
  const { t } = useTranslation();

  const copyInstallCommand = () => {
    navigator.clipboard.writeText(status.install_hint);
  };

  // Determine if auth is required and missing
  const needsAuth = status.authenticated !== null;
  const isAuthenticated = status.authenticated === true;
  const installedButNotAuth = status.installed && needsAuth && !isAuthenticated;

  return (
    <div className="flex items-start gap-3 p-4 rounded-lg bg-mid-gray/10">
      {/* Status icon */}
      <div className="mt-0.5">
        {status.installed ? (
          installedButNotAuth ? (
            <AlertTriangle className="w-5 h-5 text-yellow-400" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-green-400" />
          )
        ) : (
          <XCircle className="w-5 h-5 text-red-400" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium">{displayName}</span>
          <code className="text-xs px-1.5 py-0.5 rounded bg-mid-gray/20 text-mid-gray">
            {name}
          </code>
        </div>

        {status.installed ? (
          <div className="mt-1 text-sm text-mid-gray">
            <div className="flex items-center gap-2">
              <span>{t("devops.dependencies.version")}:</span>
              <code className="text-green-400">
                {status.version || t("devops.dependencies.unknown")}
              </code>
            </div>
            {status.path && (
              <div className="flex items-center gap-2 mt-0.5">
                <span>{t("devops.dependencies.path")}:</span>
                <code
                  className="text-xs truncate max-w-[200px]"
                  title={status.path}
                >
                  {status.path}
                </code>
              </div>
            )}
            {/* Show authenticated user if available */}
            {isAuthenticated && status.auth_user && (
              <div className="flex items-center gap-2 mt-0.5">
                <span>{t("devops.dependencies.authenticatedAs")}:</span>
                <code className="text-green-400">{status.auth_user}</code>
              </div>
            )}
            {/* Authentication status warning */}
            {installedButNotAuth && (
              <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <p className="text-yellow-400 text-sm font-medium mb-2">
                  {t("devops.dependencies.notAuthenticated")}
                </p>
                <p className="text-yellow-400/80 text-xs mb-2">
                  {t("devops.dependencies.verifyInstance")}
                </p>
                <div className="flex items-center gap-3 mt-3">
                  {onLaunchAuth && (
                    <button
                      onClick={onLaunchAuth}
                      disabled={launchAuthDisabled}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-logo-primary hover:bg-logo-primary/80 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Terminal className="w-3 h-3" />
                      {t("devops.dependencies.launchAuth")}
                    </button>
                  )}
                  {status.auth_hint_url && (
                    <a
                      href={status.auth_hint_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-logo-primary hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {t("devops.dependencies.followGuide")}
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-2">
            <p className="text-sm text-yellow-400 mb-2">
              {t("devops.dependencies.notInstalled")}
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs px-2 py-1.5 rounded bg-black/30 text-green-400 font-mono">
                {status.install_hint}
              </code>
              <button
                onClick={copyInstallCommand}
                className="p-1.5 rounded hover:bg-mid-gray/20 transition-colors"
                title={t("devops.dependencies.copyCommand")}
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Toggle switch for agents */}
      {showToggle && (
        <div className="flex items-center">
          <button
            onClick={() => onToggle?.(!isEnabled)}
            disabled={toggleDisabled || !status.installed}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              isEnabled && status.installed
                ? "bg-logo-primary"
                : "bg-mid-gray/30"
            } ${toggleDisabled || !status.installed ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            title={
              !status.installed
                ? t("devops.dependencies.installFirst")
                : undefined
            }
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isEnabled && status.installed
                  ? "translate-x-6"
                  : "translate-x-1"
              }`}
            />
          </button>
        </div>
      )}
    </div>
  );
};
