import { describe, expect, it } from "vitest";
import { createInterviewSession } from "./interviewEngine";
import {
  getInterviewSession,
  readInterviewSessions,
  saveInterviewSession,
  SESSION_STORAGE_KEY,
  type StorageLike,
} from "./sessionStore";

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("session persistence", () => {
  it("saves, updates, and retrieves sessions", () => {
    const storage = new MemoryStorage();
    const session = createInterviewSession("frontend-platform-engineer", new Date("2026-01-01T00:00:00.000Z"));

    saveInterviewSession(session, storage);
    expect(readInterviewSessions(storage)).toHaveLength(1);
    expect(getInterviewSession(session.id, storage)?.jobId).toBe("frontend-platform-engineer");

    saveInterviewSession({ ...session, status: "completed", endedAt: "2026-01-01T00:10:00.000Z" }, storage);
    const sessions = readInterviewSessions(storage);

    expect(sessions).toHaveLength(1);
    expect(sessions[0].status).toBe("completed");
  });

  it("recovers safely from malformed stored data", () => {
    const storage = new MemoryStorage();
    storage.setItem(SESSION_STORAGE_KEY, "not-json");

    expect(readInterviewSessions(storage)).toEqual([]);
  });
});
