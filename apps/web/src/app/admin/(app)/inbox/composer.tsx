'use client';

import type { PresetDto } from '@snapsell/shared';
import { Button, cn, Kbd } from '@snapsell/ui';
import { SendHorizontal } from 'lucide-react';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';

export interface ComposerHandle {
  focus: () => void;
}

/** Reply box. Type “/” for saved replies; Enter sends, Shift+Enter adds a line. */
export const Composer = forwardRef<
  ComposerHandle,
  {
    presets: PresetDto[];
    sending: boolean;
    onSend: (body: string) => Promise<unknown>;
    disabledReason?: string | null;
  }
>(function Composer({ presets, sending, onSend, disabledReason }, ref) {
  const [value, setValue] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }));

  const slash = value.startsWith('/') && !value.includes('\n') && !dismissed;
  const term = slash ? value.slice(1).toLowerCase() : '';
  const matches = slash
    ? presets.filter(
        (p) => p.key.toLowerCase().includes(term) || p.text.toLowerCase().includes(term),
      )
    : [];
  const open = slash && matches.length > 0;

  function resize() {
    const el = input.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function pick(p: PresetDto) {
    setValue(p.text);
    setDismissed(false);
    requestAnimationFrame(() => {
      resize();
      const el = input.current;
      el?.focus();
      el?.setSelectionRange(p.text.length, p.text.length);
    });
  }

  async function submit() {
    const body = value.trim();
    if (!body || sending) return;
    await onSend(body).then(
      () => {
        setValue('');
        requestAnimationFrame(resize);
      },
      () => undefined,
    );
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setHighlight((h) => (h + step + matches.length) % matches.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pick(matches[Math.min(highlight, matches.length - 1)]!);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDismissed(true);
        return;
      }
    }
    if (e.key === 'Escape') {
      input.current?.blur();
      return;
    }
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    if (e.key === 'Enter' && !e.shiftKey && !coarse && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div className="relative border-t border-border bg-surface p-3">
      {open && (
        <ul
          role="listbox"
          aria-label="Saved replies"
          className="absolute inset-x-3 bottom-full mb-2 max-h-64 overflow-y-auto rounded-xl border border-border bg-surface-raised p-1.5 shadow-lg"
        >
          {matches.map((p, i) => (
            <li key={p.key} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p)}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  'grid w-full gap-0.5 rounded-lg px-3 py-2 text-left',
                  i === highlight && 'bg-muted',
                )}
              >
                <span className="font-mono text-xs text-primary">/{p.key}</span>
                <span className="line-clamp-2 text-sm text-muted-foreground">{p.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <textarea
          ref={input}
          rows={1}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setHighlight(0);
            setDismissed(false);
            resize();
          }}
          onKeyDown={onKeyDown}
          placeholder={presets.length ? 'Write a reply… (type / for saved replies)' : 'Write a reply…'}
          aria-label="Reply"
          maxLength={4096}
          className="max-h-40 min-h-10 flex-1 resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/30"
        />
        <Button
          type="submit"
          size="icon"
          className="rounded-xl"
          loading={sending}
          disabled={!value.trim()}
          aria-label="Send"
        >
          <SendHorizontal />
        </Button>
      </form>
      <p className="mt-1.5 hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex">
        {disabledReason ? (
          <span className="text-warning">{disabledReason}</span>
        ) : (
          <>
            <Kbd>Enter</Kbd> to send · <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> new line
          </>
        )}
      </p>
    </div>
  );
});
