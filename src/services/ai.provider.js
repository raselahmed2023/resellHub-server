import {
  XAI_API_KEY,
  XAI_MODEL,
  OPENROUTER_API_KEY,
  OPENROUTER_MODEL,
  CLIENT_URL,
} from "../config/env.js";

const PROVIDERS = [
  {
    name: "Grok",
    endpoint: "https://api.x.ai/v1/chat/completions",
    key: XAI_API_KEY,
    model: XAI_MODEL,
    headers: {},
  },
  {
    name: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    key: OPENROUTER_API_KEY,
    model: OPENROUTER_MODEL,
    headers: {
      "HTTP-Referer": CLIENT_URL,
      "X-Title": "ReSellHub ReSell Guide",
    },
  },
];

const callProvider = async (provider, prompt, parseIntent) => {
  const response = await fetch(provider.endpoint, {
    method: "POST",
    signal: AbortSignal.timeout(20000),
    headers: {
      Authorization: `Bearer ${provider.key}`,
      "Content-Type": "application/json",
      ...provider.headers,
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      stream: false,
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);

    throw new Error(`HTTP ${response.status}: ${detail}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  const rawText =
    typeof content === "string"
      ? content.trim()
      : Array.isArray(content)
        ? content
            .filter((part) => part?.type === "text")
            .map((part) => part.text || "")
            .join("")
            .trim()
        : "";

  if (!rawText) {
    throw new Error("Provider returned an empty response.");
  }

  return parseIntent(rawText);
};

export const getAIIntent = async (prompt, parseIntent) => {
  const configured = PROVIDERS.filter(
    (provider) => provider.key
  );

  if (configured.length === 0) {
    const error = new Error(
      "ReSell Guide is not configured. Add an AI API key on the server."
    );

    error.status = 503;
    throw error;
  }

  for (const provider of configured) {
    try {
      return await callProvider(provider, prompt, parseIntent);
    } catch (error) {
      console.error(
        `${provider.name} AI request failed:`,
        error.message
      );
    }
  }

  const error = new Error(
    "ReSell Guide is temporarily unavailable. Please try again."
  );

  error.status = 502;
  throw error;
};