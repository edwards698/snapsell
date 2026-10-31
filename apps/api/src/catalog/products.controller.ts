import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  imageAltSchema,
  imageOrderSchema,
  MAX_IMAGES_PER_PRODUCT,
  type ProductInputParsed,
  productInputSchema,
  type ProductListQuery,
  productListQuerySchema,
  snapInputSchema,
} from '@snapsell/shared';
import { z } from 'zod';
import { Auth } from '../auth/auth.decorator.js';
import { type AuthContext } from '../auth/auth.types.js';
import { ApiError } from '../common/errors.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { ProductImageService } from './product-images.service.js';
import { ProductsService } from './products.service.js';
import { SnapService } from './snap.service.js';

@Controller('admin/products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly images: ProductImageService,
    private readonly snap: SnapService,
  ) {}

  @Get()
  list(@Query(new ZodPipe(productListQuerySchema)) query: ProductListQuery) {
    return this.products.list(query);
  }

  @Post()
  create(
    @Body(new ZodPipe(productInputSchema)) body: ProductInputParsed,
    @Auth() auth: AuthContext,
  ) {
    return this.products.create(body, auth.user.id);
  }

  /** Photo and/or voice note → suggested product details. Nothing is stored. */
  @Post('snap')
  @HttpCode(200)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'image', maxCount: 1 },
      { name: 'audio', maxCount: 1 },
    ]),
  )
  suggest(
    @UploadedFiles()
    files: { image?: Express.Multer.File[]; audio?: Express.Multer.File[] } | undefined,
    @Body(new ZodPipe(snapInputSchema)) body: z.infer<typeof snapInputSchema>,
    @Auth() auth: AuthContext,
  ) {
    return this.snap.suggest(
      { image: files?.image?.[0]?.buffer, audio: files?.audio?.[0]?.buffer, note: body.note },
      auth.user.id,
    );
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.products.get(id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodPipe(productInputSchema)) body: ProductInputParsed,
    @Auth() auth: AuthContext,
  ) {
    return this.products.update(id, body, auth.user.id);
  }

  @Post(':id/archive')
  @HttpCode(200)
  archive(@Param('id') id: string, @Auth() auth: AuthContext) {
    return this.products.setArchived(id, true, auth.user.id);
  }

  @Post(':id/restore')
  @HttpCode(200)
  restore(@Param('id') id: string, @Auth() auth: AuthContext) {
    return this.products.setArchived(id, false, auth.user.id);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id') id: string, @Auth() auth: AuthContext) {
    await this.products.delete(id, auth.user.id);
  }

  @Post(':id/images')
  @UseInterceptors(FilesInterceptor('files', MAX_IMAGES_PER_PRODUCT))
  addImages(@Param('id') id: string, @UploadedFiles() files: Express.Multer.File[] | undefined) {
    this.products.assertExists(id);
    if (!files?.length)
      throw new ApiError(HttpStatus.BAD_REQUEST, 'NO_FILES', 'Choose at least one photo.');
    return this.images.add(
      id,
      files.map((f) => f.buffer),
    );
  }

  @Put(':id/images/order')
  reorderImages(
    @Param('id') id: string,
    @Body(new ZodPipe(imageOrderSchema)) body: z.infer<typeof imageOrderSchema>,
  ) {
    return this.images.reorder(id, body.ids);
  }

  @Patch(':id/images/:imageId')
  setAlt(
    @Param('id') id: string,
    @Param('imageId') imageId: string,
    @Body(new ZodPipe(imageAltSchema)) body: z.infer<typeof imageAltSchema>,
  ) {
    return this.images.setAlt(id, imageId, body.alt);
  }

  @Delete(':id/images/:imageId')
  removeImage(@Param('id') id: string, @Param('imageId') imageId: string) {
    return this.images.remove(id, imageId);
  }
}
