import { useCallback, useEffect, useRef, useMemo, useState } from "react";
import { useBrand } from "../context/BrandContext";
import { useApiKey } from "../components/ApiKeyGuard";
import { motion } from "motion/react";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Clipboard,
  ClipboardCheck,
  Image,
  Film,
  Mic,
  Sparkles,
  Loader2,
  RefreshCw,
  Send,
  Users,
  Target,
  Layers3,
  MessageSquareQuote,
  Activity,
  History,
  PenLine,
  Filter,
  Clock,
  Wand2,
} from "lucide-react";

type ThoughtDepth = "light" | "standard" | "deep";
type BoardroomPhase = "opening_brief" | "first_pass" | "challenge" | "refinement" | "convergence";

interface BoardroomParticipant {
  id: string;
  name: string;
  role: string;
  brief: string;
}

interface BoardroomObjective {
  primaryGoal: string;
  hardConstraints: string[];
  softHints: string[];
  throwawayExamples: string[];
  importantFocus: string[];
  namingExplicitlyRequested: boolean;
  briefing: string;
}

interface BoardroomSeatState {
  participantId: string;
  participantName: string;
  focus: string;
  priorities: string[];
  concerns: string[];
  internalNotes: string[];
  updatedAt: string;
}

interface BoardroomStateSnapshot {
  id: string;
  phase: BoardroomPhase;
  phaseLabel: string;
  round: number;
  roomFocus: string;
  openQuestions: string[];
  emergingConsensus: string[];
  tensions: string[];
  provisionalItems: string[];
  importantItems: string[];
  seatStates: BoardroomSeatState[];
  summary: string;
  createdAt: string;
}

interface BoardroomTurn {
  id: string;
  participantId: string;
  participantName: string;
  role: "seat" | "system";
  kind: "brief" | "perspective" | "challenge" | "refinement" | "convergence" | "state_update" | "summary";
  round: number;
  phase: BoardroomPhase;
  phaseLabel: string;
  content: string;
  stance?: string;
  risks?: string[];
  opportunities?: string[];
  recommendations?: string[];
  stateSummary?: string;
  createdAt: string;
}

interface BoardroomPerspective {
  participantId: string;
  participantName: string;
  stance: string;
  risks: string[];
  opportunities: string[];
  recommendations: string[];
}

interface BoardroomSession {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "pending" | "completed" | "failed";
  topic: string;
  context: string;
  config?: {
    seatCount: number;
    rounds: number;
    depth: ThoughtDepth;
    protocol?: BoardroomPhase[];
  };
  objective: BoardroomObjective | null;
  participants: BoardroomParticipant[];
  turns: BoardroomTurn[];
  stateHistory: BoardroomStateSnapshot[];
  result: {
    summary: string;
    nextSteps: string[];
    perspectives: BoardroomPerspective[];
    finalState: BoardroomStateSnapshot | null;
  } | null;
  logs: string[];
  error?: string;
}

interface MediaPlanItem {
  id: string;
  type: "image" | "video" | "voice";
  label: string;
  purpose: string;
  promptTemplate: string;
  tags?: string[];
  status: "draft";
  generatedJobIds: string[];
}

// Media Strategy session template — pre-fills the form with a media-focused topic.
const MEDIA_STRATEGY_TEMPLATE = {
  topic:
    "What visual and media assets does {brandName} need for {goal}? Consider website, social media, video, and presentation materials.",
  context:
    "Focus on concrete, actionable asset types. Each seat should recommend specific formats, dimensions, and use-cases, not just vague categories.",
  participants: [
    {
      id: "media-strategist",
      name: "Media Strategist",
      role: "Media Strategist",
      brief:
        "Identify the full set of visual assets needed across every channel. Push for specificity: format, dimensions, placement, and primary message for each asset.",
    },
    {
      id: "content-producer",
      name: "Content Producer",
      role: "Content Producer",
      brief:
        "Assess production feasibility and sequencing. Which assets should be created first? What can be repurposed across channels?",
    },
    {
      id: "brand-director",
      name: "Brand Director",
      role: "Brand Director",
      brief:
        "Ensure every asset recommendation aligns with brand voice, visual identity, and target audience expectations.",
    },
  ],
} as const;

