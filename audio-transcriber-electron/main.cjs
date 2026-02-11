const { app, BrowserWindow, ipcMain, shell } = require("electron");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const MarkdownIt = require("markdown-it");

const MAX_BYTES = 25 * 1024 * 1024;
const API_KEY_PATH = path.join(__dirname, "openai_api_key.txt");
const CLIP_DIR = path.join(app.getPath("temp"), "AudioTranscriberClips");
const CHUNK_DIR = path.join(app.getPath("temp"), "AudioTranscriberChunks");
const CHUNK_SECONDS = 300;
const createdClipPaths = new Set();
const createdChunkDirs = new Set();

let mainWindow = null;

const createWindow = () => {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    resizable: true,
    title: "Audio Transcriber",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, "index.html"));
  mainWindow = win;
};

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", async () => {
  const deletions = Array.from(createdClipPaths).map((clipPath) =>
    fsp.unlink(clipPath).catch(() => null)
  );
  await Promise.all(deletions);
  const chunkDeletions = Array.from(createdChunkDirs).map((dir) =>
    fsp.rm(dir, { recursive: true, force: true }).catch(() => null)
  );
  await Promise.all(chunkDeletions);
});

const getOutputDir = async () => {
  const dir = path.join(app.getPath("documents"), "AudioTranscriber");
  await fsp.mkdir(dir, { recursive: true });
  return dir;
};

const ensureClipDir = async () => {
  await fsp.mkdir(CLIP_DIR, { recursive: true });
  return CLIP_DIR;
};

const createChunkDir = async () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(CHUNK_DIR, `chunks-${timestamp}`);
  await fsp.mkdir(dir, { recursive: true });
  createdChunkDirs.add(dir);
  return dir;
};

const sanitizeBaseName = (name) =>
  name.replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "");

const toDataUrl = async (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === ".mp3" || ext === ".mpga" || ext === ".mpeg"
      ? "audio/mpeg"
      : ext === ".m4a"
      ? "audio/mp4"
      : ext === ".wav"
      ? "audio/wav"
      : ext === ".webm"
      ? "audio/webm"
      : ext === ".mp4"
      ? "audio/mp4"
      : "audio/mpeg";

  const data = await fsp.readFile(filePath);
  return `data:${mime};base64,${data.toString("base64")}`;
};

const normalizeSegments = (segments) => {
  const map = new Map();
  let count = 0;
  return segments.map((seg) => {
    const key = seg.speaker ?? "unknown";
    if (!map.has(key)) {
      count += 1;
      map.set(key, `Speaker ${count}`);
    }
    return {
      speaker: map.get(key),
      text: seg.text || "",
    };
  });
};

const buildPrompt = (segments, headerLine) => {
  const header = headerLine || "**Transcript**";
  return [
    "You are formatting a diarized transcript.",
    "Rules:",
    "- Keep the speaker meaning verbatim, but remove filler words (um, uh, like, you know),",
    "  false starts, repeated words, and long pauses.",
    "- Do not summarize or add new content.",
    "- Keep speaker labels as 'Speaker 1', 'Speaker 2', etc.",
    "- Produce clean Markdown with:",
    `  - Start output with:\n${header}\n`,
    "  - Each speaker on a new line like a script: 'Speaker 1: ...'",
    "  - Good punctuation and capitalization.",
    "  - Use bullets only if a speaker clearly lists items.",
    "",
    "Input diarized segments (JSON array):",
    JSON.stringify(segments, null, 2),
  ].join("\n");
};

