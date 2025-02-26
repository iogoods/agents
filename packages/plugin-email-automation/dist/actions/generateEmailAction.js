import { elizaLogger } from "@elizaos/core";
import { EmailGenerationService } from "../services/emailGenerationService";
export const generateEmailAction = {
    name: "generate_email",
    description: "Generate an email based on user requirements. Use this when the user wants to compose or write an email, or when they provide content that should be formatted as an email.",
    similes: ["write an email", "compose an email", "draft an email"],
    examples: [
        [{ user: "user1", content: { text: "Can you write an email to my team about the project update?" } }],
        [{ user: "user1", content: { text: "Draft a professional email about the upcoming meeting" } }]
    ],
    async validate(_runtime, message) {
        const content = message.content;
        const isValid = content?.text?.toLowerCase().includes('email') ?? false;
        elizaLogger.info('Generate validation:', {
            isValid,
            messageId: message.id,
            content: content?.text,
            userId: message.userId
        });
        return isValid;
    },
    async handler(runtime, message, state, _options = {}, callback) {
        try {
            // Properly compose state first
            state = (await runtime.composeState(message));
            elizaLogger.info('Generate handler started', {
                messageId: message.id,
                hasState: !!state,
                stateKeys: state ? Object.keys(state) : [],
                content: message.content.text
            });
            const emailService = new EmailGenerationService(runtime);
            const content = message.content;
            const prompt = {
                content: content.text,
                tone: state?.tone || 'professional',
                format: state?.format || 'paragraph',
                language: state?.language?.toString() || 'English'
            };
            elizaLogger.info('Generating email with prompt:', { prompt });
            const generatedEmail = await emailService.generateEmail(prompt);
            elizaLogger.info('Email generated:', {
                hasSubject: !!generatedEmail.subject,
                blockCount: generatedEmail.blocks.length,
                metadata: generatedEmail.metadata
            });
            if (state) {
                state.generatedEmail = {
                    subject: generatedEmail.subject,
                    blocks: generatedEmail.blocks,
                    metadata: generatedEmail.metadata
                };
                // Update state in memory system
                await runtime.updateRecentMessageState(state);
                elizaLogger.info('State updated and persisted', {
                    stateKeys: Object.keys(state),
                    hasGeneratedEmail: !!state.generatedEmail,
                    emailSubject: generatedEmail.subject
                });
            }
            else {
                elizaLogger.warn('No state object available for storing email');
            }
            // Add preview message for Discord
            if (callback) {
                const preview = `📧 **Generated Email Preview**

**Subject:** ${generatedEmail.subject}
**To:** [Recipient's email will be set when sending]
───────────────

${generatedEmail.blocks.map(block => {
                    switch (block.type) {
                        case 'heading':
                            return `## ${block.content}\n\n`;
                        case 'paragraph':
                            return `${block.content}\n\n`;
                        case 'bulletList':
                            return Array.isArray(block.content)
                                ? `${block.content.map(item => `• ${item}`).join('\n')}\n\n`
                                : `• ${block.content}\n\n`;
                        default:
                            return `${block.content}\n\n`;
                    }
                }).join('')}`;
                // Simply send the preview without any buttons
                callback({
                    text: preview,
                    content: {
                        preview: true,
                        email: generatedEmail
                    }
                });
            }
            elizaLogger.info('Email generation completed successfully');
            // write email to state
            state.generatedEmail = {
                subject: generatedEmail.subject,
                blocks: generatedEmail.blocks,
                metadata: generatedEmail.metadata
            };
            // Update state again after modification
            await runtime.updateRecentMessageState(state);
            return true;
        }
        catch (error) {
            elizaLogger.error('Failed to generate email:', error);
            if (callback) {
                callback({
                    text: 'Failed to generate email. Please try again.',
                    content: { error: 'Generation failed' }
                });
            }
            return false;
        }
    }
};
