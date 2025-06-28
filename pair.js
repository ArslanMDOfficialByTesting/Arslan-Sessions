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
  makeCacheableSignalKeyStore 
} = require('@whiskeysockets/baileys');

// ✅ Shared Session Directory
const SESSION_DIR = './session'; 

async function removeFile(path) {
  if (fs.existsSync(path)) {
    fs.rmSync(path, { recursive: true, force: true });
  }
}

router.get('/', async (req, res) => {
  const id = makeid();
  let num = req.query.number?.replace(/[^0-9]/g, '');

  try {
    const { state, saveCreds } = await useMultiFileAuthState(`${SESSION_DIR}/${id}`);

    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
      },
      printQRInTerminal: false,
      browser: Browsers.macOS("Safari"),
      logger: pino({ level: "silent" })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        // ✅ Send session via WhatsApp
        const credsPath = `${SESSION_DIR}/${id}/creds.json`;
        const sessionCode = `ARSLANMD~${fs.readFileSync(credsPath, 'utf8')}`;
        
        await sock.sendMessage(sock.user.id, { 
          text: `*SESSION CODE:*\n${sessionCode}\n\nKeep this safe!` 
        });

        // 🚨 Cleanup
        await sock.ws.close();
        await removeFile(`${SESSION_DIR}/${id}`);
        process.exit(0);
      }
      
      if (connection === "close") {
        if (lastDisconnect?.error?.output?.statusCode !== 401) {
          setTimeout(() => GIFTED_MD_PAIR_CODE(), 5000);
        }
      }
    });

    if (!sock.authState.creds.registered && num) {
      const code = await sock.requestPairingCode(num);
      res.json({ code });
    }

  } catch (error) {
    console.error("Pairing Error:", error);
    res.status(500).json({ error: "Service unavailable" });
    await removeFile(`${SESSION_DIR}/${id}`);
  }
});

module.exports = router;
