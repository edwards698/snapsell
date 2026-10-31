import { expect, type Page, test } from '@playwright/test';
import { E2E_OWNER } from '../playwright.config';

async function signIn(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(E2E_OWNER.email);
  await page.getByLabel('Password', { exact: true }).fill(E2E_OWNER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

// One full journey per viewport, run on desktop only to keep the suite fast; the mobile layout
// is covered by the screenshot tests.
test('create a category and product with a photo, then manage its stock', async ({
  page,
  isMobile,
}, info) => {
  test.skip(isMobile || info.project.name !== 'desktop-light', 'Runs once, on desktop');
  await signIn(page);
  const suffix = Date.now().toString(36);

  // Category
  await page.goto('/admin/categories');
  await page.getByLabel('New category name').fill(`Fabric ${suffix}`);
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText(`Fabric ${suffix}`)).toBeVisible();

  // Product with photo
  await page.goto('/admin/products/new');
  await page.locator('input[type=file][multiple]').setInputFiles('e2e/fixtures/product.jpg');
  await expect(page.getByText('Cover')).toBeVisible();
  await page.getByLabel('Name').fill(`Chitenge ${suffix}`);
  await page.getByRole('button', { name: 'Save product' }).first().click();
  await expect(page.getByText('Enter an amount')).toBeVisible();

  await page.getByLabel('Price', { exact: true }).fill('60');
  await page.getByLabel('Starting stock').fill('5');
  await page.getByRole('combobox', { name: 'Category' }).click();
  await page.getByRole('option', { name: `Fabric ${suffix}` }).click();
  await page.getByRole('button', { name: 'Save product' }).first().click();
  await expect(page).toHaveURL(/\/admin\/products\/[a-z0-9]{20}$/);
  await expect(page.getByRole('heading', { name: `Chitenge ${suffix}` })).toBeVisible();
  await expect(page.locator('picture img').first()).toBeVisible();
  await expect(page.getByText('5 on hand')).toBeVisible();

  // Price change
  await page.getByLabel('Price', { exact: true }).fill('65');
  await page.getByRole('button', { name: 'Save changes' }).first().click();
  await expect(page.getByText('Changes saved')).toBeVisible();

  // Stock adjustment from the editor
  await page.getByRole('button', { name: 'Adjust' }).click();
  await page.getByRole('dialog').getByLabel('Quantity').fill('3');
  await page.getByRole('button', { name: 'Save adjustment' }).click();
  await expect(page.getByText('8 on hand')).toBeVisible();

  // It shows up in search with the new price, and in the stock list with its history
  await page.goto(`/admin/products?q=${suffix}`);
  await expect(page.getByRole('link', { name: `Edit Chitenge ${suffix}` })).toBeVisible();
  await expect(page.getByText('K65')).toBeVisible();

  await page.goto(`/admin/stock?q=${suffix}`);
  await page.getByRole('button', { name: new RegExp(`Chitenge ${suffix}`) }).click();
  await expect(page.getByText('New stock received')).toBeVisible();
  await expect(page.getByText('Initial stock')).toBeVisible();
});
