const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Hardcoded credentials as requested
const BOT_TOKEN = '8154262635:AAFiVgBwkZWVYYuq_wow1GxCIpbZ7tbfXzs';
const API_ENDPOINT = 'https://api.dreaded.site/api/chatgpt';

const bot = new Telegraf(BOT_TOKEN);
let userSessions = {};

// Improved AI response handler
async function getAIResponse(message, userId) {
    try {
        const response = await axios.post(API_ENDPOINT, {
            message: message,
            user_id: userId.toString()  // API might require user identification
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            timeout: 30000  // 30-second timeout
        });

        // Handle different response formats
        if (typeof response.data === 'string') {
            return response.data;
        } else if (response.data.response) {
            return response.data.response;
        } else if (response.data.choices && response.data.choices[0].text) {
            return response.data.choices[0].text;
        } else {
            return JSON.stringify(response.data);
        }
    } catch (error) {
        console.error('API Error:', error.response?.data || error.message);
        
        // User-friendly error messages
        if (error.code === 'ECONNABORTED') {
            return '⏱️ The AI is taking too long to respond. Please try a shorter request.';
        } else if (error.response?.status === 429) {
            return '🚫 Too many requests! Please wait a minute and try again.';
        } else {
            return '⚠️ The AI service is currently unavailable. Please try again later.';
        }
    }
}

// Session management middleware
bot.use(async (ctx, next) => {
    const userId = ctx.from.id;
    if (!userSessions[userId]) {
        userSessions[userId] = {
            history: [],
            mode: 'general',
            lastInteraction: Date.now()
        };
    }
    ctx.session = userSessions[userId];
    ctx.session.lastInteraction = Date.now();
    await next();
});

// Start command with enhanced UI
bot.start((ctx) => {
    const welcomeMessage = `🌟 <b>AI Assistant Powered by ChatGPT</b> 🌟\n\n` +
        `I can help with:\n` +
        `• Answering complex questions\n` +
        `• Creative writing & brainstorming\n` +
        `• Programming & technical help\n` +
        `• Language translation\n` +
        `• And much more!\n\n` +
        `Try these commands:\n` +
        `/new - Start fresh conversation\n` +
        `/mode - Change AI personality\n` +
        `/help - Show all commands`;
    
    ctx.replyWithHTML(welcomeMessage, Markup.inlineKeyboard([
        [Markup.button.callback('💬 Ask Question', 'quick_question')],
        [Markup.button.callback('📝 Creative Writing', 'creative_writing')],
        [Markup.button.callback('👨‍💻 Code Help', 'code_help')]
    ]));
});

// Help command
bot.help((ctx) => {
    ctx.replyWithHTML(
        '<b>🚀 Advanced AI Commands:</b>\n\n' +
        '/new - Reset conversation history\n' +
        '/mode - Switch AI personalities\n' +
        '/help - Show this help message\n' +
        '/feedback - Send your suggestions\n\n' +
        '<b>💡 Pro Tip:</b> Use buttons below responses to continue conversations!',
        Markup.keyboard([
            ['/new', '/mode'],
            ['Ask something interesting!']
        ]).resize()
    );
});

// New conversation command
bot.command('new', (ctx) => {
    ctx.session.history = [];
    ctx.reply('🆕 Conversation history cleared! I\'m ready for a new topic.', 
        Markup.removeKeyboard());
});

// Mode selection command
bot.command('mode', (ctx) => {
    ctx.reply('Select AI Personality:', Markup.inlineKeyboard([
        [Markup.button.callback('🤖 General Assistant', 'mode_general')],
        [Markup.button.callback('📚 Academic Researcher', 'mode_academic')],
        [Markup.button.callback('😂 Humorous Companion', 'mode_funny')],
        [Markup.button.callback('👨‍💻 Code Expert', 'mode_coder')]
    ]));
});

// Handle callback queries
bot.action(/^mode_/, (ctx) => {
    const mode = ctx.match[0].split('_')[1];
    ctx.session.mode = mode;
    ctx.editMessageText(`✅ Switched to ${mode.charAt(0).toUpperCase() + mode.slice(1)} mode!`);
});

bot.action('continue', async (ctx) => {
    await ctx.sendChatAction('typing');
    const continuedResponse = await getAIResponse(
        "Continue your last response: " + ctx.session.lastResponse, 
        ctx.from.id
    );
    
    ctx.session.lastResponse = continuedResponse;
    ctx.reply(continuedResponse, Markup.inlineKeyboard([
        Markup.button.callback('🔁 Continue', 'continue'),
        Markup.button.callback('🔄 Rephrase', 'rephrase')
    ]));
});

// Main message handler
bot.on('text', async (ctx) => {
    const userInput = ctx.message.text;
    
    // Input validation
    if (!userInput.trim()) {
        return ctx.reply('❌ Please send a valid message.');
    }
    if (userInput.length > 1000) {
        return ctx.reply('❌ Message too long! Please limit to 1000 characters.');
    }
    
    await ctx.sendChatAction('typing');
    
    try {
        // Add mode context to the request
        const modePrefix = ctx.session.mode === 'general' ? '' : 
            `[Respond in ${ctx.session.mode} mode] `;
        
        const fullPrompt = modePrefix + userInput;
        const aiResponse = await getAIResponse(fullPrompt, ctx.from.id);
        
        // Store session data
        ctx.session.lastResponse = aiResponse;
        ctx.session.history.push({user: userInput, ai: aiResponse});
        
        // Trim history to prevent excessive memory usage
        if (ctx.session.history.length > 10) {
            ctx.session.history.shift();
        }
        
        // Send response with interactive buttons
        ctx.reply(aiResponse, Markup.inlineKeyboard([
            Markup.button.callback('🔁 Continue', 'continue'),
            Markup.button.callback('🔄 Rephrase', 'rephrase'),
            Markup.button.callback('📝 Summarize', 'summarize')
        ]));
    } catch (error) {
        console.error('Processing Error:', error);
        ctx.reply('🚨 An error occurred. Please try your request again.');
    }
});

// Webhook configuration for Render
app.use(express.json());
app.use(bot.webhookCallback('/'));
bot.telegram.setWebhook(`https://${process.env.RENDER_APP_NAME}.onrender.com/`);

// Start server
app.listen(PORT, () => {
    console.log(`🤖 AI Bot running on port ${PORT}`);
    console.log(`🟢 Webhook set to: https://${process.env.RENDER_APP_NAME}.onrender.com/`);
});

// Clean up inactive sessions
setInterval(() => {
    const now = Date.now();
    for (const userId in userSessions) {
        if (now - userSessions[userId].lastInteraction > 30 * 60 * 1000) { // 30 minutes
            delete userSessions[userId];
        }
    }
}, 10 * 60 * 1000); // Check every 10 minutes

// Graceful shutdown
process.on('SIGINT', () => bot.stop('SIGINT'));
process.on('SIGTERM', () => bot.stop('SIGTERM'));
