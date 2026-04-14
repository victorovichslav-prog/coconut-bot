const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const TelegramBot = require('node-telegram-bot-api');

const SUPABASE_URL = 'https://owoksgyuvgvdhqrqnuwf.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID || 6971795823;

const app = express();
app.use(express.json());

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

console.log('Бот запущен');

// Webhook: новый заказ
app.post('/new-order', async (req, res) => {
  try {
    const { record } = req.body;
    if (!record) return res.sendStatus(400);
    const { id, description, tariff, user_id } = record;
    const { data: user } = await supabase.from('users').select('name').eq('id', user_id).single();
    const userName = user?.name || 'Гость';
    const tariffText = tariff === 25 ? 'до 3 кг · 25₽' : tariff === 50 ? '3–5 кг · 50₽' : '5+ кг · 100₽';
    const message = `🥥 *НОВЫЙ ЗАКАЗ!*\n👤 *${userName}*\n📦 ${description}\n⚖️ ${tariffText}`;
    await bot.sendMessage(OWNER_CHAT_ID, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Принять', callback_data: `accept_${id}` }, { text: '❌ Отклонить', callback_data: `reject_${id}` }],
          [{ text: '💬 Ответить', callback_data: `ask_${id}` }]
        ]
      }
    });
    res.sendStatus(200);
  } catch (e) {
    console.error(e);
    res.sendStatus(500);
  }
});

// Webhook: новое сообщение от пользователя
// Webhook: новое сообщение от пользователя
app.post('/new-message', async (req, res) => {
  try {
    const { record } = req.body;
    if (!record) return res.sendStatus(400);
    const { order_id, sender_type, text } = record;
    if (sender_type === 'user') {
      const { data: order } = await supabase.from('orders').select('description').eq('id', order_id).single();
      const shortDesc = order?.description?.substring(0, 30) || 'заказ';
      
      // Отправляем уведомление владельцу С КНОПКОЙ "Ответить"
      await bot.sendMessage(OWNER_CHAT_ID, 
        `💬 *Новое сообщение в чате*\n📦 ${shortDesc}...\n\n_${text}_`, 
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '💬 Ответить', callback_data: `ask_${order_id}` }]
            ]
          }
        }
      );
    }
    res.sendStatus(200);
  } catch (e) {
    console.error(e);
    res.sendStatus(500);
  }
});

// Кнопки
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const orderId = data.split('_').slice(1).join('_');
  try {
    if (data.startsWith('accept')) {
      await supabase.from('orders').update({ status: 'accepted' }).eq('id', orderId);
      await supabase.from('messages').insert({ order_id: orderId, sender_type: 'owner', text: '✅ Заказ принят!' });
      await bot.answerCallbackQuery(query.id, { text: 'Принято' });
      await bot.sendMessage(chatId, `✅ Заказ принят`);
    } else if (data.startsWith('reject')) {
      await supabase.from('orders').update({ status: 'rejected' }).eq('id', orderId);
      await supabase.from('messages').insert({ order_id: orderId, sender_type: 'owner', text: '❌ Заказ отклонён' });
      await bot.answerCallbackQuery(query.id, { text: 'Отклонено' });
      await bot.sendMessage(chatId, `❌ Заказ отклонён`);
    } else if (data.startsWith('ask')) {
      bot.sendMessage(chatId, `Напишите ответ для заказа *${orderId.slice(0,8)}*`, { parse_mode: 'Markdown' });
      userSessions[chatId] = { awaitingReplyFor: orderId };
      await bot.answerCallbackQuery(query.id);
    }
  } catch (e) {
    console.error(e);
    await bot.answerCallbackQuery(query.id, { text: 'Ошибка' });
  }
});

const userSessions = {};
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (userSessions[chatId]?.awaitingReplyFor) {
    const orderId = userSessions[chatId].awaitingReplyFor;
    delete userSessions[chatId];
    await supabase.from('messages').insert({ order_id: orderId, sender_type: 'owner', text });
    bot.sendMessage(chatId, `✅ Ответ отправлен в чат`);
  }
});
// ========== БЛОКИРОВКА ПОЛЬЗОВАТЕЛЕЙ ==========

// /ban Имя
bot.onText(/\/ban (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (chatId !== OWNER_CHAT_ID) return;
  const userName = match[1].trim();
  const { data: exist } = await supabase.from('blocked_users').select('id').eq('user_name', userName).maybeSingle();
  if (exist) return bot.sendMessage(chatId, `⚠️ "${userName}" уже заблокирован.`);
  await supabase.from('blocked_users').insert({ user_name: userName });
  bot.sendMessage(chatId, `🔒 "${userName}" заблокирован.`);
});

// /unban Имя
bot.onText(/\/unban (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (chatId !== OWNER_CHAT_ID) return;
  const userName = match[1].trim();
  await supabase.from('blocked_users').delete().eq('user_name', userName);
  bot.sendMessage(chatId, `🔓 "${userName}" разблокирован.`);
});
// /blocklist
bot.onText(/\/blocklist/, async (msg) => {
  const chatId = msg.chat.id;
  if (chatId !== OWNER_CHAT_ID) return;
  const { data } = await supabase.from('blocked_users').select('user_name, blocked_at').order('blocked_at', { ascending: false });
  if (!data?.length) return bot.sendMessage(chatId, '📭 Список пуст.');
  let text = '🚫 *Заблокированные:*\n';
  data.forEach((u, i) => text += `${i+1}. ${u.user_name}\n`);
  bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
});

app.listen(process.env.PORT || 3000, () => console.log('Server running'));
