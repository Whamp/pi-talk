import { describe, expect, it } from "vitest";
import { synthesizeSpokenResponse, type SynthesisClientOperations } from "../src/synthesis-client.js";
import { DEFAULT_TALK_CONFIG } from "../src/config.js";

describe("Synthesis client", () => {
  it("calls Supertonic's native Synthesis Endpoint and returns audio", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const audio = new Uint8Array([1, 2, 3]).buffer;
    const ops: SynthesisClientOperations = {
      fetch: async (url, init) => {
        requests.push({ url, init });
        return { ok: true, arrayBuffer: async () => audio, text: async () => "" };
      },
    };

    await expect(
      synthesizeSpokenResponse({
        baseUrl: "http://127.0.0.1:45678",
        text: "Hello from Pi Talk",
        config: DEFAULT_TALK_CONFIG,
        ops,
      }),
    ).resolves.toBe(audio);

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("http://127.0.0.1:45678/v1/tts");
    expect(requests[0].init.method).toBe("POST");
    expect(requests[0].init.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(String(requests[0].init.body))).toEqual({
      text: "Hello from Pi Talk",
      voice: "M1",
      lang: "en",
      speed: 1.05,
      total_steps: 8,
      response_format: "wav",
    });
  });
});
