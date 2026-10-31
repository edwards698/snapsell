'use client';

import type { MessageDto } from '@snapsell/shared';
import { Button, Textarea } from '@snapsell/ui';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';

/** A suggested reply, above the composer, that is not sent until the owner approves it. */
export function DraftCard({
  draft,
  approving,
  discarding,
  onApprove,
  onEdit,
  onDiscard,
}: {
  draft: MessageDto;
  approving: boolean;
  discarding: boolean;
  onApprove: () => void;
  onEdit: (body: string) => void;
  onDiscard: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(draft.body ?? '');
  const shown = editing ? text : (draft.body ?? '');

  return (
    <div className="border-t border-ai/30 bg-ai-soft px-3 py-3 sm:px-4">
      <div className="mx-auto grid max-w-3xl gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-ai">
          <Sparkles className="size-3.5" /> Suggested reply · not sent
        </p>
        {editing ? (
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            aria-label="Edit suggested reply"
          />
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{shown}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {editing ? (
            <Button
              size="sm"
              loading={approving}
              disabled={!text.trim()}
              onClick={() => onEdit(text.trim())}
            >
              Send edited reply
            </Button>
          ) : (
            <Button size="sm" loading={approving} onClick={onApprove}>
              Approve
            </Button>
          )}
          {!editing && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setText(draft.body ?? '');
                setEditing(true);
              }}
            >
              Edit
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            loading={discarding}
            onClick={onDiscard}
          >
            Discard
          </Button>
        </div>
      </div>
    </div>
  );
}
