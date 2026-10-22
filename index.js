const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.RENDER_EXTERNAL_URL;

app.get('/', (req, res) => {
  res.send('Telegram video service running.');
});

// Receive videos and save their information in Supabase
bot.on('video', async (ctx) => {
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
      console.error('Supabase error:', error.message);
      await ctx.reply('Video save nahi hui. Please dobara try karo.');
      return;
    }

    const videoUrl = `${BASE_URL}/video/${key}`;

    await ctx.reply(`Video link:\n${videoUrl}`);
  } catch (error) {
    console.error('Video handler error:', error);
    await ctx.reply('Video process nahi ho payi.');
  }
});

// Stream video with Range support for browser playback
app.get('/video/:id', async (req, res) => {
  let upstream;

  try {
    const { data, error } = await supabase
      .from('videos')
      .select('file_id')
      .eq('id', req.params.id)
      .single();

    if (error || !data) {
      return res.status(404).send('Video nahi mili.');
    }

    const telegramFile = await bot.telegram.getFile(data.file_id);

    if (!telegramFile.file_path) {
      return res.status(404).send('Telegram video file nahi mili.');
    }

    const fileUrl =
      `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${telegramFile.file_path}`;

    const headers = {};

    // Forward browser Range requests so video seeking works
    if (req.headers.range) {
      headers.Range = req.headers.range;
    }

    upstream = await fetch(fileUrl, { headers });

    if (!upstream.ok || !upstream.body) {
      console.error('Telegram fetch failed:', upstream.status);
      return res.status(502).send('Telegram se video load nahi hui.');
    }

    // Preserve the upstream response status, including 206 Partial Content
    res.status(upstream.status);

    res.setHeader(
      'Content-Type',
      upstream.headers.get('content-type') || 'video/mp4'
    );

    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'no-store');

    const contentLength = upstream.headers.get('content-length');
    const contentRange = upstream.headers.get('content-range');
    const acceptRanges = upstream.headers.get('accept-ranges');

    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    if (contentRange) {
      res.setHeader('Content-Range', contentRange);
    }

    if (acceptRanges) {
      res.setHeader('Accept-Ranges', acceptRanges);
    }

    const nodeStream = Readable.fromWeb(upstream.body);

    // Stop streaming if the browser disconnects
    res.on('close', () => {
      if (!res.writableEnded) {
        nodeStream.destroy();
      }
    });

    await pipeline(nodeStream, res);
  } catch (error) {
    console.error('Streaming error:', error.message);

    if (!res.headersSent) {
      res.status(500).send('Video play karne mein error aaya.');
    } else if (!res.destroyed) {
      res.destroy();
    }
  }
});

// Start server and Telegram bot
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

bot.launch()
  .then(() => console.log('Telegram bot started'))
  .catch((error) => console.error('Bot start error:', error));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
