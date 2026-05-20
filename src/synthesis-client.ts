import type { TalkConfig } from "./config.js";

export type SynthesisResponse = {
  ok: boolean;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
};

export type SynthesisClientOperations = {
  fetch(url: string, init: RequestInit): Promise<SynthesisResponse>;
};

export async function synthesizeSpokenResponse(options: {
  baseUrl: string;
  text: string;
  config: TalkConfig;
  ops?: SynthesisClientOperations;
}): Promise<ArrayBuffer> {
  const ops = options.ops ?? nodeSynthesisClientOperations;
  const response = await ops.fetch(`${options.baseUrl}/v1/tts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: options.text,
      voice: options.config.speech.voice,
      lang: options.config.speech.language,
      speed: options.config.speech.speed,
      total_steps: options.config.speech.quality,
      response_format: options.config.speech.responseFormat,
    }),
  });

  if (!response.ok) {
    throw new Error(`Supertonic synthesis failed: ${await response.text()}`);
  }

  return response.arrayBuffer();
}

export const nodeSynthesisClientOperations: SynthesisClientOperations = {
  fetch(url, init) {
    return fetch(url, init) as Promise<SynthesisResponse>;
  },
};
