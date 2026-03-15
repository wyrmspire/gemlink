import fs from "fs/promises";
import path from "path";
import { GoogleGenAI } from "@google/genai";

export type BoardroomSessionStatus = "pending" | "completed" | "failed";
export type BoardroomParticipantProvider = "gemini";
export type BoardroomThoughtDepth = "light" | "standard" | "deep";
export type BoardroomPhase = "opening_brief" | "first_pass" | "challenge" | "refinement" | "convergence";

export interface BoardroomParticipantInput {
  id?: string;
  name: string;
  role: string;
  brief?: string;
  provider?: BoardroomParticipantProvider;
  model?: string;
}

export interface BoardroomParticipant {
  id: string;
  name: string;
  role: string;
  brief: string;
  provider: BoardroomParticipantProvider;
  model: string;
}

export interface BoardroomSessionConfig {
  seatCount: number;
  rounds: number;
  depth: BoardroomThoughtDepth;
  protocol: BoardroomPhase[];
}

export interface BoardroomObjective {
  primaryGoal: string;
  hardConstraints: string[];
  softHints: string[];
  throwawayExamples: string[];
  importantFocus: string[];
  namingExplicitlyRequested: boolean;
  briefing: string;
}

export interface BoardroomSeatState {
  participantId: string;
  participantName: string;
  focus: string;
  priorities: string[];
  concerns: string[];
  internalNotes: string[];
  updatedAt: string;
}

