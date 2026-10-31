import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/public.decorator.js';
import { SystemService } from './system.service.js';

@Controller()
export class SystemController {
  constructor(private readonly system: SystemService) {}

  /** Public shop identity for the storefront shell. */
  @Public()
  @Get('store/info')
  storeInfo() {
    return this.system.storeInfo();
  }

  @Public()
  @Get('health')
  health() {
    return this.system.health();
  }

  @Get('admin/system')
  status() {
    return this.system.status();
  }

  @Get('admin/overview')
  overview() {
    return this.system.overview();
  }
}
