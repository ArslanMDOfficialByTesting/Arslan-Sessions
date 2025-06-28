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

const { upload } = require('./mega');

function removeFile(path) {
  if (fs.existsSync(path)) fs.rmSync(path, { recursive: true, force: true });
}

router.get('/', async (req, res) => {
  const id = makeid();
  let num = req.query.number?.replace(/[^0-9]/g, '');

  if (!num) return res.status(400).json({ error: "Invalid WhatsApp number" });

  async function ARSLAN_PAIR_CODE() {
    const { state, saveCreds } = await useMultiFileAuthState(`./temp/${id}`);
    let responseSent = false;

    try {
      const sock = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }))
        },
        printQRInTerminal: false,
        browser: Browsers.macOS("Safari"),
        logger: pino({ level: "silent" }),
        syncFullHistory: false
      });

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === "open") {
          if (responseSent) return;
          responseSent = true;

          const credsPath = `./temp/${id}/creds.json`;
          const mega_url = await upload(fs.createReadStream(credsPath), `${sock.user.id}.json`);
          const sessionCode = `ARSL~${mega_url.replace('https://mega.nz/file/', '')}`;

          await sock.sendMessage(sock.user.id, { 
            text: `*ARSLAN-AI SESSION*\n\n${sessionCode}\n\nKeep this safe!`
          });

          await sock.ws.close();
          removeFile(`./temp/${id}`);
          process.exit(0);
        }

        if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
          if (!responseSent) {
            setTimeout(ARSLAN_PAIR_CODE, 5000);
          }
        }
      });

      if (!sock.authState.creds.registered) {
        const code = await sock.requestPairingCode(num);
        if (!responseSent) {
          return res.json({ 
            code: code.replace(/\s/g, ''),
            format: "Enter without spaces" 
          });
        }
      }
    } catch (error) {
      if (!responseSent) {
        res.status(500).json({ error: "Pairing failed" });
      }
      removeFile(`./temp/${id}`);
    }
  }

  return ARSLAN_PAIR_CODE();
});

module.exports = router;
