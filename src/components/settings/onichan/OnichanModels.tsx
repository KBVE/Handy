import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { commands, OnichanModelInfo } from "@/bindings";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { useSidecarStore } from "@/stores/sidecarStore";
import {
  Brain,
  MessageSquare,
  Trash2,
  Download,
  Check,
  Loader2,
  X,
} from "lucide-react";

interface DownloadProgress {
  model_id: string;
  downloaded: number;
  total: number;
  percentage: number;
}

export const OnichanModels: React.FC = () => {
  const { t } = useTranslation();

  const {
    llmLoaded: isLlmLoaded,
    ttsLoaded: isTtsLoaded,
    refresh: refreshSidecarState,
  } = useSidecarStore();

  const [llmModels, setLlmModels] = useState<OnichanModelInfo[]>([]);
  const [ttsModels, setTtsModels] = useState<OnichanModelInfo[]>([]);
  const [selectedLlmId, setSelectedLlmId] = useState<string | null>(null);
  const [selectedTtsId, setSelectedTtsId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<
    Record<string, number>
  >({});
  const [loadingModel, setLoadingModel] = useState<string | null>(null);

  // Load models on mount
  useEffect(() => {
    const loadModels = async () => {
      const llm = await commands.getOnichanLlmModels();
      const tts = await commands.getOnichanTtsModels();
      setLlmModels(llm);
      setTtsModels(tts);
    };
    loadModels();
  }, []);

  // Listen for model download events
  useEffect(() => {
    const unlistenProgress = listen<DownloadProgress>(
      "onichan-model-download-progress",
      (event) => {
        setDownloadProgress((prev) => ({
          ...prev,
          [event.payload.model_id]: event.payload.percentage,
        }));
      },
    );

    const unlistenComplete = listen<string>(
      "onichan-model-download-complete",
      async (event) => {
        setDownloadProgress((prev) => {
          const next = { ...prev };
          delete next[event.payload];
          return next;
        });
        const llm = await commands.getOnichanLlmModels();
        const tts = await commands.getOnichanTtsModels();
        setLlmModels(llm);
        setTtsModels(tts);
      },
    );

    return () => {
      unlistenProgress.then((fn) => fn());
      unlistenComplete.then((fn) => fn());
    };
  }, []);

  const handleDownloadModel = useCallback(async (modelId: string) => {
    setDownloadProgress((prev) => ({ ...prev, [modelId]: 0 }));
    const result = await commands.downloadOnichanModel(modelId);
    if (result.status === "error") {
      setDownloadProgress((prev) => {
        const next = { ...prev };
        delete next[modelId];
        return next;
      });
    }
  }, []);

  const handleDeleteModel = useCallback(
    async (modelId: string) => {
      const result = await commands.deleteOnichanModel(modelId);
      if (result.status === "ok") {
        const llm = await commands.getOnichanLlmModels();
        const tts = await commands.getOnichanTtsModels();
        setLlmModels(llm);
        setTtsModels(tts);

        if (selectedLlmId === modelId) {
          await commands.unloadLocalLlm();
          setSelectedLlmId(null);
          refreshSidecarState();
        }
        if (selectedTtsId === modelId) {
          await commands.unloadLocalTts();
          setSelectedTtsId(null);
          refreshSidecarState();
        }
      }
    },
    [selectedLlmId, selectedTtsId, refreshSidecarState],
  );

  const handleLoadLlm = useCallback(
    async (modelId: string) => {
      setLoadingModel(modelId);
      try {
        const result = await commands.loadLocalLlm(modelId);
        if (result.status === "ok") {
          setSelectedLlmId(modelId);
          refreshSidecarState();
        }
      } catch (error) {
        console.error("Error loading LLM:", error);
      } finally {
        setLoadingModel(null);
      }
    },
    [refreshSidecarState],
  );

  const handleUnloadLlm = useCallback(async () => {
    await commands.unloadLocalLlm();
    setSelectedLlmId(null);
    refreshSidecarState();
  }, [refreshSidecarState]);

  const handleLoadTts = useCallback(
    async (modelId: string) => {
      setLoadingModel(modelId);
      const result = await commands.loadLocalTts(modelId);
      setLoadingModel(null);
      if (result.status === "ok") {
        setSelectedTtsId(modelId);
        refreshSidecarState();
      }
    },
    [refreshSidecarState],
  );

  const handleUnloadTts = useCallback(async () => {
    await commands.unloadLocalTts();
    setSelectedTtsId(null);
    refreshSidecarState();
  }, [refreshSidecarState]);

  const renderModelCard = (
    model: OnichanModelInfo,
    isSelected: boolean,
    onLoad: () => void,
    onUnload: () => void,
  ) => {
    const isDownloading = downloadProgress[model.id] !== undefined;
    const progress = downloadProgress[model.id] || 0;
    const isLoading = loadingModel === model.id;

    const isActive = isSelected;
    const isAvailable = model.is_downloaded && !isSelected;
    const needsDownload = !model.is_downloaded;

    const cardStyles = isActive
      ? "border-2 border-logo-primary bg-logo-primary/10 ring-1 ring-logo-primary/30"
      : isAvailable
        ? "border border-green-500/50 hover:border-green-500 cursor-pointer hover:bg-green-500/5"
        : "border border-background-dark/50 hover:border-text/20";

    return (
      <div
        key={model.id}
        className={`p-3 rounded-lg transition-all ${cardStyles}`}
        onClick={isAvailable && !isLoading ? onLoad : undefined}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-medium text-sm truncate">{model.name}</h4>
              {isActive && (
                <span className="px-2 py-0.5 text-xs font-semibold bg-logo-primary text-background rounded-full flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  {t("onichan.models.active")}
                </span>
              )}
              {isAvailable && !isLoading && (
                <span className="px-2 py-0.5 text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/30 rounded-full">
                  {t("onichan.models.available")}
                </span>
              )}
              {needsDownload && !isDownloading && (
                <span className="px-2 py-0.5 text-xs font-medium text-text/50 bg-background-dark/30 rounded-full">
                  {t("onichan.models.notDownloaded")}
                </span>
              )}
              {isLoading && (
                <span
                  className="px-2 py-0.5 text-xs font-medium text-yellow-400 bg-yellow-500/20 border border-yellow-500/30 rounded-full flex items-center gap-1"
                  title={t("onichan.models.loadingTooltip")}
                >
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {t("onichan.models.loading")}
                </span>
              )}
            </div>
            <p className="text-xs text-text/60 mt-1">{model.description}</p>
            <p className="text-xs text-text/40 mt-1">
              {model.size_mb} MB
              {model.context_size &&
                ` • ${model.context_size.toLocaleString()} ctx`}
              {model.voice_name && ` • ${model.voice_name}`}
            </p>
            {isAvailable && !isLoading && (
              <p className="text-xs text-green-400/70 mt-1.5 italic">
                {t("onichan.models.clickToLoad")}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1">
            {isDownloading ? (
              <div className="flex items-center gap-2">
                <div className="w-20 h-2 bg-background-dark rounded-full overflow-hidden">
                  <div
                    className="h-full bg-logo-primary transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-xs text-text/60 w-10">
                  {Math.round(progress)}%
                </span>
              </div>
            ) : isActive ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUnload();
                }}
                className="px-2 py-1 rounded text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors flex items-center gap-1"
                title={t("onichan.models.unload")}
              >
                <X className="w-3 h-3" />
                {t("onichan.models.unloadButton")}
              </button>
            ) : isAvailable ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteModel(model.id);
                }}
                className="p-1.5 rounded hover:bg-background-dark/50 text-text/40 hover:text-red-400 transition-colors"
                title={t("onichan.models.delete")}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => handleDownloadModel(model.id)}
                className="px-3 py-1.5 rounded bg-logo-primary/20 text-logo-primary hover:bg-logo-primary/30 transition-colors text-xs font-medium flex items-center gap-1.5"
                title={t("onichan.models.download")}
              >
                <Download className="w-3.5 h-3.5" />
                {t("onichan.models.downloadButton")}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6 max-w-3xl w-full mx-auto">
      {/* LLM Model Selection */}
      <SettingsGroup title={t("onichan.models.llmTitle")}>
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="w-4 h-4 text-text/60" />
            <p className="text-sm text-text/60">
              {t("onichan.models.llmDescription")}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {llmModels.map((model) =>
              renderModelCard(
                model,
                selectedLlmId === model.id && isLlmLoaded,
                () => handleLoadLlm(model.id),
                handleUnloadLlm,
              ),
            )}
          </div>
        </div>
      </SettingsGroup>

      {/* TTS Model Selection */}
      <SettingsGroup title={t("onichan.models.ttsTitle")}>
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="w-4 h-4 text-text/60" />
            <p className="text-sm text-text/60">
              {t("onichan.models.ttsDescription")}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {ttsModels.map((model) =>
              renderModelCard(
                model,
                selectedTtsId === model.id && isTtsLoaded,
                () => handleLoadTts(model.id),
                handleUnloadTts,
              ),
            )}
          </div>
          <p className="text-xs text-text/40 mt-3">
            {t("onichan.models.ttsNote")}
          </p>
        </div>
      </SettingsGroup>
    </div>
  );
};
