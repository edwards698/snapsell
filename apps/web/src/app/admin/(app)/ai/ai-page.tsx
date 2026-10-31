'use client';

import {
  type AiActivityItem,
  type AiSettingsDto,
  aiSettingsSchema,
  type PresetSetting,
  type SandboxResult,
} from '@snapsell/shared';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  Input,
  SegmentedControl,
  Skeleton,
  Switch,
  Textarea,
  toast,
} from '@snapsell/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { useFormErrors } from '@/components/auth/use-form-errors';
import { api, ApiRequestError } from '@/lib/api';

const PRESET_LABEL: Record<PresetSetting['key'], string> = {
  greeting: 'Greeting',
  hours: 'Opening hours',
  location: 'Location',
  delivery: 'Delivery',
  payment: 'Payment',
};

export function AiPage() {
  const settings = useQuery({
    queryKey: ['ai-settings'],
    queryFn: () => api<AiSettingsDto>('/admin/ai-settings'),
  });
  const presets = useQuery({
    queryKey: ['ai-presets'],
    queryFn: () => api<PresetSetting[]>('/admin/ai-settings/presets'),
  });

  return (
    <>
      <PageHeader
        title="AI Assistant"
        description="How the assistant talks, what it may look up, and a sandbox that never messages a customer."
      />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="grid gap-6">
          {settings.data ? (
            <SettingsForm initial={settings.data} />
          ) : (
            <Skeleton className="h-96 rounded-2xl" />
          )}
          {presets.data ? (
            <PresetsForm initial={presets.data} />
          ) : (
            <Skeleton className="h-64 rounded-2xl" />
          )}
        </div>
        <div className="grid gap-6">
          <Sandbox configured={settings.data?.configured ?? false} />
          <Activity />
        </div>
      </div>
    </>
  );
}

