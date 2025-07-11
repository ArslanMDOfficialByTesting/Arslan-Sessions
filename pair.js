const { makeid } = require('./gen-id');
const express = require('express');
const fs = require('fs');
const path = require('path');
let router = express.Router();
const pino = require("pino");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  Browsers,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');

const { upload } = require('./mega');

function removeFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  fs.rmSync(filePath, { recursive: true, force: true });
}

router.get('/', async (req, res) => {
  const id = makeid();
  let num = req.query.number;

  async function ARSLAN_AI_PAIR() {
    const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);

    try {
      let sock = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        printQRInTerminal: false,
        generateHighQualityLinkPreview: true,
        logger: pino({ level: "fatal" }).child({ level: "fatal" }),
        syncFullHistory: false,
        browser: Browsers.macOS("Safari"),
      });

      if (!sock.authState.creds.registered) {
        await delay(1500);
        num = num.replace(/[^0-9]/g, '');
        const code = await sock.requestPairingCode(num);
        if (!res.headersSent) {
          return res.send({ code });
        }
      }

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on("connection.update", async (s) => {
        const { connection, lastDisconnect } = s;

        if (connection === "open") {
          await delay(5000);

          const rf = path.join(__dirname, `/temp/${id}/creds.json`);
          const userNumber = sock.user.id.split(':')[0];

          // Save creds.json permanently
          const finalCredPath = path.join(__dirname, 'sessions', `${userNumber}_creds.json`);
          if (!fs.existsSync('./sessions')) fs.mkdirSync('./sessions');
          fs.copyFileSync(rf, finalCredPath);
          console.log(`✅ creds.json saved as ${userNumber}_creds.json`);

          // Generate session ID via MEGA
          const mega_url = await upload(fs.createReadStream(rf), `${sock.user.id}.json`);
          const session_id = "ARSL~" + mega_url.replace('https://mega.nz/file/', '');

          // Send session ID
          const msg = await sock.sendMessage(sock.user.id, {
            text: `✅ *Your Arslan-Ai Session ID:*\n\n${session_id}

🛡️ *Owner:* ArslanMD Official
📞 *Owner Number:* wa.me/923237045919
💻 *GitHub:* github.com/Arslan-MD/Arslan-Ai-2.0
▶️ *YouTube:* youtube.com/@ArslanMD
📰 *WhatsApp Channel:* Tap below 👇`,
            contextInfo: {
              externalAdReply: {
                title: "🔥 ArslanMD Official WhatsApp Channel",
                body: "Get Bot Updates, Tutorials & More!",
                thumbnailUrl: "https://i.imgur.com/GVW7aoD.jpeg",
                mediaType: 1,
                renderLargerThumbnail: true,
                sourceUrl: "https://whatsapp.com/channel/120363348739987203"
              }
            }
          });

          // Send creds.json file
          await sock.sendMessage(sock.user.id, {
            document: fs.readFileSync(rf),
            fileName: `${userNumber}_creds.json`,
            mimetype: 'application/json',
            caption: '📂 Here is your *creds.json* file.\nUse it to restore this session in the future.\n\n🚫 Don’t share this with anyone!'
          });

          await delay(1000);
          await sock.ws.close();
          await removeFile('./temp/' + id);
          console.log(`👤 ${sock.user.id} connected. Process complete.`);
          await delay(1000);
          process.exit();
        }

        else if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== 401) {
          await delay(10);
          ARSLAN_AI_PAIR();
        }
      });
    } catch (err) {
      console.log("⚠️ Service Restarted");
      removeFile('./temp/' + id);
      if (!res.headersSent) {
        return res.send({ code: "❗ Service Unavailable" });
      }
    }
  }

  return await ARSLAN_AI_PAIR();
});

module.exports = router;
