export type MessageLike = {
  role?: string;
  content?: unknown;
};

export type SessionEntryLike = {
  type?: string;
  message?: MessageLike;
};

export function extractSpeakableText(message: MessageLike | undefined): string {
  if (!message || message.role !== "assistant") return "";
  const content = message.content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  return content
    .flatMap((block) => {
      if (!isRecord(block)) return [];
      if (block.type !== "text") return [];
      return typeof block.text === "string" && block.text.trim() ? [block.text.trim()] : [];
    })
    .join("\n\n");
}

export function findPreviousAssistantMessage(entries: SessionEntryLike[]): MessageLike | undefined {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type === "message" && entry.message?.role === "assistant") return entry.message;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
