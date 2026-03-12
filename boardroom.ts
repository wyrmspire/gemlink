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

const MAX_SEATS = 5;
const MAX_ROUNDS = 5;
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

export async function readBoardroomSession(id: string) {
  const raw = await fs.readFile(getSessionPath(id), "utf8");
  return JSON.parse(raw) as BoardroomSession;
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

  try {
    const ai = new GoogleGenAI({ apiKey });
    const finalPerspectives = new Map<string, BoardroomPerspective>();

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
