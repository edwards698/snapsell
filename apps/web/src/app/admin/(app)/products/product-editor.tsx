'use client';

import {
  MAX_OPTIONS,
  type ProductDetail,
  type ProductInput,
  productInputSchema,
  type SnapSuggestion,
  type VariantDto,
} from '@snapsell/shared';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  ConfirmDialog,
  Field,
  Input,
  MoneyInput,
  Popover,
  PopoverContent,
  PopoverTrigger,
  QuantityInput,
  Select,
  Skeleton,
  Switch,
  Textarea,
  toast,
  Tooltip,
} from '@snapsell/ui';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Copy,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { useFormErrors } from '@/components/auth/use-form-errors';
import { AdjustStockDialog, type AdjustTarget } from '@/components/catalog/adjust-stock-dialog';
import { type ImageItem, ImageManager, usePreviewUrls } from '@/components/catalog/image-manager';
import { SnapPanel } from '@/components/catalog/snap-panel';
import { ProductStatusBadge, STATUS_OPTIONS, StockBadge } from '@/components/catalog/stock-badge';
import { ApiRequestError } from '@/lib/api';
import {
  uploadImages,
  useCategories,
  useCategoryActions,
  useImageActions,
  useProduct,
  useProductAction,
  useSaveProduct,
} from '@/lib/catalog';

// ---------------------------------------------------------------------------
// Draft model
// ---------------------------------------------------------------------------

interface VariantDraft {
  key: string;
  id?: string;
  sku: string;
  optionValues: Record<string, string>;
  priceMinor: number | null;
  compareAtMinor: number | null;
  initialStock: number;
  lowStockThreshold: number;
  existing?: VariantDto;
}

interface Draft {
  name: string;
  description: string;
  categoryId: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'UNAVAILABLE';
  hasOptions: boolean;
  options: Array<{ key: string; name: string }>;
  variants: VariantDraft[];
}

let keySeq = 0;
const nextKey = () => `k${++keySeq}`;

const emptyVariant = (price: number | null = null): VariantDraft => ({
  key: nextKey(),
  sku: '',
  optionValues: {},
  priceMinor: price,
  compareAtMinor: null,
  initialStock: 0,
  lowStockThreshold: 3,
});

function fromProduct(p: ProductDetail): Draft {
  return {
    name: p.name,
    description: p.description,
    categoryId: p.categoryId,
    status: p.status === 'ARCHIVED' ? 'INACTIVE' : p.status,
    hasOptions: p.optionNames.length > 0,
    options: p.optionNames.map((name) => ({ key: nextKey(), name })),
    variants: p.variants.map((v) => ({
      key: v.id,
      id: v.id,
      sku: v.sku,
      optionValues: { ...v.optionValues },
      priceMinor: v.priceMinor,
      compareAtMinor: v.compareAtMinor,
      initialStock: 0,
      lowStockThreshold: v.lowStockThreshold,
      existing: v,
    })),
  };
}

const NEW_DRAFT = (): Draft => ({
  name: '',
  description: '',
  categoryId: null,
  status: 'ACTIVE',
  hasOptions: false,
  options: [],
  variants: [emptyVariant()],
});

function toInput(d: Draft): ProductInput {
  const optionNames = d.hasOptions ? d.options.map((o) => o.name.trim()) : [];
  const variants = d.hasOptions ? d.variants : d.variants.slice(0, 1);
  return {
    name: d.name,
    description: d.description,
    categoryId: d.categoryId,
    status: d.status,
    optionNames,
    variants: variants.map((v) => ({
      id: v.id,
      sku: v.sku.trim(),
      optionValues: d.hasOptions
        ? Object.fromEntries(optionNames.map((n) => [n, (v.optionValues[n] ?? '').trim()]))
        : {},
      priceMinor: v.priceMinor as number,
      compareAtMinor: v.compareAtMinor,
      initialStock: v.id ? 0 : v.initialStock,
      lowStockThreshold: v.lowStockThreshold,
    })),
  };
}

/** AI-suggested fields are tinted violet until the owner edits them (BUILD_PLAN §2.3). */
function AiHint({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <Badge tone="ai" size="sm">
      <Sparkles /> Suggested
    </Badge>
  );
}
const aiRing = (on: boolean) =>
  on ? 'border-ai/50 bg-ai-soft/40 focus-visible:border-ai focus-visible:ring-ai/15' : '';

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

