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

  if (!num) {
    return res.status(400).json({ error: "Number is required" });
  }

  try {
    const { state, saveCreds } = await useMultiFileAuthState(`${SESSION_DIR}/${id}`);
    let responseSent = false; // 🔥 Critical fix

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
        if (responseSent) return; // 🔥 Prevent duplicate responses
        
        const credsPath = `${SESSION_DIR}/${id}/creds.json`;
        const sessionCode = `ARSLANMD~${fs.readFileSync(credsPath, 'base64')}`;
        
        // Send final response
        if (!responseSent) {
          responseSent = true;
          res.json({ 
            status: "success",
            session: sessionCode 
          });
        }

        await sock.ws.close();
        await removeFile(`${SESSION_DIR}/${id}`);
        process.exit(0);
      }

      if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
        setTimeout(() => {
          if (!responseSent) {
            res.json({ error: "Connection failed, retrying..." });
          }
        }, 5000);
      }
    });

    if (!sock.authState.creds.registered) {
      const code = await sock.requestPairingCode(num);
      if (!responseSent) {
        responseSent = true;
        return res.json({ code });
      }
    }

  } catch (error) {
    console.error("Error:", error);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Pairing failed" });
    }
  }
});

module.exports = router;