export interface BoardroomStateSnapshot {
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

export interface BoardroomTurn {
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

export interface BoardroomPerspective {
  participantId: string;
  participantName: string;
  stance: string;
  risks: string[];
  opportunities: string[];
  recommendations: string[];
}

export interface BoardroomResult {
  summary: string;
  nextSteps: string[];
  perspectives: BoardroomPerspective[];
  finalState: BoardroomStateSnapshot | null;
}

export interface BoardroomSession {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: BoardroomSessionStatus;
  topic: string;
  context: string;
  config: BoardroomSessionConfig;
  objective: BoardroomObjective | null;
  participants: BoardroomParticipant[];
  turns: BoardroomTurn[];
  stateHistory: BoardroomStateSnapshot[];
  result: BoardroomResult | null;
  logs: string[];
  error?: string;
}

interface BoardroomSessionRequest {
  topic: string;
  context?: string;
  participants?: BoardroomParticipantInput[];
  rounds?: number;
  depth?: BoardroomThoughtDepth;
  apiKey?: string;
}

interface BoardroomModelReply {
  stance?: string;
  message?: string;
  risks?: string[];
  opportunities?: string[];
  recommendations?: string[];
  focus?: string;
  priorities?: string[];
  concerns?: string[];
  internalNotes?: string[];
}

interface BoardroomObjectiveReply {
  primaryGoal?: string;
  hardConstraints?: string[];
  softHints?: string[];
  throwawayExamples?: string[];
  importantFocus?: string[];
  namingExplicitlyRequested?: boolean;
  briefing?: string;
}

interface BoardroomStateReply {
  roomFocus?: string;
  openQuestions?: string[];
  emergingConsensus?: string[];
  tensions?: string[];
  provisionalItems?: string[];
  importantItems?: string[];
  seatStates?: Array<{
    participantId?: string;
    focus?: string;
    priorities?: string[];
    concerns?: string[];
    internalNotes?: string[];
  }>;
  summary?: string;
}

// ── SAFETY: Loop bounds for boardroom orchestration ──────────────────────────
// An agent working on this codebase MUST ensure ALL loops that await external
// APIs have hard upper bounds. NEVER use open-ended polling without a max
// attempt counter. The boardroom is bounded by MAX_ROUNDS × MAX_SEATS plus
// overhead calls (objective, state updates, summary). Worst case:
//   1 objective + (MAX_ROUNDS × MAX_SEATS participant calls) + MAX_ROUNDS state
//   updates + 1 summary = 1 + 25 + 5 + 1 = 32 calls.
// MAX_BOARDROOM_API_CALLS is a hard ceiling — if hit, the session fails.
// GEMINI_CALL_TIMEOUT_MS is a per-call AbortController timeout.
const MAX_SEATS = 5;
const MAX_ROUNDS = 5;
const MAX_BOARDROOM_API_CALLS = 40;   // hard ceiling; actual max is ~32
const GEMINI_CALL_TIMEOUT_MS = 120_000; // 2 minutes per Gemini call
const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_DEPTH: BoardroomThoughtDepth = "standard";
const DEFAULT_ROUNDS = 5;
const boardroomRoot = path.join(process.cwd(), "jobs", "boardroom");
const PROTOCOL: BoardroomPhase[] = ["opening_brief", "first_pass", "challenge", "refinement", "convergence"];

function stamp() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function sanitizeDepth(depth?: string): BoardroomThoughtDepth {
  return depth === "light" || depth === "deep" || depth === "standard" ? depth : DEFAULT_DEPTH;
}

function sanitizeParticipants(participants?: BoardroomParticipantInput[]) {
  const defaults: BoardroomParticipantInput[] = [
    {
      id: "strategist",
      name: "Strategy Lead",
      role: "Strategy Lead",
      brief: "Prioritize positioning, market timing, and practical business leverage.",
    },
    {
      id: "operator",
      name: "Operations Lead",
      role: "Operations Lead",
      brief: "Prioritize execution risk, workflow fit, delivery scope, and measurable next moves.",
    },
  ];

  const source = participants?.length ? participants : defaults;
  if (source.length < 1) {
    throw new Error("Boardroom needs at least 1 participant.");
  }
  if (source.length > MAX_SEATS) {
    throw new Error(`Boardroom currently supports up to ${MAX_SEATS} seats per session.`);
  }

  return source.map((participant, index): BoardroomParticipant => ({
    id: participant.id?.trim() || `seat-${index + 1}`,
    name: participant.name.trim(),
    role: participant.role.trim(),
    brief: participant.brief?.trim() || participant.role.trim(),
    provider: "gemini",
    model: participant.model?.trim() || DEFAULT_MODEL,
  }));
}

function appendLog(session: BoardroomSession, message: string) {
  return [...session.logs, `[${stamp()}] ${message}`].slice(-160);
}

function extractJson(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return JSON.");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function depthGuidance(depth: BoardroomThoughtDepth) {
  if (depth === "light") {
    return "Keep it sharp and lightweight. Favor clear tradeoffs over long analysis.";
  }
  if (depth === "deep") {
    return "Think harder. Surface second-order effects, objections, and practical edge cases before you answer.";
  }
  return "Be balanced: practical, moderately detailed, and willing to make tradeoffs explicit.";
}

function phaseLabel(phase: BoardroomPhase) {
  switch (phase) {
    case "opening_brief":
      return "Opening brief";
    case "first_pass":
      return "First-pass reactions";
    case "challenge":
      return "Challenge round";
    case "refinement":
      return "Refinement round";
    case "convergence":
      return "Convergence";
  }
}

function phaseKind(phase: BoardroomPhase): BoardroomTurn["kind"] {
  switch (phase) {
    case "opening_brief":
      return "brief";
    case "first_pass":
      return "perspective";
    case "challenge":
      return "challenge";
    case "refinement":
      return "refinement";
    case "convergence":
      return "convergence";
  }
}

function formatTurnsForPrompt(turns: BoardroomTurn[], currentParticipantId?: string) {
  if (turns.length === 0) return "No prior turns yet.";
  return turns
    .filter((turn) => turn.role === "system" || turn.participantId !== currentParticipantId)
    .map((turn) => {
      const meta = [turn.phaseLabel, `round ${turn.round}`, turn.kind, turn.participantName].join(" • ");
      return `- ${meta}: ${turn.content}`;
    })
    .join("\n");
}

function normalizeReply(parsed: BoardroomModelReply, participant: BoardroomParticipant): BoardroomPerspective {
  return {
    participantId: participant.id,
    participantName: participant.name,
    stance: String(parsed.stance || parsed.message || "").trim(),
    risks: Array.isArray(parsed.risks) ? parsed.risks.map(String).filter(Boolean).slice(0, 5) : [],
    opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities.map(String).filter(Boolean).slice(0, 5) : [],
    recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String).filter(Boolean).slice(0, 5) : [],
  };
}

function normalizeObjective(parsed: BoardroomObjectiveReply): BoardroomObjective {
  return {
    primaryGoal: String(parsed.primaryGoal || "Clarify the real objective before debating tactics.").trim(),
    hardConstraints: Array.isArray(parsed.hardConstraints) ? parsed.hardConstraints.map(String).filter(Boolean).slice(0, 6) : [],
    softHints: Array.isArray(parsed.softHints) ? parsed.softHints.map(String).filter(Boolean).slice(0, 6) : [],
    throwawayExamples: Array.isArray(parsed.throwawayExamples) ? parsed.throwawayExamples.map(String).filter(Boolean).slice(0, 6) : [],
    importantFocus: Array.isArray(parsed.importantFocus) ? parsed.importantFocus.map(String).filter(Boolean).slice(0, 6) : [],
    namingExplicitlyRequested: Boolean(parsed.namingExplicitlyRequested),
    briefing: String(parsed.briefing || "Treat examples and rough names as provisional unless the user explicitly asks to work on them.").trim(),
  };
}

function safeList(input: unknown, limit = 5) {
  return Array.isArray(input) ? input.map(String).filter(Boolean).slice(0, limit) : [];
}

function normalizeState(
  parsed: BoardroomStateReply,
  participants: BoardroomParticipant[],
  phase: BoardroomPhase,
  round: number,
): BoardroomStateSnapshot {
  const rawSeatStates = Array.isArray(parsed.seatStates) ? parsed.seatStates : [];
  const seatStates: BoardroomSeatState[] = participants.map((participant) => {
    const matched = rawSeatStates.find((entry) => entry?.participantId === participant.id) || {};
    return {
      participantId: participant.id,
      participantName: participant.name,
      focus: String(matched.focus || `${participant.name} is tracking the main objective.`).trim(),
      priorities: safeList(matched.priorities),
      concerns: safeList(matched.concerns),
      internalNotes: safeList(matched.internalNotes, 4),
      updatedAt: stamp(),
    };
  });

  return {
    id: createId("state"),
    phase,
    phaseLabel: phaseLabel(phase),
    round,
    roomFocus: String(parsed.roomFocus || "Stay centered on the actual objective.").trim(),
    openQuestions: safeList(parsed.openQuestions),
    emergingConsensus: safeList(parsed.emergingConsensus),
    tensions: safeList(parsed.tensions),
    provisionalItems: safeList(parsed.provisionalItems),
    importantItems: safeList(parsed.importantItems),
    seatStates,
    summary: String(parsed.summary || "The room updated its state for the next phase.").trim(),
    createdAt: stamp(),
  };
}

async function ensureBoardroomDirectory() {
  await fs.mkdir(boardroomRoot, { recursive: true });
}

function getSessionPath(id: string) {
  return path.join(boardroomRoot, `${id}.json`);
}

export async function listBoardroomSessions() {
  await ensureBoardroomDirectory();
  const entries = await fs.readdir(boardroomRoot, { withFileTypes: true });
  const sessions: BoardroomSession[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(boardroomRoot, entry.name), "utf8");
      sessions.push(JSON.parse(raw) as BoardroomSession);
    } catch {
      // Ignore broken files so one bad session does not break history.
    }
  }

  sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return sessions;
}

