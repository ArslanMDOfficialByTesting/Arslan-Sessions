const express = require('express');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const pino = require("pino");
const {
  makeWASocket,
  useMultiFileAuthState,
  Browsers,
  makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');

const router = express.Router();
const SESSION_DIR = './session';

function makeid(length = 8) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () => characters[Math.floor(Math.random() * characters.length)]).join('');
}

async function removeFile(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

router.get('/', async (req, res) => {
  const id = makeid();
  const number = req.query.number?.replace(/[^0-9]/g, '');

  try {
    const authDir = path.join(SESSION_DIR, id);
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }))
      },
      printQRInTerminal: false,
      browser: Browsers.macOS("Safari"),
      logger: pino({ level: "silent" })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on("connection.update", async ({ connection }) => {
      if (connection === "open") {
        // 🔒 ZIP the session folder
        const zipPath = `${authDir}.zip`;
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip');

        archive.directory(authDir, false);
        archive.pipe(output);
        await archive.finalize();

        output.on('close', async () => {
          const base64 = fs.readFileSync(zipPath).toString('base64');
          const sessionCode = `ARSLANMD~${base64}`;

          await sock.sendMessage(sock.user.id, {
            text: `*SESSION CODE:*\n${sessionCode}\n\n⚠️ Paste this in your .env as SESSION_ID`
          });

          await sock.ws.close();
          await removeFile(authDir);
          fs.unlinkSync(zipPath);
          process.exit(0);
        });
      }
    });

    if (!sock.authState.creds.registered && number) {
      const code = await sock.requestPairingCode(number);
      res.json({ code });
    } else {
      res.json({ message: "Already registered or number missing." });
    }

  } catch (err) {
    console.error("❌ Pairing error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
