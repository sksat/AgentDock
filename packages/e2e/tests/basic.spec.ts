import { test, expect } from '@playwright/test';

test.describe('Basic functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for WebSocket connection
    await expect(page.getByText('Connected')).toBeVisible({ timeout: 10000 });
  });

  test('should display the app title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Claude Bridge' })).toBeVisible();
  });

  test('should create a new session', async ({ page }) => {
    await page.getByRole('button', { name: 'New Session' }).click();
    // Should see session in sidebar
    await expect(page.getByRole('button', { name: /Session/ })).toBeVisible();
  });

  test('should send a message and receive response', async ({ page }) => {
    // Create session
    await page.getByRole('button', { name: 'New Session' }).click();

    // Type and send message
    await page.getByRole('textbox', { name: 'Type a message...' }).fill('Hello');
    await page.getByRole('textbox', { name: 'Type a message...' }).press('Enter');

    // Should see user message
    await expect(page.getByText('Hello')).toBeVisible();

    // Should see assistant response (default scenario)
    await expect(page.getByText('I understand your request')).toBeVisible({ timeout: 10000 });
  });

  test('should delete a session', async ({ page }) => {
    // Create session first
    await page.getByRole('button', { name: 'New Session' }).click();
    const sessionButton = page.getByRole('button', { name: /Session/ }).first();
    await expect(sessionButton).toBeVisible();

    // Hover to show delete button
    await sessionButton.hover();
    await page.getByRole('button', { name: /Delete/ }).first().click();

    // Session should be gone (may show "No sessions" or just no matching button)
    await expect(page.getByText('No sessions')).toBeVisible({ timeout: 5000 });
  });
});
