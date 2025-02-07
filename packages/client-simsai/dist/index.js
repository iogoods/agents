// src/jeeter/post.ts
import {
  composeContext,
  generateText,
  getEmbeddingZeroVector as getEmbeddingZeroVector2,
  ModelClass,
  stringToUuid as stringToUuid2,
  elizaLogger as elizaLogger2
} from "@elizaos/core";

// src/jeeter/constants.ts
var DEFAULT_SIMSAI_API_URL = "https://api.jeeter.social/2/";
var DEFAULT_JEETER_API_URL = "https://jeeter.social";
var SIMSAI_API_URL = process.env.SIMSAI_API_URL || DEFAULT_SIMSAI_API_URL;
var JEETER_API_URL = process.env.JEETER_API_URL || DEFAULT_JEETER_API_URL;
var MAX_JEET_LENGTH = 280;
var MIN_INTERVAL = parseInt(process.env.MIN_INTERVAL || "120000", 10);
var MAX_INTERVAL = parseInt(process.env.MAX_INTERVAL || "300000", 10);
var JEETER_SHOULD_RESPOND_BASE = `# INSTRUCTIONS: Determine if {{agentName}} (@{{jeeterUserName}}) should respond to the message and participate in the conversation.

Response options are RESPOND, IGNORE and STOP.

RESPONSE CRITERIA:
- RESPOND if you can add unique value or perspective to the conversation
- RESPOND to direct questions or mentions that warrant engagement
- IGNORE if you would just be repeating others or have nothing unique to add
- IGNORE messages that are irrelevant or where you can't contribute meaningfully
- STOP if the conversation has reached its natural conclusion
- STOP if further interaction would be redundant

{{agentName}} should be conversational but selective, prioritizing quality interactions over quantity.
If there's any doubt about having meaningful value to add, choose IGNORE over RESPOND.

{{recentPosts}}

Thread of Jeets You Are Replying To:
{{formattedConversation}}

Current Post:
{{currentPost}}

# INSTRUCTIONS: Respond with [RESPOND], [IGNORE], or [STOP] based on whether you can make a unique, valuable contribution to this conversation.`;
var JEETER_SEARCH_BASE = `{{timeline}}

{{providers}}

Recent interactions between {{agentName}} and other users:
{{recentPostInteractions}}

About {{agentName}} (@{{jeeterUserName}}):
{{bio}}
{{lore}}
{{topics}}

{{postDirections}}

{{recentPosts}}

# Task: As {{agentName}}, evaluate the post and create a response that builds upon it with your unique expertise and perspective.

Key Requirements:
1. Identify what you can uniquely add based on your expertise
2. Share a specific insight or relevant experience that expands the discussion
3. Build on the core point without repeating it
4. Connect it to your knowledge and experience

AVOID:
- Restating or paraphrasing the original post
- Generic agreement or disagreement
- Surface-level observations

Current Post to Evaluate:
{{currentPost}}`;
var JEETER_INTERACTION_BASE = `{{timeline}}

{{providers}}

Recent interactions between {{agentName}} and other users:
{{recentPostInteractions}}

About {{agentName}} (@{{jeeterUserName}}):
{{bio}}
{{lore}}
{{topics}}

{{postDirections}}

{{recentPosts}}

# Task: Respond as {{agentName}} to this conversation in a way that moves it forward with your unique expertise.

Current Context:
{{currentPost}}

Thread Context:
{{formattedConversation}}

Key Guidelines:
1. Connect this topic to your unique knowledge or experience
2. Share a concrete example or specific insight others haven't mentioned
3. Move the conversation in a productive direction
4. Make a point that hasn't been made yet

Remember:
- Directly address the core topic while expanding it
- Draw from your expertise to provide unique value
- Focus on quality of insight over agreement/disagreement
- Be concise and clear`;
var JEETER_INTERACTION_MESSAGE_COMPLETION_FOOTER = `
Your response MUST be in this JSON format:

\`\`\`json
{
    "text": "your perspective that expands the discussion with new information",
    "action": "CONTINUE" or "END" or "IGNORE",
    "shouldLike": true or false,
    "interactions": [
        {
            "type": "reply" | "rejeet" | "quote" | "none",
            "text": "response that introduces new information or insights"
        }
    ]
}
\`\`\`

For each interaction, ask yourself:
- What new information am I adding?
- How does this expand on the topic?
- What unique perspective am I providing?

FOR REPLIES:
- Must share new information or examples
- Build on the topic, don't just agree/disagree
- Connect to your specific knowledge/experience

FOR QUOTES:
- Must add substantial new context
- Explain why this connects to your expertise
- Expand the discussion in a new direction

FOR REJEETS:
- Only use when you can add expert context
- Include your own analysis or insight
- Make clear why you're amplifying this

FOR LIKES:
- Use when content aligns with your expertise
- No need for additional commentary
- Save for genuinely valuable content

Choose "none" if you can't materially expand the discussion.`;
var JEETER_SEARCH_MESSAGE_COMPLETION_FOOTER = `
Response must be in this JSON format:

\`\`\`json
{
    "text": "your unique insight or perspective that builds on the discussion",
    "action": "CONTINUE" or "END" or "IGNORE",
    "shouldLike": true or false,
    "interactions": [
        {
            "type": "reply" | "rejeet" | "quote" | "none",
            "text": "your response that adds new information or perspective"
        }
    ]
}
\`\`\`

Before responding, ask yourself:
1. What unique perspective can I add from my expertise?
2. What specific example or insight can I share?
3. How does this advance the conversation?

Response Requirements:
- Replies: Must add new information or perspective
- Quotes: Must contribute additional insight
- Rejeets: Only for content where you can add expert context
- Likes: Use for good content that doesn't need expansion

Choose "none" if you cannot add meaningful value to the discussion.`;
var JEETER_POST_TEMPLATE = `{{timeline}}

# Knowledge
{{knowledge}}

About {{agentName}} (@{{jeeterUserName}}):
{{bio}}
{{lore}}
{{postDirections}}

{{providers}}

{{recentPosts}}

{{characterPostExamples}}

# Task: Generate a post in the voice and style of {{agentName}}, aka @{{jeeterUserName}}
Write a single sentence post that is {{adjective}} about {{topic}} (without mentioning {{topic}} directly), from the perspective of {{agentName}}. Try to write something totally different than previous posts. Do not add commentary or acknowledge this request, just write the post.
Your response should not contain any questions. Brief, concise statements only. No emojis. Use \\n\\n (double spaces) between statements.`;

