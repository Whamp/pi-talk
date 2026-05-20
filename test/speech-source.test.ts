import { describe, expect, it } from "vitest";
import { extractSpeakableText, findPreviousAssistantMessage } from "../src/speech-source.js";

describe("Speech source extraction", () => {
  it("extracts visible assistant text blocks only", () => {
    expect(
      extractSpeakableText({
        role: "assistant",
        content: [
          { type: "thinking", text: "hidden reasoning" },
          { type: "text", text: "First visible paragraph." },
          { type: "tool-call", toolName: "bash", input: {} },
          { type: "text", text: "Second visible paragraph." },
        ],
      }),
    ).toBe("First visible paragraph.\n\nSecond visible paragraph.");
  });

  it("finds the previous assistant message from the active session branch", () => {
    const entries = [
      { type: "message", message: { role: "user", content: [{ type: "text", text: "question" }] } },
      { type: "message", message: { role: "assistant", content: [{ type: "text", text: "answer" }] } },
      { type: "message", message: { role: "toolResult", content: [{ type: "text", text: "tool output" }] } },
    ];

    expect(findPreviousAssistantMessage(entries)).toEqual({ role: "assistant", content: [{ type: "text", text: "answer" }] });
  });
});
