import { Body, Controller, Get, Inject, Put } from '@nestjs/common';
import { businessSettings, type DatabaseHandle } from '@snapsell/db';
import { type ShopSettings, type ShopSettingsInput, shopSettingsSchema } from '@snapsell/shared';
import { eq } from 'drizzle-orm';
import { Auth } from '../auth/auth.decorator.js';
import { type AuthContext } from '../auth/auth.types.js';
import { AuditService } from '../common/audit.service.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { DATABASE } from '../database/database.module.js';

@Controller('admin/settings/shop')
export class ShopSettingsController {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    private readonly audit: AuditService,
  ) {}

  @Get()
  get(): ShopSettings {
    const s = this.handle.db.select().from(businessSettings).get()!;
    return {
      name: s.name,
      address: s.address ?? '',
      currency: s.currency,
      deliveryEnabled: s.deliveryEnabled,
      deliveryFeeMinor: s.deliveryFeeMinor,
      collectionEnabled: s.collectionEnabled,
      reservationTtlMinutes: s.reservationTtlMinutes,
    };
  }

  @Put()
  update(
    @Body(new ZodPipe(shopSettingsSchema)) body: ShopSettingsInput,
    @Auth() auth: AuthContext,
  ): ShopSettings {
    const before = this.get();
    this.handle.db.update(businessSettings).set(body).where(eq(businessSettings.id, 1)).run();
    this.audit.record({
      actor: 'OWNER',
      actorId: auth.user.id,
      action: 'settings.shop_updated',
      entity: 'business_settings',
      before,
      after: body,
    });
    return this.get();
  }
}
