const { makeid } = require('./gen-id');
const express = require('express');
const fs = require('fs');
let router = express.Router();
const pino = require("pino");
const { default: makeWASocket, useMultiFileAuthState, delay, Browsers, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const { upload } = require('./mega');

function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true });
}

router.get('/', async (req, res) => {
    const id = makeid();
    let num = req.query.number;

    async function GIFTED_MD_PAIR_CODE() {
        const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);

        try {
            const items = ["Safari"];
            const randomItem = items[Math.floor(Math.random() * items.length)];

            let sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                generateHighQualityLinkPreview: true,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                syncFullHistory: false,
                browser: Browsers.macOS(randomItem)
            });

            if (!sock.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                const code = await sock.requestPairingCode(num);
                if (!res.headersSent) {
                    await res.send({ code });
                }
            }

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection == "open") {
                    await delay(5000);
                    let rf = __dirname + `/temp/${id}/creds.json`;

                    function generateRandomText() {
                        const prefix = "3EB";
                        const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
                        let randomText = prefix;
                        for (let i = prefix.length; i < 22; i++) {
                            const randomIndex = Math.floor(Math.random() * characters.length);
                            randomText += characters.charAt(randomIndex);
                        }
                        return randomText;
                    }

                    const randomText = generateRandomText();

                    try {
                        const mega_url = await upload(fs.createReadStream(rf), `${sock.user.id}.json`);
                        const string_session = mega_url.replace('https://mega.nz/file/', '');
                        let md = "ARSL~" + string_session;

                        let code = await sock.sendMessage(sock.user.id, { text: md });

                        // ✅ Send creds.json to user's inbox
                        await sock.sendMessage(sock.user.id, {
                            document: fs.readFileSync(rf),
                            fileName: `${sock.user.id.split(':')[0]}_creds.json`,
                            mimetype: 'application/json',
                            caption: '📂 Here is your *creds.json* file.\nUse it to restore this session in the future.\n\n🚫 Don’t share this with anyone!'
                        });

                        let desc = `*Hey Dear👋*\n\n*Don’t Share Your Session ID With Your Gf🤣*\n\n*Yep...This Is <| 𝐊𝐈𝐍𝐆-𝐒𝐀𝐍𝐃𝐄𝐒𝐇-𝐌𝐃👻*\n\n*THANKS FOR USING KING-SANDESH-MD*\n\n*CONNECT FOR UPDATES*: https://whatsapp.com/channel/0029Vb5saAU4Y9lfzhgBmS2N\n\n> ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴋɪɴɢ ꜱᴀɴᴅᴇꜱʜ ᴍᴜʟᴛɪ ᴅᴇᴠɪᴄᴇ👻\n`;

                        await sock.sendMessage(sock.user.id, {
                            text: desc,
                            contextInfo: {
                                externalAdReply: {
                                    title: "Professor Sandesh Bhashana",
                                    thumbnailUrl: "https://i.imgur.com/GVW7aoD.jpeg",
                                    sourceUrl: "https://whatsapp.com/channel/0029Vb5saAU4Y9lfzhgBmS2N",
                                    mediaType: 1,
                                    renderLargerThumbnail: true
                                }
                            }
                        }, { quoted: code });

                    } catch (e) {
                        let ddd = await sock.sendMessage(sock.user.id, { text: e });
                        let desc = `*Don't Share with anyone this code use for deploy KING-SANDESH-MD*\n\n ◦ *Github:* https://github.com/vijitharanawakage/KING-SANDESH-MD`;
                        await sock.sendMessage(sock.user.id, {
                            text: desc,
                            contextInfo: {
                                externalAdReply: {
                                    title: "KING-SANDESH-MD",
                                    thumbnailUrl: "https://i.imgur.com/GVW7aoD.jpeg",
                                    sourceUrl: "https://whatsapp.com/channel/0029Vb5saAU4Y9lfzhgBmS2N",
                                    mediaType: 2,
                                    renderLargerThumbnail: true,
                                    showAdAttribution: true
                                }
                            }
                        }, { quoted: ddd });
                    }

                    await delay(10);
                    await sock.ws.close();
                    await removeFile('./temp/' + id);
                    console.log(`👤 ${sock.user.id} Connected ✅ Restarting process...`);
                    await delay(10);
                    process.exit();
                }

                else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode != 401) {
                    await delay(10);
                    GIFTED_MD_PAIR_CODE();
                }
            });

        } catch (err) {
            console.log("service restated");
            await removeFile('./temp/' + id);
            if (!res.headersSent) {
                await res.send({ code: "❗ Service Unavailable" });
            }
        }
    }

    return await GIFTED_MD_PAIR_CODE();
});

module.exports = router;
