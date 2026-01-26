import { test, expect } from '@playwright/test';

test.describe('Vibing state transitions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Connected')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'New Session' }).click();
  });

  test('should show vibing indicator after sending message', async ({ page }) => {
    // Send a message
    await page.getByRole('textbox', { name: 'Type a message...' }).fill('Hello');
    await page.getByRole('textbox', { name: 'Type a message...' }).press('Enter');

    // Should see vibing indicator (LoadingIndicator with random words ending in "...")
    // The indicator shows words like "Vibing...", "Thinking...", "Processing...", etc.
    await expect(page.locator('[data-testid="loading-indicator"]')).toBeVisible({ timeout: 5000 });
  });

  test('should hide vibing indicator after result', async ({ page }) => {
    // Send a message
    await page.getByRole('textbox', { name: 'Type a message...' }).fill('Hello');
    await page.getByRole('textbox', { name: 'Type a message...' }).press('Enter');

    // Wait for response to complete
    await expect(page.getByText('I understand your request')).toBeVisible({ timeout: 10000 });

    // Vibing indicator should be hidden
    await expect(page.locator('[data-testid="loading-indicator"]')).not.toBeVisible();
  });

  test('should stop vibing when permission request appears', async ({ page }) => {
    // Send message that triggers permission request
    await page.getByRole('textbox', { name: 'Type a message...' }).fill('write something');
    await page.getByRole('textbox', { name: 'Type a message...' }).press('Enter');

    // Wait for permission request popup
    await expect(page.getByText('Allow')).toBeVisible({ timeout: 10000 });

    // Vibing indicator should be hidden (waiting for user permission)
    await expect(page.locator('[data-testid="loading-indicator"]')).not.toBeVisible();
  });

  test('should resume vibing after permission is granted', async ({ page }) => {
    // Send message that triggers permission request
    await page.getByRole('textbox', { name: 'Type a message...' }).fill('write something');
    await page.getByRole('textbox', { name: 'Type a message...' }).press('Enter');

    // Wait for permission request
    await expect(page.getByText('Allow')).toBeVisible({ timeout: 10000 });

    // Grant permission
    await page.getByRole('button', { name: 'Allow' }).click();

    // Vibing indicator should reappear briefly while processing continues
    // Then disappear when result arrives
    // Wait for the final response
    await expect(page.getByText('File written successfully')).toBeVisible({ timeout: 10000 });

    // After result, vibing should be hidden
    await expect(page.locator('[data-testid="loading-indicator"]')).not.toBeVisible();
  });

  test('should not show vibing after page reload when waiting for permission', async ({ page }) => {
    // Send message that triggers permission request
    await page.getByRole('textbox', { name: 'Type a message...' }).fill('write something');
    await page.getByRole('textbox', { name: 'Type a message...' }).press('Enter');

    // Wait for permission request
    await expect(page.getByText('Allow')).toBeVisible({ timeout: 10000 });

    // Reload the page
    await page.reload();

    // Wait for reconnection
    await expect(page.getByText('Connected')).toBeVisible({ timeout: 10000 });

    // Permission request should be restored
    await expect(page.getByText('Allow')).toBeVisible({ timeout: 10000 });

    // Vibing indicator should NOT be visible (this was the bug we fixed)
    await expect(page.locator('[data-testid="loading-indicator"]')).not.toBeVisible();
  });

  test('should show vibing during thinking blocks', async ({ page }) => {
    // Send message that triggers thinking
    await page.getByRole('textbox', { name: 'Type a message...' }).fill('think about this');
    await page.getByRole('textbox', { name: 'Type a message...' }).press('Enter');

    // Vibing indicator should be visible during thinking
    await expect(page.locator('[data-testid="loading-indicator"]')).toBeVisible({ timeout: 5000 });

    // Wait for response
    await expect(page.getByText('I understand your request')).toBeVisible({ timeout: 10000 });

    // Vibing should be hidden after completion
    await expect(page.locator('[data-testid="loading-indicator"]')).not.toBeVisible();
  });
});