export function ProductEditor({ productId }: { productId?: string }) {
  const { data: product, isPending, isError } = useProduct(productId);
  if (productId && isError) {
    return (
      <Alert tone="danger" title="Product not found">
        It may have been deleted.{' '}
        <Link href="/admin/products" className="font-medium underline">
          Back to products
        </Link>
      </Alert>
    );
  }
  if (productId && (isPending || !product)) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-12 w-72" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Skeleton className="h-[36rem] rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }
  return <EditorForm key={product?.updatedAt ?? 'new'} product={product} />;
}

function EditorForm({ product }: { product?: ProductDetail }) {
  const router = useRouter();
  const params = useSearchParams();
  const isNew = !product;
  const archived = product?.status === 'ARCHIVED';
  const currency = product?.currency ?? 'ZMW';

  const initial = useMemo(() => (product ? fromProduct(product) : NEW_DRAFT()), [product]);
  const [draft, setDraft] = useState<Draft>(initial);
  const [suggested, setSuggested] = useState<Set<string>>(new Set());
  const errors = useFormErrors();
  const save = useSaveProduct();
  const action = useProductAction();
  const [confirm, setConfirm] = useState<'delete' | 'archive' | null>(null);
  const [adjust, setAdjust] = useState<AdjustTarget | null>(null);

  // Images: an existing product uploads immediately; a new one keeps files until it is created.
  const preview = usePreviewUrls();
  const imageActions = useImageActions(product?.id);
  const [pending, setPending] = useState<Extract<ImageItem, { kind: 'pending' }>[]>([]);
  const [uploading, setUploading] = useState<Extract<ImageItem, { kind: 'uploading' }>[]>([]);
  const images: ImageItem[] = [
    ...(product?.images ?? []).map((image) => ({ key: image.id, kind: 'saved' as const, image })),
    ...pending,
    ...uploading,
  ];

  const dirty =
    JSON.stringify(toInput(draft)) !== JSON.stringify(toInput(initial)) || pending.length > 0;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  function update(patch: Partial<Draft>, field?: string) {
    setDraft((d) => ({ ...d, ...patch }));
    if (field) {
      errors.clear(field);
      setSuggested((s) => {
        if (!s.has(field)) return s;
        const next = new Set(s);
        next.delete(field);
        return next;
      });
    }
  }

  function updateVariant(key: string, patch: Partial<VariantDraft>, field?: string) {
    setDraft((d) => ({
      ...d,
      variants: d.variants.map((v) => (v.key === key ? { ...v, ...patch } : v)),
    }));
    if (field) {
      const index = draft.variants.findIndex((v) => v.key === key);
      errors.clear(`variants.${index}.${field}`);
      if (index === 0)
        setSuggested((s) => (s.has(field) ? new Set([...s].filter((x) => x !== field)) : s));
    }
  }

  function toggleOptions(on: boolean) {
    setDraft((d) => {
      if (on)
        return {
          ...d,
          hasOptions: true,
          options: d.options.length ? d.options : [{ key: nextKey(), name: 'Size' }],
        };
      return { ...d, hasOptions: false, variants: d.variants.slice(0, 1) };
    });
    errors.clear();
  }

  function renameOption(key: string, name: string) {
    setDraft((d) => {
      const old = d.options.find((o) => o.key === key)!.name;
      return {
        ...d,
        options: d.options.map((o) => (o.key === key ? { ...o, name } : o)),
        variants: d.variants.map((v) => {
          const { [old]: value, ...rest } = v.optionValues;
          return { ...v, optionValues: value === undefined ? rest : { ...rest, [name]: value } };
        }),
      };
    });
    errors.clear();
  }

  function removeOption(key: string) {
    setDraft((d) => {
      const name = d.options.find((o) => o.key === key)!.name;
      const options = d.options.filter((o) => o.key !== key);
      return {
        ...d,
        hasOptions: options.length > 0,
        options,
        variants: (options.length ? d.variants : d.variants.slice(0, 1)).map((v) => {
          const { [name]: _drop, ...rest } = v.optionValues;
          return { ...v, optionValues: rest };
        }),
      };
    });
  }

  function addVariant(copyFrom?: VariantDraft) {
    setDraft((d) => {
      const last = copyFrom ?? d.variants.at(-1);
      const v = emptyVariant(last?.priceMinor ?? null);
      if (copyFrom)
        Object.assign(v, {
          optionValues: { ...copyFrom.optionValues },
          compareAtMinor: copyFrom.compareAtMinor,
        });
      return { ...d, variants: [...d.variants, v] };
    });
  }

  function applySnap(s: SnapSuggestion) {
    const fields = new Set<string>();
    setDraft((d) => {
      const variants = [...d.variants];
      const first = { ...variants[0]! };
      if (s.priceMinor !== null) {
        first.priceMinor = s.priceMinor;
        fields.add('priceMinor');
      }
      if (s.quantity !== null && !first.id) {
        first.initialStock = s.quantity;
        fields.add('initialStock');
      }
      variants[0] = first;
      if (s.name) fields.add('name');
      if (s.description) fields.add('description');
      if (s.categoryId) fields.add('categoryId');
      return {
        ...d,
        name: s.name || d.name,
        description: s.description || d.description,
        categoryId: s.categoryId ?? d.categoryId,
        variants,
      };
    });
    setSuggested(fields);
    errors.clear();
  }

  async function addImages(files: File[]) {
    if (isNew) {
      setPending((p) => [
        ...p,
        ...files.map((file) => ({
          key: nextKey(),
          kind: 'pending' as const,
          file,
          url: preview(file),
        })),
      ]);
      return;
    }
    const placeholders = files.map((file) => ({
      key: nextKey(),
      kind: 'uploading' as const,
      url: preview(file),
    }));
    setUploading((u) => [...u, ...placeholders]);
    try {
      await imageActions.upload.mutateAsync(files);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Upload failed');
    } finally {
      setUploading((u) => u.filter((x) => !placeholders.includes(x)));
    }
  }

  function removeImage(key: string) {
    if (pending.some((p) => p.key === key)) setPending((p) => p.filter((x) => x.key !== key));
    else
      imageActions.remove.mutate(key, { onError: () => toast.error('Couldn’t remove the photo') });
  }

  function moveImage(key: string, to: number) {
    if (isNew) {
      setPending((p) => {
        const next = [...p];
        const from = next.findIndex((x) => x.key === key);
        next.splice(to, 0, ...next.splice(from, 1));
        return next;
      });
      return;
    }
    const ids = (product?.images ?? []).map((i) => i.id);
    ids.splice(to, 0, ...ids.splice(ids.indexOf(key), 1));
    imageActions.reorder.mutate(ids);
  }

  async function onSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const input = errors.validate(productInputSchema, toInput(draft));
    if (!input) {
      toast.error('Please check the highlighted fields');
      return;
    }
    try {
      const saved = await save.mutateAsync({ id: product?.id, input: toInput(draft) });
      if (isNew) {
        if (pending.length) {
          try {
            await uploadImages(
              saved.id,
              pending.map((p) => p.file),
            );
          } catch (err) {
            toast.error('Product saved, but the photos didn’t upload', {
              description: err instanceof ApiRequestError ? err.message : undefined,
            });
          }
        }
        setPending([]);
        dirtyRef.current = false;
        toast.success(`${saved.name} added`);
        router.replace(`/admin/products/${saved.id}`);
      } else {
        toast.success('Changes saved');
      }
    } catch (err) {
      errors.fromError(err);
      toast.error(
        err instanceof ApiRequestError && !Object.keys(err.fields).length
          ? err.message
          : 'Please check the highlighted fields',
      );
    }
  }

  // Cmd/Ctrl+S saves.
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void submitRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function runAction(kind: 'archive' | 'restore' | 'delete') {
    try {
      await action.mutateAsync({ id: product!.id, action: kind });
      setConfirm(null);
      if (kind === 'delete') {
        dirtyRef.current = false;
        toast.success(`${product!.name} deleted`);
        router.replace('/admin/products');
      } else {
        toast.success(kind === 'archive' ? 'Product archived' : 'Product restored as hidden');
      }
    } catch (err) {
      setConfirm(null);
      toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong');
    }
  }

  const f = errors.fields;
  const single = draft.variants[0]!;
  const actions = (
    <>
      <Button type="button" variant="outline" asChild>
        <Link href="/admin/products">Cancel</Link>
      </Button>
      <Button
        type="submit"
        form="product-form"
        loading={save.isPending}
        disabled={archived || (!isNew && !dirty)}
      >
        {isNew ? 'Save product' : 'Save changes'}
      </Button>
    </>
  );

  return (
    <>
      <Link
        href="/admin/products"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Products
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {isNew ? 'New product' : product.name}
            {product && product.status !== 'ACTIVE' && (
              <ProductStatusBadge status={product.status} />
            )}
          </span>
        }
        description={
          isNew
            ? 'Photos, a name and a price are all you need to start.'
            : dirty
              ? 'You have unsaved changes.'
              : undefined
        }
        actions={<div className="hidden gap-2 lg:flex">{actions}</div>}
      />

      {archived && (
        <Alert tone="warning" title="This product is archived" className="mb-6">
          It isn’t shown anywhere. Restore it to make changes.{' '}
          <button
            type="button"
            onClick={() => void runAction('restore')}
            className="font-semibold underline"
          >
            Restore
          </button>
        </Alert>
      )}

      <form
        id="product-form"
        onSubmit={onSubmit}
        noValidate
        className="grid items-start gap-4 pb-24 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:pb-0"
      >
        <fieldset disabled={archived} className="grid min-w-0 gap-4 sm:gap-6">
          {isNew && (
            <SnapPanel
              defaultOpen={params.get('snap') === '1'}
              onResult={applySnap}
              onPhoto={(file) => void addImages([file])}
            />
          )}

          <Card>
            <CardHeader>
              <CardTitle>Photos</CardTitle>
            </CardHeader>
            <CardContent>
              <ImageManager
                items={images}
                onAdd={(files) => void addImages(files)}
                onRemove={removeImage}
                onMove={moveImage}
                disabled={archived}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5">
              <Field label="Name" error={f.name} action={<AiHint show={suggested.has('name')} />}>
                <Input
                  value={draft.name}
                  onChange={(e) => update({ name: e.target.value }, 'name')}
                  placeholder="e.g. Blue chitenge"
                  maxLength={120}
                  className={aiRing(suggested.has('name'))}
                />
              </Field>
              <Field
                label="Description"
                error={f.description}
                hint={`${draft.description.length}/5000 · Shown in your shop and used by the assistant to answer questions.`}
                action={<AiHint show={suggested.has('description')} />}
              >
                <Textarea
                  value={draft.description}
                  onChange={(e) => update({ description: e.target.value }, 'description')}
                  placeholder="Material, size, what’s included…"
                  maxLength={5000}
                  className={aiRing(suggested.has('description'))}
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>
                  {draft.hasOptions ? 'Options and variants' : 'Price and stock'}
                </CardTitle>
                <CardDescription>
                  {draft.hasOptions
                    ? 'Each combination is a variant with its own price and stock.'
                    : 'Does it come in sizes or colours?'}
                </CardDescription>
              </div>
              <label className="flex shrink-0 items-center gap-2 text-sm font-medium">
                <span className="hidden sm:inline">Has options</span>
                <Switch
                  checked={draft.hasOptions}
                  onCheckedChange={toggleOptions}
                  aria-label="This product has options like size or colour"
                />
              </label>
            </CardHeader>
            <CardContent className="grid gap-5">
              {!draft.hasOptions ? (
                <>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field
                      label="Price"
                      error={f['variants.0.priceMinor']}
                      action={<AiHint show={suggested.has('priceMinor')} />}
                    >
                      <MoneyInput
                        currency={currency}
                        value={single.priceMinor}
                        onValueChange={(m) =>
                          updateVariant(single.key, { priceMinor: m }, 'priceMinor')
                        }
                        placeholder="0"
                        className={aiRing(suggested.has('priceMinor'))}
                      />
                    </Field>
                    <Field
                      label="Compare-at price"
                      hint="Optional. Shown crossed out."
                      error={f['variants.0.compareAtMinor']}
                    >
                      <MoneyInput
                        currency={currency}
                        value={single.compareAtMinor}
                        onValueChange={(m) =>
                          updateVariant(single.key, { compareAtMinor: m }, 'compareAtMinor')
                        }
                        placeholder="—"
                      />
                    </Field>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-3">
                    <StockField
                      variant={single}
                      index={0}
                      errors={f}
                      suggested={suggested.has('initialStock')}
                      onChange={updateVariant}
                      onAdjust={setAdjust}
                      productName={draft.name}
                    />
                    <Field
                      label="SKU"
                      hint={single.id ? undefined : 'Leave blank to generate'}
                      error={f['variants.0.sku']}
                    >
                      <Input
                        value={single.sku}
                        onChange={(e) => updateVariant(single.key, { sku: e.target.value }, 'sku')}
                        placeholder="Auto"
                        className="uppercase"
                        maxLength={40}
                      />
                    </Field>
                    <Field label="Low-stock alert at">
                      <QuantityInput
                        value={single.lowStockThreshold}
                        onValueChange={(n) => updateVariant(single.key, { lowStockThreshold: n })}
                      />
                    </Field>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid gap-2">
                    <p className="text-sm font-medium">Options</p>
                    <div className="flex flex-wrap gap-2">
                      {draft.options.map((o, i) => (
                        <div key={o.key} className="grid gap-1">
                          <div className="flex items-center gap-1">
                            <Input
                              value={o.name}
                              onChange={(e) => renameOption(o.key, e.target.value)}
                              aria-label={`Option ${i + 1} name`}
                              aria-invalid={!!f[`optionNames.${i}`]}
                              className="h-9 w-36 sm:h-9"
                              maxLength={30}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => removeOption(o.key)}
                              aria-label={`Remove ${o.name || 'option'}`}
                            >
                              <X />
                            </Button>
                          </div>
                          {f[`optionNames.${i}`] && (
                            <p className="text-xs text-danger">{f[`optionNames.${i}`]}</p>
                          )}
                        </div>
                      ))}
                      {draft.options.length < MAX_OPTIONS && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9"
                          onClick={() =>
                            setDraft((d) => ({
                              ...d,
                              options: [
                                ...d.options,
                                {
                                  key: nextKey(),
                                  name: d.options.some((x) => x.name === 'Colour') ? '' : 'Colour',
                                },
                              ],
                            }))
                          }
                        >
                          <Plus /> Add option
                        </Button>
                      )}
                    </div>
                    {f.optionNames && <p className="text-xs text-danger">{f.optionNames}</p>}
                  </div>

                  <ul className="grid gap-3">
                    {draft.variants.map((v, i) => (
                      <li key={v.key} className="rounded-xl border border-border p-4">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold">
                            Variant {i + 1}
                            {v.existing && (
                              <StockBadge
                                state={v.existing.state}
                                available={v.existing.available}
                                className="ml-2 align-middle"
                              />
                            )}
                          </p>
                          <div className="flex gap-1">
                            <Tooltip content="Duplicate">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => addVariant(v)}
                                aria-label="Duplicate variant"
                              >
                                <Copy />
                              </Button>
                            </Tooltip>
                            <Tooltip
                              content={
                                v.existing?.hasOrders
                                  ? 'Has orders – set its stock to 0 instead'
                                  : 'Remove'
                              }
                            >
                              <span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  disabled={draft.variants.length === 1 || v.existing?.hasOrders}
                                  onClick={() =>
                                    setDraft((d) => ({
                                      ...d,
                                      variants: d.variants.filter((x) => x.key !== v.key),
                                    }))
                                  }
                                  aria-label="Remove variant"
                                >
                                  <Trash2 />
                                </Button>
                              </span>
                            </Tooltip>
                          </div>
                        </div>
                        {f[`variants.${i}.optionValues`] && (
                          <p className="mb-3 text-xs text-danger">
                            {f[`variants.${i}.optionValues`]}
                          </p>
                        )}
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {draft.options.map((o) => (
                            <Field
                              key={o.key}
                              label={o.name || 'Option'}
                              error={f[`variants.${i}.optionValues.${o.name}`]}
                            >
                              <Input
                                value={v.optionValues[o.name] ?? ''}
                                onChange={(e) =>
                                  updateVariant(
                                    v.key,
                                    {
                                      optionValues: { ...v.optionValues, [o.name]: e.target.value },
                                    },
                                    `optionValues.${o.name}`,
                                  )
                                }
                                placeholder={
                                  o.name === 'Size'
                                    ? 'e.g. M'
                                    : o.name === 'Colour'
                                      ? 'e.g. Red'
                                      : ''
                                }
                                maxLength={40}
                              />
                            </Field>
                          ))}
                          <Field
                            label="Price"
                            error={f[`variants.${i}.priceMinor`]}
                            action={
                              i === 0 ? <AiHint show={suggested.has('priceMinor')} /> : undefined
                            }
                          >
                            <MoneyInput
                              currency={currency}
                              value={v.priceMinor}
                              onValueChange={(m) =>
                                updateVariant(v.key, { priceMinor: m }, 'priceMinor')
                              }
                              className={aiRing(i === 0 && suggested.has('priceMinor'))}
                            />
                          </Field>
                          <Field label="Compare-at" error={f[`variants.${i}.compareAtMinor`]}>
                            <MoneyInput
                              currency={currency}
                              value={v.compareAtMinor}
                              onValueChange={(m) =>
                                updateVariant(v.key, { compareAtMinor: m }, 'compareAtMinor')
                              }
                              placeholder="—"
                            />
                          </Field>
                          <StockField
                            variant={v}
                            index={i}
                            errors={f}
                            suggested={i === 0 && suggested.has('initialStock')}
                            onChange={updateVariant}
                            onAdjust={setAdjust}
                            productName={draft.name}
                          />
                          <Field label="SKU" error={f[`variants.${i}.sku`]}>
                            <Input
                              value={v.sku}
                              onChange={(e) => updateVariant(v.key, { sku: e.target.value }, 'sku')}
                              placeholder="Auto"
                              className="uppercase"
                              maxLength={40}
                            />
                          </Field>
                          <Field label="Low-stock alert at">
                            <QuantityInput
                              value={v.lowStockThreshold}
                              onValueChange={(n) => updateVariant(v.key, { lowStockThreshold: n })}
                            />
                          </Field>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => addVariant()}
                    className="justify-self-start"
                  >
                    <Plus /> Add variant
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </fieldset>

        <aside className="grid gap-4 sm:gap-6 lg:sticky lg:top-24">
          <Card>
            <CardHeader>
              <CardTitle>Visibility</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5">
              <Field label="Status">
                <Select
                  value={draft.status}
                  onValueChange={(v) => update({ status: v as Draft['status'] })}
                  options={STATUS_OPTIONS}
                  disabled={archived}
                />
              </Field>
              <CategoryField
                value={draft.categoryId}
                onChange={(id) => update({ categoryId: id }, 'categoryId')}
                error={f.categoryId}
                suggested={suggested.has('categoryId')}
                disabled={archived}
              />
            </CardContent>
          </Card>

          {product && (
            <Card>
              <CardHeader>
                <CardTitle>Manage</CardTitle>
                <CardDescription>
                  Added {new Date(product.createdAt).toLocaleDateString()} · updated{' '}
                  {new Date(product.updatedAt).toLocaleDateString()}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                <Button type="button" variant="outline" asChild className="justify-start">
                  <Link href={`/admin/stock?q=${encodeURIComponent(product.name)}`}>
                    <SlidersHorizontal /> Stock history
                  </Link>
                </Button>
                {archived ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-start"
                    onClick={() => void runAction('restore')}
                    loading={action.isPending}
                  >
                    <ArchiveRestore /> Restore
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-start"
                    onClick={() => setConfirm('archive')}
                  >
                    <Archive /> Archive
                  </Button>
                )}
                <Tooltip
                  content={
                    product.hasOrders
                      ? 'Products with orders can only be archived'
                      : 'Delete permanently'
                  }
                >
                  <span className="grid">
                    <Button
                      type="button"
                      variant="ghost"
                      className="justify-start text-danger hover:bg-danger-soft"
                      onClick={() => setConfirm('delete')}
                      disabled={product.hasOrders}
                    >
                      <Trash2 /> Delete
                    </Button>
                  </span>
                </Tooltip>
              </CardContent>
            </Card>
          )}
        </aside>
      </form>

      {/* Phones: save bar above the tab bar (BUILD_PLAN §2.1 thumb zone). */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur-lg lg:hidden">
        <div className="mx-auto flex max-w-lg gap-2 [&>*]:flex-1">{actions}</div>
      </div>

      <AdjustStockDialog target={adjust} onOpenChange={(o) => !o && setAdjust(null)} />
      <ConfirmDialog
        open={confirm === 'archive'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Archive ${product?.name}?`}
        description="It disappears from your shop and the assistant, but its orders and history are kept. You can restore it later."
        confirmLabel="Archive"
        tone="primary"
        loading={action.isPending}
        onConfirm={() => void runAction('archive')}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Delete ${product?.name}?`}
        description="This permanently removes the product, its photos and its stock history. This can’t be undone."
        confirmLabel="Delete product"
        loading={action.isPending}
        onConfirm={() => void runAction('delete')}
      />
    </>
  );
}

