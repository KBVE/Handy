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
      const startState = get();

      if (showLoading && !startState.agentsLoading) {
        console.log('[DevOps Store] Setting agentsLoading = true');
        set({ agentsLoading: true });
      }

      try {
        const result = await commands.listAgentStatuses();
        const currentState = get();

        if (result.status === "ok") {
          // Only update if data actually changed
          const dataChanged = JSON.stringify(currentState.agents) !== JSON.stringify(result.data);
          if (dataChanged) {
            console.log('[DevOps Store] Agents data changed, updating');
            set({ agents: result.data });
          }

          // Clear error only if there was one
          if (currentState.agentsError !== null) {
            console.log('[DevOps Store] Clearing agents error');
            set({ agentsError: null });
          }
        } else {
          // Only set error if it changed
          if (currentState.agentsError !== result.error) {
            console.log('[DevOps Store] Setting agents error:', result.error);
            set({ agentsError: result.error });
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const currentState = get();
        if (currentState.agentsError !== errorMsg) {
          console.log('[DevOps Store] Setting agents error from exception:', errorMsg);
          set({ agentsError: errorMsg });
        }
      } finally {
        if (showLoading) {
          const finalState = get();
          if (finalState.agentsLoading) {
            console.log('[DevOps Store] Setting agentsLoading = false');
            set({ agentsLoading: false });
          }
        }
      }
    },

    // Refresh tmux sessions from backend
    refreshSessions: async (showLoading = false) => {
      const startState = get();

      if (showLoading && !startState.sessionsLoading) {
        console.log('[DevOps Store] Setting sessionsLoading = true');
        set({ sessionsLoading: true });
      }

      try {
        const running = await commands.isTmuxRunning();
        const currentState = get();

        // Only update if changed
        if (currentState.isTmuxRunning !== running) {
          console.log('[DevOps Store] tmux running status changed:', running);
          set({ isTmuxRunning: running });
        }

        if (running) {
          const [sessionResult, recoveredResult] = await Promise.all([
            commands.listTmuxSessions(),
            commands.recoverTmuxSessions(),
          ]);

          const afterFetchState = get();

          if (sessionResult.status === "ok") {
            const sessionsChanged = JSON.stringify(afterFetchState.sessions) !== JSON.stringify(sessionResult.data);
            if (sessionsChanged) {
              console.log('[DevOps Store] Sessions data changed, updating');
              set({ sessions: sessionResult.data });
            }
          }

          if (recoveredResult.status === "ok") {
            const recoveredChanged = JSON.stringify(afterFetchState.recoveredSessions) !== JSON.stringify(recoveredResult.data);
            if (recoveredChanged) {
              console.log('[DevOps Store] Recovered sessions changed, updating');
              set({ recoveredSessions: recoveredResult.data });
            }
          }

          // Clear error if it was set
          const finalState = get();
          if (finalState.sessionsError !== null) {
            console.log('[DevOps Store] Clearing sessions error');
            set({ sessionsError: null });
          }
        } else {
          // Only update if not already empty
          const emptyState = get();
          if (emptyState.sessions.length > 0 || emptyState.recoveredSessions.length > 0) {
            console.log('[DevOps Store] Clearing sessions (tmux not running)');
            set({ sessions: [], recoveredSessions: [] });
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const errorState = get();
        if (errorState.sessionsError !== errorMsg) {
          console.log('[DevOps Store] Setting sessions error:', errorMsg);
          set({ sessionsError: errorMsg });
        }
      } finally {
        if (showLoading) {
          const finalState = get();
          if (finalState.sessionsLoading) {
            console.log('[DevOps Store] Setting sessionsLoading = false');
            set({ sessionsLoading: false });
          }
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
