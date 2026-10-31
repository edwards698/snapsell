import { Global, Module } from '@nestjs/common';
import { JobQueue } from './job-queue.js';
import { JobWorker } from './job-worker.js';

@Global()
@Module({ providers: [JobQueue, JobWorker], exports: [JobQueue, JobWorker] })
export class JobsModule {}
