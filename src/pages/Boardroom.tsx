import { useCallback, useEffect, useMemo, useState } from "react";
import { useBrand } from "../context/BrandContext";
import { useApiKey } from "../components/ApiKeyGuard";
import { motion } from "motion/react";
import { AlertCircle, CheckCircle2, ClipboardList, Loader2, RefreshCw, Send, Users } from "lucide-react";

type ThoughtDepth = "light" | "standard" | "deep";

interface BoardroomParticipant {
  id: string;
  name: string;
  role: string;
  brief: string;
}

interface BoardroomTurn {
  id: string;
  participantId: string;
  participantName: string;
  role: "seat" | "system";
  kind: "perspective" | "response" | "summary";
  round: number;
  content: string;
  stance?: string;
  risks?: string[];
  opportunities?: string[];
  recommendations?: string[];
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
  };
  participants: BoardroomParticipant[];
  turns: BoardroomTurn[];
  result: {
    summary: string;
    nextSteps: string[];
    perspectives: BoardroomPerspective[];
  } | null;
  logs: string[];
  error?: string;
}

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

export default function Boardroom() {
  const brand = useBrand();
  const { resetKey } = useApiKey();
  const [topic, setTopic] = useState("");
  const [context, setContext] = useState("");
  const [seatCount, setSeatCount] = useState(3);
  const [rounds, setRounds] = useState(3);
  const [depth, setDepth] = useState<ThoughtDepth>("standard");
  const [sessions, setSessions] = useState<BoardroomSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions]);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) || sessions[0] || null,
    [sessions, activeSessionId],
  );

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

      setSessions((prev) => [data as BoardroomSession, ...prev]);
      setActiveSessionId((data as BoardroomSession).id);
      setTopic("");
      setContext("");
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
          <p className="text-zinc-400">Debate-style AI strategy sessions with configurable seats, rounds, analysis depth, and durable local history.</p>
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
        <div className="space-y-6">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Start a session</h2>
              <p className="text-sm text-zinc-400 mt-1">Pick how many voices you want in the room, how many rounds they should debate, and how hard they should think.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-zinc-300">Topic</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && startDiscussion()}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Should we launch a beginner-friendly AI media + funnel brand?"
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
                <label className="text-sm text-zinc-300">Rounds</label>
                <select
                  value={rounds}
                  onChange={(e) => setRounds(Number(e.target.value))}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
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
                placeholder="Budget, timing, constraints, target launch window, current traction..."
              />
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
              {loading ? "Running boardroom..." : "Start boardroom session"}
            </button>
          </div>

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
                          {(session.config?.seatCount || session.participants.length)} seat(s) • {session.config?.rounds || 1} round(s) • {session.config?.depth || "standard"}
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
                    <div>{activeSession.config?.rounds || 1} round{(activeSession.config?.rounds || 1) === 1 ? "" : "s"}</div>
                    <div>{activeSession.config?.depth || "standard"} depth</div>
                  </div>
                </div>
                {activeSession.context ? (
                  <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-300 whitespace-pre-wrap">
                    {activeSession.context}
                  </div>
                ) : null}
              </div>

              <div className="space-y-4">
                {activeSession.turns.map((turn) => (
                  <motion.div
                    key={turn.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`rounded-2xl border p-4 ${turn.role === "system" ? "border-indigo-500/30 bg-indigo-500/10" : "border-zinc-800 bg-zinc-900"}`}
                  >
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div>
                        <p className="text-sm font-medium text-white">{turn.participantName}</p>
                        <p className="text-xs text-zinc-500 mt-1">Round {turn.round}</p>
                      </div>
                      <span className="text-xs uppercase tracking-wider text-zinc-500">{turn.kind}</span>
                    </div>
                    <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{turn.content}</p>
                  </motion.div>
                ))}
              </div>

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
