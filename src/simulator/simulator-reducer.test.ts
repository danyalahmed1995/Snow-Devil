import { describe, expect, it } from "vitest";
import { reconstructState } from "./simulator-reducer";
import type { SimulatorEvent } from "./simulator-types";

function event(overrides: Partial<SimulatorEvent>): SimulatorEvent {
  return {
    id: "partial",
    source: "cache",
    occurredAt: "2026-06-01T00:00:00.000Z",
    repositoryId: "owner/repo",
    repositoryName: "repo",
    repositoryOwner: "owner",
    subjectId: "pull_request-42",
    subjectType: "pull_request",
    subjectTitle: "",
    eventType: "opened",
    metadata: { nativeOrDerived: "derived" },
    sourceCompleteness: "partial",
    ...overrides,
  };
}

describe("reconstructState metadata precedence", () => {
  it("enriches a partial entity with complete PR metadata", () => {
    const state = reconstructState([
      event({}),
      event({
        id: "complete",
        occurredAt: "2026-06-02T00:00:00.000Z",
        subjectNumber: 42,
        subjectTitle: "Keep the real pull request title",
        eventType: "merged",
        sourceCompleteness: "complete",
      }),
    ], "2026-06-03T00:00:00.000Z");

    expect(state.get("pull_request-42")).toMatchObject({
      number: 42,
      title: "Keep the real pull request title",
      stage: "merged",
      sourceCompleteness: "complete",
    });
  });

  it("does not replace complete metadata with a weaker blank event", () => {
    const state = reconstructState([
      event({
        id: "complete",
        subjectNumber: 42,
        subjectTitle: "Authoritative title",
        sourceCompleteness: "complete",
      }),
      event({ id: "weak", occurredAt: "2026-06-02T00:00:00.000Z", eventType: "commented" }),
    ], "2026-06-03T00:00:00.000Z");

    expect(state.get("pull_request-42")?.title).toBe("Authoritative title");
  });
});
