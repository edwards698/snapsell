import { expect, type Page, test } from '@playwright/test';
import { E2E_OWNER } from '../playwright.config';

async function signIn(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(E2E_OWNER.email);
  await page.getByLabel('Password', { exact: true }).fill(E2E_OWNER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/** Greeting, date and uptime change with the clock, so they are masked in screenshots. */
const timeDependent = (page: Page) => [page.locator('main h1'), page.locator('main h1 + p')];

test('the login page', async ({ page }) => {
  await page.goto('/admin/login');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page).toHaveScreenshot('login.png');
});

test('admin pages require a session', async ({ page }) => {
  await page.goto('/admin/settings');
  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fsettings/);
});

test('a wrong password shows an error', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(E2E_OWNER.email);
  await page.getByLabel('Password', { exact: true }).fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'don’t match' })).toBeVisible();
});

test('sign in, look around, sign out', async ({ page, isMobile }) => {
  await signIn(page);
  await expect(
    page.getByRole('heading', { name: /Good (morning|afternoon|evening), Ama/ }),
  ).toBeVisible();
  await expect(page.getByText('Get your shop ready')).toBeVisible();
  await expect(page).toHaveScreenshot('dashboard.png', { mask: timeDependent(page) });

  if (isMobile) {
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('link', { name: 'Settings' }).click();
  } else {
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Settings' })
      .click();
  }
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await expect(page).toHaveScreenshot('settings.png');

  await page.goto('/admin/system');
  await expect(page.getByRole('heading', { name: 'Background jobs' })).toBeVisible();

  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/admin\/login\?notice=signed-out/);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login/);
});

test('the command menu jumps to a section', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Keyboard shortcut is a desktop feature');
  await signIn(page);
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByPlaceholder('Search or jump to…').fill('integrations');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/admin\/integrations$/);
});

test('the storefront', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('getting ready');
  await page.getByRole('button', { name: /Cart, 0 items/ }).click();
  await expect(page.getByText('Your cart is empty')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveScreenshot('storefront.png', { fullPage: true });
});
