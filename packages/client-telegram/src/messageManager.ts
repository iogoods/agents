import type { Message } from "@telegraf/types";
import type { Context, Telegraf } from "telegraf";
import {
    composeContext,
    elizaLogger,
    ServiceType,
    composeRandomUser,
    getEmbeddingZeroVector,
} from "@elizaos/core";
import {
    Content,
    HandlerCallback,
    IAgentRuntime,
    IImageDescriptionService,
    Memory,
    ModelClass,
    State,
    UUID,
    Media,
} from "@elizaos/core";
import { stringToUuid } from "@elizaos/core";
import { generateMessageResponse, generateShouldRespond } from "@elizaos/core";
import {
    telegramMessageHandlerTemplate,
    telegramShouldRespondTemplate,
    telegramAutoPostTemplate,
    telegramPinnedMessageTemplate,
} from "./templates";
import { cosineSimilarity, escapeMarkdown } from "./utils";
import {
    MESSAGE_CONSTANTS,
    TIMING_CONSTANTS,
    RESPONSE_CHANCES,
    TEAM_COORDINATION,
} from "./constants";

import fs from "fs";

/**
 * Telegram enforces a limit of 4096 characters per message or edit.
 */
const MAX_MESSAGE_LENGTH = 4096;

enum MediaType {
    PHOTO = "photo",
    VIDEO = "video",
    DOCUMENT = "document",
    AUDIO = "audio",
    ANIMATION = "animation",
}

interface MessageContext {
    content: string;
    timestamp: number;
}

interface AutoPostConfig {
    enabled: boolean;
    monitorTime: number;
    inactivityThreshold: number;
    mainChannelId: string;
    pinnedMessagesGroups: string[];
    lastAutoPost?: number;
    minTimeBetweenPosts?: number;
}

export type InterestChats = {
    [key: string]: {
        currentHandler: string | undefined;
        lastMessageSent: number;
        messages: { userId: UUID; userName: string; content: Content }[];
        previousContext?: MessageContext;
        contextSimilarityThreshold?: number;
    };
};

export class MessageManager {
    public bot: Telegraf<Context>;
    private runtime: IAgentRuntime;
    private interestChats: InterestChats = {};
    private teamMemberUsernames: Map<string, string> = new Map();

    private autoPostConfig: AutoPostConfig;
    private lastChannelActivity: { [channelId: string]: number } = {};
    private autoPostInterval: NodeJS.Timeout;

    constructor(bot: Telegraf<Context>, runtime: IAgentRuntime) {
        this.bot = bot;
        this.runtime = runtime;

        // Initialize any known team member usernames
        this._initializeTeamMemberUsernames().catch((error) =>
            elizaLogger.error("Error initializing team member usernames:", error)
        );

        // AutoPost config
        this.autoPostConfig = {
            enabled:
                this.runtime.character.clientConfig?.telegram?.autoPost?.enabled ||
                false,
            monitorTime:
                this.runtime.character.clientConfig?.telegram?.autoPost?.monitorTime ||
                300000,
            inactivityThreshold:
                this.runtime.character.clientConfig?.telegram?.autoPost
                    ?.inactivityThreshold || 3600000,
            mainChannelId:
                this.runtime.character.clientConfig?.telegram?.autoPost
                    ?.mainChannelId || "",
            pinnedMessagesGroups:
                this.runtime.character.clientConfig?.telegram?.autoPost
                    ?.pinnedMessagesGroups || [],
            minTimeBetweenPosts:
                this.runtime.character.clientConfig?.telegram?.autoPost
                    ?.minTimeBetweenPosts || 7200000,
        };

        if (this.autoPostConfig.enabled) {
            this._startAutoPostMonitoring();
        }
    }

