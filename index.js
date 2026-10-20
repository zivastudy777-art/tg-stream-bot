const { Telegraf } = require('telegraf');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = process.env.BOT_TOKEN;
const BASE_URL = process.env.RENDER_EXTERNAL_URL;

if (!BOT_TOKEN || !BASE_URL) {
  throw new Error('BOT_TOKEN aur RENDER_EXTERNAL_URL configure karo.');
}

const bot = new Telegraf(BOT_TOKEN);
const DATA_DIR = process.env.DATA_DIR || './data';
const DB_FILE = path.join(DATA_DIR, 'videos.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

function loadVideos() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return {};
  }
}

let videos = loadVideos();

function saveVideos() {
  const temp = DB_FILE + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(videos, null, 2));
  fs.renameSync(temp, DB_FILE);
}

bot.start(ctx => {
  ctx.reply('Bot active hai! MP4 video upload karo.');
});

bot.on('video', async ctx => {
  try {
    const video = ctx.message.video;

    if (!video.file_id) {
      return ctx.reply('Video file ID nahi mila.');
    }

    const key = crypto.randomBytes(24).toString('hex');

    videos[key] = {
      fileId: video.file_id,
      createdAt: Date.now(),
      mimeType: video.mime_type || 'video/mp4'
    };

    saveVideos();

    const link = `${BASE_URL.replace(/\/$/, '')}/video/${key}`;

    await ctx.reply(
      `Video link:\n${link}\n\nIs link ko apni website ke video player mein use karo.`
    );
  } catch (err) {
    console.error('Video error:', err);
    ctx.reply('Video link generate nahi hua. Render logs check karo.');
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

  const item = videos[match[1]];

  if (!item) {
    res.writeHead(404);
    return res.end('Video link not found');
  }

  try {
    const file = await bot.telegram.getFile(item.fileId);

    const telegramUrl =
      `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;

    const headers = {};

    if (req.headers.range) {
      headers.Range = req.headers.range;
    }

    const upstream = await fetch(telegramUrl, { headers });

    if (!upstream.ok && upstream.status !== 206) {
      res.writeHead(502);
      return res.end('Telegram video fetch failed');
    }

    const responseHeaders = {
      'Content-Type': item.mimeType,
      'Cache-Control': 'no-store',
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*'
    };

    for (const name of ['content-length', 'content-range', 'accept-ranges']) {
      const value = upstream.headers.get(name);
      if (value) {
        responseHeaders[name.replace(/(^|-)(\w)/g, (_, a, b) =>
          a + b.toUpperCase()
        )] = value;
      }
    }

    res.writeHead(upstream.status, responseHeaders);

    if (!upstream.body) {
      return res.end();
    }

    const reader = upstream.body.getReader();

    req.on('close', () => {
      reader.cancel().catch(() => {});
    });

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;
      if (res.destroyed) break;

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
