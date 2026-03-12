import fs from "fs/promises";
import path from "path";
import { GoogleGenAI } from "@google/genai";

export type BoardroomSessionStatus = "pending" | "completed" | "failed";
export type BoardroomParticipantProvider = "gemini";
export type BoardroomThoughtDepth = "light" | "standard" | "deep";

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
}

export interface BoardroomTurn {
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
}

export interface BoardroomSession {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: BoardroomSessionStatus;
  topic: string;
  context: string;
  config: BoardroomSessionConfig;
  participants: BoardroomParticipant[];
  turns: BoardroomTurn[];
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
}

const MAX_SEATS = 5;
const MAX_ROUNDS = 5;
const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_DEPTH: BoardroomThoughtDepth = "standard";
const DEFAULT_ROUNDS = 2;
const boardroomRoot = path.join(process.cwd(), "jobs", "boardroom");

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
  return [...session.logs, `[${stamp()}] ${message}`].slice(-120);
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

function formatTurnsForPrompt(turns: BoardroomTurn[], currentParticipantId?: string) {
  if (turns.length === 0) return "No prior turns yet.";
  return turns
    .filter((turn) => turn.role === "system" || turn.participantId !== currentParticipantId)
    .map((turn) => {
      const meta = [`round ${turn.round}`, turn.kind, turn.participantName].join(" • ");
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

async function requestRoundReply(
  ai: GoogleGenAI,
  session: BoardroomSession,
  participant: BoardroomParticipant,
  round: number,
  priorTurns: BoardroomTurn[],
) {
  const isOpeningRound = round === 1;
  const response = await ai.models.generateContent({
    model: participant.model,
    contents: `You are ${participant.name}, the ${participant.role}, inside a startup boardroom discussion.\nReturn only JSON with this shape: {\n  "stance": string,\n  "message": string,\n  "risks": string[],\n  "opportunities": string[],\n  "recommendations": string[]\n}.\n\nDiscussion topic: ${session.topic}\nContext: ${session.context || "No extra context provided."}\nParticipant brief: ${participant.brief}\nAnalysis intensity: ${session.config.depth}\nGuidance: ${depthGuidance(session.config.depth)}\nCurrent round: ${round} of ${session.config.rounds}\n\n${isOpeningRound ? "This is round 1. Give your initial perspective." : "This is a later round. Read the prior turns from the other seats, then respond, refine your view, and challenge weak assumptions where needed."}\n\nPrior turns from the room:\n${formatTurnsForPrompt(priorTurns, participant.id)}\n\nBe specific, opinionated, and practical. Keep the message under 180 words and recommendations to 3 items max.`,
  });

  return extractJson(response.text || "") as BoardroomModelReply;
}

async function requestSummary(ai: GoogleGenAI, session: BoardroomSession, perspectives: BoardroomPerspective[]) {
  const response = await ai.models.generateContent({
    model: DEFAULT_MODEL,
    contents: `You are summarizing a multi-round boardroom discussion. Return only JSON with this shape: {\n  "summary": string,\n  "nextSteps": string[]\n}.\n\nTopic: ${session.topic}\nContext: ${session.context || "No extra context provided."}\nConfig: ${JSON.stringify(session.config)}\nFinal perspectives: ${JSON.stringify(perspectives, null, 2)}\nFull turn log: ${JSON.stringify(session.turns, null, 2)}\n\nWrite a concise synthesis and up to 5 next steps that a product/UI surface could render directly. Focus on what survived debate, where tension remains, and what should happen next.`,
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
  const config: BoardroomSessionConfig = {
    seatCount: participants.length,
    rounds: clampInteger(request.rounds, 1, MAX_ROUNDS, DEFAULT_ROUNDS),
    depth: sanitizeDepth(request.depth),
  };

  const session: BoardroomSession = {
    id: createId("boardroom"),
    createdAt: stamp(),
    updatedAt: stamp(),
    status: "pending",
    topic: request.topic.trim(),
    context: request.context?.trim() || "",
    config,
    participants,
    turns: [],
    result: null,
    logs: [`[${stamp()}] Session created with ${participants.length} seat(s), ${config.rounds} round(s), depth ${config.depth}.`],
  };

  await writeBoardroomSession(session);

  try {
    const ai = new GoogleGenAI({ apiKey });
    const finalPerspectives = new Map<string, BoardroomPerspective>();

    for (let round = 1; round <= config.rounds; round += 1) {
      session.logs = appendLog(session, `Starting round ${round} of ${config.rounds}.`);
      session.updatedAt = stamp();
      await writeBoardroomSession(session);

      const roundStartTurns = [...session.turns];
      for (const participant of participants) {
        const parsed = await requestRoundReply(ai, session, participant, round, round === 1 ? [] : roundStartTurns);
        const normalized = normalizeReply(parsed, participant);
        finalPerspectives.set(participant.id, normalized);

        session.turns.push({
          id: createId("turn"),
          participantId: participant.id,
          participantName: participant.name,
          role: "seat",
          kind: round === 1 ? "perspective" : "response",
          round,
          content: String(parsed.message || parsed.stance || "").trim(),
          stance: normalized.stance,
          risks: normalized.risks,
          opportunities: normalized.opportunities,
          recommendations: normalized.recommendations,
          createdAt: stamp(),
        });
        session.updatedAt = stamp();
        session.logs = appendLog(session, `${participant.name} completed round ${round}.`);
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
      content: String(summary.summary || "").trim(),
      createdAt: stamp(),
    });
    session.result = {
      summary: String(summary.summary || "").trim(),
      nextSteps: Array.isArray(summary.nextSteps) ? summary.nextSteps.map(String).slice(0, 5) : [],
      perspectives,
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