const mediaTypeIcon: Record<string, typeof Image> = {
  image: Image,
  video: Film,
  voice: Mic,
};

const mediaTypeColor: Record<string, string> = {
  image: "text-sky-400",
  video: "text-fuchsia-400",
  voice: "text-amber-400",
};

const seatTemplates: BoardroomParticipant[] = [
  {
    id: "strategist",
    name: "Strategy Lead",
    role: "Strategy Lead",
    brief: "Push on positioning, demand signals, market timing, and where the idea can win fastest.",
  },
  {
    id: "operator",
    name: "Operations Lead",
    role: "Operations Lead",
    brief: "Push on execution risk, delivery constraints, scope control, and what a small team can actually ship.",
  },
  {
    id: "editor",
    name: "Editorial Lead",
    role: "Editorial Lead",
    brief: "Push on message clarity, audience trust, recurring content angles, and whether the story is compelling enough to publish repeatedly.",
  },
  {
    id: "growth",
    name: "Growth Lead",
    role: "Growth Lead",
    brief: "Push on distribution, funnel design, demand capture, retention loops, and measurable growth levers.",
  },
  {
    id: "skeptic",
    name: "Skeptical Advisor",
    role: "Skeptical Advisor",
    brief: "Pressure-test the idea, attack weak assumptions, identify blind spots, and force sharper tradeoffs.",
  },
];

const depthOptions: { value: ThoughtDepth; label: string; hint: string }[] = [
  { value: "light", label: "Light", hint: "Fast, crisp, lower-latency analysis." },
  { value: "standard", label: "Standard", hint: "Balanced practical depth." },
  { value: "deep", label: "Deep", hint: "Stronger challenge/refinement and heavier reasoning." },
];

const protocolHints: Record<number, string> = {
  1: "Opening brief only",
  2: "Opening brief + first-pass reactions",
  3: "Adds a challenge round",
  4: "Adds refinement",
  5: "Full script through convergence",
};

const phaseTone: Record<string, string> = {
  opening_brief: "border-indigo-500/30 bg-indigo-500/10",
  first_pass: "border-sky-500/20 bg-sky-500/5",
  challenge: "border-amber-500/20 bg-amber-500/5",
  refinement: "border-emerald-500/20 bg-emerald-500/5",
  convergence: "border-fuchsia-500/20 bg-fuchsia-500/5",
};

function SectionList({ title, items, tone = "text-zinc-300" }: { title: string; items: string[]; tone?: string }) {
  if (!items?.length) return null;
  return (
    <div>
      <h4 className="text-sm font-medium text-white mb-2">{title}</h4>
      <ul className={`space-y-1 list-disc pl-5 text-sm ${tone}`}>
        {items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}
      </ul>
    </div>
  );
}