const runFfmpeg = (args) =>
  new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: "ignore" });
    proc.on("error", (err) => {
      reject(err);
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed with code ${code}`));
    });
  });

const runFfprobe = (args) =>
  new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    proc.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code === 0) resolve(output.trim());
      else reject(new Error(`ffprobe failed with code ${code}`));
    });
  });

const getAudioDurationSeconds = async (filePath) => {
  const out = await runFfprobe([
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=nk=1:nw=1",
    filePath,
  ]);
  const seconds = Number.parseFloat(out);
  return Number.isFinite(seconds) ? seconds : null;
};

const createChunks = async (filePath) => {
  const dir = await createChunkDir();
  const outPattern = path.join(dir, "chunk-%03d.wav");
  const args = [
    "-i",
    filePath,
    "-f",
    "segment",
    "-segment_time",
    `${CHUNK_SECONDS}`,
    "-reset_timestamps",
    "1",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    outPattern,
  ];
  await runFfmpeg(args);
  const files = (await fsp.readdir(dir))
    .filter((name) => name.endsWith(".wav"))
    .sort()
    .map((name) => path.join(dir, name));
  return { dir, files };
};

const readApiKey = async () => {
  const key = (await fsp.readFile(API_KEY_PATH, "utf8")).trim();
  if (!key) {
    throw new Error(
      "API key file is empty. Add your key to openai_api_key.txt."
    );
  }
  return key;
};

const sendStatus = (message) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("status-update", message);
  }
};

const logStep = (label, startMs) => {
  const elapsedMs = Date.now() - startMs;
  console.log(`[transcribe] ${label} (${(elapsedMs / 1000).toFixed(1)}s)`);
};

const transcribeChunk = async (
  client,
  filePath,
  knownNames,
  knownRefs,
  chunkIndex,
  chunkTotal
) => {
  const label = chunkTotal
    ? `chunk ${chunkIndex} of ${chunkTotal}`
    : "single chunk";
  sendStatus(`Transcribing ${label}...`);
  const start = Date.now();
  const transcription = await client.audio.transcriptions.create(
    {
      file: fs.createReadStream(filePath),
      model: "gpt-4o-transcribe-diarize",
      response_format: "diarized_json",
      chunking_strategy: "auto",
      ...(knownNames.length
        ? {
            extra_body: {
              known_speaker_names: knownNames,
              known_speaker_references: knownRefs,
            },
          }
        : {}),
    },
    { timeout: 15 * 60 * 1000 }
  );
  logStep(`transcription completed (${label})`, start);
  const rawSegments =
    transcription.segments ||
    transcription.diarized_segments ||
    transcription.data?.segments ||
    [];
  if (!rawSegments.length) {
    throw new Error("No transcript segments were returned by the API.");
  }
  const segments = normalizeSegments(rawSegments);
  const rawText =
    transcription.text ||
    transcription.data?.text ||
    rawSegments.map((seg) => seg.text).join(" ").trim();
  return { segments, rawText, rawSegments };
};

const formatChunk = async (client, segments, headerLine, chunkIndex, chunkTotal) => {
  const label = chunkTotal
    ? `chunk ${chunkIndex} of ${chunkTotal}`
    : "single chunk";
  sendStatus(`Formatting ${label}...`);
  const start = Date.now();
  const formatting = await client.chat.completions.create(
    {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You format transcripts into clean Markdown without changing meaning.",
        },
        { role: "user", content: buildPrompt(segments, headerLine) },
      ],
    },
    { timeout: 15 * 60 * 1000 }
  );
  logStep(`formatting completed (${label})`, start);
  const markdown = formatting.choices?.[0]?.message?.content?.trim();
  if (!markdown) {
    throw new Error("Formatting failed to produce output.");
  }
  return markdown;
};

ipcMain.handle("transcribe", async (_event, { filePath, speakerRefs }) => {
  const startedAt = Date.now();
  console.log(`[transcribe] request started at ${new Date().toISOString()}`);
  try {
    if (!filePath) {
      return { ok: false, error: "Please select an audio file." };
    }

    const stat = await fsp.stat(filePath);
    if (stat.size > MAX_BYTES) {
      return {
        ok: false,
        error: "File too large. Maximum size is 25 MB.",
      };
    }

    const { default: OpenAI } = await import("openai");
    const key = await readApiKey();
    const client = new OpenAI({
      apiKey: key,
      timeout: 15 * 60 * 1000,
      maxRetries: 0,
    });
    console.log(`[transcribe] client timeout ms = ${client.timeout}`);

    const knownNames = [];
    const knownRefs = [];
    const refs = Array.isArray(speakerRefs) ? speakerRefs : [];
    for (const ref of refs) {
      if (!ref?.name || !ref?.path) continue;
      knownNames.push(ref.name.trim());
      knownRefs.push(await toDataUrl(ref.path));
      if (knownNames.length >= 4) break;
    }

    sendStatus("Checking audio duration...");
    const durationSeconds = await getAudioDurationSeconds(filePath);
    const shouldChunk =
      Number.isFinite(durationSeconds) && durationSeconds > CHUNK_SECONDS;

    let markdown = "";
    let rawText = "";
    let diarizedOutput = null;

    if (shouldChunk) {
      sendStatus("Splitting audio into chunks...");
      const { dir, files } = await createChunks(filePath);
      const total = files.length;
      try {
        const markdownChunks = [];
        const rawChunks = [];
        const diarizedChunks = [];
        for (let i = 0; i < files.length; i += 1) {
          const chunkPath = files[i];
          const { segments, rawText: chunkText, rawSegments } = await transcribeChunk(
            client,
            chunkPath,
            knownNames,
            knownRefs,
            i + 1,
            total
          );
          const headerLine = `---\n**Chunk ${i + 1} of ${total}**\n`;
          const chunkMarkdown = await formatChunk(
            client,
            segments,
            headerLine,
            i + 1,
            total
          );
          markdownChunks.push(chunkMarkdown);
          rawChunks.push(`[Chunk ${i + 1} of ${total}]\n${chunkText}`);
          diarizedChunks.push({
            chunk: i + 1,
            total,
            segments: rawSegments,
          });
        }
        markdown = markdownChunks.join("\n\n");
        rawText = rawChunks.join("\n\n");
        diarizedOutput = { chunks: diarizedChunks };
      } finally {
        await fsp.rm(dir, { recursive: true, force: true }).catch(() => null);
        createdChunkDirs.delete(dir);
      }
    } else {
      const { segments, rawText: chunkText, rawSegments } = await transcribeChunk(
        client,
        filePath,
        knownNames,
        knownRefs,
        null,
        null
      );
      rawText = chunkText;
      markdown = await formatChunk(client, segments, "**Transcript**", null, null);
      diarizedOutput = { segments: rawSegments };
    }

    const md = new MarkdownIt({ html: false, linkify: false });
    const html = md.render(markdown);

    sendStatus("Saving raw transcript...");
    const saveStart = Date.now();
    const outputDir = await getOutputDir();
    const base = sanitizeBaseName(path.basename(filePath, path.extname(filePath)));
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rawPath = path.join(outputDir, `${base}-${timestamp}.txt`);
    const diarizedPath = path.join(outputDir, `${base}-${timestamp}.json`);
    await fsp.writeFile(rawPath, rawText, "utf8");
    if (diarizedOutput) {
      await fsp.writeFile(
        diarizedPath,
        JSON.stringify(diarizedOutput, null, 2),
        "utf8"
      );
    }
    logStep("raw transcript saved", saveStart);

    logStep("request completed", startedAt);
    sendStatus("Done.");
    return {
      ok: true,
      html,
      markdown,
      rawTextPath: rawPath,
      originalPathBase: `${base}-${timestamp}`,
    };
  } catch (err) {
    console.error("[transcribe] error", {
      name: err?.name,
      message: err?.message,
      code: err?.code,
      type: err?.type,
      status: err?.status,
      stack: err?.stack,
    });
    console.error(`[transcribe] total elapsed ${(Date.now() - startedAt) / 1000}s`);
    sendStatus("");
    return {
      ok: false,
      error: err?.message || "Unexpected error.",
    };
  }
});

ipcMain.handle(
  "create-clip",
  async (_event, { filePath, startSeconds, durationSeconds, slotIndex }) => {
    try {
      if (!filePath) {
        return { ok: false, error: "No audio file selected." };
      }

      const start = Number(startSeconds);
      const dur = Number(durationSeconds);
      if (!Number.isFinite(start) || !Number.isFinite(dur) || dur <= 0) {
        return { ok: false, error: "Invalid clip time." };
      }

      await ensureClipDir();
      const base = sanitizeBaseName(
        path.basename(filePath, path.extname(filePath))
      );
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const outPath = path.join(
        CLIP_DIR,
        `${base}-${timestamp}-slot${slotIndex}.wav`
      );

      const args = [
        "-ss",
        `${start}`,
        "-t",
        `${dur}`,
        "-i",
        filePath,
        "-ac",
        "1",
        "-ar",
        "16000",
        "-y",
        outPath,
      ];

      await runFfmpeg(args);
      createdClipPaths.add(outPath);
      return { ok: true, clipPath: outPath, durationSeconds: dur };
    } catch (err) {
      if (err?.code === "ENOENT") {
        return {
          ok: false,
          error: "ffmpeg not found. Install with: brew install ffmpeg",
        };
      }
      return { ok: false, error: err?.message || "Failed to create clip." };
    }
  }
);

ipcMain.handle("clear-clip", async (_event, { clipPath }) => {
  try {
    if (clipPath) {
      await fsp.unlink(clipPath).catch(() => null);
      createdClipPaths.delete(clipPath);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || "Failed to clear clip." };
  }
});

ipcMain.handle("save-markdown", async (_event, { markdown, originalPathBase }) => {
  try {
    if (!markdown || !markdown.trim()) {
      return { ok: false, error: "Nothing to save." };
    }
    const outputDir = await getOutputDir();
    const base = sanitizeBaseName(originalPathBase || "transcript");
    const outPath = path.join(outputDir, `${base}.md`);
    await fsp.writeFile(outPath, markdown, "utf8");
    return { ok: true, markdownPath: outPath };
  } catch (err) {
    return { ok: false, error: err?.message || "Failed to save file." };
  }
});

ipcMain.handle("render-markdown", async (_event, { markdown }) => {
  try {
    const md = new MarkdownIt({ html: false, linkify: false });
    return { ok: true, html: md.render(markdown || "") };
  } catch (err) {
    return { ok: false, error: err?.message || "Failed to render markdown." };
  }
});

ipcMain.handle("open-output-folder", async (_event, { markdownPath }) => {
  if (!markdownPath) return { ok: false };
  shell.showItemInFolder(markdownPath);
  return { ok: true };
});
