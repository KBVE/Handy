import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useSidecarStore } from "@/stores/sidecarStore";
import { commands } from "@/bindings";
import {
  Brain,
  Volume2,
  MessageCircle,
  Database,
  Play,
  Square,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface ServiceCardProps {
  icon: React.ReactNode;
  titleKey: string;
  isOnline: boolean;
  isLoading: boolean;
  configured: boolean;
  detail: string | null;
  onStart: () => void;
  onStop: () => void;
}

const ServiceCard: React.FC<ServiceCardProps> = ({
  icon,
  titleKey,
  isOnline,
  isLoading,
  configured,
  detail,
  onStart,
  onStop,
}) => {
  const { t } = useTranslation();

  return (
    <div
      className={`flex items-center gap-4 p-4 rounded-lg border transition-all ${
        isOnline
          ? "border-green-500/40 bg-green-500/5"
          : "border-mid-gray/20 bg-mid-gray/5"
      }`}
    >
      {/* Icon + status indicator */}
      <div className="relative flex-shrink-0">
        <div
          className={`p-2.5 rounded-lg ${isOnline ? "bg-green-500/15 text-green-400" : "bg-mid-gray/15 text-mid-gray"}`}
        >
          {icon}
        </div>
        <div
          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${
            isOnline
              ? "bg-green-400"
              : isLoading
                ? "bg-yellow-400 animate-pulse"
                : "bg-mid-gray/40"
          }`}
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{t(titleKey)}</span>
          {isOnline && (
            <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
          )}
        </div>
        <p className="text-xs text-text/50 mt-0.5 truncate">
          {isLoading
            ? t("onichan.core.starting")
            : isOnline
              ? detail || t("onichan.core.running")
              : configured
                ? detail || t("onichan.core.ready")
                : t("onichan.core.notConfigured")}
        </p>
      </div>

      {/* Action button */}
      <div className="flex-shrink-0">
        {isLoading ? (
          <div className="px-3 py-1.5 rounded-md bg-yellow-500/15 text-yellow-400 text-xs font-medium flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {t("onichan.core.starting")}
          </div>
        ) : isOnline ? (
          <button
            onClick={onStop}
            className="px-3 py-1.5 rounded-md bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors text-xs font-medium flex items-center gap-1.5"
          >
            <Square className="w-3.5 h-3.5" />
            {t("onichan.core.stop")}
          </button>
        ) : configured ? (
          <button
            onClick={onStart}
            className="px-3 py-1.5 rounded-md bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors text-xs font-medium flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5" />
            {t("onichan.core.start")}
          </button>
        ) : (
          <span className="px-3 py-1.5 text-xs text-text/30">
            {t("onichan.core.notConfigured")}
          </span>
        )}
      </div>
    </div>
  );
};

export const OnichanCore: React.FC = () => {
  const { t } = useTranslation();

  const {
    llmLoaded,
    llmLoading,
    llmModelName,
    ttsLoaded,
    ttsLoading,
    discordConnected,
    discordInVoice,
    discordLoading,
    discordConversationRunning,
    memoryModelLoaded,
    memoryLoading,
    memoryModelId,
    lastLlmModelId,
    lastTtsModelId,
    lastDiscordGuildId,
    lastDiscordGuildName,
    lastDiscordChannelName,
    quickConfigLoaded,
    lastEmbeddingModelId,
    quickStartLlm,
    unloadLlm,
    quickStartTts,
    unloadTts,
    quickStartDiscord,
    quickStopDiscord,
    quickStartMemory,
    quickStopMemory,
    setDiscordConversationRunning,
  } = useSidecarStore();

  const handleStopDiscord = useCallback(async () => {
    if (discordConversationRunning) {
      await commands.discordStopConversation();
      setDiscordConversationRunning(false);
    }
    await quickStopDiscord();
  }, [
    discordConversationRunning,
    quickStopDiscord,
    setDiscordConversationRunning,
  ]);

  const handleStartDiscord = useCallback(async () => {
    await quickStartDiscord();
    // Auto-start conversation mode after connecting
    const result = await commands.discordStartConversation();
    if (result.status === "ok") {
      setDiscordConversationRunning(true);
    }
  }, [quickStartDiscord, setDiscordConversationRunning]);

  const allOnline = llmLoaded && ttsLoaded && discordInVoice;
  const anyLoading =
    llmLoading || ttsLoading || discordLoading || memoryLoading;

  const handleStartAll = useCallback(async () => {
    const promises: Promise<void>[] = [];
    if (!llmLoaded && lastLlmModelId) promises.push(quickStartLlm());
    if (!ttsLoaded && lastTtsModelId) promises.push(quickStartTts());
    if (!discordConnected && lastDiscordGuildId)
      promises.push(handleStartDiscord());
    if (!memoryModelLoaded && lastEmbeddingModelId)
      promises.push(quickStartMemory());
    await Promise.allSettled(promises);
  }, [
    llmLoaded,
    ttsLoaded,
    discordConnected,
    memoryModelLoaded,
    lastLlmModelId,
    lastTtsModelId,
    lastDiscordGuildId,
    lastEmbeddingModelId,
    quickStartLlm,
    quickStartTts,
    handleStartDiscord,
    quickStartMemory,
  ]);

  const handleStopAll = useCallback(async () => {
    const promises: Promise<void>[] = [];
    if (llmLoaded) promises.push(unloadLlm());
    if (ttsLoaded) promises.push(unloadTts());
    if (discordConnected) promises.push(handleStopDiscord());
    if (memoryModelLoaded) promises.push(quickStopMemory());
    await Promise.allSettled(promises);
  }, [
    llmLoaded,
    ttsLoaded,
    discordConnected,
    memoryModelLoaded,
    unloadLlm,
    unloadTts,
    handleStopDiscord,
    quickStopMemory,
  ]);

  if (!quickConfigLoaded) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-5 h-5 animate-spin text-text/40" />
      </div>
    );
  }

  const hasAnyConfig =
    lastLlmModelId ||
    lastTtsModelId ||
    lastDiscordGuildId ||
    lastEmbeddingModelId;

  return (
    <div className="flex flex-col gap-4 max-w-3xl w-full mx-auto">
      {/* Start/Stop All */}
      {hasAnyConfig && (
        <div className="flex items-center gap-3 pb-3 border-b border-mid-gray/10">
          <p className="text-sm text-text/50 flex-1">
            {t("onichan.core.description")}
          </p>
          {allOnline ? (
            <button
              onClick={handleStopAll}
              disabled={anyLoading}
              className="px-4 py-2 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50"
            >
              <Square className="w-4 h-4" />
              {t("onichan.core.stopAll")}
            </button>
          ) : (
            <button
              onClick={handleStartAll}
              disabled={anyLoading}
              className="px-4 py-2 rounded-lg bg-logo-primary/15 text-logo-primary hover:bg-logo-primary/25 transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              {t("onichan.core.startAll")}
            </button>
          )}
        </div>
      )}

      {/* Service cards */}
      <div className="flex flex-col gap-3">
        <ServiceCard
          icon={<Brain className="w-5 h-5" />}
          titleKey="onichan.core.llm"
          isOnline={llmLoaded}
          isLoading={llmLoading}
          configured={!!lastLlmModelId}
          detail={llmModelName || lastLlmModelId}
          onStart={quickStartLlm}
          onStop={unloadLlm}
        />

        <ServiceCard
          icon={<Volume2 className="w-5 h-5" />}
          titleKey="onichan.core.tts"
          isOnline={ttsLoaded}
          isLoading={ttsLoading}
          configured={!!lastTtsModelId}
          detail={lastTtsModelId}
          onStart={quickStartTts}
          onStop={unloadTts}
        />

        <ServiceCard
          icon={<MessageCircle className="w-5 h-5" />}
          titleKey="onichan.core.discord"
          isOnline={discordInVoice}
          isLoading={discordLoading}
          configured={!!lastDiscordGuildId}
          detail={
            discordInVoice
              ? `${lastDiscordGuildName} / ${lastDiscordChannelName}`
              : lastDiscordGuildName
                ? `${lastDiscordGuildName} / ${lastDiscordChannelName}`
                : null
          }
          onStart={handleStartDiscord}
          onStop={handleStopDiscord}
        />

        <ServiceCard
          icon={<Database className="w-5 h-5" />}
          titleKey="onichan.core.memory"
          isOnline={memoryModelLoaded}
          isLoading={memoryLoading}
          configured={!!lastEmbeddingModelId}
          detail={memoryModelId || lastEmbeddingModelId}
          onStart={quickStartMemory}
          onStop={quickStopMemory}
        />
      </div>

      {/* Hint when nothing is configured */}
      {!hasAnyConfig && (
        <div className="text-center py-6 text-text/40 text-sm">
          <XCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>{t("onichan.core.noConfig")}</p>
          <p className="text-xs mt-1">{t("onichan.core.noConfigHint")}</p>
        </div>
      )}
    </div>
  );
};
