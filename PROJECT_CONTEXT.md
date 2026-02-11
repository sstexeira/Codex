# PROJECT_CONTEXT

## Goal / Non-goals
- Goal: local-first audio transcription tools using OpenAI Audio Transcriptions with diarization, formatted output, and local file outputs.
- Goal: provide a desktop Electron app that supports audio playback, speaker reference clips, transcription, and editable Markdown output.
- Non-goal: cloud multi-user service or hosted backend.
- Non-goal: automatic speaker identification without user-provided reference clips.

## Current Architecture (major components + data flow)
- **Electron app** (`audio-transcriber-electron/`)
  - Main process (`main.cjs`) handles:
    - Reading API key from `openai_api_key.txt`
    - Creating audio clips with `ffmpeg`
    - Chunking long audio with `ffmpeg` + `ffprobe`
    - Calling OpenAI transcription (`gpt-4o-transcribe-diarize`)
    - Formatting transcript with a text model (`gpt-4o-mini`)
    - Writing raw text + diarized JSON + final Markdown to disk
  - Renderer (`index.html`) handles:
    - File selection + drag/drop
    - Audio playback and clip creation
    - Speaker reference slots (name + clip)
    - Live preview of formatted Markdown + editing + find/replace
    - "Create File" action to save Markdown
  - Preload bridge (`preload.cjs`) exposes IPC for transcribe, clip creation, saving, rendering.
  - Data flow:
    1. User selects audio file and optional speaker clips.
    2. App chunks audio if needed.
    3. Each chunk is transcribed with diarization.
    4. Chunk outputs are formatted into Markdown with chunk separators.
    5. Raw text + diarized JSON are saved; user edits Markdown and saves `.md`.

- **Web app** (root `src/` + `server/`)
  - Vite + React frontend; Express backend.
  - Stores transcriptions in local SQLite.
  - This is separate from the Electron app.

## Key Constraints
- Transcription must use diarized model (`gpt-4o-transcribe-diarize`).
- Audio max size in UI: 25 MB.
- Long audio must be chunked to avoid request timeouts.
- Chunk outputs include clear separators: `---` + `**Chunk N of M**`.
- API key is read from `audio-transcriber-electron/openai_api_key.txt` and kept in memory only.
- Formatting must preserve any speaker labels returned by the diarized API.
- Speaker reference clips are sent as top-level transcription parameters.
- Raw outputs saved locally in `~/Documents/AudioTranscriber/`:
  - `.txt` for raw text (with chunk headers)
  - `.json` for diarized segments
  - `.md` for final edited transcript

## Current Status
- Implemented:
  - Electron app with playback, clip creation, diarized transcription, chunking, formatting, and editable Markdown.
  - Reference clips are generated from the main audio via `ffmpeg`.
  - Raw `.txt` and diarized `.json` outputs saved per transcription.
- Next:
  - Optional: chunk size tuning and UX improvements.
  - Optional: UI surfacing of detected speaker labels for easier validation.

## How to Run / Build / Test Locally
- Electron app:
  - `cd audio-transcriber-electron`
  - `npm install`
  - `npm run electron:dev`
- Requires `ffmpeg` and `ffprobe` on PATH (`brew install ffmpeg`).

- Web app:
  - `npm install`
  - `npm run dev`
  - Open `http://localhost:5173`

## Definitions / Terminology
- **Diarization**: labeling segments by speaker in the transcription output.
- **Speaker reference clips**: short 4-second clips generated from the main audio to map speaker labels.
- **Cleanup pass**: LLM formatting step that removes filler words and normalizes punctuation.
- **Chunking**: splitting audio into fixed-duration segments for transcription.
- **Raw transcript**: plain text output saved as `.txt` (no speaker labels).
- **Diarized JSON**: raw segment output saved as `.json` with speaker labels and timings.

## Assumptions
- Both the web app and Electron app are intended to coexist in this repo.
- The Electron app is the primary active focus.
- Users run on macOS and can install `ffmpeg`.
