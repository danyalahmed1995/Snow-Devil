import { describe, expect, it } from "vitest";
import { formatEntityTitle, humanizeSimulatorValue } from "./simulator-presentation";
import type { SimulatorEntityState } from "./simulator-types";

describe("simulator presentation", () => {
  it("humanizes internal enum values", () => {
    expect(humanizeSimulatorValue("PULL_REQUESTS")).toBe("Pull requests");
    expect(humanizeSimulatorValue("changes_requested")).toBe("Changes requested");
  });

  it("uses an explicit fallback for genuinely missing titles", () => {
    expect(formatEntityTitle({ subjectType: "pull_request", title: "" } as SimulatorEntityState))
      .toBe("Pull request details unavailable");
  });
});