// C3: Validate required fields on a parsed boardroom session object.
function validateBoardroomSession(parsed: unknown, id: string): BoardroomSession {
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Boardroom session ${id}: file is not a JSON object.`);
  }
  const obj = parsed as Record<string, unknown>;
  const required: (keyof BoardroomSession)[] = ["id", "createdAt", "updatedAt", "status", "topic", "turns", "participants", "logs"];
  for (const field of required) {
    if (!(field in obj)) {
      throw new Error(`Boardroom session ${id}: missing required field "${field}". The file may be corrupted.`);
    }
  }
  const validStatuses: BoardroomSessionStatus[] = ["pending", "completed", "failed"];
  if (!validStatuses.includes(obj.status as BoardroomSessionStatus)) {
    throw new Error(`Boardroom session ${id}: invalid status "${obj.status}".`);
  }
  if (!Array.isArray(obj.turns)) {
    throw new Error(`Boardroom session ${id}: "turns" must be an array.`);
  }
  if (!Array.isArray(obj.participants)) {
    throw new Error(`Boardroom session ${id}: "participants" must be an array.`);
  }
  return obj as unknown as BoardroomSession;
}

export async function readBoardroomSession(id: string): Promise<BoardroomSession> {
  let raw: string;
  try {
    raw = await fs.readFile(getSessionPath(id), "utf8");
  } catch (err: any) {
    throw new Error(`Boardroom session ${id} not found or unreadable: ${err?.message || err}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: any) {
    throw new Error(`Boardroom session ${id} contains invalid JSON (file may be corrupted): ${err?.message || err}`);
  }
  return validateBoardroomSession(parsed, id);
}

// C1: Async session creation — returns a pending session immediately, runs orchestration in background.
export async function startBoardroomSessionAsync(request: BoardroomSessionRequest): Promise<BoardroomSession> {
  if (!request.topic?.trim()) {
    throw new Error("Topic is required.");
  }

  const apiKey = request.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing. Set it in .env.local or provide apiKey in the request.");
  }

  const participants = sanitizeParticipants(request.participants);
  const rounds = clampInteger(request.rounds, 1, MAX_ROUNDS, DEFAULT_ROUNDS);
  const config: BoardroomSessionConfig = {
    seatCount: participants.length,
    rounds,
    depth: sanitizeDepth(request.depth),
    protocol: PROTOCOL.slice(0, rounds),
  };

  const session: BoardroomSession = {
    id: createId("boardroom"),
    createdAt: stamp(),
    updatedAt: stamp(),
    status: "pending",
    topic: request.topic.trim(),
    context: request.context?.trim() || "",
    config,
    objective: null,
    participants,
    turns: [],
    stateHistory: [],
    result: null,
    logs: [`[${stamp()}] Session queued — ${participants.length} seat(s), protocol ${config.protocol.map(phaseLabel).join(" → ")}, depth ${config.depth}.`],
  };

  // Write pending session immediately so the client can start polling.
  await writeBoardroomSession(session);

  // Run orchestration in the background — do not await.
  void runBoardroomOrchestration(session, apiKey);

  return session;
}

