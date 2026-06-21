"use client";

import * as React from "react";
import { Card, Button, Pill } from "@o/ui";
import { Upload, X, Image as ImageIcon, Check, Loader2 } from "lucide-react";
import { cn } from "@o/ui";

// =============================================================================
// PhotoUploader
// =============================================================================
// Drag-and-drop multi-file uploader. Files are stored as File objects in
// component state; the actual upload to R2 happens on submit. The flow:
//   1. User drops N files
//   2. User picks a preset
//   3. User clicks "Send"
//   4. We POST /api/photos/upload-url for each file, PUT to R2 directly
//   5. We POST /api/photos/jobs with all the original keys
//   6. We poll /api/photos/jobs/:id until status is "ready"
//   7. The gallery refreshes
//
// In dev mode (when no API is reachable), we just simulate the flow.

interface QueuedFile {
  id: string;
  file: File;
  preview: string;
  status: "queued" | "uploading" | "uploaded" | "failed";
  progress: number; // 0..1
  originalKey?: string;
  error?: string;
}

const PRESETS = [
  { id: "social-square",  label: "Social square",   variations: ["crop-square", "color-noira"] },
  { id: "portrait-feed",  label: "Portrait feed",   variations: ["crop-portrait", "color-noira"] },
  { id: "product-shot",   label: "Product shot",    variations: ["no-bg", "upscaled-2x", "color-noira"] },
  { id: "print-2x",       label: "Print 2x",        variations: ["upscaled-2x", "denoised"] },
  { id: "restore-old",    label: "Restore old",     variations: ["restored", "upscaled-2x"] },
  { id: "full-set",       label: "Full set",        variations: ["crop-square", "crop-portrait", "color-noira", "no-bg", "denoised", "restored", "upscaled-2x", "upscaled-4x"] },
];

