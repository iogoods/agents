// src/index.ts
import { elizaLogger as elizaLogger3 } from "@elizaos/core";

// src/telegramClient.ts
import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { elizaLogger as elizaLogger2 } from "@elizaos/core";

// src/messageManager.ts
import {
  composeContext,
  elizaLogger,
  ServiceType,
  composeRandomUser
} from "@elizaos/core";
import { getEmbeddingZeroVector } from "@elizaos/core";
import {
  ModelClass
} from "@elizaos/core";
import { stringToUuid } from "@elizaos/core";
import { generateMessageResponse, generateShouldRespond } from "@elizaos/core";

// src/templates.ts
import { messageCompletionFooter, shouldRespondFooter } from "@elizaos/core";
var telegramShouldRespondTemplate = `# About {{agentName}}:
{{bio}}

# RESPONSE EXAMPLES
{{user1}}: I just saw a really great movie
{{user2}}: Oh? Which movie?
Result: [IGNORE]

{{agentName}}: Oh, this is my favorite scene
{{user1}}: sick
{{user2}}: wait, why is it your favorite scene
Result: [RESPOND]

{{user1}}: stfu bot
Result: [STOP]

{{user1}}: Hey {{agent}}, can you help me with something
Result: [RESPOND]

{{user1}}: {{agentName}} stfu plz
Result: [STOP]

{{user1}}: i need help
{{agentName}}: how can I help you?
{{user1}}: no. i need help from someone else
Result: [IGNORE]

{{user1}}: Hey {{agent}}, can I ask you a question
{{agentName}}: Sure, what is it
{{user1}}: can you ask claude to create a basic react module that demonstrates a counter
Result: [RESPOND]

{{user1}}: {{agentName}} can you tell me a story
{{agentName}}: uhhh...
{{user1}}: please do it
{{agentName}}: okay
{{agentName}}: once upon a time, in a quaint little village, there was a curious girl named elara
{{user1}}: I'm loving it, keep going
Result: [RESPOND]

{{user1}}: {{agentName}} stop responding plz
Result: [STOP]

{{user1}}: okay, i want to test something. {{agentName}}, can you say marco?
{{agentName}}: marco
{{user1}}: great. okay, now do it again
Result: [RESPOND]

Response options are [RESPOND], [IGNORE] and [STOP].

{{agentName}} is in a room with other users and should only respond when they are being addressed, and should not respond if they are continuing a conversation that is very long.

Respond with [RESPOND] to messages that are directed at {{agentName}}, or participate in conversations that are interesting or relevant to their background.
If a message is not interesting, relevant, or does not directly address {{agentName}}, respond with [IGNORE]

Also, respond with [IGNORE] to messages that are very short or do not contain much information.

If a user asks {{agentName}} to be quiet, respond with [STOP]
If {{agentName}} concludes a conversation and isn't part of the conversation anymore, respond with [STOP]

IMPORTANT: {{agentName}} is particularly sensitive about being annoying, so if there is any doubt, it is better to respond with [IGNORE].
If {{agentName}} is conversing with a user and they have not asked to stop, it is better to respond with [RESPOND].

The goal is to decide whether {{agentName}} should respond to the last message.

{{recentMessages}}

Thread of Tweets You Are Replying To:

{{formattedConversation}}

# INSTRUCTIONS: Choose the option that best describes {{agentName}}'s response to the last message. Ignore messages if they are addressed to someone else.
` + shouldRespondFooter;
var telegramMessageHandlerTemplate = (
  // {{goals}}
  `# Action Examples
{{actionExamples}}
(Action examples are for reference only. Do not use the information from them in your response.)

# Knowledge
{{knowledge}}

# Task: Generate dialog and actions for the character {{agentName}}.
About {{agentName}}:
{{bio}}
{{lore}}

Examples of {{agentName}}'s dialog and actions:
{{characterMessageExamples}}

{{providers}}

{{attachments}}

{{actions}}

# Capabilities
Note that {{agentName}} is capable of reading/seeing/hearing various forms of media, including images, videos, audio, plaintext and PDFs. Recent attachments have been included above under the "Attachments" section.

{{messageDirections}}

{{recentMessages}}

# Task: Generate a post/reply in the voice, style and perspective of {{agentName}} (@{{twitterUserName}}) while using the thread of tweets as additional context:
Current Post:
{{currentPost}}
Thread of Tweets You Are Replying To:

{{formattedConversation}}
` + messageCompletionFooter
);
var telegramAutoPostTemplate = `# Action Examples
NONE: Respond but perform no additional action. This is the default if the agent is speaking and not doing anything additional.

# Task: Generate an engaging community message as {{agentName}}.
About {{agentName}}:
{{bio}}
{{lore}}

Examples of {{agentName}}'s dialog and actions:
{{characterMessageExamples}}

{{messageDirections}}

# Recent Chat History:
{{recentMessages}}

# Instructions: Write a natural, engaging message to restart community conversation. Focus on:
- Community engagement
- Educational topics
- General discusions
- Support queries
- Keep message warm and inviting
- Maximum 3 lines
- Use 1-2 emojis maximum
- Avoid financial advice
- Stay within known facts
- No team member mentions
- Be hyped, not repetitive
- Be natural, act like a human, connect with the community
- Don't sound so robotic like
- Randomly grab the most rect 5 messages for some context. Validate the context randomly and use that as a reference point for your next message, but not always, only when relevant.
- If the recent messages are mostly from {{agentName}}, make sure to create conversation starters, given there is no messages from others to reference.
- DO NOT REPEAT THE SAME thing that you just said from your recent chat history, start the message different each time, and be organic, non reptitive.

# Instructions: Write the next message for {{agentName}}. Include the "NONE" action only, as the only valid action for auto-posts is "NONE".
` + messageCompletionFooter;
var telegramPinnedMessageTemplate = `# Action Examples
NONE: Respond but perform no additional action. This is the default if the agent is speaking and not doing anything additional.

# Task: Generate pinned message highlight as {{agentName}}.
About {{agentName}}:
{{bio}}
{{lore}}

Examples of {{agentName}}'s dialog and actions:
{{characterMessageExamples}}

{{messageDirections}}

# Pinned Content:
{{pinnedMessageContent}}

# Instructions: Write an exciting message to bring attention to the pinned message. Requirements:
- Reference the message that was pinned from the pinned content
- Create genuine excitement if needed based on the pinned content, or create genuice urgency depending on the content
- Encourage community participation
- If there are links like Twitter/X posts, encourage users to like/retweet/comment to spread awarenress, but directly say that, wrap that into the post so its natural.
- Stay within announced facts only
- No additional promises or assumptions
- No team member mentions
- Start the message differently each time. Don't start with the same word like "hey", "hey hey", etc. be dynamic
- Address everyone, not as a direct reply to whoever pinned the message or wrote it, but you can reference them
- Maximum 3-7 lines formatted nicely if needed, based on the context of the announcement
- Use 1-2 emojis maximum

# Instructions: Write the next message for {{agentName}}. Include an action, if appropriate. The only valid action for pinned message highlights is "NONE".
` + messageCompletionFooter;

