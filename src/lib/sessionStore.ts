import type { InterviewSession } from "./types";

export const SESSION_STORAGE_KEY = "ai-interviewer:sessions:v1";
export const ACTIVE_SESSION_PREFIX = "ai-interviewer:active-session:";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function getBrowserStorage(): StorageLike | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.localStorage;
}

export function readInterviewSessions(storage: StorageLike | undefined = getBrowserStorage()): InterviewSession[] {
  if (!storage) {
    return [];
  }

  const raw = storage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isInterviewSession).sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  } catch {
    return [];
  }
}

export function writeInterviewSessions(
  sessions: InterviewSession[],
  storage: StorageLike | undefined = getBrowserStorage(),
): void {
  if (!storage) {
    return;
  }

  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions));
}

export function saveInterviewSession(
  session: InterviewSession,
  storage: StorageLike | undefined = getBrowserStorage(),
): InterviewSession[] {
  const sessions = readInterviewSessions(storage);
  const existingIndex = sessions.findIndex((candidate) => candidate.id === session.id);

  if (existingIndex >= 0) {
    sessions[existingIndex] = session;
  } else {
    sessions.unshift(session);
  }

  const sortedSessions = sessions.sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  writeInterviewSessions(sortedSessions, storage);
  return sortedSessions;
}

export function getInterviewSession(
  sessionId: string,
  storage: StorageLike | undefined = getBrowserStorage(),
): InterviewSession | undefined {
  return readInterviewSessions(storage).find((session) => session.id === sessionId);
}

export function getActiveSessionId(jobId: string, storage: StorageLike | undefined = getBrowserStorage()): string | undefined {
  return storage?.getItem(`${ACTIVE_SESSION_PREFIX}${jobId}`) ?? undefined;
}

export function setActiveSessionId(
  jobId: string,
  sessionId: string,
  storage: StorageLike | undefined = getBrowserStorage(),
): void {
  storage?.setItem(`${ACTIVE_SESSION_PREFIX}${jobId}`, sessionId);
}

export function clearActiveSessionId(jobId: string, storage: StorageLike | undefined = getBrowserStorage()): void {
  storage?.removeItem(`${ACTIVE_SESSION_PREFIX}${jobId}`);
}

function isInterviewSession(value: unknown): value is InterviewSession {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<InterviewSession>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.jobId === "string" &&
    typeof candidate.startedAt === "string" &&
    (candidate.status === "in_progress" || candidate.status === "completed") &&
    Array.isArray(candidate.turns)
  );
}
