import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { commands, AgentStatus, TmuxSession, RecoveredSession } from "@/bindings";

interface DevOpsStore {
  // Agent state
  agents: AgentStatus[];
  agentsLoading: boolean;
  agentsError: string | null;

  // Tmux session state
  sessions: TmuxSession[];
  recoveredSessions: RecoveredSession[];
  sessionsLoading: boolean;
  sessionsError: string | null;
  isTmuxRunning: boolean;

  // Current machine ID
  currentMachineId: string;

  // Filter state
  agentFilterMode: "all" | "local" | "remote";

  // Loading states for individual operations
  killingSession: string | null;
  cleaningUpAgent: string | null;
  completingWork: string | null;

  // Actions
  initialize: () => Promise<void>;
  cleanup: () => void;

  // Agent actions
  refreshAgents: (showLoading?: boolean) => Promise<void>;
  setAgentFilterMode: (mode: "all" | "local" | "remote") => void;
  cleanupAgent: (agent: AgentStatus, removeWorktree: boolean) => Promise<void>;
  completeAgentWork: (agent: AgentStatus, prTitle: string) => Promise<void>;

  // Session actions
  refreshSessions: (showLoading?: boolean) => Promise<void>;
  killSession: (sessionName: string) => Promise<void>;

  // Internal setters
  setAgents: (agents: AgentStatus[]) => void;
  setAgentsLoading: (loading: boolean) => void;
  setAgentsError: (error: string | null) => void;
  setSessions: (sessions: TmuxSession[]) => void;
  setRecoveredSessions: (sessions: RecoveredSession[]) => void;
  setSessionsLoading: (loading: boolean) => void;
  setSessionsError: (error: string | null) => void;
  setIsTmuxRunning: (running: boolean) => void;

  // Interval IDs for cleanup
  _agentRefreshInterval: number | null;
  _sessionRefreshInterval: number | null;
  _setAgentRefreshInterval: (id: number | null) => void;
  _setSessionRefreshInterval: (id: number | null) => void;
}

