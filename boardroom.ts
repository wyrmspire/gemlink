import fs from "fs/promises";
import path from "path";
import { GoogleGenAI } from "@google/genai";

export type BoardroomSessionStatus = "pending" | "completed" | "failed";
export type BoardroomParticipantProvider = "gemini";

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

export interface BoardroomTurn {
  id: string;
  participantId: string;
  participantName: string;
  role: "seat" | "system";
  kind: "perspective" | "summary";
  content: string;
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
  apiKey?: string;
}

const MAX_SEATS = 5;
const DEFAULT_MODEL = "gemini-2.5-flash";
const boardroomRoot = path.join(process.cwd(), "jobs", "boardroom");

function stamp() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  if (source.length < 2) {
    throw new Error("Boardroom needs at least 2 participants.");
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
  return [...session.logs, `[${stamp()}] ${message}`].slice(-60);
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

async function requestPerspective(ai: GoogleGenAI, session: BoardroomSession, participant: BoardroomParticipant) {
  const response = await ai.models.generateContent({
    model: participant.model,
    contents: `You are ${participant.name}, the ${participant.role}, inside a startup boardroom discussion.\nReturn only JSON with this shape: {\n  "stance": string,\n  "message": string,\n  "risks": string[],\n  "opportunities": string[],\n  "recommendations": string[]\n}.\n\nDiscussion topic: ${session.topic}\nContext: ${session.context || "No extra context provided."}\nParticipant brief: ${participant.brief}\n\nBe specific, opinionated, and practical. Keep the message under 140 words and recommendations to 3 items max.`,
  });

  return extractJson(response.text || "");
}

async function requestSummary(ai: GoogleGenAI, session: BoardroomSession, perspectives: BoardroomPerspective[]) {
  const response = await ai.models.generateContent({
    model: DEFAULT_MODEL,
    contents: `You are summarizing a boardroom discussion. Return only JSON with this shape: {\n  "summary": string,\n  "nextSteps": string[]\n}.\n\nTopic: ${session.topic}\nContext: ${session.context || "No extra context provided."}\nPerspectives: ${JSON.stringify(perspectives, null, 2)}\n\nWrite a concise synthesis and up to 5 next steps that a product/UI surface could render directly.`,
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
  const session: BoardroomSession = {
    id: createId("boardroom"),
    createdAt: stamp(),
    updatedAt: stamp(),
    status: "pending",
    topic: request.topic.trim(),
    context: request.context?.trim() || "",
    participants,
    turns: [],
    result: null,
    logs: [`[${stamp()}] Session created with ${participants.length} seat(s).`],
  };

  await writeBoardroomSession(session);

  try {
    const ai = new GoogleGenAI({ apiKey });
    const perspectives: BoardroomPerspective[] = [];

    for (const participant of participants) {
      const parsed = await requestPerspective(ai, session, participant);
      perspectives.push({
        participantId: participant.id,
        participantName: participant.name,
        stance: String(parsed.stance || "").trim(),
        risks: Array.isArray(parsed.risks) ? parsed.risks.map(String).slice(0, 5) : [],
        opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities.map(String).slice(0, 5) : [],
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String).slice(0, 5) : [],
      });
      session.turns.push({
        id: createId("turn"),
        participantId: participant.id,
        participantName: participant.name,
        role: "seat",
        kind: "perspective",
        content: String(parsed.message || parsed.stance || "").trim(),
        createdAt: stamp(),
      });
      session.updatedAt = stamp();
      session.logs = appendLog(session, `${participant.name} perspective captured.`);
      await writeBoardroomSession(session);
    }

    const summary = await requestSummary(ai, session, perspectives);
    session.turns.push({
      id: createId("turn"),
      participantId: "system-summary",
      participantName: "Boardroom Summary",
      role: "system",
      kind: "summary",
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
