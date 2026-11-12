import { describe, expect, test } from "bun:test";

const { toModelMessages, toToolSet, toToolChoice } = await import(
  "../lib/openai-protocol"
);

describe("OpenAI message translation", () => {
  test("moves system messages into instructions", () => {
    const { instructions, messages } = toModelMessages([
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "hello" },
    ]);

    expect(instructions).toBe("You are a helpful assistant.");
    expect(messages).toEqual([{ role: "user", content: "hello" }]);
  });

  test("joins multiple system and developer messages", () => {
    const { instructions, messages } = toModelMessages([
      { role: "system", content: "one" },
      { role: "developer", content: "two" },
      { role: "user", content: "hi" },
    ]);

    expect(instructions).toBe("one\n\ntwo");
    expect(messages).toHaveLength(1);
  });

  test("keeps user and assistant turns in order", () => {
    const { instructions, messages } = toModelMessages([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "user", content: "again" },
    ]);

    expect(instructions).toBeUndefined();
    expect(messages).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: [{ type: "text", text: "hello" }] },
      { role: "user", content: "again" },
    ]);
  });

  test("converts assistant tool calls into tool-call parts", () => {
    const { messages } = toModelMessages([
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "bash", arguments: '{"command":"ls"}' },
          },
        ],
      },
    ]);

    expect(messages).toEqual([
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "bash",
            input: { command: "ls" },
          },
        ],
      },
    ]);
  });

  test("converts tool result messages into tool-result parts", () => {
    const { messages } = toModelMessages([
      { role: "tool", tool_call_id: "call_1", name: "bash", content: "file.txt" },
    ]);

    expect(messages).toEqual([
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call_1",
            toolName: "bash",
            output: { type: "text", value: "file.txt" },
          },
        ],
      },
    ]);
  });

  test("keeps malformed tool arguments as a string", () => {
    const { messages } = toModelMessages([
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call_1", type: "function", function: { name: "bash", arguments: "not json" } },
        ],
      },
    ]);

    const assistant = messages[0];
    expect(assistant.content[0].input).toBe("not json");
  });
});

describe("tool definition translation", () => {
  test("passes the client JSON schema through untouched", () => {
    const parameters = {
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"],
    };
    const tools = toToolSet([
      { type: "function", function: { name: "weather", description: "Weather", parameters } },
    ]);

    const weather = tools.weather;
    expect(weather.description).toBe("Weather");
    expect(weather.inputSchema.jsonSchema).toEqual(parameters);
  });

  test("returns undefined when there are no tools", () => {
    expect(toToolSet(undefined)).toBeUndefined();
    expect(toToolSet([])).toBeUndefined();
  });

  test("maps tool choice onto the AI SDK shape", () => {
    expect(toToolChoice("auto")).toBe("auto");
    expect(toToolChoice("none")).toBe("none");
    expect(toToolChoice("required")).toBe("required");
    expect(toToolChoice({ type: "function", function: { name: "weather" } })).toEqual({
      type: "tool",
      toolName: "weather",
    });
    expect(toToolChoice(undefined)).toBeUndefined();
  });
});
