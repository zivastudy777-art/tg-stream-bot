const { Telegraf } = require('telegraf');
const http = require('http');

// Aapka token number
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

// === RENDER KA LAFDA FIX KARNE KE LIYE DUMMY SERVER ===
// Render ko lagta hai ki koi website chal rahi hai, isliye yeh zaroori hai
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running smoothly!\n');
});

// Render automatic PORT variable deta hai, nahi toh 10000 use hoga
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
