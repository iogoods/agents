// src/index.ts
import { elizaLogger as elizaLogger6 } from "@elizaos/core";

// src/environment.ts
import {
  parseBooleanFromText
} from "@elizaos/core";
import { z } from "zod";
var DEFAULT_POST_INTERVAL_MIN = 60;
var DEFAULT_POST_INTERVAL_MAX = 120;
var DEFAULT_ACTION_INTERVAL = 5;
var DEFAULT_MAX_ACTIONS = 1;
var instagramUsernameSchema = z.string().min(1, "An Instagram Username must be at least 1 character long").max(30, "An Instagram Username cannot exceed 30 characters").refine((username) => {
  return /^[A-Za-z0-9._]+$/.test(username);
}, "An Instagram Username can only contain letters, numbers, periods, and underscores");
var instagramEnvSchema = z.object({
  INSTAGRAM_DRY_RUN: z.boolean(),
  INSTAGRAM_USERNAME: instagramUsernameSchema,
  INSTAGRAM_PASSWORD: z.string().min(1, "Instagram password is required"),
  // Instagram API credentials
  INSTAGRAM_APP_ID: z.string().min(1, "Instagram App ID is required"),
  INSTAGRAM_APP_SECRET: z.string().min(1, "Instagram App Secret is required"),
  // Optional Business Account ID for additional features
  INSTAGRAM_BUSINESS_ACCOUNT_ID: z.string().optional(),
  // Posting configuration
  INSTAGRAM_POST_INTERVAL_MIN: z.number().int().default(DEFAULT_POST_INTERVAL_MIN),
  INSTAGRAM_POST_INTERVAL_MAX: z.number().int().default(DEFAULT_POST_INTERVAL_MAX),
  // Action processing configuration
  INSTAGRAM_ENABLE_ACTION_PROCESSING: z.boolean().default(false),
  INSTAGRAM_ACTION_INTERVAL: z.number().int().default(DEFAULT_ACTION_INTERVAL),
  INSTAGRAM_MAX_ACTIONS: z.number().int().default(DEFAULT_MAX_ACTIONS)
});
async function validateInstagramConfig(runtime) {
  try {
    const instagramConfig = {
      INSTAGRAM_DRY_RUN: parseBooleanFromText(
        runtime.getSetting("INSTAGRAM_DRY_RUN") || process.env.INSTAGRAM_DRY_RUN
      ) ?? false,
      INSTAGRAM_USERNAME: runtime.getSetting("INSTAGRAM_USERNAME") || process.env.INSTAGRAM_USERNAME,
      INSTAGRAM_PASSWORD: runtime.getSetting("INSTAGRAM_PASSWORD") || process.env.INSTAGRAM_PASSWORD,
      INSTAGRAM_APP_ID: runtime.getSetting("INSTAGRAM_APP_ID") || process.env.INSTAGRAM_APP_ID,
      INSTAGRAM_APP_SECRET: runtime.getSetting("INSTAGRAM_APP_SECRET") || process.env.INSTAGRAM_APP_SECRET,
      INSTAGRAM_BUSINESS_ACCOUNT_ID: runtime.getSetting("INSTAGRAM_BUSINESS_ACCOUNT_ID") || process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID,
      INSTAGRAM_POST_INTERVAL_MIN: Number.parseInt(
        runtime.getSetting("INSTAGRAM_POST_INTERVAL_MIN") || process.env.INSTAGRAM_POST_INTERVAL_MIN || DEFAULT_POST_INTERVAL_MIN.toString(),
        10
      ),
      INSTAGRAM_POST_INTERVAL_MAX: Number.parseInt(
        runtime.getSetting("INSTAGRAM_POST_INTERVAL_MAX") || process.env.INSTAGRAM_POST_INTERVAL_MAX || DEFAULT_POST_INTERVAL_MAX.toString(),
        10
      ),
      INSTAGRAM_ENABLE_ACTION_PROCESSING: parseBooleanFromText(
        runtime.getSetting("INSTAGRAM_ENABLE_ACTION_PROCESSING") || process.env.INSTAGRAM_ENABLE_ACTION_PROCESSING
      ) ?? false,
      INSTAGRAM_ACTION_INTERVAL: Number.parseInt(
        runtime.getSetting("INSTAGRAM_ACTION_INTERVAL") || process.env.INSTAGRAM_ACTION_INTERVAL || DEFAULT_ACTION_INTERVAL.toString(),
        10
      ),
      INSTAGRAM_MAX_ACTIONS: Number.parseInt(
        runtime.getSetting("MAX_ACTIONS_PROCESSING") || process.env.MAX_ACTIONS_PROCESSING || DEFAULT_MAX_ACTIONS.toString(),
        10
      )
    };
    return instagramEnvSchema.parse(instagramConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map((err) => `${err.path.join(".")}: ${err.message}`).join("\n");
      throw new Error(
        `Instagram configuration validation failed:
${errorMessages}`
      );
    }
    throw error;
  }
}

