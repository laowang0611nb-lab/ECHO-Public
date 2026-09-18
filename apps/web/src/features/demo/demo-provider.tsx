"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type DemoMode = "stable" | "live";

export interface DemoRouteContext {
  courseId?: string;
  studentId?: string;
  strategyId?: string;
  planId?: string;
  planTaskId?: string;
  reviewId?: string;
  conversationId?: string;
  knowledgePointId?: string;
  resourceId?: string;
}

interface DemoState {
  active: boolean;
  mode: DemoMode;
  scenarioId: string | null;
  context: DemoRouteContext;
  updatedAt: string | null;
}

interface DemoContextValue extends DemoState {
  startDemo: (
    mode: DemoMode,
    scenarioId: string,
    context: DemoRouteContext,
  ) => void;
  stopDemo: () => void;
  setScenario: (scenarioId: string, context: DemoRouteContext) => void;
  setMode: (mode: DemoMode) => void;
  clearContext: () => void;
}

const DEMO_STORAGE_KEY = "echo.teacher.demo-state";

const initialState: DemoState = {
  active: false,
  mode: "stable",
  scenarioId: null,
  context: {},
  updatedAt: null,
};

const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(initialState);

  useEffect(() => {
    const stored = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as Partial<DemoState>;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({
        ...initialState,
        ...parsed,
        context: parsed.context ?? {},
      });
    } catch {
      window.localStorage.removeItem(DEMO_STORAGE_KEY);
    }
  }, []);

  const persist = useCallback((next: DemoState) => {
    setState(next);
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next));
  }, []);

  const startDemo = useCallback(
    (mode: DemoMode, scenarioId: string, context: DemoRouteContext) => {
      persist({
        active: true,
        mode,
        scenarioId,
        context,
        updatedAt: new Date().toISOString(),
      });
    },
    [persist],
  );

  const stopDemo = useCallback(() => {
    persist(initialState);
  }, [persist]);

  const setScenario = useCallback(
    (scenarioId: string, context: DemoRouteContext) => {
      setState((current) => {
        const next = {
          ...current,
          active: true,
          scenarioId,
          context,
          updatedAt: new Date().toISOString(),
        };
        window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    [],
  );

  const setMode = useCallback((mode: DemoMode) => {
    setState((current) => {
      const next = { ...current, mode, updatedAt: new Date().toISOString() };
      window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearContext = useCallback(() => {
    setState((current) => {
      const next = { ...current, context: {}, updatedAt: new Date().toISOString() };
      window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const value = useMemo<DemoContextValue>(
    () => ({
      ...state,
      startDemo,
      stopDemo,
      setScenario,
      setMode,
      clearContext,
    }),
    [clearContext, setMode, setScenario, startDemo, state, stopDemo],
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemoMode() {
  const context = useContext(DemoContext);
  if (!context) {
    throw new Error("useDemoMode must be used within DemoProvider");
  }
  return context;
}
