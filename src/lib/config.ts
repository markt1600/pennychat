// Centralized environment configuration with sane defaults.

export const config = {
  /** Who this app belongs to — one person, one memory. Penny's app. */
  user: {
    name: "Penny",
    /** Default chat language (en, zh, ja, th, vi, de, ko, fr). */
    language: process.env.CHAT_LANGUAGE || "en",
  },
  anthropic: {
    // Memory rewrites run post-chat, but a fast model keeps costs negligible.
    fastModel: process.env.FAST_MODEL || "claude-haiku-4-5",
  },
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY || "",
    /** The custom Conversational AI agent built for this user. */
    agentId: process.env.ELEVENLABS_AGENT_ID || "",
    /**
     * Optional faster LLM sent as a per-session override (requires the
     * "LLM" override enabled on the agent). Latency is dominated by the
     * agent's LLM choice — see HANDOFF.md.
     */
    fastLlm: process.env.ELEVENLABS_FAST_LLM || "",
    /** HMAC secret for post-call webhooks (memory updates). */
    webhookSecret: process.env.ELEVENLABS_WEBHOOK_SECRET || "",
  },
  /**
   * Optional shared access code. When set, the chat page asks for it once
   * and every API call must carry it — so a public URL doesn't let
   * strangers chat into the memory file. Unset = open (e.g. local dev).
   */
  accessCode: process.env.ACCESS_CODE || "",
  kv: resolveKv(),
};

/**
 * Find Upstash/KV credentials regardless of the env-var prefix chosen when
 * the database was connected to the project. Canonical names are preferred;
 * otherwise any `<PREFIX>..._URL` + matching `..._TOKEN` pair is accepted.
 */
function resolveKv(): { url: string; token: string; source: string } {
  const env = process.env;
  if (env.KV_REST_API_URL && env.KV_REST_API_TOKEN) {
    return { url: env.KV_REST_API_URL, token: env.KV_REST_API_TOKEN, source: "KV_REST_API_URL" };
  }
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    return {
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
      source: "UPSTASH_REDIS_REST_URL",
    };
  }
  for (const key of Object.keys(env)) {
    if (/(REST_API_URL|REDIS_REST_URL)$/.test(key)) {
      const tokenKey = key.replace(/URL$/, "TOKEN");
      const url = env[key];
      const token = env[tokenKey];
      if (url && token && url.startsWith("https://")) {
        return { url, token, source: key };
      }
    }
  }
  return { url: "", token: "", source: "" };
}

export function requireEnv(value: string, name: string): string {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