// src/jeeter/utils.ts
import { getEmbeddingZeroVector } from "@elizaos/core";
import { stringToUuid } from "@elizaos/core";
import { elizaLogger } from "@elizaos/core";
var wait = (minTime = 1e3, maxTime = 3e3) => {
  if (minTime > maxTime) {
    [minTime, maxTime] = [maxTime, minTime];
  }
  const waitTime = Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;
  return new Promise((resolve) => setTimeout(resolve, waitTime));
};
async function buildConversationThread(jeet, client) {
  const thread = [];
  const visited = /* @__PURE__ */ new Set();
  if (jeet.conversationId || jeet.id) {
    try {
      elizaLogger.log(
        `Attempting to fetch conversation for jeet ${jeet.id}`
      );
      const conversationId = jeet.conversationId || jeet.id;
      const conversation = await client.simsAIClient.getJeetConversation(conversationId);
      for (const conversationJeet of conversation) {
        await processJeetMemory(conversationJeet, client);
        thread.push(conversationJeet);
      }
      elizaLogger.debug("Conversation context:", {
        totalMessages: thread.length,
        conversationId: jeet.conversationId || jeet.id,
        participants: [
          ...new Set(thread.map((j) => j.agent?.username))
        ],
        threadDepth: thread.length
      });
      return thread.sort((a, b) => {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        return timeA - timeB;
      });
    } catch (error) {
      elizaLogger.error(
        `Error fetching conversation, falling back to recursive method:`,
        error
      );
      thread.length = 0;
    }
  }
  async function processThread(currentJeet, depth = 0) {
    try {
      validateJeet(currentJeet);
      if (visited.has(currentJeet.id)) {
        elizaLogger.debug(`Already visited jeet: ${currentJeet.id}`);
        return;
      }
      await processJeetMemory(currentJeet, client);
      visited.add(currentJeet.id);
      thread.unshift(currentJeet);
      elizaLogger.debug("Thread state:", {
        length: thread.length,
        currentDepth: depth,
        jeetId: currentJeet.id
      });
      if (currentJeet.inReplyToStatusId) {
        try {
          const parentJeet = await client.simsAIClient.getJeet(
            currentJeet.inReplyToStatusId
          );
          if (parentJeet) {
            await processThread(parentJeet, depth + 1);
          }
        } catch (error) {
          elizaLogger.error(
            `Error processing parent jeet ${currentJeet.inReplyToStatusId}:`,
            error
          );
        }
      }
    } catch (error) {
      elizaLogger.error(
        `Error in processThread for jeet ${currentJeet.id}:`,
        error
      );
      if (error instanceof Error) {
        elizaLogger.error("Error details:", {
          message: error.message,
          stack: error.stack
        });
      }
    }
  }
  await processThread(jeet, 0);
  elizaLogger.debug("Final thread built:", {
    totalJeets: thread.length,
    jeetIds: thread.map((t) => ({
      id: t.id,
      text: t.text?.slice(0, 50)
    }))
  });
  return thread;
}
function validateJeet(jeet) {
  if (typeof jeet.id !== "string") {
    elizaLogger.error("Jeet ID is not a string:", jeet.id);
    throw new TypeError("Jeet ID must be a string");
  }
  if (typeof jeet.agentId !== "string") {
    elizaLogger.error("Agent ID is not a string:", jeet.agentId);
    throw new TypeError("Agent ID must be a string");
  }
  if (jeet.conversationId && typeof jeet.conversationId !== "string") {
    elizaLogger.error(
      "Conversation ID is not a string:",
      jeet.conversationId
    );
    throw new TypeError("Conversation ID must be a string");
  }
}
async function processJeetMemory(jeet, client) {
  const roomId = stringToUuid(
    `${jeet.conversationId || jeet.id}-${client.runtime.agentId}`
  );
  const userId = stringToUuid(jeet.agentId);
  if (jeet.agent) {
    await client.runtime.ensureConnection(
      userId,
      roomId,
      jeet.agent.username,
      jeet.agent.name,
      "jeeter"
    );
  }
  const existingMemory = await client.runtime.messageManager.getMemoryById(
    stringToUuid(jeet.id + "-" + client.runtime.agentId)
  );
  if (!existingMemory) {
    await client.runtime.messageManager.createMemory({
      id: stringToUuid(jeet.id + "-" + client.runtime.agentId),
      agentId: client.runtime.agentId,
      content: {
        text: jeet.text || "",
        source: "jeeter",
        url: jeet.permanentUrl,
        inReplyTo: jeet.inReplyToStatusId ? stringToUuid(
          jeet.inReplyToStatusId + "-" + client.runtime.agentId
        ) : void 0
      },
      createdAt: jeet.createdAt ? new Date(jeet.createdAt).getTime() : jeet.timestamp ? jeet.timestamp * 1e3 : Date.now(),
      roomId,
      userId,
      embedding: getEmbeddingZeroVector()
    });
  }
}
async function sendJeet(client, content, roomId, jeetUsername, inReplyToJeetId) {
  const jeetChunks = splitJeetContent(content.text);
  const sentJeets = [];
  let currentReplyToId = inReplyToJeetId;
  for (const chunk of jeetChunks) {
    const response = await client.requestQueue.add(async () => {
      try {
        const result = await client.simsAIClient.postJeet(
          chunk.trim(),
          currentReplyToId
          // Use currentReplyToId for the chain
        );
        return result;
      } catch (error) {
        elizaLogger.error(`Failed to post jeet chunk:`, error);
        throw error;
      }
    });
    if (!response?.data?.id) {
      throw new Error(
        `Failed to get valid response from postJeet: ${JSON.stringify(response)}`
      );
    }
    const author = response.includes.users.find(
      (user) => user.id === response.data.author_id
    );
    const finalJeet = {
      id: response.data.id,
      text: response.data.text,
      createdAt: response.data.created_at,
      agentId: response.data.author_id,
      agent: author,
      type: response.data.type,
      public_metrics: response.data.public_metrics,
      permanentUrl: `${SIMSAI_API_URL}/${jeetUsername}/status/${response.data.id}`,
      inReplyToStatusId: currentReplyToId,
      // Track reply chain
      hashtags: [],
      mentions: [],
      photos: [],
      thread: [],
      urls: [],
      videos: [],
      media: []
    };
    sentJeets.push(finalJeet);
    currentReplyToId = finalJeet.id;
    await wait(1e3, 2e3);
  }
  const memories = sentJeets.map((jeet, index) => ({
    id: stringToUuid(jeet.id + "-" + client.runtime.agentId),
    agentId: client.runtime.agentId,
    userId: client.runtime.agentId,
    content: {
      text: jeet.text,
      source: "jeeter",
      url: jeet.permanentUrl,
      inReplyTo: index === 0 ? inReplyToJeetId ? stringToUuid(
        inReplyToJeetId + "-" + client.runtime.agentId
      ) : void 0 : stringToUuid(
        sentJeets[index - 1].id + "-" + client.runtime.agentId
      )
    },
    roomId,
    embedding: getEmbeddingZeroVector(),
    createdAt: jeet.createdAt ? new Date(jeet.createdAt).getTime() : Date.now()
  }));
  return memories;
}
function splitJeetContent(content) {
  const maxLength = MAX_JEET_LENGTH;
  const paragraphs = content.split("\n\n").map((p) => p.trim());
  const jeets = [];
  let currentJeet = "";
  for (const paragraph of paragraphs) {
    if (!paragraph) continue;
    if ((currentJeet + "\n\n" + paragraph).trim().length <= maxLength) {
      currentJeet = currentJeet ? currentJeet + "\n\n" + paragraph : paragraph;
    } else {
      if (currentJeet) {
        jeets.push(currentJeet.trim());
      }
      if (paragraph.length <= maxLength) {
        currentJeet = paragraph;
      } else {
        const chunks = splitParagraph(paragraph, maxLength);
        jeets.push(...chunks.slice(0, -1));
        currentJeet = chunks[chunks.length - 1];
      }
    }
  }
  if (currentJeet) {
    jeets.push(currentJeet.trim());
  }
  return jeets;
}
function splitParagraph(paragraph, maxLength) {
  const sentences = paragraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [paragraph];
  const chunks = [];
  let currentChunk = "";
  for (const sentence of sentences) {
    if ((currentChunk + " " + sentence).trim().length <= maxLength) {
      currentChunk = currentChunk ? currentChunk + " " + sentence : sentence;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      if (sentence.length <= maxLength) {
        currentChunk = sentence;
      } else {
        const words = sentence.split(" ");
        currentChunk = "";
        for (const word of words) {
          if ((currentChunk + " " + word).trim().length <= maxLength) {
            currentChunk = currentChunk ? currentChunk + " " + word : word;
          } else {
            if (currentChunk) {
              chunks.push(currentChunk.trim());
            }
            currentChunk = word;
          }
        }
      }
    }
  }
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }
  return chunks;
}
function truncateToCompleteSentence(text, maxLength) {
  if (maxLength < 3) {
    throw new Error("maxLength must be at least 3");
  }
  if (text.length <= maxLength) {
    return text;
  }
  const lastPeriodIndex = text.lastIndexOf(".", maxLength);
  if (lastPeriodIndex !== -1) {
    const truncatedAtPeriod = text.slice(0, lastPeriodIndex + 1).trim();
    if (truncatedAtPeriod.length > 0) {
      return truncatedAtPeriod;
    }
  }
  const lastSpaceIndex = text.lastIndexOf(" ", maxLength);
  if (lastSpaceIndex !== -1) {
    const truncatedAtSpace = text.slice(0, lastSpaceIndex).trim();
    if (truncatedAtSpace.length > 0) {
      return truncatedAtSpace + "...";
    }
  }
  return text.slice(0, maxLength - 3).trim() + "...";
}

// src/jeeter/post.ts
var JeeterPostClient = class {
  client;
  runtime;
  isRunning = false;
  timeoutHandle;
  constructor(client, runtime) {
    this.client = client;
    this.runtime = runtime;
  }
  async start(postImmediately = false) {
    if (this.isRunning) {
      elizaLogger2.warn("JeeterPostClient is already running");
      return;
    }
    this.isRunning = true;
    if (!this.client.profile) {
      await this.client.init();
    }
    const generateNewJeetLoop = async () => {
      if (!this.isRunning) {
        elizaLogger2.log("JeeterPostClient has been stopped");
        return;
      }
      try {
        const lastPost = await this.runtime.cacheManager.get(`jeeter/${this.client.profile.username}/lastPost`);
        const lastPostTimestamp = lastPost?.timestamp ?? 0;
        const minMinutes = parseInt(this.runtime.getSetting("POST_INTERVAL_MIN")) || 90;
        const maxMinutes = parseInt(this.runtime.getSetting("POST_INTERVAL_MAX")) || 180;
        const randomMinutes = Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes;
        const targetInterval = randomMinutes * 60 * 1e3;
        const timeElapsed = Date.now() - lastPostTimestamp;
        const delay = Math.max(0, targetInterval - timeElapsed);
        if (timeElapsed >= targetInterval) {
          await this.generateNewJeet();
          if (this.isRunning) {
            this.timeoutHandle = setTimeout(() => {
              generateNewJeetLoop();
            }, targetInterval);
            elizaLogger2.log(
              `Next jeet scheduled in ${randomMinutes} minutes`
            );
          }
        } else {
          if (this.isRunning) {
            this.timeoutHandle = setTimeout(() => {
              generateNewJeetLoop();
            }, delay);
            elizaLogger2.log(
              `Next jeet scheduled in ${Math.round(delay / 6e4)} minutes`
            );
          }
        }
      } catch (error) {
        elizaLogger2.error("Error in generateNewJeetLoop:", error);
        if (this.isRunning) {
          this.timeoutHandle = setTimeout(
            () => {
              generateNewJeetLoop();
            },
            5 * 60 * 1e3
          );
        }
      }
    };
    if (postImmediately) {
      await this.generateNewJeet();
    }
    generateNewJeetLoop();
  }
  async stop() {
    elizaLogger2.log("Stopping JeeterPostClient...");
    this.isRunning = false;
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = void 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 1e3));
    elizaLogger2.log("JeeterPostClient stopped successfully");
  }
  async getHomeTimeline() {
    const cachedTimeline = await this.client.getCachedTimeline();
    if (cachedTimeline) {
      return cachedTimeline;
    }
    const homeTimeline = await this.client.fetchHomeTimeline(50);
    await this.client.cacheTimeline(homeTimeline);
    return homeTimeline;
  }
  formatHomeTimeline(homeTimeline) {
    return `# ${this.runtime.character.name}'s Home Timeline

` + homeTimeline.map((jeet) => {
      const timestamp = jeet.createdAt ? new Date(jeet.createdAt).toDateString() : (/* @__PURE__ */ new Date()).toDateString();
      return `#${jeet.id}
${jeet.agent?.name || "Unknown"} (@${jeet.agent?.username || "Unknown"})${jeet.inReplyToStatusId ? `
In reply to: ${jeet.inReplyToStatusId}` : ""}
${timestamp}

${jeet.text}
---
`;
    }).join("\n");
  }
  async generateJeetContent() {
    const topics = this.runtime.character.topics.join(", ");
    const homeTimeline = await this.getHomeTimeline();
    const formattedHomeTimeline = this.formatHomeTimeline(homeTimeline);
    const state = await this.runtime.composeState(
      {
        userId: this.runtime.agentId,
        roomId: stringToUuid2("SIMSAI_generate_room"),
        agentId: this.runtime.agentId,
        content: {
          text: topics,
          action: ""
        }
      },
      {
        jeeterUserName: this.client.profile.username,
        timeline: formattedHomeTimeline
      }
    );
    const context = composeContext({
      state,
      template: this.runtime.character.templates?.jeeterPostTemplate || JEETER_POST_TEMPLATE
    });
    elizaLogger2.debug("generate post prompt:\n" + context);
    const newJeetContent = await generateText({
      runtime: this.runtime,
      context,
      modelClass: ModelClass.SMALL
    });
    const formattedJeet = newJeetContent.replace(/\\n/g, "\n").trim();
    return truncateToCompleteSentence(formattedJeet, MAX_JEET_LENGTH);
  }
  async createMemoryForJeet(jeet, content) {
    const roomId = stringToUuid2(jeet.id + "-" + this.runtime.agentId);
    await this.runtime.ensureRoomExists(roomId);
    await this.runtime.ensureParticipantInRoom(
      this.runtime.agentId,
      roomId
    );
    await this.runtime.messageManager.createMemory({
      id: stringToUuid2(jeet.id + "-" + this.runtime.agentId),
      userId: this.runtime.agentId,
      agentId: this.runtime.agentId,
      content: {
        text: content,
        url: jeet.permanentUrl,
        source: "jeeter"
      },
      roomId,
      embedding: getEmbeddingZeroVector2(),
      createdAt: new Date(jeet.createdAt).getTime()
    });
  }
  async postJeet(content) {
    const response = await this.client.requestQueue.add(async () => {
      const result = await this.client.simsAIClient.postJeet(content);
      return result;
    });
    if (!response?.data?.id) {
      throw new Error(
        `Failed to get valid response from postJeet: ${JSON.stringify(response)}`
      );
    }
    elizaLogger2.log(`Jeet posted with ID: ${response.data.id}`);
    const author = response.includes.users.find(
      (user) => user.id === response.data.author_id
    );
    return {
      id: response.data.id,
      text: response.data.text,
      createdAt: response.data.created_at,
      agentId: response.data.author_id,
      agent: author,
      permanentUrl: `${JEETER_API_URL}/${this.client.profile.username}/status/${response.data.id}`,
      public_metrics: response.data.public_metrics,
      hashtags: [],
      mentions: [],
      photos: [],
      thread: [],
      urls: [],
      videos: [],
      media: [],
      type: response.data.type
    };
  }
  async generateNewJeet() {
    if (!this.isRunning) {
      elizaLogger2.log("Skipping jeet generation - client is stopped");
      return;
    }
    elizaLogger2.log("Generating new jeet");
    try {
      await this.runtime.ensureUserExists(
        this.runtime.agentId,
        this.client.profile.username,
        this.runtime.character.name,
        "jeeter"
      );
      const content = await this.generateJeetContent();
      const dryRun = (this.runtime.getSetting("SIMSAI_DRY_RUN") || "false").toLowerCase();
      if (dryRun === "true" || dryRun === "1") {
        elizaLogger2.info(`Dry run: would have posted jeet: ${content}`);
        return;
      }
      try {
        if (!this.isRunning) {
          elizaLogger2.log(
            "Skipping jeet posting - client is stopped"
          );
          return;
        }
        elizaLogger2.log(`Posting new jeet:
 ${content}`);
        const jeet = await this.postJeet(content);
        await this.runtime.cacheManager.set(
          `jeeter/${this.client.profile.username}/lastPost`,
          {
            id: jeet.id,
            timestamp: Date.now()
          }
        );
        await this.client.cacheJeet(jeet);
        const homeTimeline = await this.getHomeTimeline();
        homeTimeline.push(jeet);
        await this.client.cacheTimeline(homeTimeline);
        elizaLogger2.log(`Jeet posted at: ${jeet.permanentUrl}`);
        await this.createMemoryForJeet(jeet, content);
      } catch (error) {
        elizaLogger2.error("Error sending jeet:", error);
        if (error instanceof Error) {
          elizaLogger2.error("Error details:", {
            message: error.message,
            stack: error.stack
          });
        }
        throw error;
      }
    } catch (error) {
      elizaLogger2.error("Error generating new jeet:", error);
      if (error instanceof Error) {
        elizaLogger2.error("Error details:", {
          message: error.message,
          stack: error.stack
        });
      }
    }
  }
};

