# Local Audio Transcriber

A local-only web app that lets you upload or drag-and-drop an audio file, transcribe it with the OpenAI Audio Transcriptions API, and view/download the results as HTML and Markdown. Transcription history is stored locally in a SQLite database on your machine.

## Features

- Drag-and-drop upload with file type + size validation
- Audio preview with player controls
- Upload/transcribe/format progress stages + cancel
- Speaker-labeled transcript (LLM post-processing)
- Copy to clipboard + download Markdown
- Local activity log with delete + clear all

## Tech Stack

- Frontend: Vite + React + TypeScript
- Backend: Express + TypeScript
- Storage: SQLite (local `data/transcriptions.db`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the app (frontend + backend):
   ```bash
   npm run dev
   ```

3. Open the app in Chrome:
   ```
   http://localhost:5173
   ```

## Usage

1. Paste your OpenAI API key into the UI. The key is stored in `localStorage` so it stays on your machine.
2. Drag-and-drop or pick an audio file (≤ 25MB).
3. Click **Transcribe**. You can cancel if needed.
4. Copy the transcript or download the `.md` file.
5. Use the Activity panel to revisit past transcripts.

## Notes

- The API key is sent only to the local backend (`localhost`) and is never logged or stored on disk.
- Transcriptions are stored in `data/transcriptions.db` (SQLite).
- Supported audio MIME types include MP3, WAV, M4A, WebM, OGG, and MP4 audio.

## Scripts

- `npm run dev` – start frontend + backend in watch mode
- `npm run build` – build frontend and backend
- `npm run preview` – preview production frontend build
