import { Global, Module } from '@nestjs/common';
import { FileStore } from './file-store.js';
import { FilesController } from './files.controller.js';

@Global()
@Module({ providers: [FileStore], controllers: [FilesController], exports: [FileStore] })
export class FilesModule {}
