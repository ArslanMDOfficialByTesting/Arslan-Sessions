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

const SESSION_DIR = './session'; // Shared session folder

// File cleanup utility
async function removeFile(path) {
  if (fs.existsSync(path)) {
    fs.rmSync(path, { recursive: true, force: true });
  }
}

// Main pairing function
async function handlePairing(req, res) {
  const id = makeid();
  let num = req.query.number?.replace(/[^0-9]/g, '');

  if (!num) {
    return res.status(400).json({ error: "Number is required" });
  }

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
        console.log("Pairing successful!");
        
        // Get session data
        const credsPath = `${SESSION_DIR}/${id}/creds.json`;
        const sessionData = fs.readFileSync(credsPath, 'utf8');
        const sessionCode = `ARSLANMD~${Buffer.from(sessionData).toString('base64')}`;

        // Send to user
        await sock.sendMessage(sock.user.id, { 
          text: `*YOUR SESSION CODE:*\n${sessionCode}\n\nKeep this safe!` 
        });

        // Cleanup
        await sock.ws.close();
        await removeFile(`${SESSION_DIR}/${id}`);
        process.exit(0);
      }

      if (connection === "close") {
        if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
          setTimeout(() => handlePairing(req, res), 5000);
        }
      }
    });

    if (!sock.authState.creds.registered) {
      const code = await sock.requestPairingCode(num);
      return res.json({ code });
    }

  } catch (error) {
    console.error("Pairing Error:", error);
    await removeFile(`${SESSION_DIR}/${id}`);
    return res.status(500).json({ error: "Pairing failed" });
  }
}

router.get('/', handlePairing);
module.exports = router;
