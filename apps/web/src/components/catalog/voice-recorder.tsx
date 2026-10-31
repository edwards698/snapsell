'use client';

import { Button, cn } from '@snapsell/ui';
import { Mic, RotateCcw, Square, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const MAX_SECONDS = 60;
const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

function supportedType() {
  if (typeof MediaRecorder === 'undefined') return null;
  return TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

/** Tap to record a short voice note; tap again to stop (stops by itself after a minute). */
export function VoiceRecorder({
  value,
  onChange,
}: {
  value: Blob | null;
  onChange: (blob: Blob | null) => void;
}) {
  const [state, setState] = useState<'idle' | 'recording'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!value) return setUrl(null);
    const u = URL.createObjectURL(value);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [value]);

  useEffect(() => () => stop(), []);

  async function start() {
    setError(null);
    const type = supportedType();
    if (type === null || !navigator.mediaDevices?.getUserMedia) {
      setError('Voice notes aren’t supported in this browser. Type a note instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        onChange(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
      };
      rec.start();
      recorder.current = rec;
      setSeconds(0);
      setState('recording');
      timer.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS) stop();
          return s + 1;
        });
      }, 1000);
    } catch {
      setError(
        'Microphone access was blocked. Allow it in your browser settings, or type a note instead.',
      );
    }
  }

  function stop() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (recorder.current?.state === 'recording') recorder.current.stop();
    recorder.current = null;
    setState('idle');
  }

  if (value && url && state === 'idle') {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface p-2">
        <audio src={url} controls className="h-10 min-w-0 flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => onChange(null)}
          aria-label="Delete voice note"
        >
          <Trash2 />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => void start()}
          aria-label="Record again"
        >
          <RotateCcw />
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={() => (state === 'recording' ? stop() : void start())}
        className={cn(
          'flex h-14 items-center gap-3 rounded-xl border px-4 text-left text-sm font-medium transition-colors',
          state === 'recording'
            ? 'border-danger/40 bg-danger-soft text-danger-soft-foreground'
            : 'border-border bg-surface hover:bg-muted',
        )}
        aria-pressed={state === 'recording'}
      >
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-full',
            state === 'recording'
              ? 'bg-danger text-danger-foreground'
              : 'bg-ai-soft text-ai-soft-foreground',
          )}
        >
          {state === 'recording' ? (
            <Square className="size-3.5 fill-current" />
          ) : (
            <Mic className="size-4" />
          )}
        </span>
        {state === 'recording' ? (
          <>
            <span className="flex h-5 items-end gap-0.5" aria-hidden>
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="w-1 animate-pulse rounded-full bg-danger"
                  style={{ height: `${40 + ((i * 37) % 60)}%`, animationDelay: `${i * 120}ms` }}
                />
              ))}
            </span>
            <span className="flex-1">Recording… tap to stop</span>
            <span className="tabular">0:{String(seconds).padStart(2, '0')}</span>
          </>
        ) : (
          <span className="flex-1">
            Record a voice note
            <span className="block text-xs font-normal text-muted-foreground">
              e.g. “Blue chitenge, sixty kwacha, I have five”
            </span>
          </span>
        )}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
