import { test, expect } from '@playwright/test';

test.describe('Tool use display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Connected')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'New Session' }).click();
  });

  test('should display tool use when reading a file', async ({ page }) => {
    // Send message that triggers tool use scenario
    await page.getByRole('textbox', { name: 'Type a message...' }).fill('read the file');
    await page.getByRole('textbox', { name: 'Type a message...' }).press('Enter');

    // Should see tool use indicator
    await expect(page.getByText('Read')).toBeVisible({ timeout: 10000 });

    // Should see the response text after tool completes
    await expect(page.getByText('I found the file content')).toBeVisible({ timeout: 10000 });
  });

  test('should show tool input details', async ({ page }) => {
    await page.getByRole('textbox', { name: 'Type a message...' }).fill('show me the file');
    await page.getByRole('textbox', { name: 'Type a message...' }).press('Enter');

    // Should display the file path from tool input
    await expect(page.getByText('/src/app.ts')).toBeVisible({ timeout: 10000 });
  });
});
