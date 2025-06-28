const { makeid } = require('./gen-id');
const express = require('express');
const fs = require('fs');
const router = express.Router();
const pino = require("pino");
const { 
  makeWASocket, 
  useMultiFileAuthState, 
  delay, 
  Browsers,
  DisconnectReason
} = require('@whiskeysockets/baileys');

const SESSION_DIR = './temp'; // Pehle wale jaisa temp folder

async function removeFile(path) {
  if (fs.existsSync(path)) fs.rmSync(path, { recursive: true, force: true });
}

router.get('/', async (req, res) => {
  const id = makeid();
  let num = req.query.number?.replace(/[^0-9]/g, '');

  if (!num) return res.status(400).json({ error: "Number required (923001234567)" });

  async function ARSLAN_PAIR_CODE() {
    const { state, saveCreds } = await useMultiFileAuthState(`${SESSION_DIR}/${id}`);
    let responseSent = false;

    try {
      // Pehle wala browser selection logic
      const browsers = ["Safari", "Chrome", "Firefox"];
      const randomBrowser = browsers[Math.floor(Math.random() * browsers.length)];

      const sock = makeWASocket({
        auth: {
          creds: state.creds,
          keys: state.keys,
        },
        printQRInTerminal: false,
        browser: Browsers.macOS(randomBrowser), // Pehle wala random selection
        logger: pino({ level: "fatal" }), // Pehle wala fatal log level
        syncFullHistory: false,
        connectTimeoutMs: 30000
      });

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === "open") {
          if (responseSent) return;
          responseSent = true;

          // Pehle wala MEGA upload logic
          const credsPath = `${SESSION_DIR}/${id}/creds.json`;
          const { upload } = require('./mega');
          const mega_url = await upload(fs.createReadStream(credsPath), `${sock.user.id}.json`);
          const sessionCode = `ARSL~${mega_url.replace('https://mega.nz/file/', '')}`;

          // Pehle wala message format
          await sock.sendMessage(sock.user.id, { 
            text: `*ARSLAN-AI SESSION*\n\n${sessionCode}\n\n` +
                  `*DO NOT SHARE*\n` +
                  `Bot by: ARSLAN-MD\n` +
                  `Support: https://whatsapp.com/channel/0029Vb5saAU4Y9lfzhgBmS2N`
          });

          await sock.ws.close();
          await removeFile(`${SESSION_DIR}/${id}`);
          process.exit(0);
        }

        if (connection === "close") {
          if (!responseSent && lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
            setTimeout(ARSLAN_PAIR_CODE, 5000); // Pehle wala retry logic
          }
        }
      });

      if (!sock.authState.creds.registered) {
        const code = (await sock.requestPairingCode(num)).replace(/\s+/g, '');
        if (!responseSent) {
          responseSent = true;
          return res.json({ 
            code: code,
            instructions: "Enter EXACTLY as shown (no spaces)"
          });
        }
      }

    } catch (error) {
      console.error("Pairing Error:", error);
      if (!responseSent) {
        res.status(500).json({ 
          error: "WhatsApp rejected pairing",
          solution: "Try again after 1 hour"
        });
      }
      await removeFile(`${SESSION_DIR}/${id}`);
    }
  }

  return ARSLAN_PAIR_CODE();
});

module.exports = router;
