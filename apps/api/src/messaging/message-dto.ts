import type { messages } from '@snapsell/db';
import { DeliveryState, type MessageDto } from '@snapsell/shared';
import type { FileStore } from '../files/file-store.js';

/** Signed media links last an hour so an open inbox keeps working. */
const MEDIA_URL_TTL_SECONDS = 60 * 60;

export function toMessageDto(row: typeof messages.$inferSelect, files: FileStore): MessageDto {
  const state = DeliveryState.safeParse(row.deliveryState);
  return {
    id: row.id,
    conversationId: row.conversationId,
    direction: row.direction,
    author: row.author,
    type: row.type,
    body: row.body,
    media: row.media
      ? {
          mime: row.media.mime,
          size: row.media.size,
          url:
            row.media.fileKey && files.isValidKey(row.media.fileKey)
              ? files.signedUrl(row.media.fileKey, MEDIA_URL_TTL_SECONDS)
              : null,
        }
      : null,
    quotedProviderMessageId: row.quotedProviderMessageId,
    deliveryState: state.success ? state.data : null,
    aiDraftStatus: row.aiDraftStatus,
    createdAt: row.createdAt.toISOString(),
  };
}