// src/lib/auth.ts
import { elizaLogger as elizaLogger2 } from "@elizaos/core";
import { IgLoginTwoFactorRequiredError } from "instagram-private-api";

// src/lib/profile.ts
import { elizaLogger } from "@elizaos/core";

// src/lib/state.ts
import { IgApiClient } from "instagram-private-api";
var igClient = null;
var getIgClient = () => {
  if (!igClient) {
    igClient = new IgApiClient();
  }
  return igClient;
};
var createInitialState = () => ({
  accessToken: null,
  longLivedToken: null,
  profile: null,
  isInitialized: false,
  lastCheckedMediaId: null
});

// src/lib/profile.ts
async function fetchProfile(runtime, config) {
  const ig = getIgClient();
  try {
    const userInfo = await ig.user.info(ig.state.cookieUserId);
    const profile = {
      id: userInfo.pk.toString(),
      username: userInfo.username,
      name: userInfo.full_name,
      biography: userInfo.biography,
      mediaCount: userInfo.media_count,
      followerCount: userInfo.follower_count,
      followingCount: userInfo.following_count
    };
    await runtime.cacheManager.set(
      `instagram/profile/${config.INSTAGRAM_USERNAME}`,
      profile
    );
    return profile;
  } catch (error) {
    elizaLogger.error("Error fetching profile:", error);
    throw error;
  }
}

// src/lib/auth.ts
async function authenticate(runtime, config) {
  const ig = getIgClient();
  const state = createInitialState();
  try {
    ig.state.generateDevice(config.INSTAGRAM_USERNAME);
    const cachedSession = await runtime.cacheManager.get("instagram/session");
    if (cachedSession) {
      try {
        await ig.state.deserialize(cachedSession);
        const profile = await fetchProfile(runtime, config);
        return {
          ...state,
          isInitialized: true,
          profile
        };
      } catch {
        elizaLogger2.warn(
          `Cached session invalid, proceeding with fresh login`
        );
      }
    }
    try {
      await ig.account.login(
        config.INSTAGRAM_USERNAME,
        config.INSTAGRAM_PASSWORD
      );
      const serialized = await ig.state.serialize();
      await runtime.cacheManager.set("instagram/session", serialized);
      const profile = await fetchProfile(runtime, config);
      return {
        ...state,
        isInitialized: true,
        profile
      };
    } catch (error) {
      if (error instanceof IgLoginTwoFactorRequiredError) {
        throw new Error("2FA authentication not yet implemented");
      }
      throw error;
    }
  } catch (error) {
    elizaLogger2.error("Authentication failed:", error);
    throw error;
  }
}
async function setupWebhooks() {
}
async function initializeClient(runtime, config) {
  try {
    const state = await authenticate(runtime, config);
    await setupWebhooks();
    return state;
  } catch (error) {
    elizaLogger2.error("Failed to initialize Instagram client:", error);
    throw error;
  }
}

// src/services/interaction.ts
import {
  composeContext,
  elizaLogger as elizaLogger4,
  generateText,
  getEmbeddingZeroVector,
  ModelClass,
  stringToUuid
} from "@elizaos/core";

