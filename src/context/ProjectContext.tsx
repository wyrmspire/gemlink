import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";

const STORAGE_KEY = "gemlink-projects";
const ACTIVE_KEY = "gemlink-active-project";

export interface ProjectProfile {
  id: string;
  name: string;
  brandName: string;
  brandDescription: string;
  targetAudience: string;
  brandVoice: string;
  colorPalette?: string[];
  styleKeywords?: string[];
  createdAt: string;
  updatedAt: string;
}

interface ProjectContextType {
  projects: ProjectProfile[];
  activeProject: ProjectProfile | null;
  setActiveProject: (id: string) => void;
  createProject: (data: Omit<ProjectProfile, "id" | "createdAt" | "updatedAt">) => ProjectProfile;
  updateProject: (id: string, patch: Partial<Omit<ProjectProfile, "id" | "createdAt">>) => void;
  deleteProject: (id: string) => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

function newId() {
  return `proj_${Math.random().toString(36).slice(2, 10)}`;
}

function now() {
  return new Date().toISOString();
}

const DEFAULT_PROJECT: ProjectProfile = {
  id: "proj_default",
  name: "My First Project",
  brandName: "FutureTech AI",
  brandDescription: "A forward-thinking AI automation agency.",
  targetAudience: "Small to medium businesses looking to scale with AI.",
  brandVoice: "Professional, innovative, and approachable.",
  colorPalette: [],
  styleKeywords: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

function loadProjects(): ProjectProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [DEFAULT_PROJECT];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [DEFAULT_PROJECT];
    return parsed;
  } catch {
    return [DEFAULT_PROJECT];
  }
}

function saveProjects(projects: ProjectProfile[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch {
    // Ignore write failures
  }
}

function loadActiveId(projects: ProjectProfile[]): string {
  try {
    const saved = localStorage.getItem(ACTIVE_KEY);
    if (saved && projects.find((p) => p.id === saved)) return saved;
  } catch {
    // ignore
  }
  return projects[0]?.id ?? "";
}

function saveActiveId(id: string) {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // ignore
  }
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<ProjectProfile[]>(loadProjects);
  const [activeId, setActiveId] = useState<string>(() =>
    loadActiveId(loadProjects())
  );

  useEffect(() => {
    saveProjects(projects);
  }, [projects]);

  useEffect(() => {
    saveActiveId(activeId);
  }, [activeId]);

  const activeProject =
    projects.find((p) => p.id === activeId) ?? projects[0] ?? null;

  const setActiveProject = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const createProject = useCallback(
    (data: Omit<ProjectProfile, "id" | "createdAt" | "updatedAt">) => {
      const project: ProjectProfile = {
        ...data,
        id: newId(),
        createdAt: now(),
        updatedAt: now(),
      };
      setProjects((prev) => [...prev, project]);
      setActiveId(project.id);
      return project;
    },
    []
  );

  const updateProject = useCallback(
    (id: string, patch: Partial<Omit<ProjectProfile, "id" | "createdAt">>) => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, ...patch, updatedAt: now() } : p
        )
      );
    },
    []
  );

  const deleteProject = useCallback(
    (id: string) => {
      setProjects((prev) => {
        const next = prev.filter((p) => p.id !== id);
        if (next.length === 0) return [DEFAULT_PROJECT];
        return next;
      });
      setActiveId((prev) => {
        if (prev === id) {
          const remaining = projects.filter((p) => p.id !== id);
          return remaining[0]?.id ?? DEFAULT_PROJECT.id;
        }
        return prev;
      });
    },
    [projects]
  );

  return (
    <ProjectContext.Provider
      value={{
        projects,
        activeProject,
        setActiveProject,
        createProject,
        updateProject,
        deleteProject,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within a ProjectProvider");
  return ctx;
}
