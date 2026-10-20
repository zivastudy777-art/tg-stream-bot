const { Telegraf } = require('telegraf');

const bot = new Telegraf(process.env.TG_BOT_TOKEN);

bot.start((ctx) => ctx.reply('Bot Active hai! Video send karo (<20MB).'));

bot.on('video', async (ctx) => {
    try {
        const fileId = ctx.message.video.file_id;
        const fileLink = await ctx.telegram.getFileLink(fileId);
        ctx.reply(`Aapka Direct MP4 Link:\n\n${fileLink.href}`);
    } catch (error) {
        ctx.reply('Error: File check karo ki 20MB se kam ho.');
    }
});

bot.launch();
