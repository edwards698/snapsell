import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'snapsell:isPublic';

/** Opts a route out of the default-deny AuthGuard. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