export function PhotoUploader() {
  const [files, setFiles] = React.useState<QueuedFile[]>([]);
  const [preset, setPreset] = React.useState<string>("social-square");
  const [submitting, setSubmitting] = React.useState(false);
  const [caption, setCaption] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dropRef = React.useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = React.useState(false);

  function addFiles(list: FileList | File[]) {
    const arr = Array.from(list).filter((f) => f.type.startsWith("image/"));
    const queued: QueuedFile[] = arr.map((file) => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
      status: "queued",
      progress: 0,
    }));
    setFiles((prev) => [...prev, ...queued]);
  }

  function removeFile(id: string) {
    setFiles((prev) => {
      const f = prev.find((x) => x.id === id);
      if (f) URL.revokeObjectURL(f.preview);
      return prev.filter((x) => x.id !== id);
    });
  }

  async function submit() {
    if (files.length === 0 || submitting) return;
    setSubmitting(true);

    // In dev: simulate the upload + process + ready flow
    if (typeof window !== "undefined" && !process.env.NEXT_PUBLIC_API_URL) {
      for (const f of files) {
        f.status = "uploading";
        f.progress = 0;
      }
      // Simulate progress
      for (let i = 1; i <= 20; i++) {
        await new Promise((r) => setTimeout(r, 60));
        setFiles((prev) => prev.map((f) => ({ ...f, progress: Math.min(1, f.progress + 0.05) })));
      }
      setFiles((prev) => prev.map((f) => ({ ...f, status: "uploaded", progress: 1 })));
      // Dispatch a CustomEvent the gallery listens to, in dev
      window.dispatchEvent(new CustomEvent("o:photos-submitted-dev", { detail: { count: files.length, preset } }));
      // Reset after a moment
      setTimeout(() => {
        setFiles([]);
        setSubmitting(false);
        setCaption("");
      }, 800);
      return;
    }

    // In prod: real upload flow (placeholder; full implementation in production deploy)
    try {
      // 1) Request signed URLs for all files in parallel
      const sigs = await Promise.all(files.map(async (f) => {
        const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/photos/upload-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: f.file.name,
            contentType: f.file.type,
            sizeBytes: f.file.size,
          }),
        });
        if (!r.ok) throw new Error(`Failed to get signed URL for ${f.file.name}`);
        return r.json() as Promise<{ uploadUrl: string; key: string; tempId: string }>;
      }));

      // 2) PUT each file directly to R2
      await Promise.all(files.map(async (f, i) => {
        const sig = sigs[i];
        setFiles((prev) => prev.map((x) => x.id === f.id ? { ...x, status: "uploading" } : x));
        const r = await fetch(sig.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": f.file.type },
          body: f.file,
        });
        if (!r.ok) throw new Error(`Failed to upload ${f.file.name}`);
        setFiles((prev) => prev.map((x) => x.id === f.id ? { ...x, status: "uploaded", originalKey: sig.key } : x));
      }));

      // 3) Create the job(s) — one per file with the same preset
      for (const f of files) {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/photos/jobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            originalKey: f.originalKey,
            filename: f.file.name,
            contentType: f.file.type,
            sizeBytes: f.file.size,
            presetId: preset,
            caption: caption || null,
          }),
        });
      }

      setFiles([]);
      setSubmitting(false);
      setCaption("");
    } catch (err) {
      console.error("Upload failed:", err);
      setSubmitting(false);
    }
  }

  // Drag and drop
  React.useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    const onDragOver = (e: DragEvent) => { e.preventDefault(); setDragging(true); };
    const onDragLeave = () => setDragging(false);
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
    };
    el.addEventListener("dragover", onDragOver);
    el.addEventListener("dragleave", onDragLeave);
    el.addEventListener("drop", onDrop);
    return () => {
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("dragleave", onDragLeave);
      el.removeEventListener("drop", onDrop);
    };
  }, []);

  const totalBytes = files.reduce((a, f) => a + f.file.size, 0);
  const totalMB = (totalBytes / 1024 / 1024).toFixed(1);
  const allUploaded = files.length > 0 && files.every((f) => f.status === "uploaded");

  return (
    <Card className="mb-8">
      <div
        ref={dropRef}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-md p-8 text-center cursor-pointer transition",
          dragging ? "border-accent bg-accent/5" : "border-ink3 hover:border-cream3",
          files.length > 0 && "pb-4",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
        {files.length === 0 ? (
          <>
            <Upload className="h-8 w-8 text-cream3 mx-auto" />
            <p className="mt-3 text-cream font-medium">Drop photos here, or click to choose</p>
            <p className="mt-1 text-xs text-cream3">JPEG, PNG, HEIC, or WebP · up to 50MB each · up to 50 at a time</p>
          </>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {files.map((f) => (
              <FileTile key={f.id} file={f} onRemove={() => removeFile(f.id)} />
            ))}
            <button
              onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
              className="aspect-square border-2 border-dashed border-ink3 rounded-md flex flex-col items-center justify-center text-cream3 hover:text-cream hover:border-cream3"
            >
              <Upload className="h-5 w-5" />
              <span className="mt-1 text-xs">Add more</span>
            </button>
          </div>
        )}
      </div>

      {files.length > 0 && (
        <div className="mt-6 space-y-4">
          <div className="flex items-baseline justify-between">
            <h3 className="font-serif text-lg text-cream">Pick a preset</h3>
            <span className="text-xs text-cream3 font-mono">{files.length} files · {totalMB} MB</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPreset(p.id)}
                className={cn(
                  "text-left p-3 rounded-sm border transition",
                  preset === p.id
                    ? "border-accent bg-accent/10"
                    : "border-ink3 hover:border-cream3",
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm text-cream font-medium">{p.label}</p>
                  {preset === p.id && <Check className="h-3.5 w-3.5 text-accent" />}
                </div>
                <p className="mt-1 text-xs text-cream3">{p.variations.length} variations</p>
              </button>
            ))}
          </div>
          <div>
            <label className="o-label">Caption (optional)</label>
            <input
              className="o-input w-full"
              placeholder='e.g. "Quanta brand photos — batch 3"'
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={500}
            />
          </div>
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-cream3">
              {allUploaded ? "Ready to send." : submitting ? "Uploading..." : "Drop complete. Ready to send."}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setFiles([])} disabled={submitting}>Clear</Button>
              <Button onClick={submit} disabled={submitting || files.length === 0}>
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending</> : <>Send {files.length} photo{files.length === 1 ? "" : "s"}</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function FileTile({ file, onRemove }: { file: QueuedFile; onRemove: () => void }) {
  return (
    <div className="relative aspect-square bg-ink rounded-md overflow-hidden border border-ink3 group">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={file.preview} alt={file.file.name} className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent">
        <p className="text-[10px] text-cream truncate">{file.file.name}</p>
      </div>
      {file.status === "uploading" && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
          <div className="w-3/4">
            <div className="h-1 bg-ink3 rounded-full overflow-hidden">
              <div className="h-full bg-accent transition-all" style={{ width: `${file.progress * 100}%` }} />
            </div>
            <p className="mt-1 text-[10px] text-cream3 text-center font-mono">{Math.round(file.progress * 100)}%</p>
          </div>
        </div>
      )}
      {file.status === "uploaded" && (
        <div className="absolute top-1 right-1">
          <Pill tone="success"><Check className="h-2.5 w-2.5" /></Pill>
        </div>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute top-1 left-1 p-1 rounded-full bg-black/60 text-cream hover:text-accent opacity-0 group-hover:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