// src/utils.ts
function cosineSimilarity(text1, text2, text3) {
  const preprocessText = (text) => text.toLowerCase().replace(/[^\w\s'_-]/g, " ").replace(/\s+/g, " ").trim();
  const getWords = (text) => {
    return text.split(" ").filter((word) => word.length > 1);
  };
  const words1 = getWords(preprocessText(text1));
  const words2 = getWords(preprocessText(text2));
  const words3 = text3 ? getWords(preprocessText(text3)) : [];
  const freq1 = {};
  const freq2 = {};
  const freq3 = {};
  words1.forEach((word) => freq1[word] = (freq1[word] || 0) + 1);
  words2.forEach((word) => freq2[word] = (freq2[word] || 0) + 1);
  if (words3.length) {
    words3.forEach((word) => freq3[word] = (freq3[word] || 0) + 1);
  }
  const uniqueWords = /* @__PURE__ */ new Set([
    ...Object.keys(freq1),
    ...Object.keys(freq2),
    ...words3.length ? Object.keys(freq3) : []
  ]);
  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;
  let magnitude3 = 0;
  uniqueWords.forEach((word) => {
    const val1 = freq1[word] || 0;
    const val2 = freq2[word] || 0;
    const val3 = freq3[word] || 0;
    if (words3.length) {
      const sim12 = val1 * val2;
      const sim23 = val2 * val3;
      const sim13 = val1 * val3;
      dotProduct += Math.max(sim12, sim23, sim13);
    } else {
      dotProduct += val1 * val2;
    }
    magnitude1 += val1 * val1;
    magnitude2 += val2 * val2;
    if (words3.length) {
      magnitude3 += val3 * val3;
    }
  });
  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);
  magnitude3 = words3.length ? Math.sqrt(magnitude3) : 1;
  if (magnitude1 === 0 || magnitude2 === 0 || words3.length && magnitude3 === 0)
    return 0;
  if (!words3.length) {
    return dotProduct / (magnitude1 * magnitude2);
  }
  const maxMagnitude = Math.max(
    magnitude1 * magnitude2,
    magnitude2 * magnitude3,
    magnitude1 * magnitude3
  );
  return dotProduct / maxMagnitude;
}
function escapeMarkdown(text) {
  if (text.startsWith("```") && text.endsWith("```")) {
    return text;
  }
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, index) => {
    if (index % 2 === 1) {
      return part;
    }
    return part.replace(/`.*?`/g, (match) => match).replace(/([*_`\\])/g, "\\$1");
  }).join("");
}

// src/constants.ts
var MESSAGE_CONSTANTS = {
  MAX_MESSAGES: 50,
  RECENT_MESSAGE_COUNT: 5,
  CHAT_HISTORY_COUNT: 10,
  DEFAULT_SIMILARITY_THRESHOLD: 0.6,
  DEFAULT_SIMILARITY_THRESHOLD_FOLLOW_UPS: 0.4,
  INTEREST_DECAY_TIME: 5 * 60 * 1e3,
  // 5 minutes
  PARTIAL_INTEREST_DECAY: 3 * 60 * 1e3
  // 3 minutes
};
var TIMING_CONSTANTS = {
  TEAM_MEMBER_DELAY: 1500,
  // 1.5 seconds
  TEAM_MEMBER_DELAY_MIN: 1e3,
  // 1 second
  TEAM_MEMBER_DELAY_MAX: 3e3,
  // 3 seconds
  LEADER_DELAY_MIN: 2e3,
  // 2 seconds
  LEADER_DELAY_MAX: 4e3
  // 4 seconds
};
var RESPONSE_CHANCES = {
  AFTER_LEADER: 0.5
  // 50% chance to respond after leader
};
var TEAM_COORDINATION = {
  KEYWORDS: [
    "team",
    "all agents",
    "team update",
    "gm team",
    "hello team",
    "hey team",
    "hi team",
    "morning team",
    "evening team",
    "night team",
    "update team"
  ]
};

// src/messageManager.ts
import fs from "fs";
var MAX_MESSAGE_LENGTH = 4096;
var MessageManager = class {
  bot;
  runtime;
  interestChats = {};
  teamMemberUsernames = /* @__PURE__ */ new Map();
  autoPostConfig;
  lastChannelActivity = {};
  autoPostInterval;
  constructor(bot, runtime) {
    this.bot = bot;
    this.runtime = runtime;
    this._initializeTeamMemberUsernames().catch(
      (error) => elizaLogger.error(
        "Error initializing team member usernames:",
        error
      )
    );
    this.autoPostConfig = {
      enabled: this.runtime.character.clientConfig?.telegram?.autoPost?.enabled || false,
      monitorTime: this.runtime.character.clientConfig?.telegram?.autoPost?.monitorTime || 3e5,
      inactivityThreshold: this.runtime.character.clientConfig?.telegram?.autoPost?.inactivityThreshold || 36e5,
      mainChannelId: this.runtime.character.clientConfig?.telegram?.autoPost?.mainChannelId,
      pinnedMessagesGroups: this.runtime.character.clientConfig?.telegram?.autoPost?.pinnedMessagesGroups || [],
      minTimeBetweenPosts: this.runtime.character.clientConfig?.telegram?.autoPost?.minTimeBetweenPosts || 72e5
    };
    if (this.autoPostConfig.enabled) {
      this._startAutoPostMonitoring();
    }
  }
  async _initializeTeamMemberUsernames() {
    if (!this.runtime.character.clientConfig?.telegram?.isPartOfTeam)
      return;
    const teamAgentIds = this.runtime.character.clientConfig.telegram.teamAgentIds || [];
    for (const id of teamAgentIds) {
      try {
        const chat = await this.bot.telegram.getChat(id);
        if ("username" in chat && chat.username) {
          this.teamMemberUsernames.set(id, chat.username);
          elizaLogger.info(
            `Cached username for team member ${id}: ${chat.username}`
          );
        }
      } catch (error) {
        elizaLogger.error(
          `Error getting username for team member ${id}:`,
          error
        );
      }
    }
  }
  _startAutoPostMonitoring() {
    if (this.bot.botInfo) {
      elizaLogger.info(
        "[AutoPost Telegram] Bot ready, starting monitoring"
      );
      this._initializeAutoPost();
    } else {
      elizaLogger.info(
        "[AutoPost Telegram] Bot not ready, waiting for ready event"
      );
      this.bot.telegram.getMe().then(() => {
        elizaLogger.info(
          "[AutoPost Telegram] Bot ready, starting monitoring"
        );
        this._initializeAutoPost();
      });
    }
  }
  _initializeAutoPost() {
    setTimeout(() => {
      this.autoPostInterval = setInterval(() => {
        this._checkChannelActivity();
      }, Math.floor(Math.random() * (4 * 60 * 60 * 1e3) + 2 * 60 * 60 * 1e3));
    }, 5e3);
  }
  async _checkChannelActivity() {
    if (!this.autoPostConfig.enabled || !this.autoPostConfig.mainChannelId)
      return;
    try {
      const now = Date.now();
      const lastActivityTime = this.lastChannelActivity[this.autoPostConfig.mainChannelId] || 0;
      const timeSinceLastMessage = now - lastActivityTime;
      const timeSinceLastAutoPost = now - (this.autoPostConfig.lastAutoPost || 0);
      const randomThreshold = this.autoPostConfig.inactivityThreshold + (Math.random() * 18e5 - 9e5);
      if (timeSinceLastMessage > randomThreshold && timeSinceLastAutoPost > (this.autoPostConfig.minTimeBetweenPosts || 0)) {
        try {
          const roomId = stringToUuid(
            this.autoPostConfig.mainChannelId + "-" + this.runtime.agentId
          );
          const memory = {
            id: stringToUuid(`autopost-${Date.now()}`),
            userId: this.runtime.agentId,
            agentId: this.runtime.agentId,
            roomId,
            content: {
              text: "AUTO_POST_ENGAGEMENT",
              source: "telegram"
            },
            embedding: getEmbeddingZeroVector(),
            createdAt: Date.now()
          };
          let state = await this.runtime.composeState(memory, {
            telegramBot: this.bot,
            agentName: this.runtime.character.name
          });
          const context = composeContext({
            state,
            template: this.runtime.character.templates?.telegramAutoPostTemplate || telegramAutoPostTemplate
          });
          const responseContent = await this._generateResponse(
            memory,
            state,
            context
          );
          if (!responseContent?.text) return;
          console.log(
            `[Auto Post Telegram] Recent Messages: ${responseContent}`
          );
          const messages = await Promise.all(
            this.splitMessage(responseContent.text.trim()).map(
              (chunk) => this.bot.telegram.sendMessage(
                this.autoPostConfig.mainChannelId,
                chunk
              )
            )
          );
          const memories = messages.map((m) => ({
            id: stringToUuid(
              roomId + "-" + m.message_id.toString()
            ),
            userId: this.runtime.agentId,
            agentId: this.runtime.agentId,
            content: {
              ...responseContent,
              text: m.text
            },
            roomId,
            embedding: getEmbeddingZeroVector(),
            createdAt: m.date * 1e3
          }));
          for (const m of memories) {
            await this.runtime.messageManager.createMemory(m);
          }
          this.autoPostConfig.lastAutoPost = Date.now();
          state = await this.runtime.updateRecentMessageState(state);
          await this.runtime.evaluate(memory, state, true);
        } catch (error) {
          elizaLogger.warn("[AutoPost Telegram] Error:", error);
        }
      } else {
        elizaLogger.warn(
          "[AutoPost Telegram] Activity within threshold. Not posting."
        );
      }
    } catch (error) {
      elizaLogger.warn(
        "[AutoPost Telegram] Error checking channel activity:",
        error
      );
    }
  }
  async _monitorPinnedMessages(ctx) {
    if (!this.autoPostConfig.pinnedMessagesGroups.length) {
      elizaLogger.warn(
        "[AutoPost Telegram] Auto post config no pinned message groups"
      );
      return;
    }
    if (!ctx.message || !("pinned_message" in ctx.message)) {
      return;
    }
    const pinnedMessage = ctx.message.pinned_message;
    if (!pinnedMessage) return;
    if (!this.autoPostConfig.pinnedMessagesGroups.includes(
      ctx.chat.id.toString()
    ))
      return;
    const mainChannel = this.autoPostConfig.mainChannelId;
    if (!mainChannel) return;
    try {
      elizaLogger.info(
        `[AutoPost Telegram] Processing pinned message in group ${ctx.chat.id}`
      );
      const messageContent = "text" in pinnedMessage && typeof pinnedMessage.text === "string" ? pinnedMessage.text : "caption" in pinnedMessage && typeof pinnedMessage.caption === "string" ? pinnedMessage.caption : "New pinned message";
      const roomId = stringToUuid(
        mainChannel + "-" + this.runtime.agentId
      );
      const memory = {
        id: stringToUuid(`pinned-${Date.now()}`),
        userId: this.runtime.agentId,
        agentId: this.runtime.agentId,
        roomId,
        content: {
          text: messageContent,
          source: "telegram",
          metadata: {
            messageId: pinnedMessage.message_id,
            pinnedMessageData: pinnedMessage
          }
        },
        embedding: getEmbeddingZeroVector(),
        createdAt: Date.now()
      };
      let state = await this.runtime.composeState(memory, {
        telegramBot: this.bot,
        pinnedMessageContent: messageContent,
        pinnedGroupId: ctx.chat.id.toString(),
        agentName: this.runtime.character.name
      });
      const context = composeContext({
        state,
        template: this.runtime.character.templates?.telegramPinnedMessageTemplate || telegramPinnedMessageTemplate
      });
      const responseContent = await this._generateResponse(
        memory,
        state,
        context
      );
      if (!responseContent?.text) return;
      const messages = await Promise.all(
        this.splitMessage(responseContent.text.trim()).map(
          (chunk) => this.bot.telegram.sendMessage(mainChannel, chunk)
        )
      );
      const memories = messages.map((m) => ({
        id: stringToUuid(roomId + "-" + m.message_id.toString()),
        userId: this.runtime.agentId,
        agentId: this.runtime.agentId,
        content: {
          ...responseContent,
          text: m.text
        },
        roomId,
        embedding: getEmbeddingZeroVector(),
        createdAt: m.date * 1e3
      }));
      for (const m of memories) {
        await this.runtime.messageManager.createMemory(m);
      }
      state = await this.runtime.updateRecentMessageState(state);
      await this.runtime.evaluate(memory, state, true);
    } catch (error) {
      elizaLogger.warn(
        `[AutoPost Telegram] Error processing pinned message:`,
        error
      );
    }
  }
  _getTeamMemberUsername(id) {
    return this.teamMemberUsernames.get(id);
  }
  _getNormalizedUserId(id) {
    return id.toString().replace(/[^0-9]/g, "");
  }
  _isTeamMember(userId) {
    const teamConfig = this.runtime.character.clientConfig?.telegram;
    if (!teamConfig?.isPartOfTeam || !teamConfig.teamAgentIds) return false;
    const normalizedUserId = this._getNormalizedUserId(userId);
    return teamConfig.teamAgentIds.some(
      (teamId) => this._getNormalizedUserId(teamId) === normalizedUserId
    );
  }
  _isTeamLeader() {
    return this.bot.botInfo?.id.toString() === this.runtime.character.clientConfig?.telegram?.teamLeaderId;
  }
  _isTeamCoordinationRequest(content) {
    const contentLower = content.toLowerCase();
    return TEAM_COORDINATION.KEYWORDS?.some(
      (keyword) => contentLower.includes(keyword.toLowerCase())
    );
  }
  _isRelevantToTeamMember(content, chatId, lastAgentMemory = null) {
    const teamConfig = this.runtime.character.clientConfig?.telegram;
    if (this._isTeamLeader() && lastAgentMemory?.content.text) {
      const timeSinceLastMessage = Date.now() - lastAgentMemory.createdAt;
      if (timeSinceLastMessage > MESSAGE_CONSTANTS.INTEREST_DECAY_TIME) {
        return false;
      }
      const similarity = cosineSimilarity(
        content.toLowerCase(),
        lastAgentMemory.content.text.toLowerCase()
      );
      return similarity >= MESSAGE_CONSTANTS.DEFAULT_SIMILARITY_THRESHOLD_FOLLOW_UPS;
    }
    if (!teamConfig?.teamMemberInterestKeywords?.length) {
      return false;
    }
    return teamConfig.teamMemberInterestKeywords.some(
      (keyword) => content.toLowerCase().includes(keyword.toLowerCase())
    );
  }
  async _analyzeContextSimilarity(currentMessage, previousContext, agentLastMessage) {
    if (!previousContext) return 1;
    const timeDiff = Date.now() - previousContext.timestamp;
    const timeWeight = Math.max(0, 1 - timeDiff / (5 * 60 * 1e3));
    const similarity = cosineSimilarity(
      currentMessage.toLowerCase(),
      previousContext.content.toLowerCase(),
      agentLastMessage?.toLowerCase()
    );
    return similarity * timeWeight;
  }
  async _shouldRespondBasedOnContext(message2, chatState) {
    const messageText = "text" in message2 ? message2.text : "caption" in message2 ? message2.caption : "";
    if (!messageText) return false;
    if (this._isMessageForMe(message2)) return true;
    if (chatState?.currentHandler !== this.bot.botInfo?.id.toString())
      return false;
    if (!chatState.messages?.length) return false;
    const lastUserMessage = [...chatState.messages].reverse().find(
      (m, index) => index > 0 && // Skip first message (current)
      m.userId !== this.runtime.agentId
    );
    if (!lastUserMessage) return false;
    const lastSelfMemories = await this.runtime.messageManager.getMemories({
      roomId: stringToUuid(
        message2.chat.id.toString() + "-" + this.runtime.agentId
      ),
      unique: false,
      count: 5
    });
    const lastSelfSortedMemories = lastSelfMemories?.filter((m) => m.userId === this.runtime.agentId).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const contextSimilarity = await this._analyzeContextSimilarity(
      messageText,
      {
        content: lastUserMessage.content.text || "",
        timestamp: Date.now()
      },
      lastSelfSortedMemories?.[0]?.content?.text
    );
    const similarityThreshold = this.runtime.character.clientConfig?.telegram?.messageSimilarityThreshold || chatState.contextSimilarityThreshold || MESSAGE_CONSTANTS.DEFAULT_SIMILARITY_THRESHOLD;
    return contextSimilarity >= similarityThreshold;
  }
  _isMessageForMe(message2) {
    const botUsername = this.bot.botInfo?.username;
    if (!botUsername) return false;
    const messageText = "text" in message2 ? message2.text : "caption" in message2 ? message2.caption : "";
    if (!messageText) return false;
    const isReplyToBot = message2.reply_to_message?.from?.is_bot === true && message2.reply_to_message?.from?.username === botUsername;
    const isMentioned = messageText.includes(`@${botUsername}`);
    const hasUsername = messageText.toLowerCase().includes(botUsername.toLowerCase());
    return isReplyToBot || isMentioned || !this.runtime.character.clientConfig?.telegram?.shouldRespondOnlyToMentions && hasUsername;
  }
  _checkInterest(chatId) {
    const chatState = this.interestChats[chatId];
    if (!chatState) return false;
    const lastMessage = chatState.messages[chatState.messages.length - 1];
    const timeSinceLastMessage = Date.now() - chatState.lastMessageSent;
    if (timeSinceLastMessage > MESSAGE_CONSTANTS.INTEREST_DECAY_TIME) {
      delete this.interestChats[chatId];
      return false;
    } else if (timeSinceLastMessage > MESSAGE_CONSTANTS.PARTIAL_INTEREST_DECAY) {
      return this._isRelevantToTeamMember(
        lastMessage?.content.text || "",
        chatId
      );
    }
    if (this._isTeamLeader() && chatState.messages.length > 0) {
      if (!this._isRelevantToTeamMember(
        lastMessage?.content.text || "",
        chatId
      )) {
        const recentTeamResponses = chatState.messages.slice(-3).some(
          (m) => m.userId !== this.runtime.agentId && this._isTeamMember(m.userId.toString())
        );
        if (recentTeamResponses) {
          delete this.interestChats[chatId];
          return false;
        }
      }
    }
    return true;
  }
  // Process image messages and generate descriptions
  async processImage(message2) {
    try {
      let imageUrl = null;
      elizaLogger.info(`Telegram Message: ${message2}`);
      if ("photo" in message2 && message2.photo?.length > 0) {
        const photo = message2.photo[message2.photo.length - 1];
        const fileLink = await this.bot.telegram.getFileLink(
          photo.file_id
        );
        imageUrl = fileLink.toString();
      } else if ("document" in message2 && message2.document?.mime_type?.startsWith("image/")) {
        const fileLink = await this.bot.telegram.getFileLink(
          message2.document.file_id
        );
        imageUrl = fileLink.toString();
      }
      if (imageUrl) {
        const imageDescriptionService = this.runtime.getService(
          ServiceType.IMAGE_DESCRIPTION
        );
        const { title, description } = await imageDescriptionService.describeImage(imageUrl);
        return { description: `[Image: ${title}
${description}]` };
      }
    } catch (error) {
      console.error("\u274C Error processing image:", error);
    }
    return null;
  }
  // Decide if the bot should respond to the message
  async _shouldRespond(message2, state) {
    if (this.runtime.character.clientConfig?.telegram?.shouldRespondOnlyToMentions) {
      return this._isMessageForMe(message2);
    }
    if ("text" in message2 && message2.text?.includes(`@${this.bot.botInfo?.username}`)) {
      elizaLogger.info(`Bot mentioned`);
      return true;
    }
    if (message2.chat.type === "private") {
      return true;
    }
    if ("photo" in message2 || "document" in message2 && message2.document?.mime_type?.startsWith("image/")) {
      return false;
    }
    const chatId = message2.chat.id.toString();
    const chatState = this.interestChats[chatId];
    const messageText = "text" in message2 ? message2.text : "caption" in message2 ? message2.caption : "";
    if (this.runtime.character.clientConfig?.telegram?.isPartOfTeam && !this._isTeamLeader() && this._isRelevantToTeamMember(messageText, chatId)) {
      return true;
    }
    if (this.runtime.character.clientConfig?.telegram?.isPartOfTeam) {
      if (this._isTeamCoordinationRequest(messageText)) {
        if (this._isTeamLeader()) {
          return true;
        } else {
          const randomDelay = Math.floor(
            Math.random() * (TIMING_CONSTANTS.TEAM_MEMBER_DELAY_MAX - TIMING_CONSTANTS.TEAM_MEMBER_DELAY_MIN)
          ) + TIMING_CONSTANTS.TEAM_MEMBER_DELAY_MIN;
          await new Promise(
            (resolve) => setTimeout(resolve, randomDelay)
          );
          return true;
        }
      }
      if (!this._isTeamLeader() && this._isRelevantToTeamMember(messageText, chatId)) {
        await new Promise(
          (resolve) => setTimeout(resolve, TIMING_CONSTANTS.TEAM_MEMBER_DELAY)
        );
        if (chatState.messages?.length) {
          const recentMessages = chatState.messages.slice(
            -MESSAGE_CONSTANTS.RECENT_MESSAGE_COUNT
          );
          const leaderResponded = recentMessages.some(
            (m) => m.userId === this.runtime.character.clientConfig?.telegram?.teamLeaderId && Date.now() - chatState.lastMessageSent < 3e3
          );
          if (leaderResponded) {
            return Math.random() > RESPONSE_CHANCES.AFTER_LEADER;
          }
        }
        return true;
      }
      if (this._isTeamLeader() && !this._isRelevantToTeamMember(messageText, chatId)) {
        const randomDelay = Math.floor(
          Math.random() * (TIMING_CONSTANTS.LEADER_DELAY_MAX - TIMING_CONSTANTS.LEADER_DELAY_MIN)
        ) + TIMING_CONSTANTS.LEADER_DELAY_MIN;
        await new Promise(
          (resolve) => setTimeout(resolve, randomDelay)
        );
        if (chatState?.messages?.length) {
          const recentResponses = chatState.messages.slice(
            -MESSAGE_CONSTANTS.RECENT_MESSAGE_COUNT
          );
          const otherTeamMemberResponded = recentResponses.some(
            (m) => m.userId !== this.runtime.agentId && this._isTeamMember(m.userId)
          );
          if (otherTeamMemberResponded) {
            return false;
          }
        }
      }
      if (this._isMessageForMe(message2)) {
        const channelState = this.interestChats[chatId];
        if (channelState) {
          channelState.currentHandler = this.bot.botInfo?.id.toString();
          channelState.lastMessageSent = Date.now();
        }
        return true;
      }
      if (chatState?.currentHandler) {
        if (chatState.currentHandler !== this.bot.botInfo?.id.toString() && this._isTeamMember(chatState.currentHandler)) {
          return false;
        }
      }
      if (!this._isMessageForMe(message2) && this.interestChats[chatId]) {
        const recentMessages = this.interestChats[chatId].messages.slice(-MESSAGE_CONSTANTS.CHAT_HISTORY_COUNT);
        const ourMessageCount = recentMessages.filter(
          (m) => m.userId === this.runtime.agentId
        ).length;
        if (ourMessageCount > 2) {
          const responseChance = Math.pow(0.5, ourMessageCount - 2);
          if (Math.random() > responseChance) {
            return;
          }
        }
      }
    }
    if (chatState?.currentHandler) {
      const shouldRespondContext = await this._shouldRespondBasedOnContext(message2, chatState);
      if (!shouldRespondContext) {
        return false;
      }
    }
    if ("text" in message2 || "caption" in message2 && message2.caption) {
      const shouldRespondContext = composeContext({
        state,
        template: this.runtime.character.templates?.telegramShouldRespondTemplate || this.runtime.character?.templates?.shouldRespondTemplate || composeRandomUser(telegramShouldRespondTemplate, 2)
      });
      const response = await generateShouldRespond({
        runtime: this.runtime,
        context: shouldRespondContext,
        modelClass: ModelClass.SMALL
      });
      return response === "RESPOND";
    }
    return false;
  }
  // Send long messages in chunks
  async sendMessageInChunks(ctx, content, replyToMessageId) {
    if (content.attachments && content.attachments.length > 0) {
      content.attachments.map(async (attachment) => {
        const typeMap = {
          "image/gif": "animation" /* ANIMATION */,
          image: "photo" /* PHOTO */,
          doc: "document" /* DOCUMENT */,
          video: "video" /* VIDEO */,
          audio: "audio" /* AUDIO */
        };
        let mediaType = void 0;
        for (const prefix in typeMap) {
          if (attachment.contentType.startsWith(prefix)) {
            mediaType = typeMap[prefix];
            break;
          }
        }
        if (!mediaType) {
          throw new Error(
            `Unsupported Telegram attachment content type: ${attachment.contentType}`
          );
        }
        await this.sendMedia(
          ctx,
          attachment.url,
          mediaType,
          attachment.description
        );
      });
    } else {
      const chunks = this.splitMessage(content.text);
      const sentMessages = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = escapeMarkdown(chunks[i]);
        const sentMessage = await ctx.telegram.sendMessage(
          ctx.chat.id,
          chunk,
          {
            reply_parameters: i === 0 && replyToMessageId ? { message_id: replyToMessageId } : void 0,
            parse_mode: "Markdown"
          }
        );
        sentMessages.push(sentMessage);
      }
      return sentMessages;
    }
  }
  async sendMedia(ctx, mediaPath, type, caption) {
    try {
      const isUrl = /^(http|https):\/\//.test(mediaPath);
      const sendFunctionMap = {
        ["photo" /* PHOTO */]: ctx.telegram.sendPhoto.bind(ctx.telegram),
        ["video" /* VIDEO */]: ctx.telegram.sendVideo.bind(ctx.telegram),
        ["document" /* DOCUMENT */]: ctx.telegram.sendDocument.bind(
          ctx.telegram
        ),
        ["audio" /* AUDIO */]: ctx.telegram.sendAudio.bind(ctx.telegram),
        ["animation" /* ANIMATION */]: ctx.telegram.sendAnimation.bind(
          ctx.telegram
        )
      };
      const sendFunction = sendFunctionMap[type];
      if (!sendFunction) {
        throw new Error(`Unsupported media type: ${type}`);
      }
      if (isUrl) {
        await sendFunction(ctx.chat.id, mediaPath, { caption });
      } else {
        if (!fs.existsSync(mediaPath)) {
          throw new Error(`File not found at path: ${mediaPath}`);
        }
        const fileStream = fs.createReadStream(mediaPath);
        try {
          await sendFunction(
            ctx.chat.id,
            { source: fileStream },
            { caption }
          );
        } finally {
          fileStream.destroy();
        }
      }
      elizaLogger.info(
        `${type.charAt(0).toUpperCase() + type.slice(1)} sent successfully: ${mediaPath}`
      );
    } catch (error) {
      elizaLogger.error(
        `Failed to send ${type}. Path: ${mediaPath}. Error: ${error.message}`
      );
      elizaLogger.debug(error.stack);
      throw error;
    }
  }
  // Split message into smaller parts
  splitMessage(text) {
    const chunks = [];
    let currentChunk = "";
    const lines = text.split("\n");
    for (const line of lines) {
      if (currentChunk.length + line.length + 1 <= MAX_MESSAGE_LENGTH) {
        currentChunk += (currentChunk ? "\n" : "") + line;
      } else {
        if (currentChunk) chunks.push(currentChunk);
        currentChunk = line;
      }
    }
    if (currentChunk) chunks.push(currentChunk);
    return chunks;
  }
  // Generate a response using AI
  async _generateResponse(message2, _state, context) {
    const { userId, roomId } = message2;
    const response = await generateMessageResponse({
      runtime: this.runtime,
      context,
      modelClass: ModelClass.LARGE
    });
    if (!response) {
      console.error("\u274C No response from generateMessageResponse");
      return null;
    }
    await this.runtime.databaseAdapter.log({
      body: { message: message2, context, response },
      userId,
      roomId,
      type: "response"
    });
    return response;
  }
  // Main handler for incoming messages
  async handleMessage(ctx) {
    if (!ctx.message || !ctx.from) {
      return;
    }
    this.lastChannelActivity[ctx.chat.id.toString()] = Date.now();
    if (this.autoPostConfig.enabled && ctx.message && "pinned_message" in ctx.message) {
      await this._monitorPinnedMessages(ctx);
      return;
    }
    if (this.runtime.character.clientConfig?.telegram?.shouldIgnoreBotMessages && ctx.from.is_bot) {
      return;
    }
    if (this.runtime.character.clientConfig?.telegram?.shouldIgnoreDirectMessages && ctx.chat?.type === "private") {
      return;
    }
    const message2 = ctx.message;
    const chatId = ctx.chat?.id.toString();
    const messageText = "text" in message2 ? message2.text : "caption" in message2 ? message2.caption : "";
    if (this.runtime.character.clientConfig?.telegram?.isPartOfTeam && !this.runtime.character.clientConfig?.telegram?.shouldRespondOnlyToMentions) {
      const isDirectlyMentioned = this._isMessageForMe(message2);
      const hasInterest = this._checkInterest(chatId);
      if (!this._isTeamLeader() && this._isRelevantToTeamMember(messageText, chatId)) {
        this.interestChats[chatId] = {
          currentHandler: this.bot.botInfo?.id.toString(),
          lastMessageSent: Date.now(),
          messages: []
        };
      }
      const isTeamRequest = this._isTeamCoordinationRequest(messageText);
      const isLeader = this._isTeamLeader();
      if (hasInterest && !isDirectlyMentioned) {
        const lastSelfMemories = await this.runtime.messageManager.getMemories({
          roomId: stringToUuid(
            chatId + "-" + this.runtime.agentId
          ),
          unique: false,
          count: 5
        });
        const lastSelfSortedMemories = lastSelfMemories?.filter((m) => m.userId === this.runtime.agentId).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        const isRelevant = this._isRelevantToTeamMember(
          messageText,
          chatId,
          lastSelfSortedMemories?.[0]
        );
        if (!isRelevant) {
          delete this.interestChats[chatId];
          return;
        }
      }
      if (isTeamRequest) {
        if (isLeader) {
          this.interestChats[chatId] = {
            currentHandler: this.bot.botInfo?.id.toString(),
            lastMessageSent: Date.now(),
            messages: []
          };
        } else {
          this.interestChats[chatId] = {
            currentHandler: this.bot.botInfo?.id.toString(),
            lastMessageSent: Date.now(),
            messages: []
          };
          if (!isDirectlyMentioned) {
            this.interestChats[chatId].lastMessageSent = 0;
          }
        }
      }
      const otherTeamMembers = this.runtime.character.clientConfig.telegram.teamAgentIds.filter(
        (id) => id !== this.bot.botInfo?.id.toString()
      );
      const mentionedTeamMember = otherTeamMembers.find((id) => {
        const username = this._getTeamMemberUsername(id);
        return username && messageText?.includes(`@${username}`);
      });
      if (mentionedTeamMember) {
        if (hasInterest || this.interestChats[chatId]?.currentHandler === this.bot.botInfo?.id.toString()) {
          delete this.interestChats[chatId];
          if (!isDirectlyMentioned) {
            return;
          }
        }
      }
      if (isDirectlyMentioned) {
        this.interestChats[chatId] = {
          currentHandler: this.bot.botInfo?.id.toString(),
          lastMessageSent: Date.now(),
          messages: []
        };
      } else if (!isTeamRequest && !hasInterest) {
        return;
      }
      if (this.interestChats[chatId]) {
        this.interestChats[chatId].messages.push({
          userId: stringToUuid(ctx.from.id.toString()),
          userName: ctx.from.username || ctx.from.first_name || "Unknown User",
          content: { text: messageText, source: "telegram" }
        });
        if (this.interestChats[chatId].messages.length > MESSAGE_CONSTANTS.MAX_MESSAGES) {
          this.interestChats[chatId].messages = this.interestChats[chatId].messages.slice(-MESSAGE_CONSTANTS.MAX_MESSAGES);
        }
      }
    }
    try {
      const userId = stringToUuid(ctx.from.id.toString());
      const userName = ctx.from.username || ctx.from.first_name || "Unknown User";
      const chatId2 = stringToUuid(
        ctx.chat?.id.toString() + "-" + this.runtime.agentId
      );
      const agentId = this.runtime.agentId;
      const roomId = chatId2;
      await this.runtime.ensureConnection(
        userId,
        roomId,
        userName,
        userName,
        "telegram"
      );
      const messageId = stringToUuid(
        roomId + "-" + message2.message_id.toString()
      );
      const imageInfo = await this.processImage(message2);
      let messageText2 = "";
      if ("text" in message2) {
        messageText2 = message2.text;
      } else if ("caption" in message2 && message2.caption) {
        messageText2 = message2.caption;
      }
      const fullText = imageInfo ? `${messageText2} ${imageInfo.description}` : messageText2;
      if (!fullText) {
        return;
      }
      const content = {
        text: fullText,
        source: "telegram",
        inReplyTo: "reply_to_message" in message2 && message2.reply_to_message ? stringToUuid(
          message2.reply_to_message.message_id.toString() + "-" + this.runtime.agentId
        ) : void 0
      };
      const memory = {
        id: messageId,
        agentId,
        userId,
        roomId,
        content,
        createdAt: message2.date * 1e3,
        embedding: getEmbeddingZeroVector()
      };
      await this.runtime.messageManager.createMemory(memory);
      let state = await this.runtime.composeState(memory);
      state = await this.runtime.updateRecentMessageState(state);
      const shouldRespond = await this._shouldRespond(message2, state);
      const callback = async (content2) => {
        const sentMessages = await this.sendMessageInChunks(
          ctx,
          content2,
          message2.message_id
        );
        if (sentMessages) {
          const memories = [];
          for (let i = 0; i < sentMessages.length; i++) {
            const sentMessage = sentMessages[i];
            const isLastMessage = i === sentMessages.length - 1;
            const memory2 = {
              id: stringToUuid(
                roomId + "-" + sentMessage.message_id.toString()
              ),
              agentId,
              userId: agentId,
              roomId,
              content: {
                ...content2,
                text: sentMessage.text,
                inReplyTo: messageId
              },
              createdAt: sentMessage.date * 1e3,
              embedding: getEmbeddingZeroVector()
            };
            memory2.content.action = !isLastMessage ? "CONTINUE" : content2.action;
            await this.runtime.messageManager.createMemory(memory2);
            memories.push(memory2);
          }
          return memories;
        }
      };
      if (shouldRespond) {
        const context = composeContext({
          state,
          template: this.runtime.character.templates?.telegramMessageHandlerTemplate || this.runtime.character?.templates?.messageHandlerTemplate || telegramMessageHandlerTemplate
        });
        const responseContent = await this._generateResponse(
          memory,
          state,
          context
        );
        if (!responseContent || !responseContent.text) return;
        const responseMessages = await callback(responseContent);
        state = await this.runtime.updateRecentMessageState(state);
        await this.runtime.processActions(
          memory,
          responseMessages,
          state,
          callback
        );
      }
      await this.runtime.evaluate(memory, state, shouldRespond, callback);
    } catch (error) {
      elizaLogger.error("\u274C Error handling message:", error);
      elizaLogger.error("Error sending message:", error);
    }
  }
};

// src/getOrCreateRecommenderInBe.ts
async function getOrCreateRecommenderInBe(recommenderId, username, backendToken, backend, retries = 3, delayMs = 2e3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(
        `${backend}/api/updaters/getOrCreateRecommender`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${backendToken}`
          },
          body: JSON.stringify({
            recommenderId,
            username
          })
        }
      );
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(
        `Attempt ${attempt} failed: Error getting or creating recommender in backend`,
        error
      );
      if (attempt < retries) {
        console.log(`Retrying in ${delayMs} ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        console.error("All attempts failed.");
      }
    }
  }
}

// src/telegramClient.ts
var TelegramClient = class {
  bot;
  runtime;
  messageManager;
  backend;
  backendToken;
  tgTrader;
  options;
  constructor(runtime, botToken) {
    elizaLogger2.log("\u{1F4F1} Constructing new TelegramClient...");
    this.options = {
      telegram: {
        apiRoot: runtime.getSetting("TELEGRAM_API_ROOT") || process.env.TELEGRAM_API_ROOT || "https://api.telegram.org"
      }
    };
    this.runtime = runtime;
    this.bot = new Telegraf(botToken, this.options);
    this.messageManager = new MessageManager(this.bot, this.runtime);
    this.backend = runtime.getSetting("BACKEND_URL");
    this.backendToken = runtime.getSetting("BACKEND_TOKEN");
    this.tgTrader = runtime.getSetting("TG_TRADER");
    elizaLogger2.log("\u2705 TelegramClient constructor completed");
  }
  async start() {
    elizaLogger2.log("\u{1F680} Starting Telegram bot...");
    try {
      await this.initializeBot();
      this.setupMessageHandlers();
      this.setupShutdownHandlers();
    } catch (error) {
      elizaLogger2.error("\u274C Failed to launch Telegram bot:", error);
      throw error;
    }
  }
  async initializeBot() {
    this.bot.launch({ dropPendingUpdates: true });
    elizaLogger2.log(
      "\u2728 Telegram bot successfully launched and is running!"
    );
    const botInfo = await this.bot.telegram.getMe();
    this.bot.botInfo = botInfo;
    elizaLogger2.success(`Bot username: @${botInfo.username}`);
    this.messageManager.bot = this.bot;
  }
  async isGroupAuthorized(ctx) {
    const config = this.runtime.character.clientConfig?.telegram;
    if (ctx.from?.id === ctx.botInfo?.id) {
      return false;
    }
    if (!config?.shouldOnlyJoinInAllowedGroups) {
      return true;
    }
    const allowedGroups = config.allowedGroupIds || [];
    const currentGroupId = ctx.chat.id.toString();
    if (!allowedGroups.includes(currentGroupId)) {
      elizaLogger2.info(`Unauthorized group detected: ${currentGroupId}`);
      try {
        await ctx.reply("Not authorized. Leaving.");
        await ctx.leaveChat();
      } catch (error) {
        elizaLogger2.error(
          `Error leaving unauthorized group ${currentGroupId}:`,
          error
        );
      }
      return false;
    }
    return true;
  }
  setupMessageHandlers() {
    elizaLogger2.log("Setting up message handler...");
    this.bot.on(message("new_chat_members"), async (ctx) => {
      try {
        const newMembers = ctx.message.new_chat_members;
        const isBotAdded = newMembers.some(
          (member) => member.id === ctx.botInfo.id
        );
        if (isBotAdded && !await this.isGroupAuthorized(ctx)) {
          return;
        }
      } catch (error) {
        elizaLogger2.error("Error handling new chat members:", error);
      }
    });
    this.bot.on("message", async (ctx) => {
      try {
        if (!await this.isGroupAuthorized(ctx)) {
          return;
        }
        if (this.tgTrader) {
          const userId = ctx.from?.id.toString();
          const username = ctx.from?.username || ctx.from?.first_name || "Unknown";
          if (!userId) {
            elizaLogger2.warn(
              "Received message from a user without an ID."
            );
            return;
          }
          try {
            await getOrCreateRecommenderInBe(
              userId,
              username,
              this.backendToken,
              this.backend
            );
          } catch (error) {
            elizaLogger2.error(
              "Error getting or creating recommender in backend",
              error
            );
          }
        }
        await this.messageManager.handleMessage(ctx);
      } catch (error) {
        elizaLogger2.error("\u274C Error handling message:", error);
        if (error?.response?.error_code !== 403) {
          try {
            await ctx.reply(
              "An error occurred while processing your message."
            );
          } catch (replyError) {
            elizaLogger2.error(
              "Failed to send error message:",
              replyError
            );
          }
        }
      }
    });
    this.bot.on("photo", (ctx) => {
      elizaLogger2.log(
        "\u{1F4F8} Received photo message with caption:",
        ctx.message.caption
      );
    });
    this.bot.on("document", (ctx) => {
      elizaLogger2.log(
        "\u{1F4CE} Received document message:",
        ctx.message.document.file_name
      );
    });
    this.bot.catch((err, ctx) => {
      elizaLogger2.error(`\u274C Telegram Error for ${ctx.updateType}:`, err);
      ctx.reply("An unexpected error occurred. Please try again later.");
    });
  }
  setupShutdownHandlers() {
    const shutdownHandler = async (signal) => {
      elizaLogger2.log(
        `\u26A0\uFE0F Received ${signal}. Shutting down Telegram bot gracefully...`
      );
      try {
        await this.stop();
        elizaLogger2.log("\u{1F6D1} Telegram bot stopped gracefully");
      } catch (error) {
        elizaLogger2.error(
          "\u274C Error during Telegram bot shutdown:",
          error
        );
        throw error;
      }
    };
    process.once("SIGINT", () => shutdownHandler("SIGINT"));
    process.once("SIGTERM", () => shutdownHandler("SIGTERM"));
    process.once("SIGHUP", () => shutdownHandler("SIGHUP"));
  }
  async stop() {
    elizaLogger2.log("Stopping Telegram bot...");
    this.bot.stop();
    elizaLogger2.log("Telegram bot stopped");
  }
};

// src/environment.ts
import { z } from "zod";
var telegramEnvSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, "Telegram bot token is required")
});
async function validateTelegramConfig(runtime) {
  try {
    const config = {
      TELEGRAM_BOT_TOKEN: runtime.getSetting("TELEGRAM_BOT_TOKEN") || process.env.TELEGRAM_BOT_TOKEN
    };
    return telegramEnvSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map((err) => `${err.path.join(".")}: ${err.message}`).join("\n");
      throw new Error(
        `Telegram configuration validation failed:
${errorMessages}`
      );
    }
    throw error;
  }
}

// src/index.ts
var TelegramClientInterface = {
  start: async (runtime) => {
    await validateTelegramConfig(runtime);
    const tg = new TelegramClient(
      runtime,
      runtime.getSetting("TELEGRAM_BOT_TOKEN")
    );
    await tg.start();
    elizaLogger3.success(
      `\u2705 Telegram client successfully started for character ${runtime.character.name}`
    );
    return tg;
  },
  stop: async (_runtime) => {
    elizaLogger3.warn("Telegram client does not support stopping yet");
  }
};
var index_default = TelegramClientInterface;
export {
  TelegramClientInterface,
  index_default as default
};
//# sourceMappingURL=index.js.map