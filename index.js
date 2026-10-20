const { Telegraf } = require('telegraf');

// Aapka token number direct code me fit kar diya hai
const bot = new Telegraf('8672679589:AAFj7A3kMgNGxVB64XCaY_Laomll9RF3VBQ');

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
console.log("Bot chalu hai...");
