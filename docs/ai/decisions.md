# Decision Log

- 2026-02-11: Added an Electron-based audio transcription app in `audio-transcriber-electron/` that uses OpenAI diarized transcription, chunking, and a Markdown cleanup pass.  
  Rationale: Desktop workflow needed local playback, reference clips, and editing before saving.

- 2026-02-11: Implemented ffmpeg-based clip creation and chunking with 5-minute chunks.  
  Rationale: Long single requests timed out; chunking avoids request timeouts and supports in-app reference clips.

- 2026-02-11: Store API key in `audio-transcriber-electron/openai_api_key.txt` and keep it in memory only.  
  Rationale: Avoid embedding keys in the UI while keeping local-only usage.

- 2026-02-11: Preserve diarized speaker labels when formatting transcripts; only fall back to generic labels if missing or numeric.  
  Rationale: Reference clips should map to user-provided names and be retained in output.

- 2026-02-11: Pass known speaker references as top-level transcription parameters and log sample speaker labels for debugging.  
  Rationale: Ensure the diarization API sees reference clips and confirm mapping in raw output.

- 2026-02-11 18:25: Speaker references now passed as top-level transcription params; formatting preserves named labels.  
  Rationale: Ensure diarization uses provided names and retains them in output.
