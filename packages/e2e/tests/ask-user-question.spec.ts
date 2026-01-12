import { test, expect } from '@playwright/test';

test.describe('AskUserQuestion tool call', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Connected')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'New Session' }).click();
  });

  test('should display AskUserQuestion tool call with question data', async ({ page }) => {
    // Send message that triggers ask question scenario
    await page.getByRole('textbox', { name: 'Type a message...' }).fill('help me implement this');
    await page.getByRole('textbox', { name: 'Type a message...' }).press('Enter');

    // Should see the AskUserQuestion tool call
    await expect(page.getByText('AskUserQuestion')).toBeVisible({ timeout: 10000 });

    // Should see the question text in the JSON
    await expect(page.getByText(/Which framework would you like to use/)).toBeVisible();
  });

  test('should show thinking before asking question', async ({ page }) => {
    await page.getByRole('textbox', { name: 'Type a message...' }).fill('help me build');
    await page.getByRole('textbox', { name: 'Type a message...' }).press('Enter');

    // Should see thinking block first
    await expect(page.getByText('Thinking')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/clarify the requirements/)).toBeVisible();
  });
});
