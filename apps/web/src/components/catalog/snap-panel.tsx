'use client';

import type { SnapSuggestion } from '@snapsell/shared';
import { Alert, Button, Card, cn, Textarea } from '@snapsell/ui';
import { Camera, ChevronDown, ImagePlus, RefreshCw, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSystemStatus } from '@/components/admin/session';
import { ApiRequestError } from '@/lib/api';
import { snap } from '@/lib/catalog';
import { VoiceRecorder } from './voice-recorder';

/**
 * "Snap to sell" (BUILD_PLAN §2.5): a photo, a voice note and/or a typed note become suggested
 * product details that the owner checks before saving.
 */
export function SnapPanel({
  defaultOpen,
  onResult,
  onPhoto,
}: {
  defaultOpen: boolean;
  onResult: (s: SnapSuggestion) => void;
  onPhoto: (file: File) => void;
}) {
  const status = useSystemStatus();
  // Shared query data can arrive before this (Suspense-wrapped) panel hydrates; read it only
  // after mount so server and client render the same markup.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const configured = !mounted || (status.data?.ai.configured ?? true);
  const [open, setOpen] = useState(defaultOpen);
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const pick = useRef<HTMLInputElement>(null);

  function choose(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto({ file, url: URL.createObjectURL(file) });
  }

  async function run() {
    setPending(true);
    setError(null);
    try {
      const result = await snap({ image: photo?.file, audio, note });
      if (photo) onPhoto(photo.file);
      onResult(result);
      setHeard(result.heard);
      setDone(true);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <Card className="flex flex-wrap items-center gap-3 border-ai/20 bg-gradient-to-r from-ai-soft/80 to-transparent p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ai text-white">
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {done ? 'Details filled in by Snap' : 'Snap to sell'}
          </p>
          <p className="text-sm text-muted-foreground">
            {!done
              ? 'Take a photo and say the price. The assistant fills in the details.'
              : heard
                ? `Heard: “${heard}”. Check the highlighted fields before saving.`
                : 'Check the highlighted fields before saving.'}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          {done ? <RefreshCw /> : <Camera />} {done ? 'Snap again' : 'Use Snap'}
        </Button>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-ai/25">
      <div className="flex items-center gap-3 border-b border-border bg-gradient-to-r from-ai-soft to-transparent px-5 py-4">
        <span className="flex size-9 items-center justify-center rounded-xl bg-ai text-white">
          <Sparkles className="size-4" />
        </span>
        <div className="flex-1">
          <h2 className="text-base font-semibold">Snap to sell</h2>
          <p className="text-sm text-muted-foreground">A photo plus a few words is enough.</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setOpen(false)}
          aria-label="Hide Snap"
        >
          <ChevronDown />
        </Button>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-[180px_minmax(0,1fr)]">
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl border-2 border-dashed border-border-strong bg-muted/50 sm:aspect-auto sm:h-full sm:min-h-52">
          {photo ? (
            <>
              <img src={photo.url} alt="Your snap" className="size-full object-cover" />
              <button
                type="button"
                onClick={() => (URL.revokeObjectURL(photo.url), setPhoto(null))}
                className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-surface/90 shadow-sm"
                aria-label="Remove photo"
              >
                <X className="size-4" />
              </button>
            </>
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-2 p-4 text-center">
              <Button type="button" onClick={() => camera.current?.click()} className="sm:hidden">
                <Camera /> Take photo
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => pick.current?.click()}
              >
                <ImagePlus /> Choose photo
              </Button>
            </div>
          )}
        </div>
        <div className="grid content-start gap-3">
          <VoiceRecorder value={audio} onChange={setAudio} />
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="Or type it: “Kitenge shirts, sizes M and L, K250 each”"
            className="min-h-16"
          />
          {!configured && (
            <Alert tone="info" title="Snap needs a Gemini API key">
              Add <code className="font-mono text-xs">GEMINI_API_KEY</code> to{' '}
              <code className="font-mono text-xs">.env</code> and restart the API. You can still use
              the photo and fill in the details yourself.
            </Alert>
          )}
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void run()}
              loading={pending}
              disabled={!configured || (!photo && !audio && !note.trim())}
              className={cn('bg-ai text-white hover:bg-ai/90')}
            >
              <Sparkles /> Fill in the details
            </Button>
            {photo && (
              <Button
                type="button"
                variant="outline"
                onClick={() => (onPhoto(photo.file), setPhoto(null), setOpen(false))}
              >
                Just use the photo
              </Button>
            )}
          </div>
        </div>
      </div>
      <input
        ref={pick}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => (choose(e.target.files), (e.target.value = ''))}
      />
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => (choose(e.target.files), (e.target.value = ''))}
      />
    </Card>
  );
}
