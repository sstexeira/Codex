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

- 2026-02-11 18:35: App UI title changed to "Process Audio".  
  Rationale: Align product naming in window title and UI header.

- 2026-02-13: Replaced "Create File" with "Save and Continue" and added an in-app "Post-Processing" chat tab.  
  Rationale: Keep users in one workflow: save transcript, then immediately query the saved `.md` with AI.

- 2026-02-13: Post-processing requests send prompt + saved markdown file content + recent chat history to `gpt-4o-mini`.  
  Rationale: Ensure model responses stay grounded in the persisted transcript while supporting follow-up questions.

- 2026-02-13: Prompt preset dropdown is loaded from `audio-transcriber-electron/Prompts.csv` using `Title;Prompt` rows.  
  Rationale: Allow non-code prompt management and consistent preset behavior in Post-Processing UI.

- 2026-02-13: Changing prompt preset clears the prompt input before applying selected prompt text.  
  Rationale: Prevent accidental mixed prompts when switching presets.

- 2026-02-13: Prompt preset file parsing uses a simple first-semicolon split per line (`Title;Prompt`) with no quoted-field support.  
  Rationale: Keep preset editing lightweight and implementation minimal for current workflow needs.

- 2026-02-14: Increased ffmpeg chunk duration from 5 minutes to 10 minutes (`CHUNK_SECONDS=600`).  
  Rationale: Reduce number of chunk boundaries and transcription requests for long recordings while preserving timeout protection.

- 2026-02-14: Replaced user-facing "Chunk" labels with "Section" in UI statuses and transcript section headers.  
  Rationale: Use clearer, consistent language in the UI and post-transcription formatted output.

- 2026-02-14: Updated known-speaker clip UI copy to use "Clip here" and revised cue instructions.  
  Rationale: Clarify speaker-clip capture workflow and align button/instruction wording.

- 2026-02-14: AI context documentation is maintained in project `docs/` files only (`AGENTS.md`, `PROJECT_CONTEXT.md`, `decisions.md`, `roadmap.md`).  
  Rationale: Keep context state in a single location and avoid split project memory.
