import express from "express";
import multer from "multer";
import OpenAI, { toFile } from "openai";
import {
  insertTranscription,
  updateTranscription,
  listTranscriptions,
  getTranscription,
  deleteTranscription,
  clearTranscriptions,
  type TranscriptionRecord
} from "./db.js";

const app = express();
const port = 5174;

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/webm",
  "audio/ogg",
  "video/mp4"
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error("Unsupported audio format."));
  }
});

app.use(express.json({ limit: "1mb" }));

app.get("/api/activity", (_req, res) => {
  const rows = listTranscriptions.all();
  res.json({ items: rows });
});

app.get("/api/activity/:id", (req, res) => {
  const row = getTranscription.get(Number(req.params.id)) as TranscriptionRecord | undefined;
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ item: row });
});

app.delete("/api/activity/:id", (req, res) => {
  deleteTranscription.run(Number(req.params.id));
  res.json({ ok: true });
});

app.delete("/api/activity", (_req, res) => {
  clearTranscriptions.run();
  res.json({ ok: true });
});

app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  const apiKey = String(req.body.apiKey || "").trim();
  if (!apiKey) {
    res.status(400).json({ error: "API key is required." });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: "Audio file is required." });
    return;
  }

  const createdAt = new Date().toISOString();
  const model = "gpt-4o-mini-transcribe";
  const insert = insertTranscription.run({
    created_at: createdAt,
    filename: req.file.originalname,
    duration: null,
    status: "processing",
    model,
    transcript: null,
    markdown: null,
    html: null,
    error: null
  });
  const id = Number(insert.lastInsertRowid);

  const abortController = new AbortController();
  const { signal } = abortController;
  req.on("close", () => {
    abortController.abort();
  });

  try {
    const client = new OpenAI({ apiKey });
    const audioFile = await toFile(req.file.buffer, req.file.originalname, {
      type: req.file.mimetype
    });

    const transcription = await client.audio.transcriptions.create(
      {
        file: audioFile,
        model
      },
      { signal }
    );

    const rawText = transcription.text || "";
    const cleaned = await labelSpeakers(client, rawText, signal);

    const duration = typeof transcription.duration === "number" ? transcription.duration : null;
    const markdown = buildMarkdown({
      filename: req.file.originalname,
      createdAt,
      model,
      body: cleaned
    });
    const html = buildHtml(cleaned);

    updateTranscription.run({
      id,
      status: "completed",
      duration,
      transcript: cleaned,
      markdown,
      html,
      error: null
    });

    res.json({
      id,
      createdAt,
      filename: req.file.originalname,
      duration,
      status: "completed",
      model,
      transcript: cleaned,
      markdown,
      html
    });
  } catch (error) {
    if (signal.aborted) {
      updateTranscription.run({
        id,
        status: "cancelled",
        duration: null,
        transcript: null,
        markdown: null,
        html: null,
        error: "Request cancelled"
      });
      res.status(499).json({ error: "Request cancelled" });
      return;
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    updateTranscription.run({
      id,
      status: "failed",
      duration: null,
      transcript: null,
      markdown: null,
      html: null,
      error: message
    });
    res.status(500).json({ error: message });
  }
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ error: "File is too large. Maximum size is 25MB." });
      return;
    }
    res.status(400).json({ error: err.message });
    return;
  }

  if (err instanceof Error) {
    res.status(400).json({ error: err.message });
    return;
  }

  res.status(500).json({ error: "Unexpected server error." });
});

function buildMarkdown({
  filename,
  createdAt,
  model,
  body
}: {
  filename: string;
  createdAt: string;
  model: string;
  body: string;
}) {
  const header = [
    "---",
    `filename: ${filename}`,
    `transcription_date: ${createdAt}`,
    `model: ${model}`,
    "---",
    ""
  ].join("\n");
  return `${header}${body.trim()}\n`;
}

function buildHtml(body: string) {
  const lines = body
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const content = lines
    .map((line) => {
      const match = line.match(/^(Speaker\s+\d+):(.*)$/i);
      if (match) {
        const label = escapeHtml(match[1]);
        const rest = escapeHtml(match[2].trim());
        return `<p><strong>${label}:</strong> ${rest}</p>`;
      }
      return `<p>${escapeHtml(line)}</p>`;
    })
    .join("\n");

  return `<div class=\"transcript\">${content}</div>`;
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function labelSpeakers(client: OpenAI, text: string, signal: AbortSignal) {
  if (!text.trim()) {
    return "";
  }

  const prompt = `Rewrite the transcript into speaker-labeled lines (Speaker 1:, Speaker 2:, etc.).\n\nRequirements:\n- Preserve meaning and keep it cleaned-up, verbatim-style.\n- Remove filler words (um, uh, false starts) when it improves readability.\n- Normalize punctuation and capitalization.\n- Do not summarize or add new content.\n- Each speaker statement on its own line.\n- No timestamps.\n\nTranscript:\n${text}`;

  const completion = await client.chat.completions.create(
    {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a transcription formatter. Only output the rewritten transcript."
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.2
    },
    { signal }
  );

  return completion.choices[0]?.message?.content?.trim() || text.trim();
}

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
