const { makeid } = require('./gen-id');
const express = require('express');
const fs = require('fs');
const path = require('path');
const pino = require("pino");
const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  delay, 
  Browsers, 
  makeCacheableSignalKeyStore 
} = require('@whiskeysockets/baileys');

const router = express.Router();
const PAIR_MAP = {}; // keep track of active pairings

router.get("/init", async (req, res) => {
  console.log("[INIT] Called with number:", req.query.number);

  const id = makeid(8);
  const number = req.query.number?.replace(/[^0-9]/g, "");
  const sessionPath = path.join(__dirname, "temp", id);

  if (!number) return res.status(400).json({ error: "Number is required" });

  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
      },
      browser: Browsers.macOS("Safari"),
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
    });

    sock.ev.on("creds.update", saveCreds);

    if (!sock.authState.creds.registered) {
      const code = await sock.requestPairingCode(number);
      PAIR_MAP[id] = { sock, sessionPath, status: "pending", session_id: null };
      return res.json({ id, code });
    } else {
      return res.status(400).json({ error: "Number already registered." });
    }
  } catch (err) {
    console.error("[INIT ERROR]", err);
    res.status(500).json({
      error: err.message,
      stack: err.stack?.split("\n").slice(0, 5),
    });
  }
});

module.exports = router;