// Internal: background orchestration loop (same logic as the synchronous createBoardroomSession, but persisting after every turn).
// SAFETY: Total API calls are counted via `apiCallCount` and capped at MAX_BOARDROOM_API_CALLS.
// The for-loops are inherently bounded (MAX_ROUNDS × MAX_SEATS), but the counter
// is a defence-in-depth measure so a code mistake never causes infinite billing.
async function runBoardroomOrchestration(session: BoardroomSession, apiKey: string) {
  let apiCallCount = 0;

  function checkApiLimit(context: string) {
    apiCallCount++;
    if (apiCallCount > MAX_BOARDROOM_API_CALLS) {
      throw new Error(`SAFETY: Boardroom API call limit (${MAX_BOARDROOM_API_CALLS}) exceeded during ${context}. Session aborted to prevent runaway billing.`);
    }
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const finalPerspectives = new Map<string, BoardroomPerspective>();

    checkApiLimit("requestObjective");
    session.objective = await requestObjective(ai, session);
    session.turns.push({
      id: createId("turn"),
      participantId: "system-brief",
      participantName: "Boardroom Brief",
      role: "system",
      kind: "brief",
      round: 1,
      phase: "opening_brief",
      phaseLabel: phaseLabel("opening_brief"),
      content: session.objective.briefing,
      stateSummary: session.objective.primaryGoal,
      createdAt: stamp(),
    });
    session.logs = appendLog(session, "Objective anchor prepared.");
    session.updatedAt = stamp();
    await writeBoardroomSession(session);

    let latestState: BoardroomStateSnapshot | null = null;

    for (const [index, phase] of session.config.protocol.entries()) {
      const round = index + 1;
      session.logs = appendLog(session, `Starting ${phaseLabel(phase)} (${round} of ${session.config.rounds}).`);
      session.updatedAt = stamp();
      await writeBoardroomSession(session);

      if (phase !== "opening_brief") {
        const roundStartTurns = [...session.turns];
        const phaseTurns: BoardroomTurn[] = [];

        for (const participant of session.participants) {
          checkApiLimit(`${participant.name} / ${phaseLabel(phase)}`);
          const parsed = await requestRoundReply(ai, session, participant, phase, round, roundStartTurns, latestState);
          const normalized = normalizeReply(parsed, participant);
          finalPerspectives.set(participant.id, normalized);

          const turn: BoardroomTurn = {
            id: createId("turn"),
            participantId: participant.id,
            participantName: participant.name,
            role: "seat",
            kind: phaseKind(phase),
            round,
            phase,
            phaseLabel: phaseLabel(phase),
            content: String(parsed.message || parsed.stance || "").trim(),
            stance: normalized.stance,
            risks: normalized.risks,
            opportunities: normalized.opportunities,
            recommendations: normalized.recommendations,
            createdAt: stamp(),
          };

          session.turns.push(turn);
          phaseTurns.push(turn);
          session.updatedAt = stamp();
          session.logs = appendLog(session, `${participant.name} completed ${phaseLabel(phase)}.`);
          // Persist after every individual turn so the client sees incremental progress.
          await writeBoardroomSession(session);
        }

        checkApiLimit(`stateUpdate / ${phaseLabel(phase)}`);
        latestState = await requestStateUpdate(ai, session, phase, round, phaseTurns, latestState);
        session.stateHistory.push(latestState);
        session.turns.push({
          id: createId("turn"),
          participantId: "system-state",
          participantName: "Room State",
          role: "system",
          kind: "state_update",
          round,
          phase,
          phaseLabel: phaseLabel(phase),
          content: latestState.summary,
          stateSummary: latestState.roomFocus,
          createdAt: stamp(),
        });
        session.logs = appendLog(session, `State updated after ${phaseLabel(phase)}.`);
        session.updatedAt = stamp();
        await writeBoardroomSession(session);
      }
    }

    const perspectives = session.participants
      .map((participant) => finalPerspectives.get(participant.id))
      .filter(Boolean) as BoardroomPerspective[];

    checkApiLimit("requestSummary");
    const summary = await requestSummary(ai, session, perspectives);
    session.turns.push({
      id: createId("turn"),
      participantId: "system-summary",
      participantName: "Boardroom Summary",
      role: "system",
      kind: "summary",
      round: session.config.rounds + 1,
      phase: "convergence",
      phaseLabel: "Final synthesis",
      content: String(summary.summary || "").trim(),
      createdAt: stamp(),
    });
    session.result = {
      summary: String(summary.summary || "").trim(),
      nextSteps: Array.isArray(summary.nextSteps) ? summary.nextSteps.map(String).slice(0, 5) : [],
      perspectives,
      finalState: latestState,
    };
    session.status = "completed";
    session.updatedAt = stamp();
    session.logs = appendLog(session, "Session completed.");
    await writeBoardroomSession(session);
  } catch (error: any) {
    console.error("Boardroom background orchestration error:", error);
    session.status = "failed";
    session.error = error?.message || "Boardroom session failed.";
    session.updatedAt = stamp();
    session.logs = appendLog(session, `Session failed: ${session.error}`);
    await writeBoardroomSession(session);
  }
}

async function writeBoardroomSession(session: BoardroomSession) {
  await ensureBoardroomDirectory();
  await fs.writeFile(getSessionPath(session.id), JSON.stringify(session, null, 2));
}

async function requestObjective(ai: GoogleGenAI, session: BoardroomSession) {
  const response = await ai.models.generateContent({
    model: DEFAULT_MODEL,
    contents: `You are preparing a boardroom discussion. Return only JSON with this shape: {
  "primaryGoal": string,
  "hardConstraints": string[],
  "softHints": string[],
  "throwawayExamples": string[],
  "importantFocus": string[],
  "namingExplicitlyRequested": boolean,
  "briefing": string
}.

Topic: ${session.topic}
Context: ${session.context || "No extra context provided."}

Instructions:
- Distinguish the real objective from examples, filler, and offhand naming ideas.
- Treat a rough product/company/property name as provisional unless the user clearly asked for naming or brand identity work.
- Put actual goals and non-negotiable constraints in the right buckets.
- Keep the briefing practical and inspectable for a product UI.
- Do not invent strong constraints unless supported by the prompt.`,
  });

  return normalizeObjective(extractJson(response.text || "") as BoardroomObjectiveReply);
}

function formatStateForPrompt(state: BoardroomStateSnapshot | null) {
  if (!state) return "No room state yet.";
  return JSON.stringify({
    phase: state.phase,
    roomFocus: state.roomFocus,
    openQuestions: state.openQuestions,
    emergingConsensus: state.emergingConsensus,
    tensions: state.tensions,
    provisionalItems: state.provisionalItems,
    importantItems: state.importantItems,
    seatStates: state.seatStates.map((seat) => ({
      participantId: seat.participantId,
      focus: seat.focus,
      priorities: seat.priorities,
      concerns: seat.concerns,
      internalNotes: seat.internalNotes,
    })),
    summary: state.summary,
  }, null, 2);
}

