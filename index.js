const { Telegraf } = require('telegraf');
const http = require('http');

// Aapka token number direct fit hai
const bot = new Telegraf('8672679589:AAFj7A3kMgNGxVB64XCaY_Laomll9RF3VBQ');

bot.start((ctx) => ctx.reply('Bot Active hai! Video send karo (<20MB).'));

bot.on('video', async (ctx) => {
    try {
        const fileId = ctx.message.video.file_id;
        
        // Telegram API se direct file_path fetch karne ka 100% working tarika
        const res = await ctx.telegram.getFile(fileId);
        const filePath = res.file_path;
        
        // Yeh raha aapka direct web-playable streaming MP4 URL
        const directLink = `https://telegram.org{filePath}`;
        
        ctx.reply(`Aapka Direct MP4 Link:\n\n${directLink}`);
    } catch (error) {
        ctx.reply('Error: Link nahi bana. File format ya size (<20MB) check karein.');
    }
});

bot.launch();
console.log("Bot chalu hai...");

// Dummy server taaki Render crash na kare
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot Server is 100% Running!\n');
});

const PORT = process.env.PORT || 10000;
server.listen(PORT);
