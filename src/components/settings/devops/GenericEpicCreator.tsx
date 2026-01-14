import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { EpicConfig, EpicInfo, PhaseConfig } from "../../../bindings";
import { toast } from "../../../stores/toastStore";

interface PlanTemplate {
  id: string;
  title: string;
  description: string;
  labels: string[];
  tracking_repo: string | null;
  working_repo: string | null;
  goal: string;
  success_metrics: string[];
  phases: PhaseConfig[];
}

interface EpicPlan {
  title: string;
  goal: string;
  successMetrics: string[];
  phases: PhaseConfig[];
  labels: string[];
}

// Predefined epic templates
const EPIC_TEMPLATES: Record<string, EpicPlan> = {
  blank: {
    title: "",
    goal: "",
    successMetrics: [],
    phases: [],
    labels: [],
  },
  "cicd-testing": {
    title: "CICD Testing Infrastructure",
    goal: "Build comprehensive testing and CI/CD infrastructure for the multi-agent DevOps system to ensure production readiness and prevent future breakage.",
    successMetrics: [
      "100+ total tests",
      ">70% code coverage",
      "CI/CD running on all PRs",
      "Pre-commit hooks active",
      "All phases complete",
    ],
    phases: [
      {
        name: "Foundation",
        description:
          "Build test utilities and infrastructure (test mocks, fixtures, helpers)",
        approach: "manual",
      },
      {
        name: "Integration Tests",
        description:
          "Comprehensive integration tests for agent workflows (spawning, cleanup, PR creation, session recovery)",
        approach: "agent-assisted",
      },
      {
        name: "CI/CD Integration",
        description:
          "GitHub Actions workflow, pre-commit hooks, coverage tracking",
        approach: "agent-assisted",
      },
      {
        name: "Advanced Scenarios",
        description:
          "Multi-machine coordination, error handling, resource limits",
        approach: "agent-assisted",
      },
    ],
    labels: ["cicd", "testing", "high-priority"],
  },
};

type Step = "template" | "edit" | "review";

