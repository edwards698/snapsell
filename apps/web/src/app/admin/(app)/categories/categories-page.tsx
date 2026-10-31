'use client';

import type { CategoryDto } from '@snapsell/shared';
import {
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Input,
  Skeleton,
  toast,
} from '@snapsell/ui';
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Ellipsis,
  Pencil,
  Plus,
  Tags,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { ApiRequestError } from '@/lib/api';
import { useCategories, useCategoryActions } from '@/lib/catalog';

const message = (err: unknown) =>
  err instanceof ApiRequestError
    ? (Object.values(err.fields)[0] ?? err.message)
    : 'Something went wrong';

function Row({
  c,
  index,
  count,
  onMove,
  onDelete,
}: {
  c: CategoryDto;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onDelete: (c: CategoryDto) => void;
}) {
  const actions = useCategoryActions();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(c.name);

  async function rename() {
    if (name.trim() === c.name || !name.trim()) return setEditing(false);
    try {
      await actions.rename.mutateAsync({ id: c.id, name: name.trim() });
      setEditing(false);
    } catch (err) {
      toast.error(message(err));
    }
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground">
        <Tags className="size-4" />
      </span>
      {editing ? (
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void rename();
          }}
        >
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void rename()}
            onKeyDown={(e) => e.key === 'Escape' && (setName(c.name), setEditing(false))}
            maxLength={60}
            className="h-9 sm:h-9"
            aria-label="Category name"
          />
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="min-w-0 flex-1 text-left"
          disabled={c.archived}
        >
          <span className="block truncate text-sm font-medium">{c.name}</span>
          <Link
            href={`/admin/products?category=${c.id}`}
            className="text-xs text-muted-foreground hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {c.productCount} {c.productCount === 1 ? 'product' : 'products'}
          </Link>
        </button>
      )}
      {!c.archived && (
        <div className="hidden gap-1 sm:flex">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={index === 0}
            onClick={() => onMove(index, index - 1)}
            aria-label={`Move ${c.name} up`}
          >
            <ArrowUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={index === count - 1}
            onClick={() => onMove(index, index + 1)}
            aria-label={`Move ${c.name} down`}
          >
            <ArrowDown />
          </Button>
        </div>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          aria-label={`${c.name} options`}
        >
          <Ellipsis className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!c.archived && (
            <>
              <DropdownMenuItem onSelect={() => setEditing(true)}>
                <Pencil /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onMove(index, index - 1)}
                disabled={index === 0}
                className="sm:hidden"
              >
                <ArrowUp /> Move up
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onMove(index, index + 1)}
                disabled={index === count - 1}
                className="sm:hidden"
              >
                <ArrowDown /> Move down
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem
            onSelect={() =>
              actions.archive.mutate(
                { id: c.id, archived: !c.archived },
                {
                  onSuccess: () =>
                    toast.success(c.archived ? `${c.name} restored` : `${c.name} archived`),
                  onError: (e) => toast.error(message(e)),
                },
              )
            }
          >
            {c.archived ? <ArchiveRestore /> : <Archive />} {c.archived ? 'Restore' : 'Archive'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem tone="danger" onSelect={() => onDelete(c)}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

export function CategoriesPage() {
  const { data, isPending } = useCategories();
  const actions = useCategoryActions();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [deleting, setDeleting] = useState<CategoryDto | null>(null);
  const active = (data ?? []).filter((c) => !c.archived);
  const archived = (data ?? []).filter((c) => c.archived);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await actions.create.mutateAsync(name.trim());
      setName('');
    } catch (err) {
      setError(message(err));
    }
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= active.length) return;
    const ids = active.map((c) => c.id);
    ids.splice(to, 0, ...ids.splice(from, 1));
    actions.reorder.mutate([...ids, ...archived.map((c) => c.id)]);
  }

  return (
    <>
      <PageHeader
        title="Categories"
        description="Group products so customers can browse your shop. The order here is the order in your shop."
      />
      <Card className="overflow-hidden">
        <CardContent className="border-b border-border">
          <form onSubmit={add} className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => (setName(e.target.value), setError(null))}
              placeholder="New category, e.g. Shoes"
              maxLength={60}
              aria-label="New category name"
              aria-invalid={!!error}
            />
            <Button type="submit" loading={actions.create.isPending} disabled={!name.trim()}>
              <Plus /> Add
            </Button>
          </form>
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        </CardContent>
        {isPending ? (
          <div className="grid gap-3 p-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : active.length === 0 ? (
          <EmptyState
            icon={Tags}
            title="No categories yet"
            description="Add a few, like “Clothing” or “Shoes”, to make your shop easier to browse."
          />
        ) : (
          <ul className="divide-y divide-border">
            {active.map((c, i) => (
              <Row
                key={c.id}
                c={c}
                index={i}
                count={active.length}
                onMove={move}
                onDelete={setDeleting}
              />
            ))}
          </ul>
        )}
      </Card>

      {archived.length > 0 && (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowArchived((s) => !s)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={showArchived ? 'size-4' : 'size-4 -rotate-90'} /> Archived{' '}
            <Badge size="sm">{archived.length}</Badge>
          </button>
          {showArchived && (
            <Card className="mt-3 overflow-hidden">
              <ul className="divide-y divide-border">
                {archived.map((c, i) => (
                  <Row
                    key={c.id}
                    c={c}
                    index={i}
                    count={archived.length}
                    onMove={() => undefined}
                    onDelete={setDeleting}
                  />
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description={
          deleting?.productCount
            ? 'Products still use this category. Move them first, or archive the category instead.'
            : 'This can’t be undone.'
        }
        confirmLabel="Delete"
        loading={actions.remove.isPending}
        onConfirm={() =>
          actions.remove.mutate(deleting!.id, {
            onSuccess: () => (toast.success(`${deleting!.name} deleted`), setDeleting(null)),
            onError: (e) => (toast.error(message(e)), setDeleting(null)),
          })
        }
      />
    </>
  );
}