    // -------------------------------------------------------------------------
    // MAIN MESSAGE HANDLER (NOW WITH STREAMING + REPEATED "TYPING")
    // -------------------------------------------------------------------------
    public async handleMessage(ctx: Context): Promise<void> {
        if (!ctx.message || !ctx.from) {
            return; // No message or sender info
        }

        this.lastChannelActivity[ctx.chat.id.toString()] = Date.now();

        // Check pinned messages (autoPost feature)
        if (
            this.autoPostConfig.enabled &&
            ctx.message &&
            "pinned_message" in ctx.message
        ) {
            // If this is a pinned message update
            await this._monitorPinnedMessages(ctx);
            return;
        }

        // Possibly ignore bot or direct messages
        if (
            this.runtime.character.clientConfig?.telegram?.shouldIgnoreBotMessages &&
            ctx.from.is_bot
        ) {
            return;
        }
        if (
            this.runtime.character.clientConfig?.telegram?.shouldIgnoreDirectMessages &&
            ctx.chat?.type === "private"
        ) {
            return;
        }

        // 1) Convert IDs to UUID etc. + create memory if needed
        //    This was part of your original logic, so we keep it
        //    in case you want to store the raw input message.

        // We only do the creation if there's text or a caption
        // (No effect on pinned or image-only messages.)
        const message = ctx.message;
        const chatIdStr = ctx.chat.id.toString();
        const userIdStr = ctx.from.id.toString();

        if (this.runtime.character.clientConfig?.telegram?.tgTrader) {
            // Possibly sync user with backend
            const username = ctx.from?.username || ctx.from?.first_name || "Unknown";
            try {
                await getOrCreateRecommenderInBe(
                    userIdStr,
                    username,
                    this.runtime.character.clientConfig?.telegram?.backendToken,
                    this.runtime.character.clientConfig?.telegram?.backend
                );
            } catch (error) {
                elizaLogger.error("Error getting or creating recommender in backend", error);
            }
        }

        // If we only want to handle text messages for streaming
        let textContent = "";
        if ("text" in message) {
            textContent = message.text;
        } else if ("caption" in message && message.caption) {
            textContent = message.caption;
        }

        // If no text/caption, we do the image logic or skip
        if (!textContent) {
            elizaLogger.log("No text/caption found, skipping streaming logic...");
            // However, let's still do your original memory logic below
        }

        // Attempt to process an image if present (in case you want a combined text)
        const imageInfo = await this.processImage(message);
        const fullText = imageInfo
            ? `${textContent} ${imageInfo.description}`
            : textContent;

        // Create memory with the combined text + image description
        if (fullText) {
            // Original memory logic from your code
            const userId = stringToUuid(userIdStr) as UUID;
            const agentId = this.runtime.agentId;
            const roomId = stringToUuid(`${chatIdStr}-${agentId}`) as UUID;
            const msgId = stringToUuid(
                roomId + "-" + message.message_id.toString()
            ) as UUID;

            const content: Content = {
                text: fullText,
                source: "telegram",
            };

            const memory: Memory = {
                id: msgId,
                agentId,
                userId,
                roomId,
                content,
                createdAt: message.date * 1000,
                embedding: getEmbeddingZeroVector(),
            };

            // Create memory in your DB
            await this.runtime.messageManager.createMemory(memory);

            // Compose + update state
            let state = await this.runtime.composeState(memory);
            state = await this.runtime.updateRecentMessageState(state);

            // Now check if the bot "should respond"
            const shouldRespond = await this._shouldRespond(message, state);
            if (!shouldRespond) {
                elizaLogger.log("Bot decided NOT to respond, returning...");
                return;
            }

            // -----------------------------------------------------------------
            // 2) **STREAMING LOGIC** from local endpoint + repeated "typing"
            // -----------------------------------------------------------------
            elizaLogger.log("Bot decided to respond -> starting streaming...");

            let typingInterval: NodeJS.Timeout | null = null;
            try {
                // Repeatedly send "typing" every 2 seconds
                typingInterval = setInterval(() => {
                    ctx.telegram
                        .sendChatAction(ctx.chat.id, "typing")
                        .catch((err) =>
                            elizaLogger.error("Error sending typing action:", err)
                        );
                }, 2000);

                // Make the request to your local AI endpoint
                const response = await fetch("http://localhost:11434/api/generate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model: "deepseek-r1:14b",
                        prompt: fullText,
                    }),
                });

