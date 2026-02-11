# Decision Log

- 2026-02-11: Added an Electron-based audio transcription app in `audio-transcriber-electron/` that uses OpenAI diarized transcription, chunking, and a Markdown cleanup pass.  
  Rationale: Desktop workflow needed local playback, reference clips, and editing before saving.

- 2026-02-11: Implemented ffmpeg-based clip creation and chunking with 5-minute chunks.  
  Rationale: Long single requests timed out; chunking avoids request timeouts and supports in-app reference clips.

- 2026-02-11: Store API key in `audio-transcriber-electron/openai_api_key.txt` and keep it in memory only.  
  Rationale: Avoid embedding keys in the UI while keeping local-only usage.
