require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

const app = express();
const token = process.env.BOT_TOKEN || '8154262635:AAFiVgBwkZWVYYuq_wow1GxCIpbZ7tbfXzs';
const apiEndpoint = process.env.API_ENDPOINT || 'https://api.dreaded.site/api/chatgpt';
const port = process.env.PORT || 3000;

const bot = new Telegraf(token);
let userSessions = new Map();

// Session manager middleware
bot.use(async (ctx, next) => {
  const userId = ctx.from.id;
  if (!userSessions.has(userId)) {
    userSessions.set(userId, {
      history: [],
      mode: 'chatgpt',
      lastResponse: ''
    });
  }
  ctx.session = userSessions.get(userId);
  await next();
});

// AI response generator
async function getAIResponse(prompt, session) {
  try {
    const response = await axios.post(apiEndpoint, {
      message: prompt,
      context: session.history.slice(-3).join('\n')
    });
    return response.data.response || response.data;
  } catch (error) {
    console.error('API Error:', error.response?.data || error.message);
    return '⚠️ Sorry, the AI service is unavailable right now. Please try again later.';
  }
}

// Command handlers
bot.start((ctx) => {
  const welcomeMessage = `🤖 Welcome to AI Assistant!\n\n` +
    `I can help with:\n` +
    `• Answering questions\n` +
    `• Creative writing\n` +
    `• Code generation\n` +
    `• And much more!\n\n` +
    `Try /help for commands menu`;
  
  ctx.reply(welcomeMessage, Markup.inlineKeyboard([
    [Markup.button.callback('🚀 Try AI Now', 'new_chat')],
    [Markup.button.url('⭐ Rate Us', 'https://t.me/yourchannel')]
  ]));
});

bot.help((ctx) => {
  ctx.replyWithHTML(
    '<b>Available Commands:</b>\n\n' +
    '/start - Start new conversation\n' +
    '/new - Reset chat history\n' +
    '/mode - Switch AI modes\n' +
    '/help - Show this help\n\n' +
    '<b>Special Features:</b>\n' +
    '• Context-aware conversations\n' +
    '• Interactive response options\n' +
    '• Multi-mode AI support',
    Markup.keyboard([
      ['/new', '/mode'],
      ['Ask something interesting!']
    ]).resize()
  );
});

bot.command('new', (ctx) => {
  ctx.session.history = [];
  ctx.reply('🆕 Chat history cleared! Starting fresh...');
});

bot.command('mode', (ctx) => {
  ctx.reply('Select AI Mode:', Markup.inlineKeyboard([
    [Markup.button.callback('💬 ChatGPT (Default)', 'mode_chatgpt')],
    [Markup.button.callback('💡 Creative Writer', 'mode_creative')],
    [Markup.button.callback('👨‍💻 Code Assistant', 'mode_code')]
  ]));
});

// Action handlers
bot.action('new_chat', async (ctx) => {
  ctx.session.history = [];
  await ctx.editMessageText('🆕 New chat started! Ask me anything:');
});

bot.action(/^mode_/, async (ctx) => {
  const mode = ctx.match[0].split('_')[1];
  ctx.session.mode = mode;
  await ctx.editMessageText(`✅ Switched to ${mode.toUpperCase()} mode!`);
});

bot.action('continue', async (ctx) => {
  await ctx.sendChatAction('typing');
  const continuedResponse = await getAIResponse('continue from: ' + ctx.session.lastResponse, ctx.session);
  ctx.session.lastResponse = continuedResponse;
  
  ctx.reply(continuedResponse, Markup.inlineKeyboard([
    Markup.button.callback('🔁 Continue', 'continue'),
    Markup.button.callback('🔄 Rephrase', 'rephrase')
  ]));
});

// Message handler
bot.on('text', async (ctx) => {
  const userInput = ctx.message.text;
  if (userInput.length > 500) {
    return ctx.reply('❌ Message too long! Please limit to 500 characters.');
  }

  ctx.session.history.push(`User: ${userInput}`);
  await ctx.sendChatAction('typing');

  try {
    const aiResponse = await getAIResponse(userInput, ctx.session);
    ctx.session.lastResponse = aiResponse;
    ctx.session.history.push(`AI: ${aiResponse}`);

    ctx.reply(aiResponse, Markup.inlineKeyboard([
      Markup.button.callback('🔁 Continue', 'continue'),
      Markup.button.callback('🔄 Rephrase', 'rephrase'),
      Markup.button.callback('📝 Summarize', 'summarize')
    ]));
  } catch (error) {
    ctx.reply('🚨 Error processing your request. Please try again.');
    console.error('Processing Error:', error);
  }
});

// Webhook setup for Render
if (process.env.NODE_ENV === 'production') {
  app.use(bot.webhookCallback('/'));
  bot.telegram.setWebhook(`${process.env.RENDER_EXTERNAL_URL}/`);
} else {
  bot.launch();
}

// Start Express server
app.listen(port, () => {
  console.log(`🚀 Bot running on port ${port}`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));