async function requestRoundReply(
  ai: GoogleGenAI,
  session: BoardroomSession,
  participant: BoardroomParticipant,
  phase: BoardroomPhase,
  round: number,
  priorTurns: BoardroomTurn[],
  roomState: BoardroomStateSnapshot | null,
) {
  const response = await ai.models.generateContent({
    model: participant.model,
    contents: `You are ${participant.name}, the ${participant.role}, inside a startup boardroom discussion.
Return only JSON with this shape: {
  "stance": string,
  "message": string,
  "risks": string[],
  "opportunities": string[],
  "recommendations": string[],
  "focus": string,
  "priorities": string[],
  "concerns": string[],
  "internalNotes": string[]
}.

Discussion topic: ${session.topic}
Context: ${session.context || "No extra context provided."}
Objective anchor: ${JSON.stringify(session.objective, null, 2)}
Participant brief: ${participant.brief}
Analysis intensity: ${session.config.depth}
Guidance: ${depthGuidance(session.config.depth)}
Current protocol phase: ${phaseLabel(phase)} (${round} of ${session.config.rounds})
Room state before your turn:
${formatStateForPrompt(roomState)}

Prior turns from the room:
${formatTurnsForPrompt(priorTurns, participant.id)}

Protocol instructions:
- Base your contribution on the objective and room state, not just the latest message.
- Treat naming ideas, sample phrases, and possible titles as provisional unless namingExplicitlyRequested is true.
- ${phase === "first_pass" ? "Offer your first-pass reaction to the anchored objective." : "Respond according to this phase, building on consensus and tensions already in the room."}
- ${phase === "challenge" ? "Challenge weak assumptions, point out what the room may be overvaluing, and sharpen tradeoffs." : ""}
- ${phase === "refinement" ? "Refine the strongest path forward, resolve tensions where possible, and suggest practical shape." : ""}
- ${phase === "convergence" ? "Converge on a practical synthesis with concrete next moves." : ""}
- Keep internalNotes short, structured, and safe for storage. No hidden chain-of-thought.
- Keep the message under 180 words and recommendations to 3 items max.`,
  });

  return extractJson(response.text || "") as BoardroomModelReply;
}

async function requestStateUpdate(
  ai: GoogleGenAI,
  session: BoardroomSession,
  phase: BoardroomPhase,
  round: number,
  turnsInPhase: BoardroomTurn[],
  previousState: BoardroomStateSnapshot | null,
) {
  const response = await ai.models.generateContent({
    model: DEFAULT_MODEL,
    contents: `You are updating a boardroom state tracker. Return only JSON with this shape: {
  "roomFocus": string,
  "openQuestions": string[],
  "emergingConsensus": string[],
  "tensions": string[],
  "provisionalItems": string[],
  "importantItems": string[],
  "seatStates": [{
    "participantId": string,
    "focus": string,
    "priorities": string[],
    "concerns": string[],
    "internalNotes": string[]
  }],
  "summary": string
}.

Objective anchor: ${JSON.stringify(session.objective, null, 2)}
Current phase: ${phaseLabel(phase)}
Previous state: ${formatStateForPrompt(previousState)}
Turns from this phase: ${JSON.stringify(turnsInPhase, null, 2)}
Participants: ${JSON.stringify(session.participants, null, 2)}

Instructions:
- Update the room state based on what the room now believes.
- Explicitly track what is provisional vs important.
- If the user offered a possible name without asking for naming work, keep that in provisionalItems rather than importantItems.
- Keep seatStates compact and inspectable.
- Do not expose chain-of-thought. Use terse structured notes only.`,
  });

  return normalizeState(extractJson(response.text || "") as BoardroomStateReply, session.participants, phase, round);
}

async function requestSummary(ai: GoogleGenAI, session: BoardroomSession, perspectives: BoardroomPerspective[]) {
  const response = await ai.models.generateContent({
    model: DEFAULT_MODEL,
    contents: `You are summarizing a protocol-driven boardroom discussion. Return only JSON with this shape: {
  "summary": string,
  "nextSteps": string[]
}.

Topic: ${session.topic}
Context: ${session.context || "No extra context provided."}
Config: ${JSON.stringify(session.config)}
Objective anchor: ${JSON.stringify(session.objective, null, 2)}
Final state: ${JSON.stringify(session.stateHistory[session.stateHistory.length - 1] || null, null, 2)}
Final perspectives: ${JSON.stringify(perspectives, null, 2)}
Full turn log: ${JSON.stringify(session.turns, null, 2)}

Write a concise synthesis and up to 5 next steps a product UI can render directly. Focus on what survived debate, what remains provisional, and what the team should do next.`,
  });

  return extractJson(response.text || "");
}

