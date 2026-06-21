"use client";

import * as React from "react";
import { Card, Pill, Button } from "@o/ui";
import { Download, RefreshCw, Image as ImageIcon, Clock, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@o/ui";

// =============================================================================
// PhotoGallery
// =============================================================================
// Shows recent jobs and their variations. In production this polls
// /api/photos/jobs. In dev (no API URL) it shows mock data and listens
// for the o:photos-submitted-dev event from the uploader to add new
// mock jobs.

interface MockVariation {
  kind: string;
  label: string;
  url: string; // data URL or external URL
  sizeBytes: number;
  width: number;
  height: number;
  costUsd: number;
}

interface MockJob {
  id: string;
  filename: string;
  submittedAt: string;
  status: "queued" | "processing" | "ready" | "failed";
  preset: string;
  variations: MockVariation[];
  totalCostUsd: number;
  originalPreview: string; // data URL
}

const PRESET_LABELS: Record<string, string> = {
  "social-square": "Social square",
  "portrait-feed": "Portrait feed",
  "product-shot": "Product shot",
  "print-2x": "Print 2x",
  "restore-old": "Restore old",
  "full-set": "Full set",
};

const VARIATION_LABELS: Record<string, string> = {
  "original": "Original",
  "upscaled-2x": "Upscaled 2x",
  "upscaled-4x": "Upscaled 4x",
  "color-noira": "Noira color grade",
  "no-bg": "Background removed",
  "restored": "Restored",
  "crop-square": "Square crop",
  "crop-portrait": "Portrait crop",
  "denoised": "Denoised",
};

// Mock job templates — varied so the gallery looks real in dev
const MOCK_JOBS: MockJob[] = [
  {
    id: "phj_mock_1",
    filename: "portrait-04.jpg",
    submittedAt: "5 minutes ago",
    status: "ready",
    preset: "social-square",
    totalCostUsd: 0.12,
    originalPreview: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&q=80",
    variations: [
      { kind: "crop-square",  label: "Square crop",       url: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&h=600&fit=crop&q=80", sizeBytes: 184000, width: 600, height: 600, costUsd: 0 },
      { kind: "color-noira",  label: "Noira color grade", url: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800&hue=10&sat=-60&q=80", sizeBytes: 220000, width: 800, height: 800, costUsd: 0.025 },
    ],
  },
  {
    id: "phj_mock_2",
    filename: "headshot-12.jpg",
    submittedAt: "yesterday",
    status: "ready",
    preset: "full-set",
    totalCostUsd: 0.65,
    originalPreview: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&q=80",
    variations: [
      { kind: "crop-square",  label: "Square crop",       url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=600&h=600&fit=crop&q=80", sizeBytes: 156000, width: 600, height: 600, costUsd: 0 },
      { kind: "crop-portrait",label: "Portrait crop",     url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=480&h=600&fit=crop&q=80", sizeBytes: 158000, width: 480, height: 600, costUsd: 0 },
      { kind: "color-noira",  label: "Noira color grade", url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=800&hue=8&sat=-50&q=80", sizeBytes: 198000, width: 800, height: 800, costUsd: 0.025 },
      { kind: "no-bg",        label: "Background removed",url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=600&q=80&bg=transparent", sizeBytes: 142000, width: 600, height: 600, costUsd: 0.005 },
      { kind: "denoised",     label: "Denoised",          url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=600&blur=0&q=80", sizeBytes: 168000, width: 600, height: 600, costUsd: 0.012 },
      { kind: "restored",     label: "Restored",          url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=800&hue=10&sat=-30&sharp=20&q=80", sizeBytes: 188000, width: 800, height: 800, costUsd: 0.037 },
      { kind: "upscaled-2x",  label: "Upscaled 2x",       url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=1200&q=80", sizeBytes: 312000, width: 1200, height: 1200, costUsd: 0.012 },
      { kind: "upscaled-4x",  label: "Upscaled 4x",       url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=2000&q=80", sizeBytes: 580000, width: 2000, height: 2000, costUsd: 0.040 },
    ],
  },
  {
    id: "phj_mock_3",
    filename: "headshot-11.jpg",
    submittedAt: "yesterday",
    status: "ready",
    preset: "portrait-feed",
    totalCostUsd: 0.12,
    originalPreview: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&q=80",
    variations: [
      { kind: "crop-portrait",label: "Portrait crop",     url: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=480&h=600&fit=crop&q=80", sizeBytes: 152000, width: 480, height: 600, costUsd: 0 },
      { kind: "color-noira",  label: "Noira color grade", url: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=800&hue=8&sat=-40&q=80", sizeBytes: 192000, width: 800, height: 800, costUsd: 0.025 },
    ],
  },
  {
    id: "phj_mock_4",
    filename: "headshot-10.jpg",
    submittedAt: "2 days ago",
    status: "ready",
    preset: "product-shot",
    totalCostUsd: 0.22,
    originalPreview: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=400&q=80",
    variations: [
      { kind: "no-bg",        label: "Background removed",url: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=600&q=80&bg=transparent", sizeBytes: 138000, width: 600, height: 600, costUsd: 0.005 },
      { kind: "upscaled-2x",  label: "Upscaled 2x",       url: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=1200&q=80", sizeBytes: 308000, width: 1200, height: 1200, costUsd: 0.012 },
      { kind: "color-noira",  label: "Noira color grade", url: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=800&hue=10&sat=-40&q=80", sizeBytes: 196000, width: 800, height: 800, costUsd: 0.025 },
    ],
  },
];

export function PhotoGallery() {
  const [jobs, setJobs] = React.useState<MockJob[]>(MOCK_JOBS);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({ "phj_mock_1": true });

  // Listen for dev events from the uploader
  React.useEffect(() => {
    const onSubmit = (e: Event) => {
      const detail = (e as CustomEvent).detail as { count: number; preset: string };
      const newJob: MockJob = {
        id: `phj_mock_${Date.now()}`,
        filename: `your-photo-${detail.count}.jpg`,
        submittedAt: "just now",
        status: "processing",
        preset: detail.preset,
        totalCostUsd: 0,
        originalPreview: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400&q=80",
        variations: [],
      };
      setJobs((prev) => [newJob, ...prev]);

      // Simulate completion in 5 seconds
      setTimeout(() => {
        setJobs((prev) => prev.map((j) => j.id === newJob.id ? {
          ...j,
          status: "ready" as const,
          totalCostUsd: 0.12,
          variations: MOCK_JOBS[0].variations,
        } : j));
        setExpanded((prev) => ({ ...prev, [newJob.id]: true }));
      }, 5000);
    };
    window.addEventListener("o:photos-submitted-dev", onSubmit as EventListener);
    return () => window.removeEventListener("o:photos-submitted-dev", onSubmit as EventListener);
  }, []);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-serif text-2xl text-cream">Your photos</h2>
        <p className="text-xs text-cream3">{jobs.length} job{jobs.length === 1 ? "" : "s"}</p>
      </div>
      <div className="space-y-3">
        {jobs.map((job) => (
          <JobRow
            key={job.id}
            job={job}
            expanded={!!expanded[job.id]}
            onToggle={() => setExpanded((prev) => ({ ...prev, [job.id]: !prev[job.id] }))}
          />
        ))}
      </div>
    </div>
  );
}

function JobRow({ job, expanded, onToggle }: { job: MockJob; expanded: boolean; onToggle: () => void }) {
  return (
    <Card>
      <button onClick={onToggle} className="w-full flex items-center gap-4 text-left">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={job.originalPreview} alt={job.filename} className="h-14 w-14 rounded-sm object-cover bg-ink3" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-cream font-medium truncate">{job.filename}</p>
            <Pill tone={job.status === "ready" ? "success" : job.status === "processing" ? "info" : job.status === "failed" ? "danger" : "neutral"}>
              {job.status === "ready" ? "Ready" : job.status === "processing" ? <><RefreshCw className="h-3 w-3 animate-spin" /> Processing</> : job.status}
            </Pill>
          </div>
          <p className="text-xs text-cream3 mt-0.5">
            {PRESET_LABELS[job.preset] ?? job.preset} · {job.submittedAt} · {job.variations.length} variation{job.variations.length === 1 ? "" : "s"} · ${job.totalCostUsd.toFixed(2)}
          </p>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-cream3" /> : <ChevronDown className="h-4 w-4 text-cream3" />}
      </button>

      {expanded && job.variations.length > 0 && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {job.variations.map((v) => (
            <VariationTile key={v.kind} variation={v} />
          ))}
        </div>
      )}
      {expanded && job.variations.length === 0 && job.status === "processing" && (
        <div className="mt-4 p-8 text-center">
          <Clock className="h-5 w-5 text-cream3 mx-auto animate-pulse-soft" />
          <p className="mt-2 text-sm text-cream3">Processing… usually under a minute.</p>
        </div>
      )}
    </Card>
  );
}

function VariationTile({ variation }: { variation: MockVariation }) {
  return (
    <div className="group relative bg-ink2 border border-ink3 rounded-sm overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={variation.url}
        alt={variation.label}
        className="w-full aspect-square object-cover"
        loading="lazy"
      />
      <div className="p-2.5">
        <p className="text-xs text-cream font-medium">{variation.label}</p>
        <p className="text-[10px] text-cream3 font-mono mt-0.5">
          {variation.width}×{variation.height} · {(variation.sizeBytes / 1024).toFixed(0)} KB
        </p>
        <a
          href={variation.url}
          download
          target="_blank"
          rel="noreferrer"
          className="mt-2 o-btn-ghost w-full justify-center text-xs"
        >
          <Download className="h-3 w-3" /> Download
        </a>
      </div>
    </div>
  );
}
