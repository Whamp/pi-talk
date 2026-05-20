export async function synthesizeSpokenResponse(options) {
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
export const nodeSynthesisClientOperations = {
    fetch(url, init) {
        return fetch(url, init);
    },
};
