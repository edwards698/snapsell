import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { categories, type DatabaseHandle, newId, products } from '@snapsell/db';
import type { CategoryDto } from '@snapsell/shared';
import { and, asc, eq, max, ne, sql } from 'drizzle-orm';
import { AuditService } from '../common/audit.service.js';
import { ApiError } from '../common/errors.js';
import { uniqueSlug } from '../common/slug.js';
import { DATABASE } from '../database/database.module.js';

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    private readonly audit: AuditService,
  ) {}

  list(): CategoryDto[] {
    return this.handle.db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        sortOrder: categories.sortOrder,
        archivedAt: categories.archivedAt,
        // Explicit names: Drizzle drops table qualifiers in single-table selects, which would make
        // "id" resolve to products.id inside the subquery.
        productCount: sql<number>`(select count(*) from products p where p.category_id = "categories"."id" and p.status != 'ARCHIVED')`,
      })
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name))
      .all()
      .map(({ archivedAt, ...c }) => ({ ...c, archived: archivedAt !== null }));
  }

  get(id: string) {
    const row = this.list().find((c) => c.id === id);
    if (!row) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Category not found.');
    return row;
  }

  create(name: string, actorId: string) {
    const { db } = this.handle;
    this.assertNameFree(name);
    const id = newId();
    const next =
      (db
        .select({ m: max(categories.sortOrder) })
        .from(categories)
        .get()?.m ?? -1) + 1;
    db.insert(categories)
      .values({ id, name, slug: this.slugFor(name), sortOrder: next })
      .run();
    this.audit.record({
      actor: 'OWNER',
      actorId,
      action: 'category.created',
      entity: 'category',
      entityId: id,
      after: { name },
    });
    return this.get(id);
  }

  rename(id: string, name: string, actorId: string) {
    const before = this.get(id);
    this.assertNameFree(name, id);
    this.handle.db.update(categories).set({ name }).where(eq(categories.id, id)).run();
    this.audit.record({
      actor: 'OWNER',
      actorId,
      action: 'category.renamed',
      entity: 'category',
      entityId: id,
      before: { name: before.name },
      after: { name },
    });
    return this.get(id);
  }

  setArchived(id: string, archived: boolean, actorId: string) {
    this.get(id);
    this.handle.db
      .update(categories)
      .set({ archivedAt: archived ? new Date() : null })
      .where(eq(categories.id, id))
      .run();
    this.audit.record({
      actor: 'OWNER',
      actorId,
      action: archived ? 'category.archived' : 'category.restored',
      entity: 'category',
      entityId: id,
    });
    return this.get(id);
  }

  reorder(ids: string[]) {
    this.handle.db.transaction((tx) => {
      ids.forEach((id, i) =>
        tx.update(categories).set({ sortOrder: i }).where(eq(categories.id, id)).run(),
      );
    });
    return this.list();
  }

  delete(id: string, actorId: string) {
    const { db } = this.handle;
    this.get(id);
    const used = db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.categoryId, id))
      .get();
    if (used) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'CATEGORY_IN_USE',
        'Products still use this category. Move them to another category or archive it instead.',
      );
    }
    db.delete(categories).where(eq(categories.id, id)).run();
    this.audit.record({
      actor: 'OWNER',
      actorId,
      action: 'category.deleted',
      entity: 'category',
      entityId: id,
    });
  }

  /** Throws unless `id` is an existing, active category (archived ones can't take new products). */
  assertUsable(id: string, currentId?: string | null) {
    const row = this.handle.db.select().from(categories).where(eq(categories.id, id)).get();
    if (!row || (row.archivedAt && id !== currentId)) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        'Please check the highlighted fields.',
        {
          categoryId: 'Choose an active category',
        },
      );
    }
  }

  private assertNameFree(name: string, exceptId?: string) {
    const clash = this.handle.db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          sql`lower(${categories.name}) = lower(${name})`,
          exceptId ? ne(categories.id, exceptId) : sql`1 = 1`,
        ),
      )
      .get();
    if (clash) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'VALIDATION_FAILED',
        'Please check the highlighted fields.',
        {
          name: 'You already have a category with this name',
        },
      );
    }
  }

  private slugFor(name: string) {
    const { db } = this.handle;
    return uniqueSlug(
      name,
      (slug) =>
        !!db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug)).get(),
    );
  }
}
