const { Telegraf } = require('telegraf');
const http = require('http');

const bot = new Telegraf('8672679589:AAFj7A3kMgNGxVB64XCaY_Laomll9RF3VBQ');

bot.start((ctx) => ctx.reply('Bot Active hai! Video ya File send karo (<20MB).'));

// Yeh function link nikalne ka kaam karein ga
async function handleFile(ctx, fileId) {
    try {
        const fileLink = await ctx.telegram.getFileLink(fileId);
        ctx.reply(`Aapka Direct MP4 Link:\n\n${fileLink.href}`);
    } catch (error) {
        ctx.reply('Error: Link generate nahi ho paya. File size check karein.');
    }
}

// Agar video format me aaye
bot.on('video', (ctx) => {
    const fileId = ctx.message.video.file_id;
    handleFile(ctx, fileId);
});

// Agar document (uncompressed video) format me aaye
bot.on('document', (ctx) => {
    const fileId = ctx.message.document.file_id;
    handleFile(ctx, fileId);
});

bot.launch();
console.log("Bot chalu hai...");

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running smoothly!\n');
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
