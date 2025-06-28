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

  try {
    const { state, saveCreds } = await useMultiFileAuthState(`${SESSION_DIR}/${id}`);
    let responseSent = false;

    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
      },
      printQRInTerminal: false,
      browser: ["Chrome (Linux)", "", ""], // WhatsApp Web compatible
      logger: pino({ level: "silent" }),
      connectTimeoutMs: 60000
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
          res.json({ error: "Connection closed. Retry after 2 minutes." });
        }
      }
    });

    if (!sock.authState.creds.registered) {
      const code = await sock.requestPairingCode(num);
      if (!responseSent) return res.json({ code: code.replace(/\s/g, '') });
    }

  } catch (error) {
    if (!responseSent) {
      res.status(500).json({ 
        error: "WhatsApp rejected pairing",
        solution: [
          "1. Use FRESH WhatsApp number",
          "2. Wait 1 hour if multiple attempts",
          "3. Try on different network"
        ]
      });
    }
    removeFile(`${SESSION_DIR}/${id}`);
  }
});

module.exports = router;
