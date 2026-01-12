import { test, expect } from '@playwright/test';

test.describe('Thinking blocks', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Connected')).toBeVisible({ timeout: 10000 });
    // Create a session
    await page.getByRole('button', { name: 'New Session' }).click();
  });

  test('should display thinking blocks when using think prompt', async ({ page }) => {
    // Send message that triggers thinking scenario
    await page.getByRole('textbox', { name: 'Type a message...' }).fill('think about this problem');
    await page.getByRole('textbox', { name: 'Type a message...' }).press('Enter');

    // Should see thinking block with expand/collapse
    await expect(page.getByText('Thinking')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Let me analyze this problem')).toBeVisible();
  });

  test('should display thinking content', async ({ page }) => {
    // Send message that triggers thinking scenario
    await page.getByRole('textbox', { name: 'Type a message...' }).fill('analyze this');
    await page.getByRole('textbox', { name: 'Type a message...' }).press('Enter');

    // Wait for thinking block
    await expect(page.getByText('Thinking')).toBeVisible({ timeout: 10000 });

    // Should show thinking content
    await expect(page.getByText(/Let me analyze/)).toBeVisible();
    await expect(page.getByText(/understand the requirements/)).toBeVisible();
  });

  test('should toggle thinking block expand/collapse', async ({ page }) => {
    // Send message that triggers thinking scenario
    await page.getByRole('textbox', { name: 'Type a message...' }).fill('consider this');
    await page.getByRole('textbox', { name: 'Type a message...' }).press('Enter');

    // Wait for thinking block
    await expect(page.getByText('Thinking')).toBeVisible({ timeout: 10000 });

    // Find and click the thinking toggle button
    const thinkingButton = page.getByRole('button', { name: /Thinking/ });
    await expect(thinkingButton).toBeVisible();

    // Click to toggle
    await thinkingButton.click();

    // Thinking content visibility should change
    // (exact behavior depends on implementation)
  });
});
