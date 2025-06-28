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
  makeCacheableSignalKeyStore,
  DisconnectReason
} = require('@whiskeysockets/baileys');

const SESSION_DIR = './session';

async function removeFile(path) {
  if (fs.existsSync(path)) {
    fs.rmSync(path, { recursive: true, force: true });
  }
}

router.get('/', async (req, res) => {
  const id = makeid();
  let num = req.query.number?.replace(/[^0-9]/g, '');

  if (!num || num.length < 10) {
    return res.status(400).json({ error: "Invalid number format (923001234567)" });
  }

  try {
    const { state, saveCreds } = await useMultiFileAuthState(`${SESSION_DIR}/${id}`);
    let responseSent = false;

    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
      },
      printQRInTerminal: false,
      browser: Browsers.windows("Chrome", "122.0.0.0"), // Latest Chrome
      logger: pino({ level: "silent" }),
      syncFullHistory: false,
      connectTimeoutMs: 30000 // 30 seconds timeout
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        if (responseSent) return;
        
        const credsPath = `${SESSION_DIR}/${id}/creds.json`;
        const sessionData = fs.readFileSync(credsPath);
        const sessionCode = `ARSLANMD~${sessionData.toString('base64')}`;

        if (!responseSent) {
          responseSent = true;
          res.json({ 
            status: "success",
            session: sessionCode,
            message: "Save this session ID in config.cjs"
          });
        }

        await sock.ws.close();
        await removeFile(`${SESSION_DIR}/${id}`);
        process.exit(0);
      }

      if (connection === "close") {
        if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
          setTimeout(() => {
            if (!responseSent) res.json({ error: "Reconnecting..." });
          }, 5000);
        }
      }
    });

    if (!sock.authState.creds.registered) {
      try {
        const code = (await sock.requestPairingCode(num)).replace(/\s+/g, '');
        if (!responseSent) {
          responseSent = true;
          return res.json({ 
            code: code,
            format: "Enter EXACTLY as shown (no spaces)"
          });
        }
      } catch (e) {
        if (!responseSent) {
          return res.status(500).json({ 
            error: "WhatsApp rejected the code",
            solution: "1. Use different number\n2. Wait 1 hour\n3. Update Baileys"
          });
        }
      }
    }

  } catch (error) {
    console.error("Fatal Error:", error);
    if (!responseSent) {
      return res.status(500).json({ 
        error: "Server error",
        details: error.message 
      });
    }
  }
});

module.exports = router;
