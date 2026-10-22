const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const http = require('http');
const crypto = require('crypto');

const BOT_TOKEN = process.env.BOT_TOKEN;
const BASE_URL = process.env.RENDER_EXTERNAL_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!BOT_TOKEN || !BASE_URL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('BOT_TOKEN, RENDER_EXTERNAL_URL aur Supabase variables check karo.');
}

const bot = new Telegraf(BOT_TOKEN);

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

bot.start(ctx => {
  ctx.reply('Bot active hai! Gallery se video bhejo, link mil jayega.');
});

// Mobile gallery se Video ke roop mein bheji gayi files
bot.on('video', async ctx => {
  try {
    const video = ctx.message.video;
    const key = crypto.randomBytes(24).toString('hex');

    const { error } = await supabase
      .from('videos')
      .insert({
        id: key,
        file_id: video.file_id,
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error('Supabase insert error:', error.message);
      return ctx.reply('Database mein save nahi hua. Admin ko logs check karne honge.');
    }

    const link = `${BASE_URL.replace(/\/$/, '')}/video/${key}`;

    await ctx.reply(`Video link:\n${link}`);
  } catch (err) {
    console.error('Video upload error:', err);
    await ctx.reply('Video process nahi hui. Render logs check karo.');
  }
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('Telegram video service running.');
  }

  const match = url.pathname.match(/^\/video\/([a-f0-9]{48})$/);

  if (!match) {
    res.writeHead(404);
    return res.end('Not found');
  }

  try {
    const { data: item, error } = await supabase
      .from('videos')
      .select('file_id')
      .eq('id', match[1])
      .maybeSingle();

    if (error) {
      console.error('Supabase lookup error:', error.message);
      res.writeHead(500);
      return res.end('Database lookup failed');
    }

    if (!item) {
      res.writeHead(404);
      return res.end('Video link not found');
    }

    const file = await bot.telegram.getFile(item.file_id);
    const telegramUrl =
      `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;

    const headers = {};
    if (req.headers.range) headers.Range = req.headers.range;

    const upstream = await fetch(telegramUrl, { headers });

    if (!upstream.ok && upstream.status !== 206) {
      res.writeHead(502);
      return res.end('Telegram video fetch failed');
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';

    const responseHeaders = {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*'
    };

    for (const name of ['content-length', 'content-range']) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders[name] = value;
    }

    res.writeHead(upstream.status, responseHeaders);

    if (!upstream.body) return res.end();

    const reader = upstream.body.getReader();

    req.on('close', () => {
      reader.cancel().catch(() => {});
    });

    while (true) {
      const { done, value } = await reader.read();
      if (done || res.destroyed) break;

      if (!res.write(Buffer.from(value))) {
        await new Promise(resolve => res.once('drain', resolve));
      }
    }

    if (!res.destroyed) res.end();
  } catch (err) {
    console.error('Streaming error:', err);

    if (!res.headersSent) {
      res.writeHead(500);
      res.end('Video streaming error');
    } else {
      res.destroy();
    }
  }
});

const PORT = process.env.PORT || 10000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP server listening on ${PORT}`);
});

bot.launch().catch(err => {
  console.error('Telegram bot failed to start:', err);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