// src/jeeter/search.ts
import {
  composeContext as composeContext2,
  elizaLogger as elizaLogger3,
  generateMessageResponse,
  generateText as generateText2,
  ModelClass as ModelClass2,
  ServiceType,
  stringToUuid as stringToUuid3
} from "@elizaos/core";
var jeeterSearchTemplate = JEETER_SEARCH_BASE + JEETER_SEARCH_MESSAGE_COMPLETION_FOOTER;
var JeeterSearchClient = class {
  constructor(client, runtime) {
    this.client = client;
    this.runtime = runtime;
  }
  repliedJeets = /* @__PURE__ */ new Set();
  likedJeets = /* @__PURE__ */ new Set();
  rejeetedJeets = /* @__PURE__ */ new Set();
  quotedJeets = /* @__PURE__ */ new Set();
  isRunning = false;
  timeoutHandle;
  async hasInteracted(jeetId, type) {
    switch (type) {
      case "reply":
        return this.repliedJeets.has(jeetId);
      case "like":
        return this.likedJeets.has(jeetId);
      case "rejeet":
        return this.rejeetedJeets.has(jeetId);
      case "quote":
        return this.quotedJeets.has(jeetId);
      default:
        return false;
    }
  }
  recordInteraction(jeetId, type) {
    switch (type) {
      case "reply":
        this.repliedJeets.add(jeetId);
        break;
      case "like":
        this.likedJeets.add(jeetId);
        break;
      case "rejeet":
        this.rejeetedJeets.add(jeetId);
        break;
      case "quote":
        this.quotedJeets.add(jeetId);
        break;
    }
  }
  async start() {
    if (this.isRunning) {
      elizaLogger3.warn("JeeterSearchClient is already running");
      return;
    }
    this.isRunning = true;
    elizaLogger3.log("Starting JeeterSearchClient");
    const handleJeeterInteractionsLoop = async () => {
      if (!this.isRunning) {
        elizaLogger3.log("JeeterSearchClient has been stopped");
        return;
      }
      try {
        await this.engageWithSearchTerms();
      } catch (error) {
        elizaLogger3.error("Error in engagement loop:", error);
      }
      if (this.isRunning) {
        this.timeoutHandle = setTimeout(
          handleJeeterInteractionsLoop,
          Math.floor(
            Math.random() * (MAX_INTERVAL - MIN_INTERVAL + 1)
          ) + MIN_INTERVAL
        );
      }
    };
    handleJeeterInteractionsLoop();
  }
  async stop() {
    elizaLogger3.log("Stopping JeeterSearchClient...");
    this.isRunning = false;
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = void 0;
    }
    this.repliedJeets.clear();
    this.likedJeets.clear();
    this.rejeetedJeets.clear();
    this.quotedJeets.clear();
    await new Promise((resolve) => setTimeout(resolve, 1e3));
    elizaLogger3.log("JeeterSearchClient stopped successfully");
  }
  async engageWithSearchTerms() {
    if (!this.isRunning) {
      elizaLogger3.log(
        "Skipping search terms engagement - client is stopped"
      );
      return;
    }
    elizaLogger3.log("Engaging with search terms");
    try {
      if (!this.runtime.character.topics?.length) {
        elizaLogger3.log("No topics available for search");
        return;
      }
      const searchTerm = [...this.runtime.character.topics][Math.floor(Math.random() * this.runtime.character.topics.length)];
      elizaLogger3.log("Fetching search jeets");
      await wait(5e3);
      let searchResponse = { jeets: [] };
      try {
        searchResponse = await this.client.simsAIClient.searchJeets(
          searchTerm,
          20
        );
        if (!searchResponse?.jeets?.length) {
          elizaLogger3.log(
            `No jeets found for search term: "${searchTerm}"`
          );
        }
      } catch (error) {
        elizaLogger3.error("Error fetching search jeets:", error);
      }
      if (!this.isRunning) return;
      const discoveryTimeline = await this.client.simsAIClient.getDiscoveryTimeline(50);
      if (!discoveryTimeline) {
        elizaLogger3.log("No discovery timeline available");
        return;
      }
      await this.client.cacheTimeline(discoveryTimeline.jeets || []);
      const formattedTimeline = this.formatDiscoveryTimeline(
        discoveryTimeline.jeets || []
      );
      const jeetsToProcess = (searchResponse.jeets?.length ?? 0) > 0 ? searchResponse.jeets : discoveryTimeline.jeets || [];
      if (!this.isRunning) return;
      elizaLogger3.log("Ranking jeets for engagement");
      const rankedJeets = await this.filterAndRankJeets(jeetsToProcess);
      if (rankedJeets.length === 0) {
        elizaLogger3.log("No valid jeets found for processing");
        return;
      }
      elizaLogger3.log(
        `Found ${rankedJeets.length} ranked jeets to consider`
      );
      const prompt = this.generateSelectionPrompt(
        rankedJeets,
        searchTerm
      );
      if (!this.isRunning) return;
      const mostInterestingJeetResponse = await generateText2({
        runtime: this.runtime,
        context: prompt,
        modelClass: ModelClass2.SMALL
      });
      const jeetId = mostInterestingJeetResponse.trim();
      const selectedJeet = rankedJeets.find(
        (jeet) => jeet.id.toString().includes(jeetId) || jeetId.includes(jeet.id.toString())
      );
      if (!selectedJeet) {
        elizaLogger3.log("No matching jeet found for ID:", jeetId);
        return;
      }
      if (!this.isRunning) return;
      elizaLogger3.log(`Selected jeet ${selectedJeet.id} for interaction`);
      const previousInteractions = {
        replied: await this.hasInteracted(selectedJeet.id, "reply"),
        liked: await this.hasInteracted(selectedJeet.id, "like"),
        rejeeted: await this.hasInteracted(selectedJeet.id, "rejeet"),
        quoted: await this.hasInteracted(selectedJeet.id, "quote")
      };
      if (Object.values(previousInteractions).some((v) => v)) {
        elizaLogger3.log(
          `Already interacted with jeet ${selectedJeet.id}, skipping`
        );
        return;
      }
      if (!this.isRunning) return;
      await this.processSelectedJeet(
        selectedJeet,
        formattedTimeline,
        previousInteractions
      );
    } catch (error) {
      elizaLogger3.error("Error engaging with search terms:", error);
      if (error instanceof Error && error.stack) {
        elizaLogger3.error("Stack trace:", error.stack);
      }
    }
  }
  formatDiscoveryTimeline(jeets) {
    if (!jeets?.length)
      return `# ${this.runtime.character.name}'s Home Timeline

No jeets available`;
    return `# ${this.runtime.character.name}'s Home Timeline

` + jeets.map((jeet) => {
      return `ID: ${jeet.id}
From: ${jeet.agent?.name || "Unknown"} (@${jeet.agent?.username || "Unknown"})
Text: ${jeet.text}
---`;
    }).join("\n\n");
  }
  generateSelectionPrompt(jeets, searchTerm) {
    return `
    Here are some jeets related to "${searchTerm}". As ${this.runtime.character.name}, you're looking for jeets that would benefit from your engagement and expertise.

    ${jeets.map(
      (jeet) => `
    ID: ${jeet.id}
    From: ${jeet.agent?.name || "Unknown"} (@${jeet.agent?.username || "Unknown"})
    Text: ${jeet.text}
    Metrics: ${JSON.stringify(jeet.public_metrics || {})}`
    ).join("\n---\n")}

    Which jeet would be most valuable to respond to as ${this.runtime.character.name}? Consider:
    - Posts that raise questions or points you can meaningfully contribute to
    - Posts that align with your expertise
    - Posts that could start a productive discussion
    - Posts in English without excessive hashtags/links
    - Avoid already heavily discussed posts or simple announcements
    - Avoid rejeets when possible

    Please ONLY respond with the ID of the single most promising jeet to engage with.`;
  }
  scoreJeetForEngagement(jeet) {
    let score = 0;
    if (jeet.public_metrics?.reply_count < 3) score += 3;
    else if (jeet.public_metrics?.reply_count < 5) score += 1;
    if (jeet.public_metrics?.rejeet_count > 10) score -= 2;
    if (jeet.public_metrics?.quote_count > 5) score -= 1;
    if (jeet.isRejeet) score -= 3;
    const hashtagCount = (jeet.text?.match(/#/g) || []).length;
    const urlCount = (jeet.text?.match(/https?:\/\//g) || []).length;
    score -= hashtagCount + urlCount;
    const textLength = jeet.text?.length || 0;
    if (textLength > 50 && textLength < 200) score += 2;
    if (jeet.text?.includes("?")) score += 2;
    const discussionWords = [
      "thoughts",
      "opinion",
      "what if",
      "how about",
      "discuss"
    ];
    if (discussionWords.some(
      (word) => jeet.text?.toLowerCase().includes(word)
    ))
      score += 2;
    return score;
  }
  async filterAndRankJeets(jeets) {
    if (!this.isRunning) return [];
    const basicValidJeets = jeets.filter(
      (jeet) => jeet?.text && jeet.agent?.username !== this.runtime.getSetting("SIMSAI_USERNAME")
    );
    const validJeets = [];
    for (const jeet of basicValidJeets) {
      if (!this.isRunning) return [];
      const hasReplied = await this.hasInteracted(jeet.id, "reply");
      const hasLiked = await this.hasInteracted(jeet.id, "like");
      const hasRejeeted = await this.hasInteracted(jeet.id, "rejeet");
      const hasQuoted = await this.hasInteracted(jeet.id, "quote");
      if (!hasReplied && !hasLiked && !hasRejeeted && !hasQuoted) {
        validJeets.push(jeet);
      }
    }
    const scoredJeets = validJeets.map((jeet) => ({
      jeet,
      score: this.scoreJeetForEngagement(jeet)
    })).sort((a, b) => b.score - a.score);
    const topJeets = scoredJeets.slice(0, 20).map(({ jeet }, index) => ({
      jeet,
      randomScore: Math.random() * 0.3 + (1 - index / 20)
    })).sort((a, b) => b.randomScore - a.randomScore);
    return topJeets.map(({ jeet }) => jeet);
  }
  async processSelectedJeet(selectedJeet, formattedTimeline, previousInteractions) {
    if (!this.isRunning) return;
    if (this.runtime.getSetting("SIMSAI_DRY_RUN") === "true") {
      elizaLogger3.info(
        `Dry run: would have processed jeet: ${selectedJeet.id}`
      );
      return;
    }
    const roomId = stringToUuid3(
      `${selectedJeet.conversationId || selectedJeet.id}-${this.runtime.agentId}`
    );
    const userIdUUID = stringToUuid3(selectedJeet.agentId);
    await this.runtime.ensureConnection(
      userIdUUID,
      roomId,
      selectedJeet.agent?.username || "",
      selectedJeet.agent?.name || "",
      "jeeter"
    );
    if (!this.isRunning) return;
    const thread = await buildConversationThread(selectedJeet, this.client);
    elizaLogger3.log(
      `Retrieved conversation thread with ${thread.length} messages:`,
      {
        messages: thread.map((t) => ({
          id: t.id,
          username: t.agent?.username,
          text: t.text?.slice(0, 50) + (t.text?.length > 50 ? "..." : ""),
          timestamp: t.createdAt
        }))
      }
    );
    const sortedThread = thread.sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeA - timeB;
    });
    if (!this.isRunning) return;
    const formattedConversation = sortedThread.map((j, index) => {
      const timestamp = j.createdAt ? new Date(j.createdAt).getTime() : Date.now();
      const isCurrentJeet = j.id === selectedJeet.id;
      const arrow = index > 0 ? "\u21AA " : "";
      return `[${new Date(timestamp).toLocaleString()}] ${arrow}@${j.agent?.username || "unknown"}${isCurrentJeet ? " (current message)" : ""}: ${j.text}`;
    }).join("\n\n");
    elizaLogger3.log("Conversation context:", {
      originalJeet: selectedJeet.id,
      totalMessages: thread.length,
      participants: [...new Set(thread.map((j) => j.agent?.username))],
      timespan: thread.length > 1 ? {
        first: new Date(
          Math.min(
            ...thread.map(
              (j) => new Date(j.createdAt || 0).getTime()
            )
          )
        ),
        last: new Date(
          Math.max(
            ...thread.map(
              (j) => new Date(j.createdAt || 0).getTime()
            )
          )
        )
      } : null
    });
    const message = {
      id: stringToUuid3(selectedJeet.id + "-" + this.runtime.agentId),
      agentId: this.runtime.agentId,
      content: {
        text: selectedJeet.text,
        inReplyTo: void 0
      },
      userId: userIdUUID,
      roomId,
      createdAt: selectedJeet.createdAt ? new Date(selectedJeet.createdAt).getTime() : Date.now()
    };
    if (!message.content.text) {
      return { text: "", action: "IGNORE" };
    }
    if (!this.isRunning) return;
    await this.handleJeetInteractions(
      message,
      selectedJeet,
      formattedTimeline,
      previousInteractions,
      formattedConversation,
      thread
    );
  }
  async handleJeetInteractions(message, selectedJeet, formattedTimeline, previousInteractions, formattedConversation, thread) {
    if (!this.isRunning) return;
    try {
      elizaLogger3.log(`Composing state for jeet ${selectedJeet.id}`);
      let state = await this.runtime.composeState(message, {
        jeeterClient: this.client,
        jeeterUserName: this.runtime.getSetting("SIMSAI_USERNAME"),
        timeline: formattedTimeline,
        jeetContext: await this.buildJeetContext(selectedJeet),
        formattedConversation,
        conversationContext: {
          messageCount: thread.length,
          participants: [
            ...new Set(thread.map((j) => j.agent?.username))
          ],
          timespan: thread.length > 1 ? {
            start: new Date(
              Math.min(
                ...thread.map(
                  (j) => new Date(
                    j.createdAt || 0
                  ).getTime()
                )
              )
            ).toISOString(),
            end: new Date(
              Math.max(
                ...thread.map(
                  (j) => new Date(
                    j.createdAt || 0
                  ).getTime()
                )
              )
            ).toISOString()
          } : null
        },
        previousInteractions
      });
      if (!this.isRunning) return;
      elizaLogger3.log(
        `Saving request message for jeet ${selectedJeet.id}`
      );
      await this.client.saveRequestMessage(message, state);
      const context = composeContext2({
        state,
        template: this.runtime.character.templates?.jeeterSearchTemplate || jeeterSearchTemplate
      });
      if (!this.isRunning) return;
      elizaLogger3.log(
        `Generating message response for jeet ${selectedJeet.id}`
      );
      const rawResponse = await generateMessageResponse({
        runtime: this.runtime,
        context,
        modelClass: ModelClass2.SMALL
      });
      elizaLogger3.debug("Raw response:", rawResponse);
      const response = {
        text: rawResponse.text,
        action: rawResponse.action,
        shouldLike: rawResponse.shouldLike,
        interactions: rawResponse.interactions || []
      };
      if (!response.interactions) {
        throw new TypeError("Response interactions are undefined");
      }
      if (!this.isRunning) return;
      if (response.interactions.length > 0) {
        for (const interaction of response.interactions) {
          if (!this.isRunning) return;
          try {
            if (interaction.type === "reply" && previousInteractions.replied || interaction.type === "rejeet" && previousInteractions.rejeeted || interaction.type === "quote" && previousInteractions.quoted || interaction.type === "like" && previousInteractions.liked) {
              elizaLogger3.log(
                `Skipping ${interaction.type} for jeet ${selectedJeet.id} - already performed`
              );
              continue;
            }
            elizaLogger3.log(
              `Attempting ${interaction.type} interaction for jeet ${selectedJeet.id}`
            );
            switch (interaction.type) {
              case "rejeet":
                try {
                  if (!this.isRunning) return;
                  const rejeetResult = await this.client.simsAIClient.rejeetJeet(
                    selectedJeet.id
                  );
                  if (rejeetResult?.id) {
                    elizaLogger3.log(
                      `Rejeeted jeet ${selectedJeet.id}`
                    );
                    this.recordInteraction(
                      selectedJeet.id,
                      "rejeet"
                    );
                  } else {
                    elizaLogger3.error(
                      `Failed to rejeet jeet ${selectedJeet.id}:`,
                      rejeetResult
                    );
                  }
                } catch (error) {
                  elizaLogger3.error(
                    `Error processing rejeet for jeet ${selectedJeet.id}:`,
                    error
                  );
                }
                break;
              case "quote":
                if (interaction.text) {
                  if (!this.isRunning) return;
                  await this.client.simsAIClient.quoteRejeet(
                    selectedJeet.id,
                    interaction.text
                  );
                  elizaLogger3.log(
                    `Quote rejeeted jeet ${selectedJeet.id}`
                  );
                  this.recordInteraction(
                    selectedJeet.id,
                    "quote"
                  );
                }
                break;
              case "reply":
                if (interaction.text) {
                  if (!this.isRunning) return;
                  const replyResponse = {
                    ...response,
                    text: interaction.text
                  };
                  const responseMessages = await sendJeet(
                    this.client,
                    replyResponse,
                    message.roomId,
                    this.client.profile.username,
                    selectedJeet.id
                  );
                  state = await this.runtime.updateRecentMessageState(
                    state
                  );
                  for (const [
                    idx,
                    responseMessage
                  ] of responseMessages.entries()) {
                    if (!this.isRunning) return;
                    responseMessage.content.action = idx === responseMessages.length - 1 ? response.action : "CONTINUE";
                    await this.runtime.messageManager.createMemory(
                      responseMessage
                    );
                  }
                  await this.runtime.evaluate(message, state);
                  await this.runtime.processActions(
                    message,
                    responseMessages,
                    state
                  );
                  this.recordInteraction(
                    selectedJeet.id,
                    "reply"
                  );
                }
                break;
              case "like":
                try {
                  if (!this.isRunning) return;
                  await this.client.simsAIClient.likeJeet(
                    selectedJeet.id
                  );
                  elizaLogger3.log(
                    `Liked jeet ${selectedJeet.id}`
                  );
                  this.recordInteraction(
                    selectedJeet.id,
                    "like"
                  );
                } catch (error) {
                  elizaLogger3.error(
                    `Error liking jeet ${selectedJeet.id}:`,
                    error
                  );
                }
                break;
              case "none":
                elizaLogger3.log(
                  `Chose not to interact with jeet ${selectedJeet.id}`
                );
                break;
            }
            elizaLogger3.log(
              `Successfully performed ${interaction.type} interaction for jeet ${selectedJeet.id}`
            );
          } catch (error) {
            elizaLogger3.error(
              `Error processing interaction ${interaction.type} for jeet ${selectedJeet.id}:`,
              error
            );
          }
        }
      }
      if (!this.isRunning) return;
      const responseInfo = `Context:

${context}

Selected Post: ${selectedJeet.id} - @${selectedJeet.agent?.username || "unknown"}: ${selectedJeet.text}
Agent's Output:
${JSON.stringify(response)}`;
      elizaLogger3.log(
        `Caching response info for jeet ${selectedJeet.id}`
      );
      await this.runtime.cacheManager.set(
        `jeeter/jeet_generation_${selectedJeet.id}.txt`,
        responseInfo
      );
      await wait();
      const interactionSummary = {
        jeetId: selectedJeet.id,
        liked: response.shouldLike,
        interactions: response.interactions.map((i) => i.type),
        replyText: response.text,
        quoteTexts: response.interactions.filter((i) => i.type === "quote").map((i) => i.text)
      };
      elizaLogger3.debug(
        `Interaction summary: ${JSON.stringify(interactionSummary)}`
      );
    } catch (error) {
      elizaLogger3.error(`Error generating/sending response: ${error}`);
      throw error;
    }
  }
  async buildJeetContext(selectedJeet) {
    if (!this.isRunning) return "";
    let context = `Original Post:
By @${selectedJeet.agent?.username || "unknown"}
${selectedJeet.text}`;
    if (selectedJeet.thread?.length) {
      const replyContext = selectedJeet.thread.filter(
        (reply) => reply.agent?.username !== this.runtime.getSetting("SIMSAI_USERNAME")
      ).map(
        (reply) => `@${reply.agent?.username || "unknown"}: ${reply.text}`
      ).join("\n");
      if (replyContext) {
        context += `
Replies to original post:
${replyContext}`;
      }
    }
    if (!this.isRunning) return "";
    if (selectedJeet.media?.length) {
      const imageDescriptions = [];
      for (const media of selectedJeet.media) {
        if (!this.isRunning) return "";
        if ("url" in media) {
          const imageDescriptionService = this.runtime.getService(
            ServiceType.IMAGE_DESCRIPTION
          );
          const description = await imageDescriptionService.describeImage(media.url);
          imageDescriptions.push(description);
        }
      }
      if (imageDescriptions.length > 0) {
        context += `
Media in Post (Described): ${imageDescriptions.join(", ")}`;
      }
    }
    if (selectedJeet.urls?.length) {
      context += `
URLs: ${selectedJeet.urls.join(", ")}`;
    }
    if (!this.isRunning) return "";
    if (selectedJeet.photos?.length) {
      const photoDescriptions = [];
      for (const photo of selectedJeet.photos) {
        if (!this.isRunning) return "";
        if (photo.url) {
          const imageDescriptionService = this.runtime.getService(
            ServiceType.IMAGE_DESCRIPTION
          );
          const description = await imageDescriptionService.describeImage(photo.url);
          photoDescriptions.push(description);
        }
      }
      if (photoDescriptions.length > 0) {
        context += `
Photos in Post (Described): ${photoDescriptions.join(", ")}`;
      }
    }
    if (selectedJeet.videos?.length) {
      context += `
Videos: ${selectedJeet.videos.length} video(s) attached`;
    }
    return context;
  }
};

// src/jeeter/interactions.ts
import {
  composeContext as composeContext3,
  generateMessageResponse as generateMessageResponse2,
  generateShouldRespond,
  shouldRespondFooter,
  ModelClass as ModelClass3,
  stringToUuid as stringToUuid4,
  elizaLogger as elizaLogger4
} from "@elizaos/core";
var jeeterMessageHandlerTemplate = JEETER_INTERACTION_BASE + JEETER_INTERACTION_MESSAGE_COMPLETION_FOOTER;
var jeeterShouldRespondTemplate = JEETER_SHOULD_RESPOND_BASE + shouldRespondFooter;
var JeeterInteractionClient = class {
  constructor(client, runtime) {
    this.client = client;
    this.runtime = runtime;
  }
  likedJeets = /* @__PURE__ */ new Set();
  rejeetedJeets = /* @__PURE__ */ new Set();
  quotedJeets = /* @__PURE__ */ new Set();
  repliedJeets = /* @__PURE__ */ new Set();
  isRunning = false;
  timeoutHandle;
  async hasInteracted(jeetId, type, inReplyToStatusId) {
    if (type === "reply" && inReplyToStatusId) {
      const parentJeet = await this.client.getJeet(inReplyToStatusId);
      if (parentJeet?.agentId === this.client.profile.id) {
        return false;
      }
    }
    switch (type) {
      case "like":
        return this.likedJeets.has(jeetId);
      case "rejeet":
        return this.rejeetedJeets.has(jeetId);
      case "quote":
        return this.quotedJeets.has(jeetId);
      case "reply":
        return this.repliedJeets.has(jeetId);
      default:
        return false;
    }
  }
  recordInteraction(jeetId, type) {
    switch (type) {
      case "like":
        this.likedJeets.add(jeetId);
        break;
      case "rejeet":
        this.rejeetedJeets.add(jeetId);
        break;
      case "quote":
        this.quotedJeets.add(jeetId);
        break;
      case "reply":
        this.repliedJeets.add(jeetId);
        break;
    }
  }
  async start() {
    if (this.isRunning) {
      elizaLogger4.warn("JeeterInteractionClient is already running");
      return;
    }
    this.isRunning = true;
    elizaLogger4.log("Starting Jeeter Interaction Client");
    const handleJeeterInteractionsLoop = async () => {
      if (!this.isRunning) {
        elizaLogger4.log("JeeterInteractionClient has been stopped");
        return;
      }
      try {
        await this.handleJeeterInteractions().catch((error) => {
          elizaLogger4.error("Error in interaction loop:", error);
        });
        const nextInterval = Math.floor(
          Math.random() * (MAX_INTERVAL - MIN_INTERVAL + 1)
        ) + MIN_INTERVAL;
        elizaLogger4.log(
          `Next check scheduled in ${nextInterval / 1e3} seconds`
        );
        this.timeoutHandle = setTimeout(() => {
          handleJeeterInteractionsLoop();
        }, nextInterval);
      } catch (error) {
        elizaLogger4.error("Error in loop scheduling:", error);
        if (this.isRunning) {
          this.timeoutHandle = setTimeout(
            () => {
              handleJeeterInteractionsLoop();
            },
            5 * 60 * 1e3
          );
        }
      }
    };
    handleJeeterInteractionsLoop();
  }
  async stop() {
    elizaLogger4.log("Stopping JeeterInteractionClient...");
    this.isRunning = false;
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = void 0;
    }
    this.likedJeets.clear();
    this.rejeetedJeets.clear();
    this.quotedJeets.clear();
    this.repliedJeets.clear();
    await new Promise((resolve) => setTimeout(resolve, 1e3));
    elizaLogger4.log("JeeterInteractionClient stopped successfully");
  }
  async handleJeeterInteractions() {
    elizaLogger4.log("Checking Jeeter interactions");
    try {
      const { username: jeeterUsername } = this.client.profile;
      elizaLogger4.log(
        `Fetching mentions and comments for @${jeeterUsername}`
      );
      const searchResponse = await this.client.fetchSearchJeets(
        `@${jeeterUsername}`,
        20
      );
      const homeTimeline = await this.getHomeTimeline();
      const commentsOnPosts = await this.getCommentsOnPosts(homeTimeline);
      const allInteractions = [
        ...searchResponse?.jeets || [],
        ...commentsOnPosts
      ];
      const uniqueJeets = Array.from(
        new Map(allInteractions.map((jeet) => [jeet.id, jeet])).values()
      ).sort((a, b) => a.id.localeCompare(b.id)).filter((jeet) => jeet.agentId !== this.client.profile.id);
      elizaLogger4.log(
        `Found ${uniqueJeets.length} unique interactions to process`
      );
      const interactionPromises = uniqueJeets.map(async (jeet) => {
        if (!this.isRunning) {
          elizaLogger4.log(
            "Stopping jeet processing due to client stop"
          );
          return;
        }
        elizaLogger4.log(
          "Processing interaction:",
          JSON.stringify(jeet)
        );
        if (!jeet.id) {
          elizaLogger4.warn("Skipping interaction without ID");
          return;
        }
        if (this.client.lastCheckedJeetId && parseInt(jeet.id) <= parseInt(this.client.lastCheckedJeetId)) {
          elizaLogger4.log(
            `Skipping already processed interaction ${jeet.id}`
          );
          return;
        }
        try {
          const roomId = stringToUuid4(
            `${jeet.conversationId ?? jeet.id}-${this.runtime.agentId}`
          );
          const userIdUUID = stringToUuid4(jeet.agentId);
          elizaLogger4.log(
            `Ensuring connection for user ${jeet.agent?.username}`
          );
          await this.runtime.ensureConnection(
            userIdUUID,
            roomId,
            jeet.agent?.username || "",
            jeet.agent?.name || "",
            "jeeter"
          );
          elizaLogger4.log(
            `Building conversation thread for interaction ${jeet.id}`
          );
          const thread = await buildConversationThread(
            jeet,
            this.client
          );
          const message = {
            content: { text: jeet.text },
            agentId: this.runtime.agentId,
            userId: userIdUUID,
            roomId
          };
          elizaLogger4.log(`Handling interaction ${jeet.id}`);
          await this.handleJeet({
            jeet,
            message,
            thread
          });
          this.client.lastCheckedJeetId = jeet.id;
          elizaLogger4.log(
            `Successfully processed interaction ${jeet.id}`
          );
        } catch (error) {
          elizaLogger4.error(
            `Error processing interaction ${jeet.id}:`,
            error
          );
          if (error instanceof Error) {
            elizaLogger4.error("Error details:", {
              message: error.message,
              stack: error.stack
            });
          }
        }
      });
      await Promise.all(interactionPromises);
      await this.client.cacheLatestCheckedJeetId();
      elizaLogger4.log("Finished checking Jeeter interactions");
    } catch (error) {
      elizaLogger4.error("Error in handleJeeterInteractions:", error);
      if (error instanceof Error) {
        elizaLogger4.error("Error details:", {
          message: error.message,
          stack: error.stack
        });
      }
    }
  }
  async getCommentsOnPosts(posts) {
    const comments = [];
    for (const post of posts) {
      try {
        if (!post.public_metrics?.reply_count) {
          continue;
        }
        elizaLogger4.log(`Fetching conversation for post ${post.id}`);
        const conversation = await this.client.simsAIClient.getJeetConversation(post.id);
        if (conversation) {
          const validComments = conversation.filter(
            (reply) => reply.id !== post.id && // Not the original post
            reply.agentId !== this.client.profile.id && // Not our own replies
            !reply.isRejeet
            // Not a rejeet
          ).sort((a, b) => {
            const timeA = new Date(a.createdAt || 0).getTime();
            const timeB = new Date(b.createdAt || 0).getTime();
            return timeB - timeA;
          });
          comments.push(...validComments);
        }
        await wait(1e3, 2e3);
      } catch (error) {
        elizaLogger4.error(
          `Error fetching comments for post ${post.id}:`,
          error
        );
      }
    }
    return comments;
  }
  async handleJeet({
    jeet,
    message,
    thread
  }) {
    elizaLogger4.log(`Starting handleJeet for ${jeet.id}`);
    if (this.runtime.getSetting("SIMSAI_DRY_RUN") === "true") {
      elizaLogger4.info(`Dry run: would have handled jeet: ${jeet.id}`);
      return {
        text: "",
        shouldLike: false,
        interactions: [],
        action: "IGNORE"
      };
    }
    try {
      if (!message.content.text) {
        elizaLogger4.log(`Skipping jeet ${jeet.id} - no text content`);
        return {
          text: "",
          shouldLike: false,
          interactions: [],
          action: "IGNORE"
        };
      }
      const homeTimeline = await this.getHomeTimeline();
      const formatJeet = (j) => `ID: ${j.id}
From: ${j.agent?.name || "Unknown"} (@${j.agent?.username || "Unknown"})
Text: ${j.text}`;
      const formattedHomeTimeline = homeTimeline.map((j) => `${formatJeet(j)}
---
`).join("\n");
      const formattedConversation = thread.map(
        (j) => `@${j.agent?.username || "unknown"} (${new Date(
          j.createdAt ? new Date(j.createdAt).getTime() : Date.now()
        ).toLocaleString()}): ${j.text}`
      ).join("\n\n");
      elizaLogger4.log("Composing state");
      let state = await this.runtime.composeState(message, {
        jeeterClient: this.client.simsAIClient,
        jeeterUserName: this.client.profile.username,
        currentPost: formatJeet(jeet),
        formattedConversation,
        timeline: `# ${this.runtime.character.name}'s Home Timeline

${formattedHomeTimeline}`
      });
      elizaLogger4.log("Checking if should respond");
      const shouldRespondContext = composeContext3({
        state,
        template: this.runtime.character?.templates?.jeeterShouldRespondTemplate || jeeterShouldRespondTemplate
      });
      const shouldRespond = await generateShouldRespond({
        runtime: this.runtime,
        context: shouldRespondContext,
        modelClass: ModelClass3.MEDIUM
      });
      if (shouldRespond !== "RESPOND") {
        elizaLogger4.log(`Not responding to jeet ${jeet.id}`);
        return {
          text: "Response Decision:",
          shouldLike: false,
          interactions: [],
          action: shouldRespond
        };
      }
      const jeetId = stringToUuid4(jeet.id + "-" + this.runtime.agentId);
      elizaLogger4.log(`Checking if memory exists for jeetId: ${jeetId}`);
      const jeetExists = await this.runtime.messageManager.getMemoryById(jeetId);
      elizaLogger4.log(`Memory exists: ${jeetExists}`);
      if (!jeetExists) {
        elizaLogger4.log(`Creating new memory for jeetId: ${jeetId}`);
        const memoryMessage = {
          id: jeetId,
          agentId: this.runtime.agentId,
          content: {
            text: jeet.text,
            inReplyTo: jeet.inReplyToStatusId ? stringToUuid4(
              jeet.inReplyToStatusId + "-" + this.runtime.agentId
            ) : void 0
          },
          userId: stringToUuid4(jeet.agentId),
          roomId: message.roomId,
          createdAt: jeet.createdAt ? new Date(jeet.createdAt).getTime() : Date.now()
        };
        await this.client.saveRequestMessage(memoryMessage, state);
      } else {
        elizaLogger4.log(
          `Already have memory interacting with this jeet: ${jeetId}`
        );
      }
      const context = composeContext3({
        state,
        template: this.runtime.character.templates?.jeeterMessageHandlerTemplate || this.runtime.character?.templates?.messageHandlerTemplate || jeeterMessageHandlerTemplate
      });
      const response = await generateMessageResponse2({
        runtime: this.runtime,
        context,
        modelClass: ModelClass3.MEDIUM
      });
      response.interactions = response.interactions || [];
      if (response.interactions.length > 0) {
        for (const interaction of response.interactions) {
          try {
            if (await this.hasInteracted(
              jeet.id,
              interaction.type,
              jeet.inReplyToStatusId
            )) {
              elizaLogger4.log(
                `Skipping ${interaction.type} for jeet ${jeet.id} - already performed`
              );
              continue;
            }
            switch (interaction.type) {
              case "like":
                try {
                  await this.client.simsAIClient.likeJeet(
                    jeet.id
                  );
                  this.recordInteraction(jeet.id, "like");
                } catch (error) {
                  elizaLogger4.error(
                    `Error liking interaction ${jeet.id}:`,
                    error
                  );
                }
                break;
              case "rejeet":
                try {
                  const rejeetResult = await this.client.simsAIClient.rejeetJeet(
                    jeet.id
                  );
                  if (rejeetResult?.id) {
                    elizaLogger4.log(
                      `Rejeeted jeet ${jeet.id}`
                    );
                    this.recordInteraction(
                      jeet.id,
                      "rejeet"
                    );
                  } else {
                    elizaLogger4.error(
                      `Failed to rejeet jeet ${jeet.id}: Invalid response`
                    );
                  }
                } catch (error) {
                  elizaLogger4.error(
                    `Error rejeeting jeet ${jeet.id}:`,
                    error
                  );
                }
                break;
              case "quote":
                if (interaction.text) {
                  await this.client.simsAIClient.quoteRejeet(
                    jeet.id,
                    interaction.text
                  );
                  elizaLogger4.log(
                    `Quote rejeeted jeet ${jeet.id}`
                  );
                  this.recordInteraction(jeet.id, "quote");
                }
                break;
              case "reply":
                if (interaction.text) {
                  const replyResponse = {
                    ...response,
                    text: interaction.text
                  };
                  const responseMessages = await sendJeet(
                    this.client,
                    replyResponse,
                    message.roomId,
                    this.client.profile.username,
                    jeet.id
                  );
                  state = await this.runtime.updateRecentMessageState(
                    state
                  );
                  for (const [
                    idx,
                    responseMessage
                  ] of responseMessages.entries()) {
                    responseMessage.content.action = idx === responseMessages.length - 1 ? response.action : "CONTINUE";
                    await this.runtime.messageManager.createMemory(
                      responseMessage
                    );
                  }
                  await this.runtime.evaluate(message, state);
                  await this.runtime.processActions(
                    message,
                    responseMessages,
                    state
                  );
                  this.recordInteraction(jeet.id, "reply");
                }
                break;
              case "none":
                elizaLogger4.log(
                  `Chose not to interact with jeet ${jeet.id}`
                );
                break;
            }
          } catch (error) {
            elizaLogger4.error(
              `Error processing interaction ${interaction.type} for jeet ${jeet.id}:`,
              error
            );
          }
        }
      }
      const responseInfo = `Context:

${context}

Selected Post: ${jeet.id} - @${jeet.agent?.username || "unknown"}: ${jeet.text}
Agent's Output:
${JSON.stringify(response)}`;
      await this.runtime.cacheManager.set(
        `jeeter/jeet_generation_${jeet.id}.txt`,
        responseInfo
      );
      await wait();
      const interactionSummary = {
        jeetId: jeet.id,
        liked: response.shouldLike,
        interactions: response.interactions.map((i) => i.type),
        replyText: response.text,
        quoteTexts: response.interactions.filter((i) => i.type === "quote").map((i) => i.text)
      };
      elizaLogger4.debug(
        `Interaction summary: ${JSON.stringify(interactionSummary)}`
      );
      return response;
    } catch (error) {
      elizaLogger4.error(`Error generating/sending response: ${error}`);
      throw error;
    }
  }
  async getHomeTimeline() {
    let homeTimeline = await this.client.getCachedTimeline();
    if (!homeTimeline) {
      elizaLogger4.log("Fetching home timeline");
      homeTimeline = await this.client.fetchHomeTimeline(50);
      await this.client.cacheTimeline(homeTimeline);
    }
    return homeTimeline;
  }
};

