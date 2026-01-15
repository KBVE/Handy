import React from "react";
import { useTranslation } from "react-i18next";
import { PipelineItem } from "@/bindings";
import { Play, AlertCircle } from "lucide-react";
import { PipelineCard } from "./PipelineCard";

interface ActivePipelineProps {
  items: PipelineItem[];
  onRefresh: () => void;
}

export const ActivePipeline: React.FC<ActivePipelineProps> = ({
  items,
  onRefresh,
}) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Play className="w-5 h-5 text-blue-400" />
        <h3 className="font-semibold">
          {t("devops.orchestration.activePipeline")}
        </h3>
        <span className="text-sm text-mid-gray">({items.length})</span>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center bg-mid-gray/5 rounded-xl border border-mid-gray/10">
          <AlertCircle className="w-8 h-8 text-mid-gray/30 mb-2" />
          <p className="text-sm text-mid-gray">
            {t("devops.orchestration.noActiveWork")}
          </p>
          <p className="text-xs text-mid-gray/70 mt-1">
            {t("devops.orchestration.noActiveWorkHint")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {items.map((item) => (
            <PipelineCard key={item.id} item={item} onRefresh={onRefresh} />
          ))}
        </div>
      )}
    </div>
  );
};