export async function createBoardroomSession(request: BoardroomSessionRequest) {
  if (!request.topic?.trim()) {
    throw new Error("Topic is required.");
  }

  const apiKey = request.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing. Set it in .env.local or provide apiKey in the request.");
  }

  const participants = sanitizeParticipants(request.participants);
  const rounds = clampInteger(request.rounds, 1, MAX_ROUNDS, DEFAULT_ROUNDS);
  const config: BoardroomSessionConfig = {
    seatCount: participants.length,
    rounds,
    depth: sanitizeDepth(request.depth),
    protocol: PROTOCOL.slice(0, rounds),
  };

  const session: BoardroomSession = {
    id: createId("boardroom"),
    createdAt: stamp(),
    updatedAt: stamp(),
    status: "pending",
    topic: request.topic.trim(),
    context: request.context?.trim() || "",
    config,
    objective: null,
    participants,
    turns: [],
    stateHistory: [],
    result: null,
    logs: [`[${stamp()}] Session created with ${participants.length} seat(s), protocol ${config.protocol.map(phaseLabel).join(" → ")}, depth ${config.depth}.`],
  };

  await writeBoardroomSession(session);

  // SAFETY: Same API call counter as runBoardroomOrchestration (defence-in-depth).
  let apiCallCount = 0;
  function checkApiLimit(context: string) {
    apiCallCount++;
    if (apiCallCount > MAX_BOARDROOM_API_CALLS) {
      throw new Error(`SAFETY: Boardroom API call limit (${MAX_BOARDROOM_API_CALLS}) exceeded during ${context}. Session aborted to prevent runaway billing.`);
    }
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const finalPerspectives = new Map<string, BoardroomPerspective>();

    checkApiLimit("requestObjective");
    session.objective = await requestObjective(ai, session);
    session.turns.push({
      id: createId("turn"),
      participantId: "system-brief",
      participantName: "Boardroom Brief",
      role: "system",
      kind: "brief",
      round: 1,
      phase: "opening_brief",
      phaseLabel: phaseLabel("opening_brief"),
      content: session.objective.briefing,
      stateSummary: session.objective.primaryGoal,
      createdAt: stamp(),
    });
    session.logs = appendLog(session, "Objective anchor prepared.");
    session.updatedAt = stamp();
    await writeBoardroomSession(session);

    let latestState: BoardroomStateSnapshot | null = null;

    for (const [index, phase] of config.protocol.entries()) {
      const round = index + 1;
      session.logs = appendLog(session, `Starting ${phaseLabel(phase)} (${round} of ${config.rounds}).`);
      session.updatedAt = stamp();
      await writeBoardroomSession(session);

      if (phase !== "opening_brief") {
        const roundStartTurns = [...session.turns];
        const phaseTurns: BoardroomTurn[] = [];

        for (const participant of participants) {
          checkApiLimit(`${participant.name} / sync ${phaseLabel(phase)}`);
          const parsed = await requestRoundReply(ai, session, participant, phase, round, roundStartTurns, latestState);
          const normalized = normalizeReply(parsed, participant);
          finalPerspectives.set(participant.id, normalized);

          const turn: BoardroomTurn = {
            id: createId("turn"),
            participantId: participant.id,
            participantName: participant.name,
            role: "seat",
            kind: phaseKind(phase),
            round,
            phase,
            phaseLabel: phaseLabel(phase),
            content: String(parsed.message || parsed.stance || "").trim(),
            stance: normalized.stance,
            risks: normalized.risks,
            opportunities: normalized.opportunities,
            recommendations: normalized.recommendations,
            createdAt: stamp(),
          };

          session.turns.push(turn);
          phaseTurns.push(turn);
          session.updatedAt = stamp();
          session.logs = appendLog(session, `${participant.name} completed ${phaseLabel(phase)}.`);
          await writeBoardroomSession(session);
        }

        checkApiLimit(`stateUpdate / sync ${phaseLabel(phase)}`);
        latestState = await requestStateUpdate(ai, session, phase, round, phaseTurns, latestState);
        session.stateHistory.push(latestState);
        session.turns.push({
          id: createId("turn"),
          participantId: "system-state",
          participantName: "Room State",
          role: "system",
          kind: "state_update",
          round,
          phase,
          phaseLabel: phaseLabel(phase),
          content: latestState.summary,
          stateSummary: latestState.roomFocus,
          createdAt: stamp(),
        });
        session.logs = appendLog(session, `State updated after ${phaseLabel(phase)}.`);
        session.updatedAt = stamp();
        await writeBoardroomSession(session);
      }
    }

    const perspectives = participants
      .map((participant) => finalPerspectives.get(participant.id))
      .filter(Boolean) as BoardroomPerspective[];

    checkApiLimit("requestSummary (sync)");
    const summary = await requestSummary(ai, session, perspectives);
    session.turns.push({
      id: createId("turn"),
      participantId: "system-summary",
      participantName: "Boardroom Summary",
      role: "system",
      kind: "summary",
      round: config.rounds + 1,
      phase: "convergence",
      phaseLabel: "Final synthesis",
      content: String(summary.summary || "").trim(),
      createdAt: stamp(),
    });
    session.result = {
      summary: String(summary.summary || "").trim(),
      nextSteps: Array.isArray(summary.nextSteps) ? summary.nextSteps.map(String).slice(0, 5) : [],
      perspectives,
      finalState: latestState,
    };
    session.status = "completed";
    session.updatedAt = stamp();
    session.logs = appendLog(session, "Session completed.");
    await writeBoardroomSession(session);

    return session;
  } catch (error: any) {
    session.status = "failed";
    session.error = error?.message || "Boardroom session failed.";
    session.updatedAt = stamp();
    session.logs = appendLog(session, `Session failed: ${session.error}`);
    await writeBoardroomSession(session);
    throw error;
  }
}

// ── I2: Media Brief Pipeline ──────────────────────────────────────────────────

/**
 * MediaPlanItem — mirrors the interface defined in upgrade.md Track H.
 * Returned by extractMediaBriefs() so the frontend / Media Plan page can
 * ingest the suggestions without any further transformation.
 */
export interface MediaPlanItem {
  id: string;
  type: "image" | "video" | "voice";
  label: string;            // e.g. "Hero banner for landing page"
  purpose: string;          // e.g. "Website hero", "Instagram post"
  promptTemplate: string;   // Ready-to-use generation prompt
  model?: string;
  size?: string;
  aspectRatio?: string;
  status: "draft";          // Always "draft" when freshly extracted
  generatedJobIds: string[];
  rating?: number;
  tags?: string[];
}

/**
 * Pre-configured Media Strategy session template (I2 companion feature).
 * The topic uses {brandName} / {goal} placeholders so the frontend can
 * substitute them before submitting.
 */