export default function Boardroom() {
  const brand = useBrand();
  const { resetKey } = useApiKey();
  const [topic, setTopic] = useState("");
  const [context, setContext] = useState("");
  const [seatCount, setSeatCount] = useState(3);
  const [rounds, setRounds] = useState(5);
  const [depth, setDepth] = useState<ThoughtDepth>("standard");
  const [sessions, setSessions] = useState<BoardroomSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // C1: Ref to hold the polling interval for the currently-pending session.
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // C2: Left-panel tab ("new" = creation form, "history" = expanded session history).
  const [leftPanel, setLeftPanel] = useState<"new" | "history">("new");
  // I2: Media briefs state.
  const [mediaBriefs, setMediaBriefs] = useState<MediaPlanItem[]>([]);
  const [extractingBriefs, setExtractingBriefs] = useState(false);
  const [copiedBriefId, setCopiedBriefId] = useState<string | null>(null);
  // C2: Phase filter for the turn transcript replay — null means show all turns.
  const [phaseFilter, setPhaseFilter] = useState<BoardroomPhase | null>(null);

  const selectedSeats = useMemo(() => seatTemplates.slice(0, seatCount), [seatCount]);

  const fetchSessions = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    }
    try {
      const response = await fetch("/api/boardroom/sessions", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed to load boardroom sessions.");
      }
      const data = (await response.json()) as BoardroomSession[];
      setSessions(data);
      if (!activeSessionId && data.length > 0) {
        setActiveSessionId(data[0].id);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setRefreshing(false);
    }
  }, [activeSessionId]);

  // C1: Poll a specific session by ID and merge the result into state.
  const startPolling = useCallback((sessionId: string) => {
    // Clear any existing poll first.
    if (pollingRef.current !== null) clearInterval(pollingRef.current);

    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/boardroom/sessions/${sessionId}`, { cache: "no-store" });
        if (!res.ok) return;
        const fresh = (await res.json()) as BoardroomSession;
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? fresh : s))
        );
        // Stop polling once the session reaches a terminal state.
        if (fresh.status === "completed" || fresh.status === "failed") {
          if (pollingRef.current !== null) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        }
      } catch (err) {
        console.error("Boardroom poll error:", err);
      }
    }, 3000);
  }, []);

  // Clean up poll on unmount.
  useEffect(() => {
    return () => {
      if (pollingRef.current !== null) clearInterval(pollingRef.current);
    };
  }, []);

  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions]);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) || sessions[0] || null,
    [sessions, activeSessionId],
  );

  // C2: Reset phase filter whenever the active session changes.
  useEffect(() => {
    setPhaseFilter(null);
    setMediaBriefs([]);
  }, [activeSessionId]);

  // I2: Extract media briefs from finished session.
  const handleExtractBriefs = useCallback(async () => {
    if (!activeSession || activeSession.status !== "completed") return;
    setExtractingBriefs(true);
    try {
      const res = await fetch(`/api/boardroom/sessions/${activeSession.id}/media-briefs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: import.meta.env.VITE_GEMINI_API_KEY || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to extract media briefs.");
      }
      const briefs = (await res.json()) as MediaPlanItem[];
      setMediaBriefs(briefs);
    } catch (err: any) {
      alert(err.message || "Media brief extraction failed.");
    } finally {
      setExtractingBriefs(false);
    }
  }, [activeSession]);

  // I2: Copy a single media brief item to clipboard ("Send to Media Plan").
  const copyBriefToClipboard = useCallback(async (brief: MediaPlanItem) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(brief, null, 2));
      setCopiedBriefId(brief.id);
      setTimeout(() => setCopiedBriefId(null), 2000);
    } catch {
      alert("Failed to copy to clipboard.");
    }
  }, []);

  // I2: Apply the Media Strategy template to the form.
  const applyMediaStrategyTemplate = useCallback(() => {
    const filledTopic = MEDIA_STRATEGY_TEMPLATE.topic
      .replace("{brandName}", brand.brandName || "your brand")
      .replace("{goal}", "[your stated goal]");
    setTopic(filledTopic);
    setContext(MEDIA_STRATEGY_TEMPLATE.context);
    setSeatCount(3);
    setRounds(5);
    setDepth("standard");
  }, [brand.brandName]);

  // C2: Derive the visible turns based on the current phase filter.
  const visibleTurns = useMemo(() => {
    if (!activeSession) return [];
    if (!phaseFilter) return activeSession.turns;
    return activeSession.turns.filter((t) => t.phase === phaseFilter);
  }, [activeSession, phaseFilter]);

  // C2: Build the unique phases present in the session for filter chips.
  const sessionPhases = useMemo((): BoardroomPhase[] => {
    if (!activeSession) return [];
    const seen = new Set<BoardroomPhase>();
    activeSession.turns.forEach((t) => seen.add(t.phase));
    const order: BoardroomPhase[] = ["opening_brief", "first_pass", "challenge", "refinement", "convergence"];
    return order.filter((p) => seen.has(p));
  }, [activeSession]);

  // C2: Format elapsed time for a completed session.
  function elapsedLabel(session: BoardroomSession): string {
    if (session.status !== "completed") return "";
    const ms = new Date(session.updatedAt).getTime() - new Date(session.createdAt).getTime();
    const mins = Math.round(ms / 60000);
    return mins < 1 ? "< 1 min" : `${mins} min${mins === 1 ? "" : "s"}`;
  }

  const startDiscussion = async () => {
    if (!topic.trim()) return;
    setLoading(true);

    try {
      const response = await fetch("/api/boardroom/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          context: [
            `Brand: ${brand.brandName}`,
            `Description: ${brand.brandDescription}`,
            `Audience: ${brand.targetAudience}`,
            `Voice: ${brand.brandVoice}`,
            context.trim(),
          ].filter(Boolean).join("\n"),
          participants: selectedSeats,
          rounds,
          depth,
          apiKey: import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to create boardroom session.");
      }

      const pending = data as BoardroomSession;
      // Insert the pending session at the top and select it immediately.
      setSessions((prev) => [pending, ...prev]);
      setActiveSessionId(pending.id);
      setTopic("");
      setContext("");
      // After submitting, switch back to the new-session view so the user
      // sees the pending session detail on the right immediately.
      setLeftPanel("new");
      // C1: Start polling this session for incremental progress.
      startPolling(pending.id);
    } catch (error: any) {
      console.error(error);
      if (error?.message?.includes("PERMISSION_DENIED") || error?.message?.includes("Requested entity was not found")) {
        resetKey();
      } else {
        alert(error.message || "Discussion failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 md:p-8 max-w-7xl mx-auto"
    >
      <div className="mb-6 md:mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">The Boardroom</h1>
          <p className="text-zinc-400">Objective-anchored AI strategy sessions with a visible meeting script, evolving room state, and durable local history.</p>
        </div>
        <button
          onClick={() => fetchSessions(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh sessions
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)] gap-6">
        <div className="space-y-4">

          {/* C2: Left panel tab toggle */}
          <div className="flex rounded-xl border border-zinc-800 bg-zinc-950 p-1 gap-1">
            <button
              onClick={() => setLeftPanel("new")}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors ${
                leftPanel === "new"
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <PenLine className="w-4 h-4" />
              New Session
            </button>
            <button
              onClick={() => setLeftPanel("history")}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors ${
                leftPanel === "history"
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <History className="w-4 h-4" />
              History
              {sessions.length > 0 && (
                <span className="ml-1 rounded-full bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
                  {sessions.length}
                </span>
              )}
            </button>
          </div>

          {leftPanel === "new" ? (
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Start a session</h2>
                <p className="text-sm text-zinc-400 mt-1">The room now anchors on objective first, then moves through a visible protocol instead of free-form ping-pong.</p>
              </div>
              <button
                type="button"
                onClick={applyMediaStrategyTemplate}
                title="Load Media Strategy template"
                className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-1.5 text-xs font-medium text-fuchsia-300 hover:bg-fuchsia-500/20 transition-colors"
              >
                <Wand2 className="w-3.5 h-3.5" />
                Media Strategy
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-zinc-300">Topic</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && startDiscussion()}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Should we build a media + funnel business around beginner-friendly AI workflows?"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm text-zinc-300">Seats</label>
                <select
                  value={seatCount}
                  onChange={(e) => setSeatCount(Number(e.target.value))}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-zinc-300">Protocol depth</label>
                <select
                  value={rounds}
                  onChange={(e) => setRounds(Number(e.target.value))}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
                <p className="text-xs text-zinc-500">{protocolHints[rounds]}</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-zinc-300">Thought depth</label>
              <div className="grid grid-cols-1 gap-2">
                {depthOptions.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    onClick={() => setDepth(option.value)}
                    className={`rounded-xl border px-4 py-3 text-left transition-colors ${depth === option.value ? "border-indigo-500 bg-indigo-500/10" : "border-zinc-800 bg-zinc-900 hover:bg-zinc-800/70"}`}
                  >
                    <div className="text-sm font-medium text-white">{option.label}</div>
                    <div className="text-xs text-zinc-400 mt-1">{option.hint}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-zinc-300">Extra context</label>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                rows={5}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Goals, constraints, timing, budget, traction, and any examples the room should treat as provisional unless explicitly important..."
              />
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm text-zinc-300">
                <Layers3 className="w-4 h-4 text-indigo-400" />
                Meeting script preview
              </div>
              <div className="grid grid-cols-1 gap-2 text-sm">
                {["Opening brief", "First-pass reactions", "Challenge round", "Refinement round", "Convergence"].map((step, index) => (
                  <div key={step} className={`rounded-lg border px-3 py-2 ${index < rounds ? "border-zinc-700 bg-zinc-950 text-zinc-200" : "border-zinc-800 bg-zinc-950/40 text-zinc-500"}`}>
                    {index + 1}. {step}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex items-center gap-2 text-sm text-zinc-300 mb-3">
                <Users className="w-4 h-4 text-indigo-400" />
                Active seats
              </div>
              <div className="space-y-3">
                {selectedSeats.map((seat) => (
                  <div key={seat.id} className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
                    <p className="text-sm font-medium text-white">{seat.name}</p>
                    <p className="text-xs text-zinc-500">{seat.brief}</p>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={startDiscussion}
              disabled={loading || !topic.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              {loading ? "Starting..." : "Start boardroom session"}
            </button>
          </div>
          ) : null}

          {/* C2: History panel — shown when leftPanel === 'history', or as a compact list in 'new' mode */}
          {leftPanel === "history" ? (
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-semibold text-white">All sessions</h2>
              </div>
              <button
                onClick={() => fetchSessions(true)}
                className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>

            {sessions.length === 0 ? (
              <div className="text-sm text-zinc-500 rounded-xl border border-dashed border-zinc-800 p-4">No boardroom sessions yet.</div>
            ) : (
              <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
                {sessions.map((session) => {
                  const elapsed = elapsedLabel(session);
                  const turnCount = session.turns.filter((t) => t.role === "seat").length;
                  return (
                  <button
                    key={session.id}
                    onClick={() => { setActiveSessionId(session.id); setLeftPanel("new"); }}
                    className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                      activeSession?.id === session.id
                        ? "border-indigo-500 bg-indigo-500/10"
                        : "border-zinc-800 bg-zinc-900 hover:bg-zinc-800/70"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white line-clamp-2">{session.topic}</p>
                        <p className="text-xs text-zinc-500 mt-1">{new Date(session.createdAt).toLocaleString()}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs text-zinc-500">
                          <span>{session.config?.seatCount || session.participants.length} seat{(session.config?.seatCount || session.participants.length) === 1 ? "" : "s"}</span>
                          <span>{session.config?.protocol?.length || session.config?.rounds || 1} stage{(session.config?.protocol?.length || session.config?.rounds || 1) === 1 ? "" : "s"}</span>
                          <span>{session.config?.depth || "standard"}</span>
                          {turnCount > 0 && <span>{turnCount} turn{turnCount === 1 ? "" : "s"}</span>}
                          {elapsed && (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" />{elapsed}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${
                        session.status === "completed" ? "bg-emerald-500/10 text-emerald-300"
                        : session.status === "failed" ? "bg-red-500/10 text-red-300"
                        : "bg-amber-500/10 text-amber-300"
                      }`}>
                        {session.status === "completed" ? <CheckCircle2 className="w-3 h-3" />
                          : session.status === "failed" ? <AlertCircle className="w-3 h-3" />
                          : <Loader2 className="w-3 h-3 animate-spin" />}
                        {session.status}
                      </span>
                    </div>
                  </button>
                  );
                })}
              </div>
            )}
          </div>
          ) : (
          /* Compact recent sessions list in 'new' mode */
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <ClipboardList className="w-5 h-5 text-indigo-400" />
              <h2 className="text-lg font-semibold text-white">Recent sessions</h2>
            </div>

            {sessions.length === 0 ? (
              <div className="text-sm text-zinc-500 rounded-xl border border-dashed border-zinc-800 p-4">No boardroom sessions yet.</div>
            ) : (
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => setActiveSessionId(session.id)}
                    className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${activeSession?.id === session.id ? "border-indigo-500 bg-indigo-500/10" : "border-zinc-800 bg-zinc-900 hover:bg-zinc-800/70"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white line-clamp-2">{session.topic}</p>
                        <p className="text-xs text-zinc-500 mt-1">{new Date(session.createdAt).toLocaleString()}</p>
                        <p className="text-xs text-zinc-500 mt-1">
                          {(session.config?.seatCount || session.participants.length)} seat(s) • {session.config?.protocol?.length || session.config?.rounds || 1} stage(s) • {session.config?.depth || "standard"}
                        </p>
                      </div>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${session.status === "completed" ? "bg-emerald-500/10 text-emerald-300" : session.status === "failed" ? "bg-red-500/10 text-red-300" : "bg-amber-500/10 text-amber-300"}`}>
                        {session.status === "completed" ? <CheckCircle2 className="w-3 h-3" /> : session.status === "failed" ? <AlertCircle className="w-3 h-3" /> : <Loader2 className="w-3 h-3 animate-spin" />}
                        {session.status}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          )}
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 min-h-[700px]">
          {!activeSession ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-500">
              <Users className="w-16 h-16 mb-4 opacity-50" />
              <p>The board is waiting for a real session.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold text-white">{activeSession.topic}</h2>
                    <p className="text-sm text-zinc-500 mt-2">Started {new Date(activeSession.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="text-xs text-zinc-400 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 space-y-1">
                    <div>{activeSession.participants.length} seat{activeSession.participants.length === 1 ? "" : "s"}</div>
                    <div>{activeSession.config?.protocol?.length || activeSession.config?.rounds || 1} stage{(activeSession.config?.protocol?.length || activeSession.config?.rounds || 1) === 1 ? "" : "s"}</div>
                    <div>{activeSession.config?.depth || "standard"} depth</div>
                  </div>
                </div>
                {activeSession.context ? (
                  <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-300 whitespace-pre-wrap">
                    {activeSession.context}
                  </div>
                ) : null}
              </div>

              {/* C1: Live progress banner for a pending session */}
              {activeSession.status === "pending" && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
                  <Activity className="w-5 h-5 text-amber-300 mt-0.5 animate-pulse shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-amber-200 mb-1">Session running — updating every 3 s</p>
                    {activeSession.logs?.length > 0 && (
                      <p className="text-xs text-amber-300/70 font-mono truncate">
                        {activeSession.logs[activeSession.logs.length - 1]}
                      </p>
                    )}
                  </div>
                  <Loader2 className="w-4 h-4 text-amber-300 animate-spin shrink-0 mt-0.5" />
                </div>
              )}

              {activeSession.objective ? (
                <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-5 space-y-4">
                  <div className="flex items-center gap-2 text-white">
                    <Target className="w-5 h-5 text-indigo-300" />
                    <h3 className="text-lg font-semibold">Objective anchor</h3>
                  </div>
                  <p className="text-sm text-zinc-200 leading-relaxed">{activeSession.objective.primaryGoal}</p>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <SectionList title="Hard constraints" items={activeSession.objective.hardConstraints} />
                    <SectionList title="Important focus" items={activeSession.objective.importantFocus} />
                    <SectionList title="Soft hints" items={activeSession.objective.softHints} />
                    <SectionList title="Provisional / throwaway examples" items={activeSession.objective.throwawayExamples} tone="text-amber-200" />
                  </div>
                  <div className="rounded-xl border border-zinc-700 bg-zinc-950/70 px-4 py-3 text-sm text-zinc-300">
                    <span className="font-medium text-white">Briefing:</span> {activeSession.objective.briefing}
                    <div className="mt-2 text-xs text-zinc-500">Naming explicitly requested: {activeSession.objective.namingExplicitlyRequested ? "yes" : "no"}</div>
                  </div>
                </div>
              ) : null}

              {activeSession.config?.protocol?.length ? (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
                  <div className="flex items-center gap-2 mb-4 text-white">
                    <Layers3 className="w-5 h-5 text-indigo-400" />
                    <h3 className="text-lg font-semibold">Protocol</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                    {activeSession.config.protocol.map((phase, index) => (
                      <div key={phase} className={`rounded-xl border px-3 py-3 ${phaseTone[phase] || "border-zinc-800 bg-zinc-950"}`}>
                        <div className="text-xs uppercase tracking-wider text-zinc-400">Stage {index + 1}</div>
                        <div className="text-sm font-medium text-white mt-1">{phase.replaceAll("_", " ")}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* C2: Phase filter chips — replay session phase by phase */}
              {sessionPhases.length > 1 && (
                <div className="flex flex-wrap items-center gap-2">
                  <Filter className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  <button
                    onClick={() => setPhaseFilter(null)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      phaseFilter === null
                        ? "bg-indigo-600 text-white"
                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
                    }`}
                  >
                    All
                  </button>
                  {sessionPhases.map((phase) => (
                    <button
                      key={phase}
                      onClick={() => setPhaseFilter(phaseFilter === phase ? null : phase)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors capitalize ${
                        phaseFilter === phase
                          ? "bg-indigo-600 text-white"
                          : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
                      }`}
                    >
                      {phase.replace(/_/g, " ")}
                    </button>
                  ))}
                  {phaseFilter && (
                    <span className="text-xs text-zinc-500 ml-1">
                      {visibleTurns.length} turn{visibleTurns.length === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
              )}

              <div className="space-y-4">
                {visibleTurns.length === 0 && phaseFilter ? (
                  <div className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
                    No turns in this phase yet.
                  </div>
                ) : (
                  visibleTurns.map((turn) => (
                  <motion.div
                    key={turn.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`rounded-2xl border p-4 ${phaseTone[turn.phase] || (turn.role === "system" ? "border-indigo-500/30 bg-indigo-500/10" : "border-zinc-800 bg-zinc-900")}`}
                  >
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div>
                        <p className="text-sm font-medium text-white">{turn.participantName}</p>
                        <p className="text-xs text-zinc-500 mt-1">{turn.phaseLabel} • Round {turn.round}</p>
                      </div>
                      <span className="text-xs uppercase tracking-wider text-zinc-500">{turn.kind}</span>
                    </div>
                    <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{turn.content}</p>
                    {turn.stateSummary ? <p className="text-xs text-zinc-500 mt-3">State focus: {turn.stateSummary}</p> : null}
                  </motion.div>
                  ))
                )}
              </div>

              {activeSession.stateHistory?.length ? (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
                  <div className="flex items-center gap-2 text-white">
                    <MessageSquareQuote className="w-5 h-5 text-indigo-400" />
                    <h3 className="text-lg font-semibold">Room state evolution</h3>
                  </div>
                  {activeSession.stateHistory.map((state) => (
                    <div key={state.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-white">{state.phaseLabel}</p>
                          <p className="text-xs text-zinc-500 mt-1">Round {state.round}</p>
                        </div>
                        <div className="text-xs text-zinc-500">{new Date(state.createdAt).toLocaleTimeString()}</div>
                      </div>
                      <p className="text-sm text-zinc-300 leading-relaxed">{state.summary}</p>
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
                        <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Room focus</div>
                        <div className="text-sm text-zinc-200">{state.roomFocus}</div>
                      </div>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <SectionList title="Open questions" items={state.openQuestions} />
                        <SectionList title="Emerging consensus" items={state.emergingConsensus} tone="text-emerald-200" />
                        <SectionList title="Tensions" items={state.tensions} tone="text-amber-200" />
                        <SectionList title="Important items" items={state.importantItems} />
                        <SectionList title="Provisional items" items={state.provisionalItems} tone="text-zinc-400" />
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-white mb-3">Seat state</h4>
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                          {state.seatStates.map((seat) => (
                            <div key={`${state.id}-${seat.participantId}`} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
                              <div>
                                <div className="text-sm font-medium text-white">{seat.participantName}</div>
                                <div className="text-sm text-zinc-300 mt-1">{seat.focus}</div>
                              </div>
                              <div className="grid grid-cols-1 gap-3 text-sm">
                                <SectionList title="Priorities" items={seat.priorities} />
                                <SectionList title="Concerns" items={seat.concerns} tone="text-amber-200" />
                                <SectionList title="Internal notes" items={seat.internalNotes} tone="text-zinc-400" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {activeSession.result ? (
                <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6">
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
                    <h3 className="text-lg font-semibold text-white mb-3">Final synthesis</h3>
                    <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{activeSession.result.summary}</p>
                    <div className="mt-5">
                      <h4 className="text-sm font-medium text-white mb-2">Next steps</h4>
                      <ul className="space-y-2 text-sm text-zinc-300 list-disc pl-5">
                        {activeSession.result.nextSteps.map((step, index) => (
                          <li key={`${activeSession.id}-step-${index}`}>{step}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {activeSession.result.perspectives.map((perspective) => (
                      <div key={perspective.participantId} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
                        <h3 className="text-lg font-semibold text-white">{perspective.participantName}</h3>
                        <p className="text-sm text-zinc-300 mt-2">{perspective.stance}</p>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 text-sm">
                          <div>
                            <h4 className="font-medium text-red-300 mb-2">Risks</h4>
                            <ul className="space-y-1 text-zinc-300 list-disc pl-5">
                              {perspective.risks.map((item, index) => <li key={`risk-${index}`}>{item}</li>)}
                            </ul>
                          </div>
                          <div>
                            <h4 className="font-medium text-emerald-300 mb-2">Opportunities</h4>
                            <ul className="space-y-1 text-zinc-300 list-disc pl-5">
                              {perspective.opportunities.map((item, index) => <li key={`opportunity-${index}`}>{item}</li>)}
                            </ul>
                          </div>
                          <div>
                            <h4 className="font-medium text-indigo-300 mb-2">Recommendations</h4>
                            <ul className="space-y-1 text-zinc-300 list-disc pl-5">
                              {perspective.recommendations.map((item, index) => <li key={`recommendation-${index}`}>{item}</li>)}
                            </ul>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* I2: Extract Media Briefs button + results (completed sessions only) */}
              {activeSession.status === "completed" && (
                <div className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-5 space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-fuchsia-400" />
                      <h3 className="text-lg font-semibold text-white">Media Briefs</h3>
                    </div>
                    <button
                      onClick={handleExtractBriefs}
                      disabled={extractingBriefs}
                      className="inline-flex items-center gap-2 rounded-xl border border-fuchsia-500/30 bg-fuchsia-600 hover:bg-fuchsia-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium transition-colors"
                    >
                      {extractingBriefs ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                      {extractingBriefs ? "Extracting..." : mediaBriefs.length > 0 ? "Re-extract" : "Extract Media Briefs"}
                    </button>
                  </div>

                  {mediaBriefs.length === 0 && !extractingBriefs && (
                    <p className="text-sm text-zinc-500">
                      Click "Extract Media Briefs" to surface actionable media asset suggestions from this session's convergence output.
                    </p>
                  )}

                  {mediaBriefs.length > 0 && (
                    <div className="space-y-3">
                      {mediaBriefs.map((brief) => {
                        const TypeIcon = mediaTypeIcon[brief.type] || Image;
                        const typeColor = mediaTypeColor[brief.type] || "text-zinc-400";
                        const isCopied = copiedBriefId === brief.id;
                        return (
                          <motion.div
                            key={brief.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-2"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <TypeIcon className={`w-4 h-4 shrink-0 ${typeColor}`} />
                                <h4 className="text-sm font-medium text-white truncate">{brief.label}</h4>
                              </div>
                              <button
                                onClick={() => copyBriefToClipboard(brief)}
                                title="Copy to clipboard (Send to Media Plan)"
                                className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                                  isCopied
                                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                    : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                                }`}
                              >
                                {isCopied ? <ClipboardCheck className="w-3 h-3" /> : <Clipboard className="w-3 h-3" />}
                                {isCopied ? "Copied!" : "Send to Plan"}
                              </button>
                            </div>
                            <p className="text-xs text-zinc-400">{brief.purpose}</p>
                            <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
                              <p className="text-xs text-zinc-300 leading-relaxed">{brief.promptTemplate}</p>
                            </div>
                            {brief.tags && brief.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {brief.tags.map((tag) => (
                                  <span key={tag} className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeSession.logs?.length ? (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
                  <h3 className="text-lg font-semibold text-white mb-3">Session log</h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {activeSession.logs.map((line, index) => (
                      <div key={`${activeSession.id}-log-${index}`} className="text-xs text-zinc-400 font-mono whitespace-pre-wrap">
                        {line}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {activeSession.error ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                  {activeSession.error}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
