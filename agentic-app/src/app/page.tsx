"use client";

import { FormEvent, useMemo, useState } from "react";
import NextImage from "next/image";

type GenerationResponse = {
  enhancedImagePrompt: string;
  enhancedVideoPrompt: string;
  imageBase64: string;
};

type MotionProfile = {
  zoom: number;
  panX: number;
  panY: number;
  rotation: number;
};

const defaultImagePrompt =
  "a futuristic city skyline at dusk, neon reflections in water";
const defaultVideoPrompt =
  "slow cinematic zoom forward with a gentle drift to the right";

export default function Home() {
  const [imagePrompt, setImagePrompt] = useState(defaultImagePrompt);
  const [videoPrompt, setVideoPrompt] = useState(defaultVideoPrompt);
  const [enhancedImagePrompt, setEnhancedImagePrompt] = useState<string | null>(
    null,
  );
  const [enhancedVideoPrompt, setEnhancedVideoPrompt] = useState<string | null>(
    null,
  );
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isVideoRendering, setIsVideoRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoProgress, setVideoProgress] = useState(0);

  const isReady = useMemo(
    () => Boolean(imageSrc && enhancedVideoPrompt),
    [imageSrc, enhancedVideoPrompt],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsGenerating(true);
    setIsVideoRendering(false);
    setVideoUrl(null);
    setEnhancedImagePrompt(null);
    setEnhancedVideoPrompt(null);
    setImageSrc(null);

    try {
      const formData = new FormData();
      formData.append("imagePrompt", imagePrompt);
      formData.append("videoPrompt", videoPrompt);

      const response = await fetch("/api/generate", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error ?? "Failed to generate assets");
      }

      const data: GenerationResponse = await response.json();
      const base64 = `data:image/png;base64,${data.imageBase64}`;

      setEnhancedImagePrompt(data.enhancedImagePrompt);
      setEnhancedVideoPrompt(data.enhancedVideoPrompt);
      setImageSrc(base64);

      await renderVideo(base64, data.enhancedVideoPrompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setIsGenerating(false);
    }
  };

  const deriveMotion = (promptText: string): MotionProfile => {
    const text = promptText.toLowerCase();
    const profile: MotionProfile = {
      zoom: 0.18,
      panX: 0,
      panY: 0,
      rotation: 0,
    };

    if (text.includes("zoom out")) {
      profile.zoom = -0.16;
    } else if (text.includes("zoom") || text.includes("dolly")) {
      profile.zoom = 0.24;
    }

    if (text.includes("left")) {
      profile.panX = -80;
    } else if (text.includes("right")) {
      profile.panX = 80;
    }

    if (text.includes("up")) {
      profile.panY = -60;
    } else if (text.includes("down")) {
      profile.panY = 60;
    }

    if (text.includes("rotate clockwise")) {
      profile.rotation = 0.05;
    } else if (text.includes("rotate counter") || text.includes("rotate anti")) {
      profile.rotation = -0.05;
    }

    return profile;
  };

  const renderVideo = async (base64: string, promptText: string) => {
    setIsVideoRendering(true);
    setVideoProgress(0);
    setVideoUrl(null);

    try {
      const { default: WebMWriter } = await import("webm-writer");

      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = reject;
        element.src = base64;
      });

      const size = 512;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Unable to obtain rendering context");
      }

      const fps = 24;
      const durationSeconds = 6;
      const totalFrames = fps * durationSeconds;
      const startScale = 1;
      const motion = deriveMotion(promptText);

      const writer = new WebMWriter({
        quality: 0.95,
        frameRate: fps,
        transparent: false,
        width: size,
        height: size,
      });

      const { width: imgWidth, height: imgHeight } = img;
      const imgAspect = imgWidth / imgHeight;
      const baseWidth = imgAspect >= 1 ? size * imgAspect : size;
      const baseHeight = imgAspect >= 1 ? size : size / imgAspect;

      for (let frame = 0; frame < totalFrames; frame += 1) {
        const progress = frame / (totalFrames - 1);
        const eased = 1 - Math.pow(1 - progress, 2);
        const scale = startScale + motion.zoom * eased;
        const translateX = motion.panX * eased;
        const translateY = motion.panY * eased;
        const rotation = motion.rotation * eased;

        ctx.save();
        ctx.clearRect(0, 0, size, size);
        ctx.translate(size / 2, size / 2);
        ctx.rotate(rotation);
        ctx.scale(scale, scale);
        ctx.translate(translateX, translateY);
        ctx.drawImage(img, -baseWidth / 2, -baseHeight / 2, baseWidth, baseHeight);
        ctx.restore();

        writer.addFrame(canvas);
        setVideoProgress(Math.round(((frame + 1) / totalFrames) * 100));

        if (frame % fps === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      const blob = await writer.complete();
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Video rendering failed");
    } finally {
      setIsVideoRendering(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-12 px-6 py-12">
        <header className="space-y-4">
          <p className="text-xs uppercase tracking-[0.4em] text-emerald-300">
            Agentic Studio
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Dual-Stage Visual AI Agent
          </h1>
          <p className="max-w-2xl text-sm text-zinc-400 sm:text-base">
            Provide a concept for a hero image and a cinematic direction for the
            accompanying motion clip. The agent rewrites your prompts for
            realism, renders the artwork, and synthesizes an animated shot.
          </p>
        </header>

        <form
          className="grid gap-6 rounded-3xl border border-zinc-800 bg-zinc-900/60 p-8 shadow-lg shadow-black/40 backdrop-blur"
          onSubmit={handleSubmit}
        >
          <div className="grid gap-6 md:grid-cols-2">
            <label className="flex flex-col gap-3">
              <span className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-400">
                Image Prompt
              </span>
              <textarea
                className="h-40 w-full rounded-2xl border border-zinc-800/60 bg-zinc-900 px-4 py-3 text-sm leading-relaxed text-zinc-200 outline-none transition-colors focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30"
                value={imagePrompt}
                onChange={(event) => setImagePrompt(event.target.value)}
                placeholder="Describe the hero image you want to see."
                required
              />
            </label>
            <label className="flex flex-col gap-3">
              <span className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-400">
                Motion Prompt
              </span>
              <textarea
                className="h-40 w-full rounded-2xl border border-zinc-800/60 bg-zinc-900 px-4 py-3 text-sm leading-relaxed text-zinc-200 outline-none transition-colors focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30"
                value={videoPrompt}
                onChange={(event) => setVideoPrompt(event.target.value)}
                placeholder="Describe how the scene should move in video form."
                required
              />
            </label>
          </div>

          <button
            className="group inline-flex items-center justify-center gap-2 rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-emerald-950 transition hover:bg-emerald-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/70 disabled:cursor-not-allowed disabled:bg-emerald-500/40 disabled:text-emerald-900/60"
            type="submit"
            disabled={isGenerating}
          >
            {isGenerating ? "Generating..." : "Run Agent"}
          </button>

          {error && (
            <p className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </p>
          )}
        </form>

        <section className="grid gap-6 lg:grid-cols-[2fr_3fr]">
          <article className="space-y-4 rounded-3xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h2 className="text-xs uppercase tracking-[0.35em] text-zinc-400">
              Enhanced Prompts
            </h2>
            <div className="space-y-4">
              <div>
                <p className="text-[0.7rem] uppercase tracking-[0.25em] text-emerald-300">
                  Image
                </p>
                <p className="mt-2 whitespace-pre-line text-sm text-zinc-200">
                  {enhancedImagePrompt ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-[0.7rem] uppercase tracking-[0.25em] text-emerald-300">
                  Video
                </p>
                <p className="mt-2 whitespace-pre-line text-sm text-zinc-200">
                  {enhancedVideoPrompt ?? "—"}
                </p>
              </div>
            </div>
          </article>

          <article className="grid gap-6 rounded-3xl border border-zinc-800 bg-zinc-900/50 p-6">
            <div className="space-y-3">
              <h2 className="text-xs uppercase tracking-[0.35em] text-zinc-400">
                Rendered Image
              </h2>
              <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
                {imageSrc ? (
                  <NextImage
                    src={imageSrc}
                    alt="AI generated visual"
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-zinc-600">
                    {isGenerating ? "Synthesizing image…" : "Awaiting prompt"}
                  </div>
                )}
              </div>
              {imageSrc && (
                <a
                  className="inline-flex items-center justify-center rounded-full border border-emerald-500/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-200 transition hover:bg-emerald-500/10"
                  href={imageSrc}
                  download="agentic-image.png"
                >
                  Download Image
                </a>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs uppercase tracking-[0.35em] text-zinc-400">
                  Cinematic Clip
                </h2>
                {isVideoRendering && (
                  <span className="text-xs uppercase tracking-[0.3em] text-emerald-300">
                    Rendering {videoProgress}%
                  </span>
                )}
              </div>
              <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
                {videoUrl ? (
                  <video
                    className="h-full w-full object-cover"
                    src={videoUrl}
                    autoPlay
                    loop
                    muted
                    controls
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-zinc-600">
                    {isReady
                      ? isVideoRendering
                        ? "Generating video frames…"
                        : "Finalizing video…"
                      : "Video will appear after generation"}
                  </div>
                )}
              </div>
              {videoUrl && (
                <a
                  className="inline-flex items-center justify-center rounded-full border border-emerald-500/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-200 transition hover:bg-emerald-500/10"
                  href={videoUrl}
                  download="agentic-video.webm"
                >
                  Download Video
                </a>
              )}
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}