export function GenericEpicCreator() {
  const [currentStep, setCurrentStep] = useState<Step>("template");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("blank");
  const [repo, setRepo] = useState<string>("KBVE/Handy");
  const [workRepo, setWorkRepo] = useState<string>("");

  // Loaded templates from filesystem
  const [templates, setTemplates] = useState<PlanTemplate[]>([
    {
      id: "blank",
      title: "Blank",
      description: "Start from scratch",
      labels: [],
      tracking_repo: null,
      working_repo: null,
      goal: "",
      success_metrics: [],
      phases: [],
    },
  ]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  // Editable plan state
  const [title, setTitle] = useState<string>("");
  const [goal, setGoal] = useState<string>("");
  const [successMetrics, setSuccessMetrics] = useState<string[]>([]);
  const [phases, setPhases] = useState<PhaseConfig[]>([]);
  const [labels, setLabels] = useState<string[]>([]);

  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<EpicInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  // New metric/label/phase inputs
  const [newMetric, setNewMetric] = useState<string>("");
  const [newLabel, setNewLabel] = useState<string>("");

  // Load templates on mount
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        setTemplatesLoading(true);
        const loadedTemplates = await invoke<PlanTemplate[]>("list_epic_plan_templates");
        setTemplates(loadedTemplates);
        setTemplatesError(null);

        // Apply repos from first template if it has them (templates are sorted by title)
        if (loadedTemplates.length > 0) {
          const firstTemplate = loadedTemplates[0];
          setSelectedTemplate(firstTemplate.id);
          if (firstTemplate.tracking_repo) {
            setRepo(firstTemplate.tracking_repo);
          }
          if (firstTemplate.working_repo) {
            setWorkRepo(firstTemplate.working_repo);
          }
        }
      } catch (err) {
        console.error("Failed to load templates:", err);
        setTemplatesError(err as string);
        toast.warning(
          "Template Loading Failed",
          "Using fallback templates. Could not load from docs/plans/",
          7000
        );
        // Fallback to hardcoded templates if filesystem loading fails
        const fallbackTemplates: PlanTemplate[] = [
          {
            id: "blank",
            title: "Blank",
            description: "Start from scratch",
            labels: [],
            tracking_repo: null,
            working_repo: null,
            goal: "",
            success_metrics: [],
            phases: [],
          },
          {
            id: "cicd-testing",
            title: EPIC_TEMPLATES["cicd-testing"].title,
            description: "Comprehensive testing infrastructure",
            labels: EPIC_TEMPLATES["cicd-testing"].labels,
            tracking_repo: null,
            working_repo: null,
            goal: EPIC_TEMPLATES["cicd-testing"].goal,
            success_metrics: EPIC_TEMPLATES["cicd-testing"].successMetrics,
            phases: EPIC_TEMPLATES["cicd-testing"].phases,
          },
        ];
        setTemplates(fallbackTemplates);
      } finally {
        setTemplatesLoading(false);
      }
    };
    loadTemplates();
  }, []);

  const loadTemplate = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    setTitle(template.title);
    setGoal(template.goal);
    setSuccessMetrics([...template.success_metrics]);
    setPhases([...template.phases]);
    setLabels([...template.labels]);
    setSelectedTemplate(templateId);

    // Set repos from template if specified
    if (template.tracking_repo) {
      setRepo(template.tracking_repo);
    }
    if (template.working_repo) {
      setWorkRepo(template.working_repo);
    }
  };

  // Update repos when template selection changes in the dropdown
  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      // Update repo fields immediately when template changes
      if (template.tracking_repo) {
        setRepo(template.tracking_repo);
      }
      if (template.working_repo) {
        setWorkRepo(template.working_repo);
      }
    }
  };

  const handleTemplateSelect = () => {
    loadTemplate(selectedTemplate);
    setCurrentStep("edit");
  };

  const addSuccessMetric = () => {
    if (newMetric.trim()) {
      setSuccessMetrics([...successMetrics, newMetric.trim()]);
      setNewMetric("");
    }
  };

  const removeSuccessMetric = (index: number) => {
    setSuccessMetrics(successMetrics.filter((_, i) => i !== index));
  };

  const addLabel = () => {
    if (newLabel.trim() && !labels.includes(newLabel.trim())) {
      setLabels([...labels, newLabel.trim()]);
      setNewLabel("");
    }
  };

  const removeLabel = (index: number) => {
    setLabels(labels.filter((_, i) => i !== index));
  };

  const addPhase = () => {
    setPhases([
      ...phases,
      {
        name: "",
        description: "",
        approach: "manual",
      },
    ]);
  };

  const updatePhase = (
    index: number,
    field: keyof PhaseConfig,
    value: string,
  ) => {
    const updated = [...phases];
    updated[index] = { ...updated[index], [field]: value };
    setPhases(updated);
  };

  const removePhase = (index: number) => {
    setPhases(phases.filter((_, i) => i !== index));
  };

  const movePhaseUp = (index: number) => {
    if (index > 0) {
      const updated = [...phases];
      [updated[index - 1], updated[index]] = [
        updated[index],
        updated[index - 1],
      ];
      setPhases(updated);
    }
  };

  const movePhaseDown = (index: number) => {
    if (index < phases.length - 1) {
      const updated = [...phases];
      [updated[index], updated[index + 1]] = [
        updated[index + 1],
        updated[index],
      ];
      setPhases(updated);
    }
  };

  const handleCreateEpic = async () => {
    setCreating(true);
    setError(null);
    setResult(null);

    try {
      const config: EpicConfig = {
        title,
        repo,
        work_repo: workRepo.trim() || null,
        goal,
        success_metrics: successMetrics,
        phases,
        labels,
      };

      const epicInfo = await invoke<EpicInfo>("create_epic", { config });
      setResult(epicInfo);
      console.log("Epic created:", epicInfo);
      toast.success(
        "Epic Created Successfully",
        `Epic #${epicInfo.epic_number} created in ${epicInfo.repo}`,
        8000
      );
    } catch (err) {
      setError(err as string);
      console.error("Failed to create epic:", err);
      toast.error(
        "Failed to Create Epic",
        err as string,
        10000
      );
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setCurrentStep("template");
    setSelectedTemplate("blank");
    setTitle("");
    setGoal("");
    setSuccessMetrics([]);
    setPhases([]);
    setLabels([]);
    setResult(null);
    setError(null);
  };

  // Step 1: Template Selection
  if (currentStep === "template" && !result) {
    return (
      <div className="space-y-4">
        <div className="space-y-3">
          {templatesLoading && (
            <div className="text-xs text-gray-400 py-2">
              Loading templates...
            </div>
          )}

          {templatesError && (
            <div className="text-xs text-yellow-400 py-2">
              Note: Using fallback templates (could not load from docs/plans/)
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-400 mb-1.5">
              Choose Template
            </label>
            <select
              value={selectedTemplate}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="w-full px-3 py-2 bg-mid-gray/10 border border-mid-gray/20 rounded text-sm text-white focus:outline-none focus:border-blue-500"
              disabled={templatesLoading}
            >
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.title || "Blank (Start from scratch)"} {template.description && `- ${template.description}`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5">
              Tracking Repository{" "}
              <span className="text-gray-500">
                (where Epic/Sub-issues are created)
              </span>
            </label>
            <input
              type="text"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="org/repo"
              className="w-full px-3 py-2 bg-mid-gray/10 border border-mid-gray/20 rounded text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5">
              Work Repository{" "}
              <span className="text-gray-500">
                (optional - where code lives and agents work)
              </span>
            </label>
            <input
              type="text"
              value={workRepo}
              onChange={(e) => setWorkRepo(e.target.value)}
              placeholder="Leave empty to use tracking repo"
              className="w-full px-3 py-2 bg-mid-gray/10 border border-mid-gray/20 rounded text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
            />
            <div className="mt-1 text-xs text-gray-500">
              If your issues are tracked in one repo but code lives in another
            </div>
          </div>

          {selectedTemplate !== "blank" && templates.find((t) => t.id === selectedTemplate) && (
            <div className="p-3 bg-mid-gray/5 border border-mid-gray/10 rounded space-y-2">
              <div className="text-xs">
                <div className="text-gray-400">Template Preview:</div>
                <div className="text-gray-300 mt-1">
                  {templates.find((t) => t.id === selectedTemplate)?.goal}
                </div>
              </div>
              <div className="text-xs">
                <div className="text-gray-400">
                  Phases: {templates.find((t) => t.id === selectedTemplate)?.phases.length || 0} |
                  Metrics:{" "}
                  {templates.find((t) => t.id === selectedTemplate)?.success_metrics.length || 0}
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={handleTemplateSelect}
          disabled={!repo.trim()}
          className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm rounded transition-colors font-medium"
        >
          Next: Edit Plan →
        </button>
      </div>
    );
  }

  // Step 2: Edit Plan
  if (currentStep === "edit" && !result) {
    return (
      <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
        {/* Title */}
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">
            Epic Title <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., CICD Testing Infrastructure"
            className="w-full px-3 py-2 bg-mid-gray/10 border border-mid-gray/20 rounded text-sm text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Goal */}
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">
            Goal <span className="text-red-400">*</span>
          </label>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="1-2 sentence description of what this Epic aims to achieve"
            rows={3}
            className="w-full px-3 py-2 bg-mid-gray/10 border border-mid-gray/20 rounded text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>

        {/* Success Metrics */}
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">
            Success Metrics
          </label>
          <div className="space-y-2">
            {successMetrics.map((metric, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="text-xs text-gray-400">□</span>
                <span className="flex-1 text-sm text-gray-300">{metric}</span>
                <button
                  onClick={() => removeSuccessMetric(index)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Remove
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <input
                type="text"
                value={newMetric}
                onChange={(e) => setNewMetric(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && addSuccessMetric()}
                placeholder="Add success metric..."
                className="flex-1 px-3 py-2 bg-mid-gray/10 border border-mid-gray/20 rounded text-sm text-white focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={addSuccessMetric}
                className="px-3 py-2 bg-mid-gray/20 hover:bg-mid-gray/30 text-white text-sm rounded transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        {/* Phases */}
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">
            Phases <span className="text-red-400">*</span>
          </label>
          <div className="space-y-3">
            {phases.map((phase, index) => (
              <div
                key={index}
                className="p-3 bg-mid-gray/5 border border-mid-gray/10 rounded space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    Phase {index + 1}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => movePhaseUp(index)}
                      disabled={index === 0}
                      className="text-xs text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => movePhaseDown(index)}
                      disabled={index === phases.length - 1}
                      className="text-xs text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => removePhase(index)}
                      className="text-xs text-red-400 hover:text-red-300 ml-2"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  value={phase.name}
                  onChange={(e) => updatePhase(index, "name", e.target.value)}
                  placeholder="Phase name"
                  className="w-full px-3 py-2 bg-mid-gray/10 border border-mid-gray/20 rounded text-sm text-white focus:outline-none focus:border-blue-500"
                />
                <textarea
                  value={phase.description}
                  onChange={(e) =>
                    updatePhase(index, "description", e.target.value)
                  }
                  placeholder="Phase description"
                  rows={2}
                  className="w-full px-3 py-2 bg-mid-gray/10 border border-mid-gray/20 rounded text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
                />
                <select
                  value={phase.approach}
                  onChange={(e) =>
                    updatePhase(index, "approach", e.target.value)
                  }
                  className="w-full px-3 py-2 bg-mid-gray/10 border border-mid-gray/20 rounded text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="manual">Manual</option>
                  <option value="agent-assisted">Agent-Assisted</option>
                  <option value="automated">Automated</option>
                </select>
              </div>
            ))}
            <button
              onClick={addPhase}
              className="w-full px-3 py-2 bg-mid-gray/10 hover:bg-mid-gray/20 border border-dashed border-mid-gray/30 rounded text-sm text-gray-400 hover:text-white transition-colors"
            >
              + Add Phase
            </button>
          </div>
        </div>

        {/* Labels */}
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Labels</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {labels.map((label, index) => (
              <div
                key={index}
                className="flex items-center gap-1 px-2 py-1 bg-blue-500/20 border border-blue-500/30 rounded text-xs text-blue-300"
              >
                {label}
                <button
                  onClick={() => removeLabel(index)}
                  className="text-blue-400 hover:text-blue-200"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && addLabel()}
              placeholder="Add label..."
              className="flex-1 px-3 py-2 bg-mid-gray/10 border border-mid-gray/20 rounded text-sm text-white focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={addLabel}
              className="px-3 py-2 bg-mid-gray/20 hover:bg-mid-gray/30 text-white text-sm rounded transition-colors"
            >
              Add
            </button>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex gap-2 pt-4 border-t border-mid-gray/20">
          <button
            onClick={() => setCurrentStep("template")}
            className="flex-1 px-4 py-2 bg-mid-gray/20 hover:bg-mid-gray/30 text-white text-sm rounded transition-colors"
          >
            ← Back
          </button>
          <button
            onClick={() => setCurrentStep("review")}
            disabled={!title.trim() || !goal.trim() || phases.length === 0}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm rounded transition-colors font-medium"
          >
            Review Plan →
          </button>
        </div>
      </div>
    );
  }

  // Step 3: Review & Create
  if (currentStep === "review" && !result) {
    return (
      <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
        <div className="p-4 bg-mid-gray/5 border border-mid-gray/10 rounded space-y-3">
          <div>
            <div className="text-xs text-gray-400">Title</div>
            <div className="text-sm text-white font-medium">[EPIC] {title}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400">Repository</div>
            <div className="text-sm text-white font-mono">{repo}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400">Goal</div>
            <div className="text-sm text-gray-300">{goal}</div>
          </div>
          {successMetrics.length > 0 && (
            <div>
              <div className="text-xs text-gray-400 mb-1">Success Metrics</div>
              {successMetrics.map((metric, i) => (
                <div key={i} className="text-sm text-gray-300">
                  □ {metric}
                </div>
              ))}
            </div>
          )}
          <div>
            <div className="text-xs text-gray-400 mb-1">
              Phases ({phases.length})
            </div>
            {phases.map((phase, i) => (
              <div key={i} className="text-sm text-gray-300 mb-1">
                {i + 1}. <strong>{phase.name}</strong> ({phase.approach})
              </div>
            ))}
          </div>
          {labels.length > 0 && (
            <div>
              <div className="text-xs text-gray-400 mb-1">Labels</div>
              <div className="flex flex-wrap gap-1">
                {labels.map((label, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 bg-blue-500/20 border border-blue-500/30 rounded text-xs text-blue-300"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-400">
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className="flex gap-2 pt-4 border-t border-mid-gray/20">
          <button
            onClick={() => setCurrentStep("edit")}
            disabled={creating}
            className="flex-1 px-4 py-2 bg-mid-gray/20 hover:bg-mid-gray/30 disabled:opacity-50 text-white text-sm rounded transition-colors"
          >
            ← Edit
          </button>
          <button
            onClick={handleCreateEpic}
            disabled={creating}
            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm rounded transition-colors font-medium"
          >
            {creating ? "Creating Epic..." : "Create Epic ✓"}
          </button>
        </div>
      </div>
    );
  }

  // Success State
  if (result) {
    return (
      <div className="p-4 bg-green-500/10 border border-green-500/20 rounded space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-green-400 text-lg">✓</span>
          <span className="text-sm font-medium text-white">
            Epic Created Successfully!
          </span>
        </div>
        <div className="space-y-1 text-xs text-gray-300">
          <div>
            <span className="text-gray-400">Epic Number:</span>{" "}
            <span className="font-mono text-white">#{result.epic_number}</span>
          </div>
          <div>
            <span className="text-gray-400">Repository:</span>{" "}
            <span className="font-mono text-white">{result.repo}</span>
          </div>
          <div>
            <span className="text-gray-400">Phases:</span>{" "}
            <span className="text-white">{result.phases.length}</span>
          </div>
          <div>
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 underline"
            >
              View on GitHub →
            </a>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-green-500/20 text-xs text-gray-400">
          <strong>Next steps:</strong>
          <ol className="mt-1 ml-4 list-decimal space-y-1">
            <li>Create sub-issues for each phase</li>
            <li>Implement manual phases</li>
            <li>Spawn agents for agent-assisted phases</li>
          </ol>
        </div>
        <button
          onClick={resetForm}
          className="w-full mt-3 px-4 py-2 bg-mid-gray/20 hover:bg-mid-gray/30 text-white text-sm rounded transition-colors"
        >
          Create Another Epic
        </button>
      </div>
    );
  }

  return null;
}
