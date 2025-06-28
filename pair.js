const express = require('express');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { makeid } = require('./gen-id');
const pino = require('pino');
const {
  makeWASocket,
  useMultiFileAuthState,
  delay,
  Browsers,
  makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');

const SESSION_DIR = path.join(__dirname, './session');
const STATUS_MAP = {}; // For tracking status in-memory
const router = express.Router();

// 🧹 Utility: Remove temp folder
async function removeFolder(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

// 📦 Utility: Zip session directory into base64 string
async function zipSession(dirPath) {
  const archive = archiver('zip');
  const outputPath = path.join(__dirname, 'temp.zip');
  const output = fs.createWriteStream(outputPath);

  return new Promise((resolve, reject) => {
    archive.directory(dirPath, false);
    archive.pipe(output);
    archive.finalize();

    output.on('close', () => {
      const data = fs.readFileSync(outputPath);
      fs.unlinkSync(outputPath);
      resolve(data.toString('base64'));
    });

    archive.on('error', (err) => reject(err));
  });
}

// 🚀 Route: Start pairing
router.get('/pair/init', async (req, res) => {
  const number = req.query.number?.replace(/[^0-9]/g, '');
  if (!number) return res.status(400).json({ error: 'Missing number' });

  const id = makeid();
  const sessionPath = path.join(SESSION_DIR, id);
  STATUS_MAP[id] = { status: 'pending', session_id: null };

  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }))
      },
      printQRInTerminal: false,
      browser: Browsers.macOS('Safari'),
      logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection }) => {
      if (connection === 'open') {
        const zipBase64 = await zipSession(sessionPath);
        const session_id = `ARSLANMD~${zipBase64}`;
        STATUS_MAP[id] = { status: 'paired', session_id };
        await sock.ws.close();
        await removeFolder(sessionPath);
      }

      if (connection === 'close') {
        if (STATUS_MAP[id]?.status !== 'paired') {
          STATUS_MAP[id].status = 'failed';
        }
      }
    });

    if (!sock.authState.creds.registered) {
      const code = await sock.requestPairingCode(number);
      STATUS_MAP[id].code = code;
      return res.json({ id, code });
    } else {
      return res.status(400).json({ error: 'Number already registered' });
    }
  } catch (err) {
    console.error('Pairing error:', err);
    STATUS_MAP[id].status = 'failed';
    await removeFolder(sessionPath);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// 📥 Route: Poll pairing status
router.get('/pair/status/:id', (req, res) => {
  const { id } = req.params;
  const data = STATUS_MAP[id];
  if (!data) return res.status(404).json({ error: 'Invalid ID' });
  return res.json(data);
});

module.exports = router;
