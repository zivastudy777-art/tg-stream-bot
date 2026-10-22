const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

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

// Receive videos from Telegram
bot.on('video', async (ctx) => {
  try {
    const video = ctx.message.video;
    const key = video.file_unique_id;

    const { error } = await supabase
      .from('videos')
      .upsert({
        id: key,
        file_id: video.file_id,
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error('Supabase save error:', error.message);
      await ctx.reply('Video save nahi ho payi. Please dobara try karo.');
      return;
    }

    const videoUrl = `${BASE_URL}/video/${key}`;

    await ctx.reply(
      `Video link:\n${videoUrl}`
    );
  } catch (error) {
    console.error('Video handler error:', error);
    await ctx.reply('Kuch error aaya. Please dobara try karo.');
  }
});

// Stream video in browser
app.get('/video/:id', async (req, res) => {
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
    const filePath = telegramFile.file_path;

    const fileUrl =
      `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${filePath}`;

    const upstream = await fetch(fileUrl);

    if (!upstream.ok || !upstream.body) {
      return res.status(502).send('Telegram se video load nahi hui.');
    }

    const contentType =
      upstream.headers.get('content-type') || 'video/mp4';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const contentLength = upstream.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    const contentRange = upstream.headers.get('content-range');
    if (contentRange) {
      res.setHeader('Content-Range', contentRange);
    }

    const acceptRanges = upstream.headers.get('accept-ranges');
    if (acceptRanges) {
      res.setHeader('Accept-Ranges', acceptRanges);
    }

    // Stream the video to the browser
    const reader = upstream.body.getReader();

    req.on('close', () => {
      reader.cancel().catch(() => {});
    });

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;
      if (res.destroyed) break;

      if (!res.write(Buffer.from(value))) {
        await new Promise((resolve) => res.once('drain', resolve));
      }
    }

    if (!res.destroyed) {
      res.end();
    }
  } catch (error) {
    console.error('Streaming error:', error);

    if (!res.headersSent) {
      res.status(500).send('Video play karne mein error aaya.');
    } else {
      res.destroy();
    }
  }
});

// Start server and bot
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

bot.launch()
  .then(() => console.log('Telegram bot started'))
  .catch((error) => console.error('Bot start error:', error));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
