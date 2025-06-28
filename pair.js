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
  if (fs.existsSync(path)) fs.rmSync(path, { recursive: true });
}

router.get('/', async (req, res) => {
  const id = makeid();
  let num = req.query.number?.replace(/[^0-9]/g, '');

  if (!num) return res.status(400).json({ error: "Number required (923001234567)" });

  let responseSent = false; // 🔥 Single response control

  try {
    const { state, saveCreds } = await useMultiFileAuthState(`${SESSION_DIR}/${id}`);

    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
      },
      printQRInTerminal: false,
      browser: ["Ubuntu", "Chrome", "122.0.0.0"],
      logger: pino({ level: "silent" }),
      connectTimeoutMs: 30000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        if (responseSent) return;
        responseSent = true;

        const credsPath = `${SESSION_DIR}/${id}/creds.json`;
        const sessionCode = `ARSLANMD~${fs.readFileSync(credsPath, 'base64')}`;

        res.json({ 
          status: "success",
          session: sessionCode 
        });

        sock.ws.close();
        removeFile(`${SESSION_DIR}/${id}`);
        process.exit(0);
      }

      if (connection === "close") {
        if (!responseSent && lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
          responseSent = true;
          res.status(408).json({ error: "Connection timeout. Retry after 2 minutes." });
        }
      }
    });

    if (!sock.authState.creds.registered) {
      const code = await sock.requestPairingCode(num);
      if (!responseSent) {
        responseSent = true;
        return res.json({ code: code.replace(/\s/g, '') });
      }
    }

  } catch (error) {
    if (!responseSent) {
      responseSent = true;
      res.status(500).json({ 
        error: "WhatsApp rejected pairing",
        solution: "1. Use fresh number\n2. Wait 1 hour\n3. Try different network"
      });
    }
    removeFile(`${SESSION_DIR}/${id}`);
  }
});

module.exports = router;