// src/lib/actions.ts
import { elizaLogger as elizaLogger3 } from "@elizaos/core";
async function fetchComments(mediaId, count = 20) {
  const ig = getIgClient();
  try {
    const feed = ig.feed.mediaComments(mediaId);
    const comments = await feed.items();
    return comments.slice(0, count).map((comment) => ({
      id: comment.pk.toString(),
      text: comment.text,
      timestamp: new Date(comment.created_at * 1e3).toISOString(),
      username: comment.user.username,
      replies: []
      // Instagram API doesn't provide replies in the same call
    }));
  } catch (error) {
    elizaLogger3.error("Error fetching comments:", error);
    throw error;
  }
}
async function postComment(mediaId, text) {
  const ig = getIgClient();
  try {
    const result = await ig.media.comment({
      mediaId,
      text: text.slice(0, 2200)
      // Instagram comment length limit
    });
    return {
      id: result.pk.toString(),
      text: result.text,
      timestamp: new Date(result.created_at * 1e3).toISOString(),
      username: result.user.username,
      replies: []
    };
  } catch (error) {
    elizaLogger3.error("Error posting comment:", error);
    throw error;
  }
}
async function likeMedia(mediaId) {
  const ig = getIgClient();
  try {
    await ig.media.like({
      mediaId,
      moduleInfo: {
        module_name: "profile",
        user_id: ig.state.cookieUserId,
        username: ig.state.cookieUsername
      }
    });
    elizaLogger3.log(`Liked media: ${mediaId}`);
  } catch (error) {
    elizaLogger3.error("Error liking media:", error);
    throw error;
  }
}

// src/services/interaction.ts
var instagramCommentTemplate = `
  # Areas of Expertise
  {{knowledge}}

  # About {{agentName}} (@{{instagramUsername}}):
  {{bio}}
  {{lore}}
  {{topics}}

  {{providers}}

  {{characterPostExamples}}

  {{postDirections}}

  # Task: Generate a response to the following Instagram comment in the voice and style of {{agentName}}.
  Original Comment (@{{commentUsername}}): {{commentText}}

  Your response should be friendly, engaging, and natural. Keep it brief (1-2 sentences).
  Do not use hashtags in comment responses. Be conversational and authentic.`;
var shouldInteractTemplate = `
  # About {{agentName}} (@{{instagramUsername}}):
  {{bio}}
  {{lore}}
  {{topics}}

  {{postDirections}}

  # Task: Determine if {{agentName}} should interact with this content:
  Interaction Type: {{interactionType}}
  User: @{{username}}
  Content: {{content}}

  Consider:
  1. Is this user's content relevant to {{agentName}}'s interests?
  2. Would interaction be authentic and meaningful?
  3. Is there potential for valuable engagement?

  Respond with one of:
  [INTERACT] - Content is highly relevant and engagement would be valuable
  [SKIP] - Content is not relevant enough or engagement wouldn't be authentic

  Choose [INTERACT] only if very confident about relevance and value.`;
