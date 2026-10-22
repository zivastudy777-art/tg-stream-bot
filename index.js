const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const crypto = require('crypto');
const { Readable, pipeline } = require('stream'); // स्ट्रीम हैंडलिंग के लिए ट्रेडिशनल पाइपलाइन का इस्तेमाल

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

// टेलीग्राम से वीडियो रिसीव करना और Supabase में सेव करना (अपरिवर्तित)
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

// मुख्य स्ट्रीमिंग रूट - वीडियो प्लेबैक फिक्स के साथ
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

    if (!telegramFile.file_path) {
      return res.status(404).send('Telegram video file nahi mili.');
    }

    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${telegramFile.file_path}`;
    const headers = {};

    // ब्राउज़र के Range रिक्वेस्ट को हैंडल करना ताकि Seeking (आगे-पीछे करना) काम करे
    if (req.headers.range) {
      headers.Range = req.headers.range;
    }

    const upstream = await fetch(fileUrl, { headers });

    if (!upstream.ok || !upstream.body) {
      console.error('Telegram fetch failed:', upstream.status);
      return res.status(502).send('Telegram se video load nahi hui.');
    }

    // ब्राउज़र को डाउनलोडिंग से रोकने के लिए सही Content-Type सेट करना
    let contentType = upstream.headers.get('content-type') || 'video/mp4';
    if (contentType.includes('octet-stream') || !contentType.startsWith('video/')) {
      contentType = 'video/mp4'; // फ़ोर्स वीडियो प्लेबैक हेडर
    }

    const contentLength = upstream.headers.get('content-length');
    const contentRange = upstream.headers.get('content-range');

    // हेडर्स को ब्राउज़र फ्रेंडली और इनलाइन प्लेबैक के अनुकूल बनाना
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'inline'); // ब्राउज़र में सीधे प्ले करने का निर्देश
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // बफरिंग स्मूथ करने के लिए थोड़ा कैश बैकएंड सपोर्ट

    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (contentRange) res.setHeader('Content-Range', contentRange);

    // टेलीग्राम सर्वर का सही स्टेटस कोड रिफ्लेक्ट करना (जैसे 206 Partial Content)
    res.status(upstream.status);

    // वेब स्ट्रीम को नोड स्ट्रीम में कन्वर्ट करना
    const nodeStream = Readable.fromWeb(upstream.body);

    // यदि ब्राउज़र कनेक्शन काट देता है या टैब बंद करता है तो स्ट्रीम को नष्ट करना
    res.on('close', () => {
      if (!res.writableEnded) {
        nodeStream.destroy();
      }
    });

    // डेटा को बिना करप्शन के सुरक्षित पाइप करना
    pipeline(nodeStream, res, (err) => {
      if (err) {
        console.error('Pipeline streaming error:', err.message);
        if (!res.headersSent) {
          res.status(500).send('Streaming fail ho gayi.');
        }
      }
    });

  } catch (error) {
    console.error('Server side streaming error:', error.message);
    if (!res.headersSent) {
      res.status(500).send('Video play karne mein error aaya.');
    }
  }
});

// सर्वर और टेलीग्राम बॉट चालू करना
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

bot.launch()
  .then(() => console.log('Telegram bot started'))
  .catch((error) => console.error('Bot start error:', error));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