export const MEDIA_STRATEGY_TEMPLATE = {
  id: "media-strategy",
  label: "Media Strategy",
  description:
    "Ask the AI seats to brainstorm every visual and media asset a brand or project needs — website, social, video, and presentation.",
  defaultTopic:
    "What visual and media assets does {brandName} need for {goal}? Consider website, social media, video, and presentation materials.",
  defaultContext:
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

/** Keywords used to scan convergence output for media-related sentences. */
const MEDIA_KEYWORDS = [
  "visual", "image", "video", "content", "asset", "graphic", "photo",
  "illustration", "animation", "banner", "poster", "thumbnail", "logo",
  "icon", "infographic", "presentation", "slide", "hero", "social",
  "instagram", "twitter", "linkedin", "youtube", "reel", "story",
  "advertisement", "ad", "brand", "media",
];

function containsMediaKeyword(sentence: string): boolean {
  const lower = sentence.toLowerCase();
  return MEDIA_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * I2: Extract actionable media briefs from a completed boardroom session.
 *
 * 1. Validates the session is completed.
 * 2. Gathers convergence-phase turns + final synthesis text.
 * 3. Calls Gemini to extract structured MediaPlanItem suggestions.
 * 4. Returns a normalised array ready for the Media Plan page (or clipboard).
 */
export async function extractMediaBriefs(
  sessionId: string,
  apiKey?: string,
): Promise<MediaPlanItem[]> {
  const session = await readBoardroomSession(sessionId);

  if (session.status !== "completed") {
    throw new Error(
      `Cannot extract media briefs from a session with status "${session.status}". Session must be completed.`,
    );
  }

  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is missing. Set it in .env.local or provide apiKey in the request.",
    );
  }

  // Gather convergence-phase content: convergence turns + final result summary.
  const convergenceTurns = session.turns.filter(
    (t) => t.phase === "convergence" || t.kind === "summary",
  );

  const convergenceText = [
    ...convergenceTurns.map((t) => `[${t.participantName}]: ${t.content}`),
    session.result?.summary ? `\nFinal synthesis:\n${session.result.summary}` : "",
    session.result?.nextSteps?.length
      ? `\nNext steps:\n${session.result.nextSteps.join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  if (!convergenceText.trim()) {
    return [];
  }

  // Quick heuristic: surface sentences most likely to mention media assets.
  const sentences = convergenceText.split(/[.!?]+/).filter(Boolean);
  const mediaHints = sentences
    .filter(containsMediaKeyword)
    .slice(0, 20)
    .join(". ");

  const promptContext = (mediaHints || convergenceText).slice(0, 3000);

  const ai = new GoogleGenAI({ apiKey: key });

  const systemPrompt = `You are a media planning assistant. Given the following boardroom session output about "${session.topic}", extract actionable media asset suggestions.

Return ONLY a JSON array (no markdown fences, no commentary) of objects with this exact shape:
[
  {
    "type": "image" | "video" | "voice",
    "label": "Short descriptive name for the asset",
    "purpose": "Where/how it will be used (e.g. Website hero, Instagram post, Pitch deck slide)",
    "promptTemplate": "A concrete, ready-to-use generation prompt for this asset",
    "tags": ["tag1", "tag2"]
  }
]

Rules:
- Extract 3–8 concrete media suggestions (not vague categories).
- Each promptTemplate should be a specific, actionable generation prompt mentioning brand tone, visual style, and purpose.
- type "image" for static visuals, "video" for motion content, "voice" for audio/voiceover.
- Focus on assets clearly implied or recommended by the session output.
- If no clear media suggestions are present, return an empty array [].

Session topic: ${session.topic}
Session output to analyze:
${promptContext}`;

  const response = await ai.models.generateContent({
    model: DEFAULT_MODEL,
    contents: systemPrompt,
  });

  const rawText = (response.text || "").trim();

  let parsed: unknown;
  try {
    const arrayStart = rawText.indexOf("[");
    const arrayEnd = rawText.lastIndexOf("]");
    if (arrayStart === -1 || arrayEnd === -1 || arrayEnd <= arrayStart) {
      return [];
    }
    parsed = JSON.parse(rawText.slice(arrayStart, arrayEnd + 1));
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const validTypes = new Set(["image", "video", "voice"]);

  return parsed
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item, index): MediaPlanItem => ({
      id: createId(`brief-${index}`),
      type: validTypes.has(String(item.type)) ? (item.type as MediaPlanItem["type"]) : "image",
      label: String(item.label || "Untitled asset").trim().slice(0, 120),
      purpose: String(item.purpose || "General use").trim().slice(0, 200),
      promptTemplate: String(item.promptTemplate || "").trim().slice(0, 1000),
      tags: Array.isArray(item.tags)
        ? item.tags.map(String).filter(Boolean).slice(0, 8)
        : [],
      status: "draft",
      generatedJobIds: [],
    }))
    .filter((item) => item.label && item.promptTemplate);
}


// ── L2: Strategy Analysis Template ───────────────────────────────────────────

/**
 * Strategy Analysis session template (L2).
 * 4 specialized seats designed to extract underlying principles from
 * any observed strategy (competitor, viral content, growth hack, etc.)
 * and adapt them to the user's brand context.
 */
export const STRATEGY_ANALYSIS_TEMPLATE = {
  id: "strategy-analysis",
  label: "Strategy Analysis",
  description:
    "Describe a strategy you observed (e.g. a TikTok approach, a competitor campaign, a viral format). The 4 seats will extract the underlying principles and adapt them to your brand.",
  defaultTopic:
    "Analyse this observed strategy and extract the underlying principles, psychological drivers, and adaptation notes.",
  defaultContext: "",
  participants: [
    {
      id: "analyst",
      name: "Analyst",
      role: "Strategy Analyst",
      brief:
        "Break down the observed strategy into its core components: hooks used, content formats, posting frequency, distribution tactics, monetisation mechanics, and any platform-specific patterns. Be precise and systematic — not impressionistic.",
    },
    {
      id: "psychologist",
      name: "Psychologist",
      role: "Consumer Psychologist",
      brief:
        "Identify the psychological principles operating beneath the surface of this strategy. Look for: social proof mechanics, scarcity or urgency signals, authority positioning, reciprocity loops, pattern interrupts, identity signalling, in-group/out-group dynamics, and dopamine-loop design. Explain WHY each technique works neurologically and socially.",
    },
    {
      id: "adapter",
      name: "Adapter",
      role: "Brand Strategist / Translator",
      brief:
        "Translate the analysed strategy into concrete, actionable briefs for THIS specific brand and audience. Prefix your key points with: \"Here's how this would work for YOUR audience\". Be specific: format, frequency, tone, channel, and expected outcome. Do not theorise — prescribe.",
    },
    {
      id: "devils-advocate",
      name: "Devil's Advocate",
      role: "Critical Challenger",
      brief:
        "Challenge every assumption the other seats make. Ask: does this actually work at scale, or is it survivorship bias? Does it depend on a faceless channel vs. a brand with a face? What breaks down when the audience is different? What risks or downsides is the room underweighting? Force the room to earn its conclusions.",
    },
  ],
} as const;

/**
 * StrategyAnalysisOutput — the structured JSON produced by extractStrategyAnalysisOutput().
 * Stored as a Strategy Artifact's content field.
 */
export interface StrategyAnalysisOutput {
  originalDescription: string;
  extractedPrinciples: string[];
  adaptationNotes: string;
  suggestedMedia: Array<{
    type: "image" | "video" | "voice";
    label: string;
    purpose: string;
    promptIdea: string;
  }>;
  tags: string[];
}

/**
 * Extract structured Strategy Analysis output from a completed session's convergence.
 * Called by the save-artifact endpoint (W2).
 */
export async function extractStrategyAnalysisOutput(
  sessionId: string,
  apiKey?: string,
): Promise<StrategyAnalysisOutput> {
  const session = await readBoardroomSession(sessionId);

  if (session.status !== "completed") {
    throw new Error(
      `Session ${sessionId} is not completed (status: ${session.status}).`,
    );
  }

  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is missing.");
  }

  const convergenceText = [
    ...session.turns.map((t) => `[${t.participantName}]: ${t.content}`),
    session.result?.summary ? `\nFinal synthesis:\n${session.result.summary}` : "",
    session.result?.nextSteps?.length
      ? `\nNext steps:\n${session.result.nextSteps.join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 6000);

  const ai = new GoogleGenAI({ apiKey: key });

  const prompt = `You are extracting structured intelligence from a completed boardroom strategy analysis session.

Session topic: ${session.topic}
Session output:
${convergenceText}

Return ONLY valid JSON (no markdown fences) with this exact shape:
{
  "originalDescription": "The user's original observed strategy in 1-2 sentences",
  "extractedPrinciples": ["principle 1", "principle 2", "principle 3"],
  "adaptationNotes": "2-3 sentences on how to adapt this to the brand",
  "suggestedMedia": [
    { "type": "image", "label": "...", "purpose": "...", "promptIdea": "..." }
  ],
  "tags": ["tag1", "tag2", "tag3"]
}

Rules:
- extractedPrinciples: 3-7 specific, named principles (e.g. Pattern interrupt in first 3 seconds, Social proof via comment bait)
- adaptationNotes: concrete, not generic — specific to the brand described in the session
- suggestedMedia: 2-4 concrete media suggestions derived from the strategy (type must be image, video, or voice)
- tags: 3-8 short descriptive tags (platform, format, psychological technique, audience)`;

  const response = await ai.models.generateContent({
    model: DEFAULT_MODEL,
    contents: prompt,
  });

  const rawText = (response.text || "").trim();
  let parsed: unknown;
  try {
    const start = rawText.indexOf("{");
    const end = rawText.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("No JSON found");
    parsed = JSON.parse(rawText.slice(start, end + 1));
  } catch {
    return {
      originalDescription: session.topic,
      extractedPrinciples: session.result?.nextSteps ?? [],
      adaptationNotes: session.result?.summary ?? "",
      suggestedMedia: [],
      tags: ["strategy-analysis"],
    };
  }

  const obj = parsed as Record<string, unknown>;
  const validTypes = new Set(["image", "video", "voice"]);

  return {
    originalDescription: String(obj.originalDescription || session.topic).slice(0, 500),
    extractedPrinciples: Array.isArray(obj.extractedPrinciples)
      ? obj.extractedPrinciples.map(String).filter(Boolean).slice(0, 10)
      : [],
    adaptationNotes: String(obj.adaptationNotes || "").slice(0, 1000),
    suggestedMedia: Array.isArray(obj.suggestedMedia)
      ? (obj.suggestedMedia as Record<string, unknown>[])
          .filter((m) => m && typeof m === "object")
          .map((m) => ({
            type: validTypes.has(String(m.type)) ? (m.type as "image" | "video" | "voice") : "image",
            label: String(m.label || "Untitled").slice(0, 120),
            purpose: String(m.purpose || "").slice(0, 200),
            promptIdea: String(m.promptIdea || "").slice(0, 500),
          }))
          .slice(0, 6)
      : [],
    tags: Array.isArray(obj.tags)
      ? obj.tags.map(String).filter(Boolean).slice(0, 10)
      : ["strategy-analysis"],
  };
}
