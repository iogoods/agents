// src/providers/asterai.provider.ts
import {
  elizaLogger
} from "@elizaos/core";

// src/environment.ts
import { z } from "zod";
var envSchema = z.object({
  ASTERAI_AGENT_ID: z.string().min(1, "ASTERAI_AGENT_ID is required"),
  ASTERAI_PUBLIC_QUERY_KEY: z.string().min(1, "ASTERAI_PUBLIC_QUERY_KEY is required")
});
async function validateAsteraiConfig(runtime) {
  try {
    const config = {
      ASTERAI_AGENT_ID: runtime.getSetting("ASTERAI_AGENT_ID") || process.env.ASTERAI_AGENT_ID,
      ASTERAI_PUBLIC_QUERY_KEY: runtime.getSetting("ASTERAI_PUBLIC_QUERY_KEY") || process.env.ASTERAI_PUBLIC_QUERY_KEY
    };
    return envSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map((err) => `${err.path.join(".")}: ${err.message}`).join("\n");
      throw new Error(
        `Asterai plugin configuration validation failed:
${errorMessages}`
      );
    }
    throw error;
  }
}

// src/providers/asterai.provider.ts
var asteraiProvider = {
  get: async (runtime, message, _state) => {
    const hasConfiguredEnv = !!runtime.getSetting("ASTERAI_AGENT_ID") && !!runtime.getSetting("ASTERAI_PUBLIC_QUERY_KEY");
    if (!hasConfiguredEnv) {
      elizaLogger.error(
        "ASTERAI_AGENT_ID or ASTERAI_PUBLIC_QUERY_KEY not configured, skipping provider"
      );
      return null;
    }
    const config = await validateAsteraiConfig(runtime);
    const asteraiClient2 = getInitAsteraiClient(
      config.ASTERAI_AGENT_ID,
      config.ASTERAI_PUBLIC_QUERY_KEY
    );
    if (!asteraiClient2) {
      elizaLogger.error("asteraiClient is not initialised");
      return null;
    }
    const agentId = runtime.getSetting("ASTERAI_AGENT_ID");
    let agentSummaryMemory = await runtime.knowledgeManager.getMemoryById(agentId);
    if (!agentSummaryMemory) {
      const summary = await asteraiClient2.fetchSummary();
      elizaLogger.debug("asterai agent summary fetched:", summary);
      await runtime.knowledgeManager.createMemory({
        id: agentId,
        userId: message.userId,
        agentId: message.agentId,
        roomId: message.roomId,
        createdAt: Date.now(),
        content: {
          text: summary
        }
      });
      agentSummaryMemory = await runtime.knowledgeManager.getMemoryById(agentId);
    }
    if (!agentSummaryMemory) {
      elizaLogger.error("failed to initialise agent's summary memory");
      return null;
    }
    return agentSummaryMemory.content.text;
  }
};

// src/actions/query.ts
import {
  elizaLogger as elizaLogger2
} from "@elizaos/core";
var queryAction = {
  name: "QUERY_ASTERAI_AGENT",
  similes: [
    "MESSAGE_ASTERAI_AGENT",
    "TALK_TO_ASTERAI_AGENT",
    "SEND_MESSAGE_TO_ASTERAI_AGENT",
    "COMMUNICATE_WITH_ASTERAI_AGENT"
  ],
  description: "Call this action to send a message to the asterai agent which has access to external plugins and functionality to answer the user you are assisting, to help perform a workflow task, etc.",
  validate: async (runtime, _message) => {
    const config = await validateAsteraiConfig(runtime);
    getInitAsteraiClient(
      config.ASTERAI_AGENT_ID,
      config.ASTERAI_PUBLIC_QUERY_KEY
    );
    return true;
  },
  handler: async (runtime, message, _state, _options, callback) => {
    const config = await validateAsteraiConfig(runtime);
    const asteraiClient2 = getInitAsteraiClient(
      config.ASTERAI_AGENT_ID,
      config.ASTERAI_PUBLIC_QUERY_KEY
    );
    elizaLogger2.debug("called QUERY_ASTERAI_AGENT action with message:", message.content);
    const response = await asteraiClient2.query({
      query: message.content.text
    });
    const textResponse = await response.text();
    callback({
      text: textResponse
    });
    return true;
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "How's the weather in LA?"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "Let me check that for you, just a moment.",
          action: "QUERY_ASTERAI_AGENT"
        }
      }
    ]
  ]
};

// src/index.ts
import { AsteraiClient } from "@asterai/client";
var asteraiClient = null;
var getInitAsteraiClient = (agentId, publicQueryKey) => {
  if (!asteraiClient) {
    asteraiClient = new AsteraiClient({
      appId: agentId,
      queryKey: publicQueryKey
    });
  }
  return asteraiClient;
};
var asteraiPlugin = {
  name: "asterai",
  description: "asterai Plugin for Eliza",
  providers: [asteraiProvider],
  actions: [queryAction],
  evaluators: [],
  services: []
};
var index_default = asteraiPlugin;
export {
  asteraiPlugin,
  asteraiProvider,
  index_default as default,
  getInitAsteraiClient,
  validateAsteraiConfig
};
//# sourceMappingURL=index.js.map