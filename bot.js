const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const TelegramBot = require('node-telegram-bot-api');

// ЗАМЕНИ ЗДЕСЬ ↓↓↓
const SUPABASE_URL = 'https://owoksgyuvgvdhqrqnuwf.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93b2tzZ3l1dmd2ZGhxcnFudXdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMDQ5MTQsImV4cCI6MjA5MTY4MDkxNH0.zhZWb041DDu7IH3_9_FC4cCqYerWz_NXUil5o1jvnVg';
const TELEGRAM_BOT_TOKEN = '8595671244:AAG99X4AejQXZ5nk_n_0odfsd9kQGAI7Ah8';
const OWNER_CHAT_ID = 6971795823;

const app = express();
app.use(express.json());
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

console.log('Бот запущен и ждёт сообщения...');

// Когда приходит новый заказ (вызов через Supabase Webhook)
app.post('/new-order', async (req, res) => {
  const { record } = req.body;
  if (!record) return res.sendStatus(400);
  const { id, description, tariff } = record;
  let tariffText = tariff === 25 ? 'до 3 кг · 25₽' : (tariff === 50 ? '3–5 кг · 50₽' : '5+ кг · 100₽');
  await bot.sendMessage(OWNER_CHAT_ID, `🥥 НОВЫЙ ЗАКАЗ!\n📦 ${description}\n⚖️ ${tariffText}\n\nНапиши ответ: принять ${id.slice(0,8)} или отклонить ${id.slice(0,8)}`);
  res.sendStatus(200);
});

// Обработка команд от тебя
bot.onText(/принять (.+)/, async (msg, match) => {
  const shortId = match[1];
  const { data: orders } = await supabase.from('orders').select('id').ilike('id', `${shortId}%`);
  if (!orders || orders.length === 0) return bot.sendMessage(OWNER_CHAT_ID, 'Заказ не найден');
  const orderId = orders[0].id;
  await supabase.from('orders').update({ status: 'accepted' }).eq('id', orderId);
  await supabase.from('messages').insert({ order_id: orderId, sender_type: 'owner', text: '✅ Заказ принят!' });
  bot.sendMessage(OWNER_CHAT_ID, '✅ Статус обновлён: Принят');
});

bot.onText(/отклонить (.+)/, async (msg, match) => {
  const shortId = match[1];
  const { data: orders } = await supabase.from('orders').select('id').ilike('id', `${shortId}%`);
  if (!orders || orders.length === 0) return bot.sendMessage(OWNER_CHAT_ID, 'Заказ не найден');
  const orderId = orders[0].id;
  await supabase.from('orders').update({ status: 'rejected' }).eq('id', orderId);
  await supabase.from('messages').insert({ order_id: orderId, sender_type: 'owner', text: '❌ Заказ отклонён' });
  bot.sendMessage(OWNER_CHAT_ID, '❌ Статус обновлён: Отклонён');
});

bot.onText(/ответ (.+?) (.+)/, async (msg, match) => {
  const shortId = match[1];
  const text = match[2];
  const { data: orders } = await supabase.from('orders').select('id').ilike('id', `${shortId}%`);
  if (!orders || orders.length === 0) return bot.sendMessage(OWNER_CHAT_ID, 'Заказ не найден');
  const orderId = orders[0].id;
  await supabase.from('messages').insert({ order_id: orderId, sender_type: 'owner', text });
  bot.sendMessage(OWNER_CHAT_ID, '✅ Ответ отправлен в чат');
});

app.listen(3000, () => console.log('Сервер на порту 3000'));