import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";

type ActivityItem = {
  id: number;
  created_at: string;
  filename: string;
  duration: number | null;
  status: string;
  model: string;
};

type TranscriptPayload = {
  id: number;
  createdAt: string;
  filename: string;
  duration: number | null;
  status: string;
  model: string;
  transcript: string;
  markdown: string;
  html: string;
};

type ActivityDetail = {
  id: number;
  created_at: string;
  filename: string;
  duration: number | null;
  status: string;
  model: string;
  transcript: string | null;
  markdown: string | null;
  html: string | null;
  error: string | null;
};

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ACCEPTED_TYPES = [
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
];

const apiKeyStorageKey = "openai_api_key";

export default function App() {
  const [apiKey, setApiKey] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState<{ stage: string; percent?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [result, setResult] = useState<TranscriptPayload | null>(null);
  const [activityDetail, setActivityDetail] = useState<ActivityDetail | null>(null);
  const requestRef = useRef<XMLHttpRequest | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(apiKeyStorageKey);
    if (stored) {
      setApiKey(stored);
    }
    fetchActivity();
  }, []);

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setAudioUrl(null);
  }, [file]);

  const isBusy = Boolean(progress);

  const selectedOutput = useMemo(() => {
    if (result) {
      return {
        html: result.html,
        markdown: result.markdown,
        metadata: {
          filename: result.filename,
          createdAt: result.createdAt,
          model: result.model
        }
      };
    }
    if (activityDetail) {
      return {
        html: activityDetail.html,
        markdown: activityDetail.markdown,
        metadata: {
          filename: activityDetail.filename,
          createdAt: activityDetail.created_at,
          model: activityDetail.model
        }
      };
    }
    return null;
  }, [result, activityDetail]);

  const onFileSelected = (selected: File | null) => {
    setError(null);
    setResult(null);
    setActivityDetail(null);
    setSelectedId(null);
    if (!selected) {
      setFile(null);
      return;
    }
    if (!ACCEPTED_TYPES.includes(selected.type)) {
      setError("Unsupported file type. Please choose a supported audio format.");
      return;
    }
    if (selected.size > MAX_FILE_SIZE) {
      setError("File is too large. Please select a file under 25MB.");
      return;
    }
    setFile(selected);
  };

  const fetchActivity = async () => {
    const response = await fetch("/api/activity");
    const data = await response.json();
    setActivity(data.items || []);
  };

  const fetchActivityDetail = async (id: number) => {
    const response = await fetch(`/api/activity/${id}`);
    if (!response.ok) {
      setError("Unable to load the transcript.");
      return;
    }
    const data = await response.json();
    setActivityDetail(data.item);
  };

  const handleTranscribe = () => {
    if (!file) {
      setError("Please choose an audio file first.");
      return;
    }
    if (!apiKey.trim()) {
      setError("Please paste your OpenAI API key.");
      return;
    }
    setError(null);
    setProgress({ stage: "Uploading…", percent: 0 });
    setResult(null);
    setActivityDetail(null);

    const formData = new FormData();
    formData.append("audio", file);
    formData.append("apiKey", apiKey.trim());

    const xhr = new XMLHttpRequest();
    requestRef.current = xhr;
    xhr.open("POST", "/api/transcribe");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setProgress({ stage: "Uploading…", percent });
      }
    };

    xhr.upload.onload = () => {
      setProgress({ stage: "Transcribing…" });
    };

    xhr.onprogress = () => {
      if (xhr.readyState === XMLHttpRequest.LOADING) {
        setProgress({ stage: "Formatting…" });
      }
    };

    xhr.onload = () => {
      setProgress(null);
      requestRef.current = null;
      if (xhr.status >= 200 && xhr.status < 300) {
        const payload: TranscriptPayload = JSON.parse(xhr.responseText);
        setResult(payload);
        setSelectedId(payload.id);
        fetchActivity();
        return;
      }
      const response = JSON.parse(xhr.responseText || "{}") as { error?: string };
      setError(response.error || "Transcription failed.");
    };

    xhr.onerror = () => {
      setProgress(null);
      requestRef.current = null;
      setError("Network error while uploading.");
    };

    xhr.onabort = () => {
      setProgress(null);
      requestRef.current = null;
      setError("Request cancelled.");
    };

    xhr.send(formData);
  };

  const handleCancel = () => {
    if (requestRef.current) {
      requestRef.current.abort();
    }
  };

  const handleCopy = async () => {
    if (!selectedOutput?.markdown) {
      return;
    }
    await navigator.clipboard.writeText(selectedOutput.markdown);
  };

  const handleDownload = () => {
    if (!selectedOutput?.markdown) {
      return;
    }
    const blob = new Blob([selectedOutput.markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedOutput.metadata.filename.replace(/\.[^/.]+$/, "")}-transcript.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (id: number, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    await fetch(`/api/activity/${id}`, { method: "DELETE" });
    if (selectedId === id) {
      setSelectedId(null);
      setActivityDetail(null);
    }
    fetchActivity();
  };

  const handleClearAll = async () => {
    await fetch("/api/activity", { method: "DELETE" });
    setSelectedId(null);
    setActivityDetail(null);
    fetchActivity();
  };

  const formattedDate = (value: string) => new Date(value).toLocaleString();

  return (
    <div className="app">
      <aside className="sidebar">
        <div>
          <h2>Activity</h2>
          <div className="inline-actions">
            <button className="button secondary" onClick={handleClearAll} disabled={!activity.length}>
              Clear all
            </button>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
          {activity.length === 0 && <p className="activity-meta">No transcriptions yet.</p>}
          {activity.map((item) => (
            <div
              key={item.id}
              className={`activity-item ${selectedId === item.id ? "active" : ""}`}
              onClick={() => {
                setSelectedId(item.id);
                setResult(null);
                fetchActivityDetail(item.id);
              }}
            >
              <strong>{item.filename}</strong>
              <div className="activity-meta">{formattedDate(item.created_at)}</div>
              <div className="activity-meta">
                {item.duration ? `${item.duration.toFixed(1)}s` : "Duration unknown"} · {item.status}
              </div>
              <button
                className="button secondary"
                style={{ marginTop: 8 }}
                onClick={(event) => handleDelete(item.id, event)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </aside>
      <main className="main">
        <div className="card">
          <h1>Local Audio Transcriber</h1>
          <p>Upload an audio file, transcribe it with your OpenAI API key, and keep transcripts locally.</p>
          <label className="label" htmlFor="api-key">
            OpenAI API Key
          </label>
          <div className="controls">
            <input
              id="api-key"
              type="text"
              placeholder="sk-..."
              value={apiKey}
              onChange={(event) => {
                const value = event.target.value;
                setApiKey(value);
                localStorage.setItem(apiKeyStorageKey, value);
              }}
            />
            <button
              className="button secondary"
              onClick={() => {
                setApiKey("");
                localStorage.removeItem(apiKeyStorageKey);
              }}
            >
              Clear
            </button>
          </div>
        </div>

        <div className="card">
          <h2>Upload</h2>
          <div
            className={`dropzone ${isDragging ? "dragging" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              const dropped = event.dataTransfer.files?.[0];
              onFileSelected(dropped || null);
            }}
          >
            <p>Drag and drop an audio file here, or click to browse.</p>
            <input
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              onChange={(event) => onFileSelected(event.target.files?.[0] || null)}
            />
          </div>

          {file && (
            <div style={{ marginTop: 16 }}>
              <strong>Selected:</strong> {file.name}
              {audioUrl && (
                <audio style={{ display: "block", marginTop: 12, width: "100%" }} controls src={audioUrl} />
              )}
            </div>
          )}

          <div className="controls">
            <button className="button" onClick={handleTranscribe} disabled={isBusy || !file}>
              Transcribe
            </button>
            <button className="button secondary" onClick={handleCancel} disabled={!isBusy}>
              Cancel
            </button>
          </div>

          {progress && (
            <div className="progress">
              {progress.stage} {progress.percent !== undefined ? `${progress.percent}%` : ""}
            </div>
          )}
          {error && <div className="error">{error}</div>}
        </div>

        <div className="card">
          <h2>Transcript Output</h2>
          {selectedOutput ? (
            <>
              <div className="metadata">
                <div>Filename: {selectedOutput.metadata.filename}</div>
                <div>Transcribed: {formattedDate(selectedOutput.metadata.createdAt)}</div>
                <div>Model: {selectedOutput.metadata.model}</div>
              </div>
              <div className="controls">
                <button className="button secondary" onClick={handleCopy}>
                  Copy
                </button>
                <button className="button secondary" onClick={handleDownload}>
                  Download .md
                </button>
              </div>
              <div
                className="output"
                style={{ marginTop: 16 }}
                dangerouslySetInnerHTML={{ __html: selectedOutput.html || "" }}
              />
            </>
          ) : (
            <p>No transcript selected yet.</p>
          )}
        </div>
      </main>
    </div>
  );
}
