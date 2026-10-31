import { expect, type Page, test } from '@playwright/test';
import { E2E_OWNER } from '../playwright.config';

/** Creates a product (and sets a delivery fee) through the admin API. */
async function seedProduct(page: Page, name: string) {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(E2E_OWNER.email);
  await page.getByLabel('Password', { exact: true }).fill(E2E_OWNER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  const csrf = (await page.context().cookies()).find((c) => c.name === 'ss_csrf')!.value;
  const headers = { 'x-csrf-token': csrf };
  await page.request.put('/api/admin/settings/shop', {
    headers,
    data: {
      name: 'E2E Shop',
      address: 'Shop 4, Kamwala Market',
      deliveryEnabled: true,
      deliveryFeeMinor: 5000,
      collectionEnabled: true,
      reservationTtlMinutes: 60,
    },
  });
  const res = await page.request.post('/api/admin/products', {
    headers,
    data: {
      name,
      description: 'Bright cotton, two metres.',
      optionNames: ['Size'],
      variants: [
        { optionValues: { Size: '2m' }, priceMinor: 6000, initialStock: 5 },
        { optionValues: { Size: '4m' }, priceMinor: 11000, initialStock: 0 },
      ],
    },
  });
  expect(res.ok()).toBe(true);
}

test('a customer finds a product, checks out with delivery and sees the order', async ({
  page,
  browser,
  isMobile,
}, info) => {
  test.skip(info.project.name === 'desktop-dark', 'Covered by the light projects');
  const name = `Chitenge ${Date.now().toString(36)}`;
  await seedProduct(page, name);

  const customer = await browser.newContext({
    viewport: page.viewportSize()!,
    isMobile,
    hasTouch: isMobile,
    baseURL: info.project.use.baseURL,
  });
  const shop = await customer.newPage();
  await shop.goto(`/?q=${encodeURIComponent(name)}`);
  await shop.getByRole('link', { name: new RegExp(name) }).click();
  await expect(shop).toHaveURL(/\/products\//);
  await expect(shop.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();

  // The sold-out size is shown but can't be bought.
  await shop.getByRole('button', { name: '4m' }).click();
  await expect(shop.getByRole('button', { name: 'Sold out' })).toBeDisabled();
  await shop.getByRole('button', { name: '2m' }).click();
  await shop.getByRole('button', { name: 'Increase' }).click();
  await shop.getByRole('button', { name: 'Add to cart' }).click();
  await expect(shop.getByRole('button', { name: 'Cart, 2 items' })).toBeVisible();

  await shop.getByRole('button', { name: 'Cart, 2 items' }).click();
  await expect(shop.getByText('K120.00')).toBeVisible();
  await shop.getByRole('link', { name: 'Checkout' }).click();
  await expect(shop).toHaveURL(/\/checkout$/);

  await shop.getByRole('button', { name: /Pay securely/ }).click();
  await expect(shop.getByText('Enter your full name')).toBeVisible();

  await shop.getByLabel('Full name').fill('Mwila Banda');
  await shop.getByLabel('Phone number').fill('097 123 4567');
  await shop.getByRole('radio', { name: 'Deliver' }).click();
  await shop.getByLabel('Street or house').fill('Plot 12, Woodlands');
  await expect(shop.getByRole('button', { name: /Pay securely · K170\.00/ })).toBeVisible();
  await shop.getByRole('button', { name: /Pay securely/ }).click();

  // Test-mode payment page (DEVDRAFT_MODE=fake) stands in for DevDraft's hosted page.
  await expect(shop).toHaveURL(/\/pay\/test\//);
  await expect(shop.getByText('No money moves')).toBeVisible();
  await shop.getByRole('button', { name: /^Pay K170\.00/ }).click();

  await expect(shop).toHaveURL(/\/order\/ORD-\d{5}\?t=/);
  await expect(shop.getByRole('heading', { name: 'Thank you, Mwila!' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(shop.getByText('Payment received.')).toBeVisible();
  await expect(shop.getByText('K170.00')).toBeVisible();
  await expect(shop.getByRole('button', { name: 'Cart, 0 items' })).toBeVisible();
  const ref = /ORD-\d{5}/.exec(shop.url())![0];

  // The owner sees it paid and moves it along.
  await page.goto(`/admin/orders/${ref}`);
  await expect(page.getByText('Paid', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mark out for delivery' }).first().click();
  await expect(page.getByText('Out for delivery').first()).toBeVisible();
  await expect(page.getByText('Payment verified')).toBeVisible();
  await customer.close();
});