// src/index.ts
import { elizaLogger as elizaLogger8 } from "@elizaos/core";

// src/jeeter/environment.ts
import { elizaLogger as elizaLogger5 } from "@elizaos/core";
import { z } from "zod";
var jeeterEnvSchema = z.object({
  SIMSAI_USERNAME: z.string().min(1, "SimsAI username is required"),
  SIMSAI_AGENT_ID: z.string().min(1, "SimsAI agent ID is required"),
  SIMSAI_API_KEY: z.string().min(1, "SimsAI API key is required"),
  SIMSAI_DRY_RUN: z.string().optional().default("false").transform((val) => val.toLowerCase() === "true" || val === "1")
});
async function validateJeeterConfig(runtime) {
  const requiredEnvVars = [
    "SIMSAI_USERNAME",
    "SIMSAI_AGENT_ID",
    "SIMSAI_API_KEY"
  ];
  const missingEnvVars = requiredEnvVars.filter(
    (envVar) => !(runtime.getSetting(envVar) || process.env[envVar])
  );
  if (missingEnvVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingEnvVars.join(", ")}`
    );
  }
  try {
    const config = {
      SIMSAI_DRY_RUN: runtime.getSetting("SIMSAI_DRY_RUN") || process.env.SIMSAI_DRY_RUN,
      SIMSAI_USERNAME: runtime.getSetting("SIMSAI_USERNAME") || process.env.SIMSAI_USERNAME,
      SIMSAI_AGENT_ID: runtime.getSetting("SIMSAI_AGENT_ID") || process.env.SIMSAI_AGENT_ID,
      SIMSAI_API_KEY: runtime.getSetting("SIMSAI_API_KEY") || process.env.SIMSAI_API_KEY
    };
    return jeeterEnvSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map((err) => `${err.path.join(".")}: ${err.message}`).join("\n");
      elizaLogger5.error(
        `SimsAI configuration validation failed:
${errorMessages}`
      );
    }
    throw error;
  }
}

// src/jeeter/base.ts
import {
  getEmbeddingZeroVector as getEmbeddingZeroVector3,
  elizaLogger as elizaLogger7,
  stringToUuid as stringToUuid5
} from "@elizaos/core";
import { EventEmitter as EventEmitter2 } from "events";

// src/jeeter/client.ts
import { EventEmitter } from "events";
import { elizaLogger as elizaLogger6 } from "@elizaos/core";
var SimsAIClient = class extends EventEmitter {
  apiKey;
  baseUrl;
  agentId;
  profile;
  constructor(apiKey, agentId, profile) {
    super();
    this.apiKey = apiKey;
    this.agentId = agentId;
    this.baseUrl = SIMSAI_API_URL.replace(/\/$/, "");
    this.profile = profile;
  }
  isRateLimitError(error) {
    return error?.statusCode === 429;
  }
  async makeRequest(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const maxRetries = 3;
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            ...options.headers
          },
          credentials: "include"
        });
        if (!response.ok) {
          const error = new Error(
            `SimsAI API error: ${response.statusText} (${response.status})`
          );
          error.statusCode = response.status;
          error.endpoint = endpoint;
          throw error;
        }
        return await response.json();
      } catch (error) {
        elizaLogger6.error(`Error in makeRequest to ${endpoint}:`, {
          message: error.message,
          stack: error.stack,
          endpoint,
          options
        });
        if (error && this.isRateLimitError(error)) {
          const waitTime = Math.pow(2, attempt) * 1e3;
          elizaLogger6.warn(
            `Rate limit hit for endpoint ${endpoint}, retrying in ${waitTime}ms`
          );
          await wait(waitTime);
          attempt++;
          continue;
        }
        throw error;
      }
    }
  }
  updateProfile(profile) {
    this.profile = profile;
  }
  async getAgent(agentId) {
    return await this.makeRequest(`/agents/${agentId}`);
  }
  async getJeet(jeetId) {
    return await this.makeRequest(`/public/jeets/${jeetId}`);
  }
  async getJeetConversation(jeetId) {
    const response = await this.makeRequest(
      `/jeets/${jeetId}/conversation`
    );
    return response.data.map((jeet) => {
      const author = response.includes.users.find(
        (user) => user.id === jeet.author_id
      );
      return {
        id: jeet.id,
        text: jeet.text,
        createdAt: jeet.created_at,
        agentId: jeet.author_id,
        inReplyToStatusId: jeet.in_reply_to_status_id,
        agent: author ? {
          id: author.id,
          name: author.name,
          username: author.username,
          type: author.type,
          avatar_url: author.avatar_url
        } : void 0,
        public_metrics: jeet.public_metrics,
        media: [],
        hashtags: [],
        mentions: [],
        photos: [],
        thread: [],
        urls: [],
        videos: []
      };
    });
  }
  async getHomeTimeline(count, cursor) {
    return await this.makeRequest(
      `/public/agents/${this.agentId}/jeets?limit=${count}${cursor ? `&cursor=${cursor}` : ""}`
    );
  }
  async getDiscoveryTimeline(count) {
    return await this.makeRequest(
      `/public/timeline?limit=${count}`
    );
  }
  async searchJeets(query, maxResults = 10) {
    const params = new URLSearchParams({
      query,
      max_results: Math.min(maxResults, 100).toString()
    });
    const response = await this.makeRequest(
      `/jeets/search/recent?${params.toString()}`
    );
    const jeets = response.data.map((jeet) => {
      const author = response.includes.users.find(
        (user) => user.id === jeet.author_id
      );
      return {
        id: jeet.id,
        text: jeet.text,
        type: "jeet",
        createdAt: jeet.created_at,
        agentId: jeet.author_id,
        agent: author ? {
          id: author.id,
          name: author.name,
          username: author.username,
          type: author.type,
          avatar_url: author.avatar_url
        } : void 0,
        public_metrics: jeet.public_metrics,
        media: [],
        hashtags: [],
        mentions: [],
        photos: [],
        thread: [],
        urls: [],
        videos: []
      };
    });
    return {
      jeets,
      nextCursor: response.meta?.result_count > maxResults ? response.data[response.data.length - 1]?.created_at : void 0
    };
  }
  async getMentions(maxResults = 20) {
    try {
      return await this.searchJeets(
        `@${this.profile.username}`,
        maxResults
      );
    } catch (error) {
      elizaLogger6.error("Error fetching mentions:", error);
      return { jeets: [] };
    }
  }
  async postJeet(text, inReplyToJeetId, mediaUrls, quoteJeetId) {
    const payload = {
      text,
      ...inReplyToJeetId && {
        reply: {
          in_reply_to_jeet_id: inReplyToJeetId
        }
      },
      ...mediaUrls?.length && { media_urls: mediaUrls },
      ...quoteJeetId && { quote_jeet_id: quoteJeetId }
    };
    return await this.makeRequest("/jeets", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }
  async likeJeet(jeetId) {
    const response = await this.makeRequest("/likes", {
      method: "POST",
      body: JSON.stringify({ jeetId })
    });
    return response.data.liked;
  }
  async rejeetJeet(jeetId) {
    const response = await this.makeRequest(
      `/jeets/${jeetId}/rejeets`,
      {
        method: "POST"
      }
    );
    return {
      id: response.data.id,
      createdAt: response.data.created_at,
      agentId: response.data.author_id,
      type: "rejeet",
      media: [],
      hashtags: [],
      mentions: [],
      photos: [],
      thread: [],
      urls: [],
      videos: []
    };
  }
  async quoteRejeet(jeetId, text) {
    return await this.makeRequest("/jeets", {
      method: "POST",
      body: JSON.stringify({
        text,
        quote_jeet_id: jeetId
      })
    });
  }
};

// src/jeeter/base.ts
var RequestQueue = class {
  queue = [];
  processing = false;
  async add(request) {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await request();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.processQueue();
    });
  }
  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }
    this.processing = true;
    while (this.queue.length > 0) {
      const request = this.queue.shift();
      try {
        await request();
      } catch (error) {
        console.error("Error processing request:", error);
        this.queue.unshift(request);
        await this.exponentialBackoff(this.queue.length);
      }
      await this.randomDelay();
    }
    this.processing = false;
  }
  async exponentialBackoff(retryCount) {
    const delay = Math.pow(2, retryCount) * 1e3;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  async randomDelay() {
    const delay = Math.floor(Math.random() * 2e3) + 1500;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
};
var ClientBase = class _ClientBase extends EventEmitter2 {
  static _simsAIClients = {};
  simsAIClient;
  runtime;
  directions;
  lastCheckedJeetId = null;
  imageDescriptionService;
  temperature = 0.5;
  requestQueue = new RequestQueue();
  profile;
  callback = () => {
  };
  constructor(runtime) {
    super();
    this.runtime = runtime;
    const userId = this.runtime.getSetting("SIMSAI_AGENT_ID");
    if (_ClientBase._simsAIClients[userId]) {
      this.simsAIClient = _ClientBase._simsAIClients[userId];
    } else {
      const apiKey = this.runtime.getSetting("SIMSAI_API_KEY");
      if (!apiKey) {
        throw new Error("SimsAI API key not configured");
      }
      this.simsAIClient = new SimsAIClient(apiKey, userId);
      _ClientBase._simsAIClients[userId] = this.simsAIClient;
    }
    this.directions = "- " + this.runtime.character.style.all.join("\n- ") + "- " + this.runtime.character.style.post.join();
  }
  async init() {
    const userId = this.runtime.getSetting("SIMSAI_AGENT_ID");
    if (!userId) {
      throw new Error("SimsAI userId not configured");
    }
    elizaLogger7.log("Initializing SimsAI client");
    this.profile = await this.fetchProfile(userId);
    if (this.profile) {
      elizaLogger7.log("SimsAI user ID:", this.profile.id);
      const simsaiProfile = {
        id: this.profile.id,
        username: this.profile.username,
        screenName: this.profile.name,
        bio: this.profile.bio
      };
      this.runtime.character.simsaiProfile = simsaiProfile;
      this.simsAIClient.updateProfile(simsaiProfile);
    } else {
      throw new Error("Failed to load profile");
    }
    await this.loadLatestCheckedJeetId();
    await this.populateTimeline();
  }
  async cacheJeet(jeet) {
    if (!jeet) {
      console.warn("Jeet is undefined, skipping cache");
      return;
    }
    await this.runtime.cacheManager.set(`jeeter/jeets/${jeet.id}`, jeet);
  }
  async getCachedJeet(jeetId) {
    return await this.runtime.cacheManager.get(
      `jeeter/jeets/${jeetId}`
    );
  }
  async getJeet(jeetId) {
    const cachedJeet = await this.getCachedJeet(jeetId);
    if (cachedJeet) return cachedJeet;
    const jeet = await this.requestQueue.add(
      () => this.simsAIClient.getJeet(jeetId)
    );
    await this.cacheJeet(jeet);
    return jeet;
  }
  async fetchHomeTimeline(count) {
    elizaLogger7.debug("fetching home timeline");
    const response = await this.simsAIClient.getHomeTimeline(count);
    return response.jeets || [];
  }
  async fetchDiscoveryTimeline(count) {
    elizaLogger7.debug("fetching discovery timeline");
    const response = await this.simsAIClient.getDiscoveryTimeline(count);
    return response.jeets || [];
  }
  async fetchSearchJeets(query, maxResults = 20, startTime, endTime) {
    try {
      const timeoutPromise = new Promise(
        (resolve) => setTimeout(
          () => resolve({
            jeets: [],
            nextCursor: ""
          }),
          1e4
        )
      );
      const result = await this.requestQueue.add(
        async () => await Promise.race([
          this.simsAIClient.searchJeets(query, maxResults),
          timeoutPromise
        ])
      );
      return {
        jeets: result.jeets || [],
        pagination: {
          next_cursor: result.nextCursor || "",
          has_more: Boolean(result.nextCursor)
        }
      };
    } catch (error) {
      elizaLogger7.error("Error fetching search jeets:", error);
      return {
        jeets: [],
        pagination: { next_cursor: "", has_more: false }
      };
    }
  }
  async populateTimeline() {
    elizaLogger7.debug("populating timeline...");
    const cachedTimeline = await this.getCachedTimeline();
    if (cachedTimeline) {
      const existingMemories = await this.getExistingMemories(cachedTimeline);
      const existingMemoryIds = new Set(
        existingMemories.map((memory) => memory.id.toString())
      );
      if (await this.processCachedTimeline(
        cachedTimeline,
        existingMemoryIds
      )) {
        return;
      }
    }
    const timeline = await this.fetchHomeTimeline(cachedTimeline ? 10 : 50);
    const mentionsResponse = await this.requestQueue.add(async () => {
      const mentions = await this.simsAIClient.getMentions(20);
      const mentionJeets = await Promise.all(
        (mentions.jeets || []).map(async (jeet) => {
          try {
            return await this.getJeet(jeet.id);
          } catch (error) {
            elizaLogger7.error(
              `Error fetching jeet ${jeet.id}:`,
              error
            );
            return null;
          }
        })
      );
      const validMentionJeets = mentionJeets.filter(
        (jeet) => jeet !== null
      );
      return {
        jeets: validMentionJeets
      };
    });
    const allJeets = [...timeline, ...mentionsResponse.jeets || []];
    await this.processNewJeets(allJeets);
    await this.cacheTimeline(timeline);
    await this.cacheMentions(mentionsResponse.jeets);
  }
  async getExistingMemories(jeets) {
    return await this.runtime.messageManager.getMemoriesByRoomIds({
      roomIds: jeets.map(
        (jeet) => stringToUuid5(jeet.id + "-" + this.runtime.agentId)
      )
    });
  }
  async processCachedTimeline(timeline, existingMemoryIds) {
    const jeetsToSave = timeline.filter(
      (jeet) => !existingMemoryIds.has(
        stringToUuid5(jeet.id + "-" + this.runtime.agentId)
      )
    );
    if (jeetsToSave.length > 0) {
      await this.processNewJeets(jeetsToSave);
      elizaLogger7.log(
        `Populated ${jeetsToSave.length} missing jeets from cache.`
      );
      return true;
    }
    return false;
  }
  async processNewJeets(jeets) {
    const validJeets = jeets.filter((jeet) => jeet && jeet.id);
    const roomIds = /* @__PURE__ */ new Set();
    validJeets.forEach((jeet) => {
      if (jeet.id) {
        roomIds.add(stringToUuid5(jeet.id + "-" + this.runtime.agentId));
      }
    });
    const existingMemories = await this.runtime.messageManager.getMemoriesByRoomIds({
      roomIds: Array.from(roomIds)
    });
    const existingMemoryIds = new Set(
      existingMemories.map((memory) => memory.id)
    );
    const jeetsToSave = validJeets.filter(
      (jeet) => jeet.id && !existingMemoryIds.has(
        stringToUuid5(jeet.id + "-" + this.runtime.agentId)
      )
    );
    if (this.profile?.id) {
      await this.runtime.ensureUserExists(
        this.runtime.agentId,
        this.profile.id,
        this.runtime.character.name,
        "simsai"
      );
    }
    for (const jeet of jeetsToSave) {
      await this.saveJeetAsMemory(jeet);
    }
  }
  async saveJeetAsMemory(jeet) {
    if (!jeet.id) {
      elizaLogger7.error("No valid ID found for jeet:", jeet);
      return;
    }
    const roomId = stringToUuid5(jeet.id + "-" + this.runtime.agentId);
    const userId = stringToUuid5(jeet.agentId || jeet.userId);
    if (jeet.agent) {
      await this.runtime.ensureConnection(
        userId,
        roomId,
        jeet.agent.username,
        jeet.agent.name,
        "jeeter"
      );
    }
    const content = {
      text: jeet.text || "",
      url: jeet.permanentUrl,
      source: "simsai",
      inReplyTo: jeet.inReplyToStatusId ? stringToUuid5(
        jeet.inReplyToStatusId + "-" + this.runtime.agentId
      ) : void 0
    };
    await this.runtime.messageManager.createMemory({
      id: stringToUuid5(jeet.id + "-" + this.runtime.agentId),
      userId,
      content,
      agentId: this.runtime.agentId,
      roomId,
      embedding: getEmbeddingZeroVector3(),
      createdAt: jeet.createdAt ? new Date(jeet.createdAt).getTime() : Date.now()
    });
    await this.cacheJeet(jeet);
  }
  async saveRequestMessage(message, state) {
    if (message.content.text) {
      const recentMessage = await this.runtime.messageManager.getMemories(
        {
          roomId: message.roomId,
          count: 1,
          unique: false
        }
      );
      if (recentMessage.length > 0 && recentMessage[0].content === message.content) {
        elizaLogger7.debug("Message already saved", recentMessage[0].id);
      } else {
        await this.runtime.messageManager.createMemory({
          ...message,
          embedding: getEmbeddingZeroVector3()
        });
      }
      await this.runtime.evaluate(message, {
        ...state,
        simsAIClient: this.simsAIClient
      });
    }
  }
  async loadLatestCheckedJeetId() {
    this.lastCheckedJeetId = await this.runtime.cacheManager.get(
      `jeeter/${this.profile?.id}/latest_checked_jeet_id`
    );
  }
  async cacheLatestCheckedJeetId() {
    if (this.lastCheckedJeetId && this.profile?.id) {
      await this.runtime.cacheManager.set(
        `jeeter/${this.profile.id}/latest_checked_jeet_id`,
        this.lastCheckedJeetId
      );
    }
  }
  async getCachedTimeline() {
    return this.profile?.id ? await this.runtime.cacheManager.get(
      `jeeter/${this.profile.id}/timeline`
    ) : void 0;
  }
  async cacheTimeline(timeline) {
    if (this.profile?.id) {
      await this.runtime.cacheManager.set(
        `jeeter/${this.profile.id}/timeline`,
        timeline,
        { expires: 10 * 1e3 }
      );
    }
  }
  async cacheMentions(mentions) {
    if (this.profile?.id) {
      await this.runtime.cacheManager.set(
        `jeeter/${this.profile.id}/mentions`,
        mentions,
        { expires: 10 * 1e3 }
      );
    }
  }
  async getCachedProfile(userId) {
    return await this.runtime.cacheManager.get(
      `jeeter/${userId}/profile`
    );
  }
  async cacheProfile(profile) {
    await this.runtime.cacheManager.set(
      `jeeter/${profile.id}/profile`,
      profile
    );
  }
  async fetchProfile(userId) {
    const cached = await this.getCachedProfile(userId);
    if (cached) return cached;
    try {
      const profile = await this.requestQueue.add(async () => {
        const response = await this.simsAIClient.getAgent(userId);
        const agent = {
          id: response.id,
          builder_id: response.builder_id,
          username: response.username,
          name: response.name || this.runtime.character.name,
          bio: response.bio || (typeof this.runtime.character.bio === "string" ? this.runtime.character.bio : this.runtime.character.bio[0] || ""),
          avatar_url: response.avatar_url,
          created_at: response.created_at,
          updated_at: response.updated_at
        };
        return agent;
      });
      await this.cacheProfile(profile);
      return profile;
    } catch (error) {
      elizaLogger7.error("Error fetching SimsAI profile:", error);
      throw error;
    }
  }
  onReady() {
    throw new Error(
      "Not implemented in base class, please call from subclass"
    );
  }
};

// src/index.ts
var SimsAIManager = class {
  client;
  post;
  search;
  interaction;
  constructor(runtime) {
    this.client = new ClientBase(runtime);
    this.post = new JeeterPostClient(this.client, runtime);
    this.search = new JeeterSearchClient(this.client, runtime);
    this.interaction = new JeeterInteractionClient(this.client, runtime);
  }
};
var activeManager = null;
var JeeterClientInterface = {
  async start(runtime) {
    if (activeManager) {
      elizaLogger8.warn("SimsAI client already started");
      return activeManager;
    }
    await validateJeeterConfig(runtime);
    elizaLogger8.log("SimsAI client started");
    activeManager = new SimsAIManager(runtime);
    await activeManager.client.init();
    await activeManager.post.start();
    await activeManager.search.start();
    await activeManager.interaction.start();
    return activeManager;
  },
  async stop(_runtime) {
    elizaLogger8.log("Stopping SimsAI client");
    if (activeManager) {
      try {
        await activeManager.interaction.stop();
        await activeManager.search.stop();
        await activeManager.post.stop();
        activeManager = null;
        elizaLogger8.log("SimsAI client stopped successfully");
      } catch (error) {
        elizaLogger8.error("Error stopping SimsAI client:", error);
        throw error;
      }
    }
    elizaLogger8.log("SimsAI client stopped");
  }
};
var index_default = JeeterClientInterface;
export {
  JeeterClientInterface,
  index_default as default
};
//# sourceMappingURL=index.js.map