const express = require("express");
const fs = require("fs");
const path = require("path");
const pino = require("pino");
const { makeid } = require("./gen-id");
const { upload } = require("./mega");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  Browsers,
  makeCacheableSignalKeyStore,
  delay,
} = require("@whiskeysockets/baileys");

const router = express.Router();
const SESSION_DIR = path.join(__dirname, "temp");
const PAIR_MAP = {}; // Stores session status by id

function removeDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

router.get("/init", async (req, res) => {
  const id = makeid(8);
  const number = req.query.number?.replace(/[^0-9]/g, "");
  const sessionPath = path.join(SESSION_DIR, id);

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
    removeDir(sessionPath);
    return res.status(500).json({ error: err.message });
  }
});

router.get("/status/:id", async (req, res) => {
  const { id } = req.params;
  const pair = PAIR_MAP[id];

  if (!pair) return res.status(404).json({ error: "Invalid ID" });

  const { sock, sessionPath } = pair;

  if (pair.status === "paired") {
    return res.json({ status: "paired", session_id: pair.session_id });
  }

  sock.ev.on("connection.update", async ({ connection }) => {
    if (connection === "open") {
      try {
        const credsFile = path.join(sessionPath, "creds.json");
        const stream = fs.createReadStream(credsFile);
        const uploadedUrl = await upload(stream, `${sock.user.id}.json`);
        const sessionId = `ARSLANMD~${uploadedUrl.replace("https://mega.nz/file/", "")}`;

        pair.status = "paired";
        pair.session_id = sessionId;

        await sock.sendMessage(sock.user.id, {
          text: `*SESSION ID:*
${sessionId}

Don't share with anyone.`,
        });

        await delay(3000);
        await sock.ws.close();
        removeDir(sessionPath);
      } catch (e) {
        console.error("[SESSION UPLOAD ERROR]", e);
        pair.status = "failed";
      }
    }
  });

  res.json({ status: pair.status });
});

module.exports = router;