                if (!response.body) {
                    elizaLogger.warn("No streaming body from local AI endpoint.");
                    return;
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder("utf-8");

                // Read partial lines
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        elizaLogger.log("Done reading from streaming AI endpoint.");
                        break;
                    }
                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split("\n");

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed) continue;

                        let data;
                        try {
                            data = JSON.parse(trimmed);
                        } catch (err) {
                            elizaLogger.error("Error parsing JSON line:", err);
                            continue;
                        }
                        if (!data?.response) continue;

                        // For each partial line -> send a new message
                        elizaLogger.log(
                            `AI partial line: ${data.response.slice(0, 40)}...`
                        );

                        await this.bot.telegram.sendMessage(ctx.chat.id, data.response);

                        // OPTIONAL:
                        // If you want to store partial lines in memory, you could do so here.
                        // This example just sends the partial text to the user.
                    }
                }
            } finally {
                // Stop "typing"
                if (typingInterval) clearInterval(typingInterval);
            }

            // If you want a final message after streaming:
            // await ctx.reply("Done streaming response!");

            // Evaluate + handle any post-response logic
            state = await this.runtime.updateRecentMessageState(state);
            await this.runtime.evaluate(memory, state, true /* responded */);
        } else {
            // No text at all -> do nothing
            elizaLogger.log("No text content to respond to, ignoring...");
        }
    }

    // -------------------------------------------------------------------------
    // AUTO-POST, PINNED-MESSAGE, AND TEAM LOGIC (unchanged from your original)
    // -------------------------------------------------------------------------

    private _startAutoPostMonitoring(): void {
        if (this.bot.botInfo) {
            elizaLogger.info("[AutoPost Telegram] Bot ready, starting monitoring");
            this._initializeAutoPost();
        } else {
            elizaLogger.info("[AutoPost Telegram] Bot not ready, waiting for ready event");
            this.bot.telegram.getMe().then(() => {
                elizaLogger.info("[AutoPost Telegram] Bot ready, starting monitoring");
                this._initializeAutoPost();
            });
        }
    }

    private _initializeAutoPost(): void {
        setTimeout(() => {
            this.autoPostInterval = setInterval(() => {
                this._checkChannelActivity();
            }, Math.floor(Math.random() * (4 * 60 * 60 * 1000) + 2 * 60 * 60 * 1000));
        }, 5000);
    }

    private async _checkChannelActivity(): Promise<void> {
        if (!this.autoPostConfig.enabled || !this.autoPostConfig.mainChannelId) return;

        try {
            const now = Date.now();
            const lastActivity =
                this.lastChannelActivity[this.autoPostConfig.mainChannelId] || 0;
            const timeSinceLastMsg = now - lastActivity;
            const timeSinceLastAutoPost =
                now - (this.autoPostConfig.lastAutoPost || 0);

            const randomThreshold =
                this.autoPostConfig.inactivityThreshold +
                (Math.random() * 1800000 - 900000);

            if (
                timeSinceLastMsg > randomThreshold &&
                timeSinceLastAutoPost >
                    (this.autoPostConfig.minTimeBetweenPosts || 0)
            ) {
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
                            source: "telegram",
                        },
                        embedding: getEmbeddingZeroVector(),
                        createdAt: Date.now(),
                    };

                    let state = await this.runtime.composeState(memory, {
                        telegramBot: this.bot,
                        agentName: this.runtime.character.name,
                    });

                    const context = composeContext({
                        state,
                        template:
                            this.runtime.character.templates?.telegramAutoPostTemplate ||
                            telegramAutoPostTemplate,
                    });

                    const responseContent = await this._generateResponse(
                        memory,
                        state,
                        context
                    );
                    if (!responseContent?.text) return;

                    console.log("[AutoPost] Attempting to auto-post content.");

                    const msgs = await Promise.all(
                        this.splitMessage(responseContent.text.trim()).map((chunk) =>
                            this.bot.telegram.sendMessage(
                                this.autoPostConfig.mainChannelId!,
                                chunk
                            )
                        )
                    );

                    const memories = msgs.map((m) => ({
                        id: stringToUuid(roomId + "-" + m.message_id.toString()),
                        userId: this.runtime.agentId,
                        agentId: this.runtime.agentId,
                        content: {
                            ...responseContent,
                            text: m.text,
                        },
                        roomId,
                        embedding: getEmbeddingZeroVector(),
                        createdAt: m.date * 1000,
                    }));

                    for (const mem of memories) {
                        await this.runtime.messageManager.createMemory(mem);
                    }

                    this.autoPostConfig.lastAutoPost = Date.now();
                    state = await this.runtime.updateRecentMessageState(state);
                    await this.runtime.evaluate(memory, state, true);
                } catch (error) {
                    elizaLogger.warn("[AutoPost Telegram] Error:", error);
                }
            } else {
                elizaLogger.warn("[AutoPost Telegram] Activity within threshold. Not posting.");
            }
        } catch (error) {
            elizaLogger.warn("[AutoPost Telegram] Error in _checkChannelActivity:", error);
        }
    }

    private async _monitorPinnedMessages(ctx: Context): Promise<void> {
        if (!this.autoPostConfig.pinnedMessagesGroups.length) {
            elizaLogger.warn("[AutoPost Telegram] No pinned message groups configured");
            return;
        }

        if (!ctx.message || !("pinned_message" in ctx.message)) {
            return;
        }

        const pinnedMessage = ctx.message.pinned_message;
        if (!pinnedMessage) return;

        if (
            !this.autoPostConfig.pinnedMessagesGroups.includes(
                ctx.chat.id.toString()
            )
        ) {
            return;
        }

        const mainChannel = this.autoPostConfig.mainChannelId;
        if (!mainChannel) return;

        try {
            elizaLogger.info(
                `[AutoPost Telegram] Processing pinned message in group ${ctx.chat.id}`
            );

            const pinnedText =
                "text" in pinnedMessage && typeof pinnedMessage.text === "string"
                    ? pinnedMessage.text
                    : "caption" in pinnedMessage && pinnedMessage.caption
                    ? pinnedMessage.caption
                    : "Pinned Message (no text)";

            const roomId = stringToUuid(mainChannel + "-" + this.runtime.agentId);
            const memory = {
                id: stringToUuid(`pinned-${Date.now()}`),
                userId: this.runtime.agentId,
                agentId: this.runtime.agentId,
                roomId,
                content: {
                    text: pinnedText,
                    source: "telegram",
                    metadata: {
                        pinnedMessageData: pinnedMessage,
                    },
                },
                embedding: getEmbeddingZeroVector(),
                createdAt: Date.now(),
            };

            let state = await this.runtime.composeState(memory, {
                telegramBot: this.bot,
                pinnedMessageContent: pinnedText,
                pinnedGroupId: ctx.chat.id.toString(),
                agentName: this.runtime.character.name,
            });

            const context = composeContext({
                state,
                template:
                    this.runtime.character.templates?.telegramPinnedMessageTemplate ||
                    telegramPinnedMessageTemplate,
            });

            const responseContent = await this._generateResponse(memory, state, context);
            if (!responseContent?.text) return;

            const msgs = await Promise.all(
                this.splitMessage(responseContent.text.trim()).map((chunk) =>
                    this.bot.telegram.sendMessage(mainChannel, chunk)
                )
            );

            const memories = msgs.map((m) => ({
                id: stringToUuid(roomId + "-" + m.message_id.toString()),
                userId: this.runtime.agentId,
                agentId: this.runtime.agentId,
                content: {
                    ...responseContent,
                    text: m.text,
                },
                roomId,
                embedding: getEmbeddingZeroVector(),
                createdAt: m.date * 1000,
            }));

            for (const mem of memories) {
                await this.runtime.messageManager.createMemory(mem);
            }

            state = await this.runtime.updateRecentMessageState(state);
            await this.runtime.evaluate(memory, state, true);
        } catch (error) {
            elizaLogger.warn("[AutoPost Telegram] Error in _monitorPinnedMessages:", error);
        }
    }

    // -------------------------------------------------------------------------
    // IMAGE PROCESSING + REPLY SPLITTING + MEDIA SENDING
    // -------------------------------------------------------------------------
    private async processImage(message: Message): Promise<{ description: string } | null> {
        try {
            let imageUrl: string | null = null;

            if ("photo" in message && message.photo?.length > 0) {
                const photo = message.photo[message.photo.length - 1];
                const fileLink = await this.bot.telegram.getFileLink(photo.file_id);
                imageUrl = fileLink.toString();
            } else if (
                "document" in message &&
                message.document?.mime_type?.startsWith("image/")
            ) {
                const fileLink = await this.bot.telegram.getFileLink(
                    message.document.file_id
                );
                imageUrl = fileLink.toString();
            }

            if (imageUrl) {
                const imgService =
                    this.runtime.getService<IImageDescriptionService>(
                        ServiceType.IMAGE_DESCRIPTION
                    );
                const { title, description } = await imgService.describeImage(imageUrl);
                return { description: `[Image: ${title}\n${description}]` };
            }
        } catch (error) {
            console.error("❌ Error processing image:", error);
        }

        return null;
    }

    private splitMessage(text: string): string[] {
        const chunks: string[] = [];
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

    private async sendMedia(
        ctx: Context,
        mediaPath: string,
        type: MediaType,
        caption?: string
    ): Promise<void> {
        try {
            const isUrl = /^(http|https):\/\//.test(mediaPath);
            const sendFunctionMap: Record<MediaType, Function> = {
                [MediaType.PHOTO]: ctx.telegram.sendPhoto.bind(ctx.telegram),
                [MediaType.VIDEO]: ctx.telegram.sendVideo.bind(ctx.telegram),
                [MediaType.DOCUMENT]: ctx.telegram.sendDocument.bind(ctx.telegram),
                [MediaType.AUDIO]: ctx.telegram.sendAudio.bind(ctx.telegram),
                [MediaType.ANIMATION]: ctx.telegram.sendAnimation.bind(ctx.telegram),
            };

            const sendFunc = sendFunctionMap[type];
            if (!sendFunc) {
                throw new Error(`Unsupported media type: ${type}`);
            }

            if (isUrl) {
                await sendFunc(ctx.chat.id, mediaPath, { caption });
            } else {
                if (!fs.existsSync(mediaPath)) {
                    throw new Error(`File not found at path: ${mediaPath}`);
                }
                const fileStream = fs.createReadStream(mediaPath);
                try {
                    await sendFunc(ctx.chat.id, { source: fileStream }, { caption });
                } finally {
                    fileStream.destroy();
                }
            }

            elizaLogger.info(
                `${type.charAt(0).toUpperCase() + type.slice(1)} sent: ${mediaPath}`
            );
        } catch (error: any) {
            elizaLogger.error(
                `Failed to send ${type}: ${mediaPath}. Error: ${error.message}`
            );
            elizaLogger.debug(error.stack);
            throw error;
        }
    }

    // -------------------------------------------------------------------------
    // TEAM/CONTEXT/RESPONSE DECISION LOGIC (unchanged from your original)
    // -------------------------------------------------------------------------
    private async _initializeTeamMemberUsernames(): Promise<void> {
        if (!this.runtime.character.clientConfig?.telegram?.isPartOfTeam) return;

        const teamAgentIds =
            this.runtime.character.clientConfig.telegram.teamAgentIds || [];

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
                elizaLogger.error(`Error getting username for ${id}:`, error);
            }
        }
    }

    private _isTeamCoordinationRequest(content: string): boolean {
        const lower = content.toLowerCase();
        return TEAM_COORDINATION.KEYWORDS?.some((k) => lower.includes(k.toLowerCase()));
    }

    private _isTeamLeader(): boolean {
        return (
            this.bot.botInfo?.id.toString() ===
            this.runtime.character.clientConfig?.telegram?.teamLeaderId
        );
    }

    private _isTeamMember(userId: string | number): boolean {
        const teamCfg = this.runtime.character.clientConfig?.telegram;
        if (!teamCfg?.isPartOfTeam || !teamCfg.teamAgentIds) return false;
        const norm = this._getNormalizedUserId(userId);
        return teamCfg.teamAgentIds.some(
            (id) => this._getNormalizedUserId(id) === norm
        );
    }

    private _getNormalizedUserId(id: string | number): string {
        return id.toString().replace(/[^0-9]/g, "");
    }

    private _isMessageForMe(message: Message): boolean {
        const botUsername = this.bot.botInfo?.username;
        if (!botUsername) return false;

        const text =
            "text" in message
                ? message.text
                : "caption" in message
                ? message.caption
                : "";
        if (!text) return false;

        const isReplyToBot =
            (message as any).reply_to_message?.from?.is_bot === true &&
            (message as any).reply_to_message?.from?.username === botUsername;
        const isMentioned = text.includes(`@${botUsername}`);
        const hasUsername = text.toLowerCase().includes(botUsername.toLowerCase());

        return (
            isReplyToBot ||
            isMentioned ||
            (!this.runtime.character.clientConfig?.telegram
                ?.shouldRespondOnlyToMentions &&
                hasUsername)
        );
    }

    private _checkInterest(chatId: string): boolean {
        const st = this.interestChats[chatId];
        if (!st) return false;

        const lastMsg = st.messages[st.messages.length - 1];
        const since = Date.now() - st.lastMessageSent;

        if (since > MESSAGE_CONSTANTS.INTEREST_DECAY_TIME) {
            delete this.interestChats[chatId];
            return false;
        } else if (since > MESSAGE_CONSTANTS.PARTIAL_INTEREST_DECAY) {
            return this._isRelevantToTeamMember(lastMsg?.content.text || "", chatId);
        }
        if (this._isTeamLeader() && st.messages.length > 0) {
            if (!this._isRelevantToTeamMember(lastMsg?.content.text || "", chatId)) {
                const recentTeam = st.messages.slice(-3).some(
                    (m) =>
                        m.userId !== this.runtime.agentId &&
                        this._isTeamMember(m.userId.toString())
                );
                if (recentTeam) {
                    delete this.interestChats[chatId];
                    return false;
                }
            }
        }
        return true;
    }

    private _isRelevantToTeamMember(
        content: string,
        chatId: string,
        lastAgentMemory?: Memory
    ): boolean {
        const teamCfg = this.runtime.character.clientConfig?.telegram;
        // If I'm the leader:
        if (this._isTeamLeader() && lastAgentMemory?.content.text) {
            const dt = Date.now() - lastAgentMemory.createdAt;
            if (dt > MESSAGE_CONSTANTS.INTEREST_DECAY_TIME) return false;
            const sim = cosineSimilarity(
                content.toLowerCase(),
                lastAgentMemory.content.text.toLowerCase()
            );
            return sim >= MESSAGE_CONSTANTS.DEFAULT_SIMILARITY_THRESHOLD_FOLLOW_UPS;
        }

        // Otherwise check keywords
        if (!teamCfg?.teamMemberInterestKeywords?.length) return false;
        return teamCfg.teamMemberInterestKeywords.some((k) =>
            content.toLowerCase().includes(k.toLowerCase())
        );
    }

    private async _analyzeContextSimilarity(
        currentMsg: string,
        prev?: MessageContext,
        agentLast?: string
    ): Promise<number> {
        if (!prev) return 1;
        const dt = Date.now() - prev.timestamp;
        const timeWeight = Math.max(0, 1 - dt / (5 * 60 * 1000));
        const sim = cosineSimilarity(
            currentMsg.toLowerCase(),
            prev.content.toLowerCase(),
            agentLast?.toLowerCase()
        );
        return sim * timeWeight;
    }

    private async _shouldRespondBasedOnContext(
        msg: Message,
        chatSt: InterestChats[string]
    ): Promise<boolean> {
        const msgText =
            "text" in msg
                ? msg.text
                : "caption" in msg
                ? msg.caption
                : "";
        if (!msgText) return false;

        if (this._isMessageForMe(msg)) return true;
        if (chatSt?.currentHandler !== this.bot.botInfo?.id.toString()) {
            return false;
        }
        if (!chatSt.messages?.length) return false;

        const lastUserMsg = [...chatSt.messages].reverse().find(
            (m, idx) => idx > 0 && m.userId !== this.runtime.agentId
        );
        if (!lastUserMsg) return false;

        const lastSelfMem = await this.runtime.messageManager.getMemories({
            roomId: stringToUuid(msg.chat.id.toString() + "-" + this.runtime.agentId),
            unique: false,
            count: 5,
        });
        const lastSelfSorted = lastSelfMem
            ?.filter((m) => m.userId === this.runtime.agentId)
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        const sim = await this._analyzeContextSimilarity(
            msgText,
            { content: lastUserMsg.content.text || "", timestamp: Date.now() },
            lastSelfSorted?.[0]?.content?.text
        );

        const thr =
            this.runtime.character.clientConfig?.telegram?.messageSimilarityThreshold ||
            chatSt.contextSimilarityThreshold ||
            MESSAGE_CONSTANTS.DEFAULT_SIMILARITY_THRESHOLD;

        return sim >= thr;
    }

    private async _shouldRespond(message: Message, state: State): Promise<boolean> {
        if (this.runtime.character.clientConfig?.telegram?.shouldRespondOnlyToMentions) {
            return this._isMessageForMe(message);
        }

        if (
            "text" in message &&
            message.text?.includes(`@${this.bot.botInfo?.username}`)
        ) {
            elizaLogger.info("Bot was directly mentioned -> respond");
            return true;
        }

        if (message.chat.type === "private") {
            return true;
        }

        // If it's an image in group => skip
        if (
            "photo" in message ||
            ("document" in message &&
                message.document?.mime_type?.startsWith("image/"))
        ) {
            return false;
        }

        const chatId = message.chat.id.toString();
        const chatSt = this.interestChats[chatId];
        const txt =
            "text" in message
                ? message.text
                : "caption" in message
                ? message.caption
                : "";

        // Team logic
        if (this.runtime.character.clientConfig?.telegram?.isPartOfTeam) {
            // If I'm not the leader, but message is relevant to me
            if (!this._isTeamLeader() && this._isRelevantToTeamMember(txt, chatId)) {
                return true;
            }

            // Check team coordination
            if (this._isTeamCoordinationRequest(txt)) {
                if (this._isTeamLeader()) return true;
                else {
                    // If I'm not leader, random small delay
                    const rd =
                        Math.floor(
                            Math.random() *
                                (TIMING_CONSTANTS.TEAM_MEMBER_DELAY_MAX -
                                    TIMING_CONSTANTS.TEAM_MEMBER_DELAY_MIN)
                        ) + TIMING_CONSTANTS.TEAM_MEMBER_DELAY_MIN;
                    await new Promise((resolve) => setTimeout(resolve, rd));
                    return true;
                }
            }

            if (!this._isTeamLeader() && this._isRelevantToTeamMember(txt, chatId)) {
                // 1.5s delay
                await new Promise((resolve) =>
                    setTimeout(resolve, TIMING_CONSTANTS.TEAM_MEMBER_DELAY)
                );

                if (chatSt.messages?.length) {
                    const recents = chatSt.messages.slice(
                        -MESSAGE_CONSTANTS.RECENT_MESSAGE_COUNT
                    );
                    const leaderReplied = recents.some(
                        (m) =>
                            m.userId ===
                                this.runtime.character.clientConfig?.telegram
                                    ?.teamLeaderId &&
                            Date.now() - chatSt.lastMessageSent < 3000
                    );
                    if (leaderReplied) {
                        return Math.random() > RESPONSE_CHANCES.AFTER_LEADER;
                    }
                }
                return true;
            }

            if (this._isTeamLeader() && !this._isRelevantToTeamMember(txt, chatId)) {
                // 2-4s delay
                const r =
                    Math.floor(
                        Math.random() *
                            (TIMING_CONSTANTS.LEADER_DELAY_MAX -
                                TIMING_CONSTANTS.LEADER_DELAY_MIN)
                    ) + TIMING_CONSTANTS.LEADER_DELAY_MIN;
                await new Promise((resolve) => setTimeout(resolve, r));

                // If another team member responded
                if (chatSt?.messages?.length) {
                    const recents = chatSt.messages.slice(
                        -MESSAGE_CONSTANTS.RECENT_MESSAGE_COUNT
                    );
                    const otherTeamResponded = recents.some(
                        (m) =>
                            m.userId !== this.runtime.agentId &&
                            this._isTeamMember(m.userId)
                    );
                    if (otherTeamResponded) {
                        return false;
                    }
                }
            }

            if (this._isMessageForMe(message)) {
                if (this.interestChats[chatId]) {
                    this.interestChats[chatId].currentHandler =
                        this.bot.botInfo?.id.toString();
                    this.interestChats[chatId].lastMessageSent = Date.now();
                }
                return true;
            }

            if (chatSt?.currentHandler) {
                if (
                    chatSt.currentHandler !== this.bot.botInfo?.id.toString() &&
                    this._isTeamMember(chatSt.currentHandler)
                ) {
                    return false;
                }
            }

            if (!this._isMessageForMe(message) && this.interestChats[chatId]) {
                const recentMsgs = this.interestChats[chatId].messages.slice(
                    -MESSAGE_CONSTANTS.CHAT_HISTORY_COUNT
                );
                const ourCount = recentMsgs.filter(
                    (m) => m.userId === this.runtime.agentId
                ).length;
                if (ourCount > 2) {
                    const chance = Math.pow(0.5, ourCount - 2);
                    if (Math.random() > chance) {
                        return false;
                    }
                }
            }
            if (chatSt?.currentHandler) {
                const shouldRespContext = await this._shouldRespondBasedOnContext(
                    message,
                    chatSt
                );
                if (!shouldRespContext) {
                    return false;
                }
            }
        }

        // Otherwise fallback to your AI's "should respond" logic
        if ("text" in message || ("caption" in message && message.caption)) {
            const ctx = composeContext({
                state,
                template:
                    this.runtime.character.templates?.telegramShouldRespondTemplate ||
                    this.runtime.character?.templates?.shouldRespondTemplate ||
                    composeRandomUser(telegramShouldRespondTemplate, 2),
            });
            const resp = await generateShouldRespond({
                runtime: this.runtime,
                context: ctx,
                modelClass: ModelClass.SMALL,
            });
            return resp === "RESPOND";
        }

        return false;
    }

    // -------------------------------------------------------------------------
    // AI MESSAGE GENERATION (kept if you still want it for other features)
    // -------------------------------------------------------------------------
    private async _generateResponse(
        message: Memory,
        _state: State,
        context: string
    ): Promise<Content> {
        const { userId, roomId } = message;

        const response = await generateMessageResponse({
            runtime: this.runtime,
            context,
            modelClass: ModelClass.LARGE,
        });

        if (!response) {
            console.error("❌ No response from generateMessageResponse");
            return null;
        }

        await this.runtime.databaseAdapter.log({
            body: { message, context, response },
            userId,
            roomId,
            type: "response",
        });

        return response;
    }

    // If you need to sleep in any code path
    private async sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