export const useDevOpsStore = create<DevOpsStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    agents: [],
    agentsLoading: true,
    agentsError: null,

    sessions: [],
    recoveredSessions: [],
    sessionsLoading: true,
    sessionsError: null,
    isTmuxRunning: false,

    currentMachineId: "",

    agentFilterMode: "all",

    killingSession: null,
    cleaningUpAgent: null,
    completingWork: null,

    _agentRefreshInterval: null,
    _sessionRefreshInterval: null,

    // Internal setters
    setAgents: (agents) => set({ agents }),
    setAgentsLoading: (agentsLoading) => set({ agentsLoading }),
    setAgentsError: (agentsError) => set({ agentsError }),
    setSessions: (sessions) => set({ sessions }),
    setRecoveredSessions: (recoveredSessions) => set({ recoveredSessions }),
    setSessionsLoading: (sessionsLoading) => set({ sessionsLoading }),
    setSessionsError: (sessionsError) => set({ sessionsError }),
    setIsTmuxRunning: (isTmuxRunning) => set({ isTmuxRunning }),
    setAgentFilterMode: (agentFilterMode) => set({ agentFilterMode }),
    _setAgentRefreshInterval: (id) => set({ _agentRefreshInterval: id }),
    _setSessionRefreshInterval: (id) => set({ _sessionRefreshInterval: id }),

    // Refresh agents from backend
    refreshAgents: async (showLoading = false) => {
      if (showLoading) {
        set({ agentsLoading: true });
      }
      set({ agentsError: null });

      try {
        const result = await commands.listAgentStatuses();
        if (result.status === "ok") {
          // Only update if data actually changed
          const currentAgents = get().agents;
          if (JSON.stringify(currentAgents) !== JSON.stringify(result.data)) {
            set({ agents: result.data });
          }
        } else {
          set({ agentsError: result.error });
        }
      } catch (err) {
        set({ agentsError: err instanceof Error ? err.message : String(err) });
      } finally {
        if (showLoading) {
          set({ agentsLoading: false });
        }
      }
    },

    // Refresh tmux sessions from backend
    refreshSessions: async (showLoading = false) => {
      if (showLoading) {
        set({ sessionsLoading: true });
      }
      set({ sessionsError: null });

      try {
        const running = await commands.isTmuxRunning();
        set({ isTmuxRunning: running });

        if (running) {
          const [sessionResult, recoveredResult] = await Promise.all([
            commands.listTmuxSessions(),
            commands.recoverTmuxSessions(),
          ]);

          if (sessionResult.status === "ok") {
            const currentSessions = get().sessions;
            if (JSON.stringify(currentSessions) !== JSON.stringify(sessionResult.data)) {
              set({ sessions: sessionResult.data });
            }
          }

          if (recoveredResult.status === "ok") {
            const currentRecovered = get().recoveredSessions;
            if (JSON.stringify(currentRecovered) !== JSON.stringify(recoveredResult.data)) {
              set({ recoveredSessions: recoveredResult.data });
            }
          }
        } else {
          set({ sessions: [], recoveredSessions: [] });
        }
      } catch (err) {
        set({ sessionsError: err instanceof Error ? err.message : String(err) });
      } finally {
        if (showLoading) {
          set({ sessionsLoading: false });
        }
      }
    },

    // Kill a tmux session
    killSession: async (sessionName: string) => {
      set({ killingSession: sessionName });
      try {
        await commands.killTmuxSession(sessionName);
        await get().refreshSessions(false);
      } catch (err) {
        set({ sessionsError: err instanceof Error ? err.message : String(err) });
      } finally {
        set({ killingSession: null });
      }
    },

    // Cleanup an agent
    cleanupAgent: async (agent: AgentStatus, removeWorktree: boolean) => {
      if (!agent.worktree) {
        set({ agentsError: "Agent has no associated worktree" });
        return;
      }

      set({ cleaningUpAgent: agent.session });
      try {
        const repoRootResult = await commands.getGitRepoRoot(agent.worktree);
        if (repoRootResult.status === "error") {
          set({ agentsError: repoRootResult.error });
          return;
        }

        const cleanupResult = await commands.cleanupAgent(
          agent.session,
          repoRootResult.data,
          removeWorktree,
          removeWorktree,
        );

        if (cleanupResult.status === "error") {
          set({ agentsError: cleanupResult.error });
          return;
        }

        await get().refreshAgents(false);
      } catch (err) {
        set({ agentsError: err instanceof Error ? err.message : String(err) });
      } finally {
        set({ cleaningUpAgent: null });
      }
    },

    // Complete agent work (create PR)
    completeAgentWork: async (agent: AgentStatus, prTitle: string) => {
      if (!agent.issue_ref) {
        set({ agentsError: "Agent has no issue reference" });
        return;
      }

      set({ completingWork: agent.session });
      set({ agentsError: null });

      try {
        await commands.completeAgentWork(
          agent.session,
          prTitle,
          null,
          ["agent-working"],
          ["needs-review"],
          false,
        );
        await get().refreshAgents(false);
      } catch (err) {
        set({ agentsError: err instanceof Error ? err.message : String(err) });
      } finally {
        set({ completingWork: null });
      }
    },

    // Initialize store and start polling
    initialize: async () => {
      const { refreshAgents, refreshSessions, _setAgentRefreshInterval, _setSessionRefreshInterval } = get();

      // Load current machine ID
      try {
        const machineId = await commands.getCurrentMachineId();
        set({ currentMachineId: machineId });
      } catch (err) {
        console.error("Failed to get machine ID:", err);
      }

      // Initial load with loading state
      await Promise.all([
        refreshAgents(true),
        refreshSessions(true),
      ]);

      // Set up polling intervals
      // Agents: 12 seconds (staggered from sessions)
      const agentInterval = window.setInterval(() => refreshAgents(false), 12000);
      _setAgentRefreshInterval(agentInterval);

      // Sessions: 10 seconds
      const sessionInterval = window.setInterval(() => refreshSessions(false), 10000);
      _setSessionRefreshInterval(sessionInterval);
    },

    // Cleanup intervals
    cleanup: () => {
      const { _agentRefreshInterval, _sessionRefreshInterval } = get();

      if (_agentRefreshInterval !== null) {
        clearInterval(_agentRefreshInterval);
        set({ _agentRefreshInterval: null });
      }

      if (_sessionRefreshInterval !== null) {
        clearInterval(_sessionRefreshInterval);
        set({ _sessionRefreshInterval: null });
      }
    },
  })),
);

// Hook for initializing the store (call once when DevOps settings are mounted)
export const initializeDevOpsStore = () => {
  const { initialize } = useDevOpsStore.getState();
  initialize();
};

// Hook for cleanup (call when DevOps settings are unmounted)
export const cleanupDevOpsStore = () => {
  const { cleanup } = useDevOpsStore.getState();
  cleanup();
};