function StockField({
  variant: v,
  index,
  errors,
  suggested,
  onChange,
  onAdjust,
  productName,
}: {
  variant: VariantDraft;
  index: number;
  errors: Record<string, string>;
  suggested: boolean;
  onChange: (key: string, patch: Partial<VariantDraft>, field?: string) => void;
  onAdjust: (t: AdjustTarget) => void;
  productName: string;
}) {
  if (!v.existing) {
    return (
      <Field
        label="Starting stock"
        error={errors[`variants.${index}.initialStock`]}
        action={<AiHint show={suggested} />}
      >
        <QuantityInput
          value={v.initialStock}
          onValueChange={(n) => onChange(v.key, { initialStock: n }, 'initialStock')}
          className={cn(suggested && 'border-ai/50 bg-ai-soft/40')}
        />
      </Field>
    );
  }
  const e = v.existing;
  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">Stock</span>
      <div className="flex h-11 items-center justify-between gap-2 rounded-lg border border-border bg-muted/50 pl-3.5 pr-1.5 sm:h-10">
        <span className="text-sm tabular">
          <strong>{e.onHand}</strong> on hand
          {e.reserved > 0 && (
            <span className="text-muted-foreground"> · {e.reserved} reserved</span>
          )}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8"
          onClick={() =>
            onAdjust({
              variantId: e.id,
              title: productName,
              subtitle: e.label === 'Default' ? undefined : e.label,
              onHand: e.onHand,
              reserved: e.reserved,
            })
          }
        >
          Adjust
        </Button>
      </div>
    </div>
  );
}

