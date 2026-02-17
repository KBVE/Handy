import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Bot, MessageCircle, Blocks, Zap } from "lucide-react";
import { OnichanCore } from "./OnichanCore";
import { OnichanSettings } from "./OnichanSettings";
import { DiscordSettings } from "../discord/DiscordSettings";
import { OnichanModels } from "./OnichanModels";

type TabId = "core" | "chat" | "discord" | "models";

interface Tab {
  id: TabId;
  labelKey: string;
  icon: React.ReactNode;
}

const tabs: Tab[] = [
  {
    id: "core",
    labelKey: "onichan.tabs.core",
    icon: <Zap className="w-4 h-4" />,
  },
  {
    id: "chat",
    labelKey: "onichan.tabs.chat",
    icon: <Bot className="w-4 h-4" />,
  },
  {
    id: "discord",
    labelKey: "onichan.tabs.discord",
    icon: <MessageCircle className="w-4 h-4" />,
  },
  {
    id: "models",
    labelKey: "onichan.tabs.models",
    icon: <Blocks className="w-4 h-4" />,
  },
];

export const OnichanLayout: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabId>("core");

  const handleTabClick = (tabId: TabId) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveTab(tabId);
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Header with tabs */}
      <div className="flex items-center gap-4 pb-4 mb-4 border-b border-mid-gray/20">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-logo-primary" />
          <h1 className="text-lg font-semibold">{t("onichan.title")}</h1>
        </div>

        {/* Tab buttons */}
        <div className="flex items-center gap-1 ml-auto bg-mid-gray/10 rounded-lg p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={handleTabClick(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-logo-primary text-white"
                  : "text-mid-gray hover:text-white hover:bg-mid-gray/20"
              }`}
            >
              {tab.icon}
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="w-full">
        {activeTab === "core" && <OnichanCore />}
        {activeTab === "chat" && <OnichanSettings />}
        {activeTab === "discord" && <DiscordSettings />}
        {activeTab === "models" && <OnichanModels />}
      </div>
    </div>
  );
};
