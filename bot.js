const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const TelegramBot = require('node-telegram-bot-api');

// ---------- ТВОИ НАСТРОЙКИ (ЗАМЕНИ, ЕСЛИ НАДО) ----------
const SUPABASE_URL = 'https://owoksgyuvgvdhqrqnuwf.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93b2tzZ3l1dmd2ZGhxcnFudXdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMDQ5MTQsImV4cCI6MjA5MTY4MDkxNH0.zhZWb041DDu7IH3_9_FC4cCqYerWz_NXUil5o1jvnVg'; // ← обязательно service_role
const TELEGRAM_BOT_TOKEN = 'токен_бота';
const OWNER_CHAT_ID = 6971795823; // твой ID в Telegram

const app = express();
app.use(express.json());

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// 🔔 Webhook от Supabase (новый заказ)
app.post('/new-order', async (req, res) => {
  const { record } = req.body;
  if (!record) return res.sendStatus(400);

  const { id, description, tariff, user_id } = record;
  const { data: user } = await supabase
    .from('users')
    .select('name')
    .eq('id', user_id)
    .single();
  const userName = user?.name || 'Гость';

  const tariffText =
    tariff === 25 ? 'до 3 кг · 25₽' : tariff === 50 ? '3–5 кг · 50₽' : '5+ кг · 100₽';

  const message = `🥥 *НОВЫЙ ЗАКАЗ!*\n👤 *${userName}*\n📦 ${description}\n⚖️ ${tariffText}`;

  await bot.sendMessage(OWNER_CHAT_ID, message, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Принять', callback_data: `accept_${id}` },
          { text: '❌ Отклонить', callback_data: `reject_${id}` }
        ],
        [{ text: '💬 Ответить в чат', callback_data: `ask_${id}` }]
      ]
    }
  });

  res.sendStatus(200);
});

// 🎯 Обработка нажатий на кнопки
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const orderId = data.split('_').slice(1).join('_'); // на случай, если id с подчёркиваниями

  try {
    if (data.startsWith('accept')) {
      await supabase.from('orders').update({ status: 'accepted' }).eq('id', orderId);
      await supabase.from('messages').insert({
        order_id: orderId,
        sender_type: 'owner',
        text: '✅ Заказ принят! Ожидайте.'
      });
      await bot.answerCallbackQuery(query.id, { text: '✅ Заказ принят!' });
      await bot.sendMessage(chatId, `✅ Статус заказа обновлён: ПРИНЯТ.`);
    } else if (data.startsWith('reject')) {
      await supabase.from('orders').update({ status: 'rejected' }).eq('id', orderId);
      await supabase.from('messages').insert({
        order_id: orderId,
        sender_type: 'owner',
        text: '❌ Заказ отклонён. Свяжитесь для уточнения.'
      });
      await bot.answerCallbackQuery(query.id, { text: '❌ Заказ отклонён' });
      await bot.sendMessage(chatId, `❌ Статус заказа обновлён: ОТКЛОНЁН.`);
    } else if (data.startsWith('ask')) {
      // Запоминаем order_id в сессии пользователя (простейший вариант – через ожидание ответа)
      bot.sendMessage(chatId, `💬 Введите ответ для заказа *${orderId.slice(0, 8)}*:\n(просто напишите сообщение следующим)`, {
        parse_mode: 'Markdown'
      });
      // Сохраняем временно в памяти (в реальном проекте лучше в базе)
      userSessions[chatId] = { awaitingReplyFor: orderId };
    }
    await bot.answerCallbackQuery(query.id);
  } catch (err) {
    console.error(err);
    await bot.answerCallbackQuery(query.id, { text: '⚠️ Ошибка сервера' });
  }
});

// Временное хранилище сессий (для ответа в чат)
const userSessions = {};

// 💬 Ответ владельца на заказ (после нажатия "Ответить в чат")
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Если ждём ответа на заказ
  if (userSessions[chatId] && userSessions[chatId].awaitingReplyFor) {
    const orderId = userSessions[chatId].awaitingReplyFor;
    delete userSessions[chatId];

    if (!text) return bot.sendMessage(chatId, '❌ Пустое сообщение.');

    await supabase.from('messages').insert({
      order_id: orderId,
      sender_type: 'owner',
      text: text
    });
    bot.sendMessage(chatId, `✅ Ответ отправлен в чат заказа.`);
  }
});

app.listen(process.env.PORT || 3000, () => console.log('🚀 Бот работает'));