function CategoryField({
  value,
  onChange,
  error,
  suggested,
  disabled,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  error?: string;
  suggested: boolean;
  disabled?: boolean;
}) {
  const { data } = useCategories();
  const { create } = useCategoryActions();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const options = [
    { value: 'none', label: 'No category' },
    ...(data ?? [])
      .filter((c) => !c.archived || c.id === value)
      .map((c) => ({ value: c.id, label: c.name })),
  ];

  async function add(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      const c = await create.mutateAsync(name.trim());
      onChange(c.id);
      setName('');
      setOpen(false);
    } catch (err) {
      setCreateError(
        err instanceof ApiRequestError
          ? (err.fields.name ?? err.message)
          : 'Couldn’t create category',
      );
    }
  }

  return (
    <Field
      label="Category"
      error={error}
      action={
        suggested ? (
          <AiHint show />
        ) : (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
              className="text-sm font-medium text-primary hover:underline"
              disabled={disabled}
            >
              New
            </PopoverTrigger>
            <PopoverContent align="end">
              <div className="grid gap-3">
                <p className="text-sm font-medium">New category</p>
                <Input
                  autoFocus
                  value={name}
                  onChange={(e) => (setName(e.target.value), setCreateError(null))}
                  onKeyDown={(e) => e.key === 'Enter' && void add(e)}
                  placeholder="e.g. Shoes"
                  maxLength={60}
                  aria-invalid={!!createError}
                />
                {createError && <p className="text-xs text-danger">{createError}</p>}
                <Button
                  type="button"
                  size="sm"
                  onClick={(e) => void add(e)}
                  loading={create.isPending}
                  disabled={!name.trim()}
                >
                  Create
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        )
      }
    >
      <Select
        value={value ?? 'none'}
        onValueChange={(v) => onChange(v === 'none' ? null : v)}
        options={options}
        disabled={disabled}
        className={aiRing(suggested)}
      />
    </Field>
  );
}