var InstagramInteractionService = class {
  runtime;
  state;
  isProcessing = false;
  stopProcessing = false;
  constructor(runtime, state) {
    this.runtime = runtime;
    this.state = state;
  }
  async start() {
    const handleInteractionsLoop = () => {
      this.handleInteractions();
      if (!this.stopProcessing) {
        setTimeout(
          handleInteractionsLoop,
          Number.parseInt(this.runtime.getSetting("ACTION_INTERVAL") || "300", 10) * 1e3
        );
      }
    };
    handleInteractionsLoop();
  }
  async stop() {
    this.stopProcessing = true;
  }
  async generateResponse(text, username, action) {
    const state = await this.runtime.composeState(
      {
        userId: this.runtime.agentId,
        roomId: stringToUuid(`instagram-temp-${Date.now()}-${this.runtime.agentId}`),
        agentId: this.runtime.agentId,
        content: {
          text,
          action
        }
      },
      {
        instagramUsername: this.state.profile?.username,
        commentUsername: username,
        commentText: text
      }
    );
    const context = composeContext({
      state,
      template: instagramCommentTemplate
    });
    const response = await generateText({
      runtime: this.runtime,
      context,
      modelClass: ModelClass.SMALL
    });
    return this.cleanResponse(response);
  }
  cleanResponse(response) {
    return response.replace(/^\s*{?\s*"text":\s*"|"\s*}?\s*$/g, "").replace(/^['"](.*)['"]$/g, "$1").replace(/\\"/g, '"').trim();
  }
  async handleInteractions() {
    if (this.isProcessing) {
      elizaLogger4.log("Already processing interactions, skipping");
      return;
    }
    try {
      this.isProcessing = true;
      elizaLogger4.log("Checking Instagram interactions");
      const ig = getIgClient();
      const activity = await ig.feed.news().items();
      for (const item of activity) {
        const activityId = `instagram-activity-${item.pk}`;
        if (await this.runtime.cacheManager.get(activityId)) continue;
        switch (item.type) {
          case 2:
            await this.handleComment(item);
            break;
          case 3:
            await this.handleLike(item);
            break;
          case 12:
            await this.handleMention(item);
            break;
        }
        await this.runtime.cacheManager.set(activityId, true);
      }
    } catch (error) {
      elizaLogger4.error("Error handling Instagram interactions:", error);
    } finally {
      this.isProcessing = false;
    }
  }
  async handleComment(item) {
    try {
      const comments = await fetchComments(item.media_id);
      const comment = comments.find((c) => c.id === item.pk.toString());
      if (!comment) return;
      const roomId2 = stringToUuid(`instagram-comment-${item.media_id}-${this.runtime.agentId}`);
      const commentId = stringToUuid(`instagram-comment-${comment.id}-${this.runtime.agentId}`);
      const userId = stringToUuid(`instagram-user-${item.user_id}-${this.runtime.agentId}`);
      const cleanedResponse = await this.generateResponse(
        comment.text,
        comment.username,
        "COMMENT"
      );
      if (!cleanedResponse) {
        elizaLogger4.error("Failed to generate valid comment response");
        return;
      }
      await this.ensureEntities(roomId2, userId, comment.username);
      await this.createInteractionMemories(
        commentId,
        userId,
        roomId2,
        comment,
        cleanedResponse,
        item.media_id
      );
    } catch (error) {
      elizaLogger4.error("Error handling comment:", error);
    }
  }
  async handleLike(item) {
    try {
      const state = await this.runtime.composeState(
        {
          userId: this.runtime.agentId,
          roomId: stringToUuid(`instagram-like-${item.media_id}-${this.runtime.agentId}`),
          agentId: this.runtime.agentId,
          content: { text: "", action: "DECIDE_INTERACTION" }
        },
        {
          instagramUsername: this.state.profile?.username,
          interactionType: "like",
          username: item.user?.username,
          content: item.text || ""
        }
      );
      const context = composeContext({ state, template: shouldInteractTemplate });
      const decision = await generateText({
        runtime: this.runtime,
        context,
        modelClass: ModelClass.SMALL
      });
      if (decision.includes("[INTERACT]")) {
        const userFeed = await getIgClient().feed.user(item.user_id).items();
        if (userFeed.length > 0) {
          await likeMedia(userFeed[0].id);
          elizaLogger4.log(`Liked post from user: ${item.user?.username}`);
        }
      }
    } catch (error) {
      elizaLogger4.error("Error handling like:", error);
    }
  }
  async handleMention(item) {
    try {
      const roomId2 = stringToUuid(`instagram-mention-${item.media_id}-${this.runtime.agentId}`);
      const mentionId = stringToUuid(`instagram-mention-${item.pk}-${this.runtime.agentId}`);
      const userId = stringToUuid(`instagram-user-${item.user.pk}-${this.runtime.agentId}`);
      const cleanedResponse = await this.generateResponse(
        item.text,
        item.user.username,
        "MENTION"
      );
      if (!cleanedResponse) {
        elizaLogger4.error("Failed to generate valid mention response");
        return;
      }
      await this.ensureEntities(roomId2, userId, item.user.username);
      await this.createInteractionMemories(
        mentionId,
        userId,
        roomId2,
        item,
        cleanedResponse,
        item.media_id
      );
    } catch (error) {
      elizaLogger4.error("Error handling mention:", error);
    }
  }
  async ensureEntities(roomId2, userId, username) {
    await this.runtime.ensureRoomExists(roomId2);
    await this.runtime.ensureUserExists(userId, username, username, "instagram");
    await this.runtime.ensureParticipantInRoom(this.runtime.agentId, roomId2);
  }
  async createInteractionMemories(originalId, userId, roomId2, originalItem, response, mediaId) {
    await this.runtime.messageManager.createMemory({
      id: originalId,
      userId,
      agentId: this.runtime.agentId,
      content: {
        text: originalItem.text,
        source: "instagram"
      },
      roomId: roomId2,
      embedding: getEmbeddingZeroVector(),
      createdAt: new Date(originalItem.timestamp || originalItem.created_at * 1e3).getTime()
    });
    const postedComment = await postComment(mediaId, response);
    await this.runtime.messageManager.createMemory({
      id: stringToUuid(`instagram-reply-${postedComment.id}-${this.runtime.agentId}`),
      userId: this.runtime.agentId,
      agentId: this.runtime.agentId,
      content: {
        text: response,
        source: "instagram",
        inReplyTo: originalId
      },
      roomId: roomId2,
      embedding: getEmbeddingZeroVector(),
      createdAt: Date.now()
    });
  }
};

// src/services/post.ts
import {
  ModelClass as ModelClass2,
  composeContext as composeContext2,
  elizaLogger as elizaLogger5,
  generateImage,
  generateText as generateText2,
  getEmbeddingZeroVector as getEmbeddingZeroVector2,
  stringToUuid as stringToUuid2
} from "@elizaos/core";
import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";
var instagramPostTemplate = `
# Areas of Expertise
{{knowledge}}

# About {{agentName}} (@{{instagramUsername}}):
{{bio}}
{{lore}}
{{topics}}

{{providers}}

{{characterPostExamples}}

{{postDirections}}

# Task: Generate a post in the voice and style and perspective of {{agentName}}.
Write a post that is {{adjective}} about {{topic}} (without mentioning {{topic}} directly), from the perspective of {{agentName}}.
Your response should be 1-3 sentences (choose the length at random).
Your response should not contain any questions. Brief, concise statements only.
Add up to 3 relevant hashtags at the end.`;
var InstagramPostService = class {
  runtime;
  state;
  isProcessing = false;
  lastPostTime = 0;
  stopProcessing = false;
  constructor(runtime, state) {
    this.runtime = runtime;
    this.state = state;
  }
  async start() {
    const generatePostLoop = async () => {
      const lastPost = await this.runtime.cacheManager.get("instagram/lastPost");
      const lastPostTimestamp = lastPost?.timestamp ?? 0;
      const minMinutes = Number.parseInt(
        this.runtime.getSetting("INSTAGRAM_POST_INTERVAL_MIN") || this.runtime.getSetting("POST_INTERVAL_MIN") || "90",
        10
      );
      const maxMinutes = Number.parseInt(
        this.runtime.getSetting("INSTAGRAM_POST_INTERVAL_MAX") || this.runtime.getSetting("POST_INTERVAL_MAX") || "180",
        10
      );
      const randomMinutes = Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes;
      const delay = randomMinutes * 60 * 1e3;
      if (Date.now() > lastPostTimestamp + delay) {
        await this.generateNewPost();
      }
      if (!this.stopProcessing) {
        setTimeout(generatePostLoop, delay);
      }
      elizaLogger5.log(
        `Next Instagram post scheduled in ${randomMinutes} minutes`
      );
    };
    generatePostLoop();
  }
  async stop() {
    this.stopProcessing = true;
  }
  async generateNewPost() {
    try {
      elizaLogger5.log("Generating new Instagram post");
      const roomId2 = stringToUuid2(
        "instagram_generate_room-" + this.state.profile?.username
      );
      await this.runtime.ensureUserExists(
        this.runtime.agentId,
        this.state.profile?.username || "",
        this.runtime.character.name,
        "instagram"
      );
      const topics = this.runtime.character.topics.join(", ");
      const state = await this.runtime.composeState(
        {
          userId: this.runtime.agentId,
          roomId: roomId2,
          agentId: this.runtime.agentId,
          content: {
            text: topics || "",
            action: "POST"
          }
        },
        {
          instagramUsername: this.state.profile?.username
        }
      );
      const context = composeContext2({
        state,
        // TODO: Add back in when we have a template for Instagram on character
        //template: this.runtime.character.templates?.instagramPostTemplate || instagramPostTemplate,
        template: instagramPostTemplate
      });
      elizaLogger5.debug("generate post prompt:\n" + context);
      const content = await generateText2({
        runtime: this.runtime,
        context,
        modelClass: ModelClass2.SMALL
      });
      let cleanedContent2 = "";
      try {
        const parsedResponse = JSON.parse(content);
        if (parsedResponse.text) {
          cleanedContent2 = parsedResponse.text;
        } else if (typeof parsedResponse === "string") {
          cleanedContent2 = parsedResponse;
        }
      } catch {
        cleanedContent2 = content.replace(/^\s*{?\s*"text":\s*"|"\s*}?\s*$/g, "").replace(/^['"](.*)['"]$/g, "$1").replace(/\\"/g, '"').replace(/\\n/g, "\n\n").trim();
      }
      if (!cleanedContent2) {
        elizaLogger5.error(
          "Failed to extract valid content from response:",
          {
            rawResponse: content,
            attempted: "JSON parsing"
          }
        );
        return;
      }
      const mediaUrl = await this.getOrGenerateImage(cleanedContent2);
      await this.createPost({
        media: [
          {
            type: "IMAGE",
            url: mediaUrl
          }
        ],
        caption: cleanedContent2
      });
      await this.runtime.messageManager.createMemory({
        id: stringToUuid2(`instagram-post-${Date.now()}`),
        userId: this.runtime.agentId,
        agentId: this.runtime.agentId,
        content: {
          text: cleanedContent2,
          source: "instagram"
        },
        roomId: roomId2,
        embedding: getEmbeddingZeroVector2(),
        createdAt: Date.now()
      });
    } catch (error) {
      elizaLogger5.error("Error generating Instagram post:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : void 0,
        phase: "generateNewPost"
      });
    }
  }
  // Placeholder - implement actual image generation/selection
  async getOrGenerateImage(content) {
    try {
      elizaLogger5.log("Generating image for Instagram post");
      let imageSettings = this.runtime.character.settings.imageSettings || {};
      const result = await generateImage(
        {
          prompt: content,
          width: imageSettings?.width || 1024,
          height: imageSettings?.height || 1024,
          count: imageSettings?.count || 1,
          negativePrompt: imageSettings?.negativePrompt || null,
          numIterations: imageSettings?.numIterations || 50,
          guidanceScale: imageSettings?.guidanceScale || 7.5,
          seed: imageSettings?.seed || null,
          modelId: imageSettings?.modelId || null,
          jobId: imageSettings?.jobId || null,
          stylePreset: imageSettings?.stylePreset || "",
          hideWatermark: imageSettings?.hideWatermark ?? true,
          safeMode: imageSettings?.safeMode ?? true,
          cfgScale: imageSettings?.cfgScale || null
        },
        this.runtime
      );
      if (!result.success || !result.data || result.data.length === 0) {
        throw new Error(
          "Failed to generate image: " + (result.error || "No image data returned")
        );
      }
      const imageData = result.data[0].replace(
        /^data:image\/\w+;base64,/,
        ""
      );
      const tempDir = path.resolve(process.cwd(), "temp");
      await fs.mkdir(tempDir, { recursive: true });
      const tempFile = path.join(
        tempDir,
        `instagram-post-${Date.now()}.png`
      );
      await fs.writeFile(tempFile, Buffer.from(imageData, "base64"));
      return tempFile;
    } catch {
      cleanedContent = content.replace(/^\s*{?\s*"text":\s*"|"\s*}?\s*$/g, "").replace(/^['"](.*)['"]$/g, "$1").replace(/\\"/g, '"').replace(/\\n/g, "\n\n").trim();
    }
    if (!cleanedContent) {
      elizaLogger5.error("Failed to extract valid content from response:", {
        rawResponse: content,
        attempted: "JSON parsing"
      });
      return;
    }
    const mediaUrl = await this.getOrGenerateImage(cleanedContent);
    await this.createPost({
      media: [{
        type: "IMAGE",
        url: mediaUrl
      }],
      caption: cleanedContent
    });
    await this.runtime.messageManager.createMemory({
      id: stringToUuid2(`instagram-post-${Date.now()}`),
      userId: this.runtime.agentId,
      agentId: this.runtime.agentId,
      content: {
        text: cleanedContent,
        source: "instagram"
      },
      roomId,
      embedding: getEmbeddingZeroVector2(),
      createdAt: Date.now()
    });
  }
  catch(error) {
    elizaLogger5.error("Error generating Instagram post:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : void 0,
      phase: "generateNewPost"
    });
  }
  async createPost(options) {
    const ig = getIgClient();
    try {
      elizaLogger5.log("Creating Instagram post", {
        mediaCount: options.media.length,
        hasCaption: !!options.caption
      });
      const processedMedia = await Promise.all(
        options.media.map(async (media) => {
          const buffer = await this.processMedia(media);
          return {
            ...media,
            buffer
          };
        })
      );
      if (processedMedia.length > 1) {
        await ig.publish.album({
          items: processedMedia.map((media) => ({
            file: media.buffer,
            caption: options.caption
          }))
        });
      } else {
        const media = processedMedia[0];
        if (media.type === "VIDEO") {
          await ig.publish.video({
            video: media.buffer,
            caption: options.caption,
            coverImage: media.buffer
          });
        } else {
          await ig.publish.photo({
            file: media.buffer,
            caption: options.caption
          });
        }
      }
      this.lastPostTime = Date.now();
      await this.runtime.cacheManager.set("instagram/lastPost", {
        timestamp: this.lastPostTime
      });
      elizaLogger5.log("Instagram post created successfully");
    } catch (error) {
      elizaLogger5.error("Error creating Instagram post:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : void 0,
        phase: "createPost",
        mediaCount: options.media.length,
        hasCaption: !!options.caption
      });
      throw error;
    }
  }
  async processMedia(media) {
    try {
      elizaLogger5.log("Processing media", {
        type: media.type,
        url: media.url
      });
      const buffer = await fs.readFile(media.url);
      if (media.type === "IMAGE") {
        return await sharp(buffer).resize(1080, 1080, {
          fit: "inside",
          withoutEnlargement: true
        }).jpeg({
          quality: 85,
          progressive: true
        }).toBuffer();
      }
      return buffer;
    } catch (error) {
      elizaLogger5.error("Error processing media:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : void 0,
        phase: "processMedia",
        mediaType: media.type,
        url: media.url
      });
      throw error;
    }
  }
};

// src/index.ts
var InstagramClientInterface = {
  async start(runtime) {
    try {
      const config = await validateInstagramConfig(runtime);
      elizaLogger6.log("Instagram client configuration validated");
      const state = await initializeClient(runtime, config);
      elizaLogger6.log("Instagram client initialized");
      const postService = new InstagramPostService(runtime, state);
      const interactionService = new InstagramInteractionService(
        runtime,
        state
      );
      if (!config.INSTAGRAM_DRY_RUN) {
        await postService.start();
        elizaLogger6.log("Instagram post service started");
        if (config.INSTAGRAM_ENABLE_ACTION_PROCESSING) {
          await interactionService.start();
          elizaLogger6.log("Instagram interaction service started");
        }
      } else {
        elizaLogger6.log("Instagram client running in dry-run mode");
      }
      return {
        post: postService,
        interaction: interactionService,
        state
      };
    } catch (error) {
      elizaLogger6.error("Failed to start Instagram client:", error);
      throw error;
    }
  },
  // eslint-disable-next-line
  async stop(runtime) {
    elizaLogger6.log("Stopping Instagram client services...");
  }
};
var index_default = InstagramClientInterface;
export {
  InstagramClientInterface,
  index_default as default
};
//# sourceMappingURL=index.js.map