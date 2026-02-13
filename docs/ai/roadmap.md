# Roadmap (Near Term)

- Harden Post-Processing tab UX:
  - show clearer loading/error states for chat responses and prompt preset loading.
  - optionally stream assistant responses for long outputs.
- Add prompt preset management improvements:
  - document/edit workflow for `audio-transcriber-electron/Prompts.csv`.
  - add validation messages for malformed `Title;Prompt` rows.
- Add debug UI toggle to display diarized JSON inside the app for troubleshooting.
- Add chunk size configuration in the UI (advanced settings).
- Add basic error recovery guidance in the UI when ffmpeg or API calls fail.
