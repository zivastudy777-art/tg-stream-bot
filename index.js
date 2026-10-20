const http = require('http');
const https = require('https');

const TOKEN = '8672679589:AAFj7A3kMgNGxVB64XCaY_Laomll9RF3VBQ';

// Render ko khush rakhne ke liye dummy server
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot Server is 100% Live!\n');
});

// Telegram Webhook ya Long Polling bypass karne ke liye interval
setInterval(() => {
    https.get(`https://telegram.org{TOKEN}/getUpdates?offset=-1`, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                if (json.result && json.result.length > 0) {
                    const msg = json.result[0].message;
                    if (msg && msg.video) {
                        const fileId = msg.video.file_id;
                        console.log("Video mili! File ID:", fileId);
                    }
                }
            } catch (e) {}
        });
    });
}, 3000);

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
