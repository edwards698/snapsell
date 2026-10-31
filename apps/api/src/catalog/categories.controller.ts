import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { type CategoryInput, categoryInputSchema, categoryOrderSchema } from '@snapsell/shared';
import { z } from 'zod';
import { Auth } from '../auth/auth.decorator.js';
import { type AuthContext } from '../auth/auth.types.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { CategoriesService } from './categories.service.js';

@Controller('admin/categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list() {
    return this.categories.list();
  }

  @Post()
  create(@Body(new ZodPipe(categoryInputSchema)) body: CategoryInput, @Auth() auth: AuthContext) {
    return this.categories.create(body.name, auth.user.id);
  }

  @Put('order')
  reorder(@Body(new ZodPipe(categoryOrderSchema)) body: z.infer<typeof categoryOrderSchema>) {
    return this.categories.reorder(body.ids);
  }

  @Patch(':id')
  rename(
    @Param('id') id: string,
    @Body(new ZodPipe(categoryInputSchema)) body: CategoryInput,
    @Auth() auth: AuthContext,
  ) {
    return this.categories.rename(id, body.name, auth.user.id);
  }

  @Post(':id/archive')
  @HttpCode(200)
  archive(@Param('id') id: string, @Auth() auth: AuthContext) {
    return this.categories.setArchived(id, true, auth.user.id);
  }

  @Post(':id/restore')
  @HttpCode(200)
  restore(@Param('id') id: string, @Auth() auth: AuthContext) {
    return this.categories.setArchived(id, false, auth.user.id);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@Param('id') id: string, @Auth() auth: AuthContext) {
    this.categories.delete(id, auth.user.id);
  }
}