function SettingsForm({ initial }: { initial: AiSettingsDto }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(initial);
  const errors = useFormErrors();
  useEffect(() => setDraft(initial), [initial]);
  const save = useMutation({
    mutationFn: (body: AiSettingsDto) =>
      api<AiSettingsDto>('/admin/ai-settings', {
        method: 'PATCH',
        json: {
          enabled: body.enabled,
          mode: body.mode,
          responseStyle: body.responseStyle,
          tone: body.tone,
          language: body.language,
          features: body.features,
          confidenceThreshold: body.confidenceThreshold,
          escalationTopics: body.escalationTopics,
          afterHoursMessage: body.afterHoursMessage,
        },
      }),
    onSuccess: (saved) => {
      qc.setQueryData(['ai-settings'], saved);
      toast.success('Assistant settings saved');
    },
  });
  const set = (patch: Partial<AiSettingsDto>) => setDraft({ ...draft, ...patch });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...draft,
      confidenceThreshold: Number(draft.confidenceThreshold),
      afterHoursMessage: draft.afterHoursMessage?.trim() ? draft.afterHoursMessage.trim() : null,
    };
    if (!errors.validate(aiSettingsSchema, payload)) return;
    try {
      await save.mutateAsync(payload);
    } catch (err) {
      errors.fromError(err);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} noValidate>
        <CardHeader>
          <CardTitle>Behaviour</CardTitle>
          <CardDescription>
            Suggest mode drafts a reply for you to approve. Auto sends it when the checks pass.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          {!initial.configured && (
            <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
              Add GEMINI_API_KEY to the server environment before the assistant can reply.
            </p>
          )}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Assistant</p>
              <p className="text-sm text-muted-foreground">Master switch for every conversation.</p>
            </div>
            <Switch
              checked={draft.enabled}
              onCheckedChange={(enabled) => set({ enabled })}
              aria-label="Assistant enabled"
            />
          </div>
          <Field label="Mode">
            <SegmentedControl
              aria-label="Assistant mode"
              value={draft.mode}
              onValueChange={(mode) => set({ mode })}
              options={[
                { value: 'MANUAL', label: 'Manual' },
                { value: 'SUGGEST', label: 'Suggest' },
                { value: 'AUTO', label: 'Auto' },
              ]}
            />
          </Field>
          <Field label="Style">
            <SegmentedControl
              aria-label="Response style"
              value={draft.responseStyle}
              onValueChange={(responseStyle) => set({ responseStyle })}
              options={[
                { value: 'conversational', label: 'Chat' },
                { value: 'concise', label: 'Short' },
                { value: 'structured', label: 'Structured' },
                { value: 'preset', label: 'Saved replies' },
              ]}
            />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Tone">
              <SegmentedControl
                aria-label="Tone"
                value={draft.tone}
                onValueChange={(tone) => set({ tone })}
                options={[
                  { value: 'professional', label: 'Professional' },
                  { value: 'friendly', label: 'Friendly' },
                  { value: 'casual', label: 'Casual' },
                ]}
              />
            </Field>
            <Field label="Language" error={errors.fields.language} hint="Used when the customer hasn’t shown one.">
              <Input
                value={draft.language}
                onChange={(e) => set({ language: e.target.value })}
                maxLength={20}
              />
            </Field>
          </div>
          <div className="grid gap-3">
            <Toggle
              label="Product questions"
              checked={draft.features.productEnquiries}
              onChange={(productEnquiries) =>
                set({ features: { ...draft.features, productEnquiries } })
              }
            />
            <Toggle
              label="Stock questions"
              checked={draft.features.stockEnquiries}
              onChange={(stockEnquiries) =>
                set({ features: { ...draft.features, stockEnquiries } })
              }
            />
            <Toggle
              label="Tell customers the exact number in stock"
              checked={draft.features.showExactStock}
              onChange={(showExactStock) =>
                set({ features: { ...draft.features, showExactStock } })
              }
            />
            <Toggle
              label="Voice notes"
              checked={draft.features.voiceNotes}
              onChange={(voiceNotes) => set({ features: { ...draft.features, voiceNotes } })}
            />
            <Toggle
              label="Photos"
              checked={draft.features.imageUnderstanding}
              onChange={(imageUnderstanding) =>
                set({ features: { ...draft.features, imageUnderstanding } })
              }
            />
            <Toggle
              label="Help with WhatsApp orders"
              checked={draft.features.orderAssistance}
              onChange={(orderAssistance) =>
                set({ features: { ...draft.features, orderAssistance } })
              }
            />
            <Toggle
              label="Create draft orders"
              checked={draft.features.draftOrders}
              onChange={(draftOrders) => set({ features: { ...draft.features, draftOrders } })}
            />
            <Toggle
              label="Send payment links automatically after confirm"
              checked={draft.features.paymentAutoSend}
              onChange={(paymentAutoSend) =>
                set({ features: { ...draft.features, paymentAutoSend } })
              }
            />
          </div>
          <Field
            label="Confidence threshold"
            error={errors.fields.confidenceThreshold}
            hint="Below this, Auto saves a draft instead of sending."
          >
            <Input
              type="number"
              min={0}
              max={100}
              value={draft.confidenceThreshold}
              onChange={(e) => set({ confidenceThreshold: Number(e.target.value) })}
            />
          </Field>
          <Field label="Hand over when the customer mentions" hint="One topic per line.">
            <Textarea
              rows={3}
              value={draft.escalationTopics.join('\n')}
              onChange={(e) =>
                set({
                  escalationTopics: e.target.value
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>
          <Field label="After-hours reply" hint="Sent instead of calling the model when the shop is closed. Leave blank to stay quiet.">
            <Textarea
              rows={3}
              value={draft.afterHoursMessage ?? ''}
              onChange={(e) => set({ afterHoursMessage: e.target.value })}
            />
          </Field>
        </CardContent>
        <CardFooter>
          <Button type="submit" loading={save.isPending}>
            Save settings
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 text-sm">
      {label}
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}

function PresetsForm({ initial }: { initial: PresetSetting[] }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState(initial);
  useEffect(() => setRows(initial), [initial]);
  const save = useMutation({
    mutationFn: (presets: PresetSetting[]) =>
      api<PresetSetting[]>('/admin/ai-settings/presets', { method: 'PUT', json: { presets } }),
    onSuccess: (saved) => {
      qc.setQueryData(['ai-presets'], saved);
      void qc.invalidateQueries({ queryKey: ['presets'] });
      toast.success('Saved replies updated');
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Saved replies</CardTitle>
        <CardDescription>
          When a question matches, this wording is sent unchanged.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {rows.map((row, index) => (
          <div key={row.key} className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">{PRESET_LABEL[row.key]}</p>
              <Switch
                checked={row.enabled}
                onCheckedChange={(enabled) =>
                  setRows(rows.map((r, i) => (i === index ? { ...r, enabled } : r)))
                }
                aria-label={`${PRESET_LABEL[row.key]} enabled`}
              />
            </div>
            <Textarea
              rows={2}
              value={row.text}
              aria-label={PRESET_LABEL[row.key]}
              onChange={(e) =>
                setRows(rows.map((r, i) => (i === index ? { ...r, text: e.target.value } : r)))
              }
            />
          </div>
        ))}
      </CardContent>
      <CardFooter>
        <Button
          type="button"
          loading={save.isPending}
          onClick={() =>
            save.mutate(
              rows.map((r) => ({ ...r, text: r.text.trim() })),
              {
                onError: (err) =>
                  toast.error(err instanceof ApiRequestError ? err.message : 'Could not save replies.'),
              },
            )
          }
        >
          Save replies
        </Button>
      </CardFooter>
    </Card>
  );
}

function Sandbox({ configured }: { configured: boolean }) {
  const qc = useQueryClient();
  const [message, setMessage] = useState('Do you have wireless headphones?');
  const [result, setResult] = useState<SandboxResult | null>(null);
  const run = useMutation({
    mutationFn: (text: string) => api<SandboxResult>('/admin/ai/sandbox', { json: { message: text } }),
    onSuccess: (data) => {
      setResult(data);
      void qc.invalidateQueries({ queryKey: ['ai-activity'] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sandbox</CardTitle>
        <CardDescription>Uses the live catalogue. Nothing is sent on WhatsApp.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Textarea
          rows={3}
          value={message}
          aria-label="Sandbox message"
          onChange={(e) => setMessage(e.target.value)}
        />
        {result && (
          <div className="grid gap-2 rounded-xl bg-muted p-3 text-sm">
            <p className="whitespace-pre-wrap">{result.reply || 'No reply.'}</p>
            {result.interpretation && (
              <p className="text-muted-foreground">{result.interpretation}</p>
            )}
            {result.toolCalls.length > 0 && (
              <ul className="grid gap-1 font-mono text-xs text-muted-foreground">
                {result.toolCalls.map((call, i) => (
                  <li key={`${call.name}-${i}`}>{call.name}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button
          type="button"
          disabled={!configured || !message.trim()}
          loading={run.isPending}
          onClick={() =>
            run.mutate(message.trim(), {
              onError: (err) =>
                toast.error(err instanceof ApiRequestError ? err.message : 'The sandbox failed.'),
            })
          }
        >
          Try it
        </Button>
      </CardFooter>
    </Card>
  );
}

function Activity() {
  const activity = useQuery({
    queryKey: ['ai-activity'],
    queryFn: () => api<AiActivityItem[]>('/admin/ai/activity'),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
        <CardDescription>What the assistant understood, which tools it called, and what happened.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {!activity.data && <Skeleton className="h-24 rounded-xl" />}
        {activity.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">No assistant turns yet.</p>
        )}
        {activity.data?.map((row) => (
          <div key={row.id} className="grid gap-1 border-b border-border pb-3 text-sm last:border-0">
            <p className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{row.outcome}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(row.createdAt).toLocaleString()}
              </span>
            </p>
            {row.interpretation && <p className="text-muted-foreground">{row.interpretation}</p>}
            {row.response && <p className="whitespace-pre-wrap">{row.response}</p>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
