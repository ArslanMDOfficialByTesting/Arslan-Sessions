const { makeid } = require('./gen-id');
const express = require('express');
const fs = require('fs');
let router = express.Router();
const pino = require("pino");
const { default: makeWASocket, useMultiFileAuthState, delay, Browsers, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys')

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
            const browserLabel = Browsers.macOS("Safari");
            let sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                generateHighQualityLinkPreview: true,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                syncFullHistory: false,
                browser: browserLabel
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

                if (connection === "open") {
                    await delay(5000);

                    const credsPath = `./temp/${id}/creds.json`;
                    const credsBuffer = fs.readFileSync(credsPath);

                    // Upload to MEGA
                    const mega_url = await upload(fs.createReadStream(credsPath), `${sock.user.id}.json`);
                    const sessionID = mega_url.replace('https://mega.nz/file/', '');
                    const sessionCode = "ARSLANMD~" + sessionID;

                    // 📎 Also send creds.json as document
                    await sock.sendMessage(sock.user.id, {
                        document: credsBuffer,
                        mimetype: 'application/json',
                        fileName: 'creds.json',
                        caption: '✅ Here is your creds.json file (keep it safe)'
                    });

                    // 📢 Send session string message
                    const desc = `*Hey Dear👋*\n\n*Don’t Share Your Session ID With Anyone❗*\n\n*Yep...This Is <| Arslan-MD👻*\n\n*THANKS FOR USING Arslan-MD*\n\n*CONNECT FOR UPDATES*: https://whatsapp.com/channel/0029VarfjW04tRrmwfb8x306\n\n>POWERED BY ArslanMD Official👻`;

                    const codeMsg = await sock.sendMessage(sock.user.id, { text: sessionCode });
                    await sock.sendMessage(sock.user.id, {
                        text: desc,
                        contextInfo: {
                            externalAdReply: {
                                title: "Professor ArslanMD Official",
                                thumbnailUrl: "https://files.catbox.moe/bxqan2.png",
                                sourceUrl: "https://whatsapp.com/channel/0029VarfjW04tRrmwfb8x306",
                                mediaType: 1,
                                renderLargerThumbnail: true
                            }
                        }
                    }, { quoted: codeMsg });

                    await delay(10);
                    await sock.ws.close();
                    await removeFile('./temp/' + id);
                    console.log(`👤 ${sock.user.id} Connected ✅ Restarting...`);
                    await delay(10);
                    process.exit();
                } else if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== 401) {
                    await delay(10);
                    GIFTED_MD_PAIR_CODE();
                }
            });
        } catch (err) {
            console.log("service restarted");
            await removeFile('./temp/' + id);
            if (!res.headersSent) {
                await res.send({ code: "❗ Service Unavailable" });
            }
        }
    }

    return await GIFTED_MD_PAIR_CODE();
});

module.exports = router;
