import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IS_PUBLIC } from '../src/common/public.decorator.js';
import { startTestApp, type TestApp } from './helpers.js';

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t.close();
});

interface Route {
  method: string;
  path: string;
  isPublic: boolean;
}

/** Every route Nest knows about, read from controller metadata. */
function allRoutes(): Route[] {
  const discovery = t.app.get(DiscoveryService);
  const scanner = t.app.get(MetadataScanner);
  const reflector = t.app.get(Reflector);
  const routes: Route[] = [];
  for (const wrapper of discovery.getControllers()) {
    const instance = wrapper.instance as object;
    const ctrl = wrapper.metatype as object;
    const prefix = [Reflect.getMetadata(PATH_METADATA, ctrl) as string | string[]].flat()[0] ?? '';
    const proto = Object.getPrototypeOf(instance) as object;
    for (const name of scanner.getAllMethodNames(proto)) {
      const handler = (proto as Record<string, unknown>)[name] as object;
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      if (path === undefined) continue;
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number]!;
      const full = ['/api', prefix, path]
        .filter((p) => p && p !== '/')
        .join('/')
        .replace(/\/+/g, '/');
      routes.push({
        method,
        path: full,
        isPublic: !!reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
          handler as () => void,
          ctrl as () => void,
        ]),
      });
    }
  }
  return routes;
}

describe('default-deny auth', () => {
  it('discovers the routes', () => {
    const routes = allRoutes();
    expect(routes.length).toBeGreaterThan(5);
    expect(
      routes
        .filter((r) => r.isPublic)
        .map((r) => `${r.method} ${r.path}`)
        .sort(),
    ).toEqual([
      'GET /api/files',
      'GET /api/health',
      'GET /api/store/categories',
      'GET /api/store/info',
      'GET /api/store/orders/:ref',
      'GET /api/store/products',
      'GET /api/store/products/:slug',
      'GET /api/test-payments/:linkId',
      'POST /api/admin/auth/forgot-password',
      'POST /api/admin/auth/login',
      'POST /api/admin/auth/reset-password',
      'POST /api/internal/wa/events',
      'POST /api/internal/wa/media',
      'POST /api/store/cart/price',
      'POST /api/store/checkout',
      'POST /api/test-payments/:linkId/:outcome',
      'POST /api/webhooks/devdraft',
    ]);
  });

  it('returns 401 for every non-public route without a session', async () => {
    const protectedRoutes = allRoutes().filter((r) => !r.isPublic);
    for (const route of protectedRoutes) {
      const path = route.path.replace(/:(\w+)/g, 'x');
      const res = await t.http()[route.method.toLowerCase() as 'get'](path).send({});
      expect(res.status, `${route.method} ${route.path}`).toBe(401);
    }
  });
});
