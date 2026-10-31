'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './button';

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  className,
  noun = 'items',
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
  noun?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav
      aria-label="Pagination"
      className={cn('flex items-center justify-between gap-3 text-sm', className)}
    >
      <p className="text-muted-foreground tabular">
        {from}–{to} of {total} {noun}
      </p>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-14 text-center tabular">
            {page} / {pages}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pages}
            aria-label="Next page"
          >
            <ChevronRight />
          </Button>
        </div>
      )}
    </nav>
  );
}
