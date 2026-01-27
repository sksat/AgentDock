import { test, expect } from '@playwright/test';

test.describe('ProcessStatusIndicator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Connected')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'New Session' }).click();
  });

  test('should show Running indicator when process is vibing', async ({ page }) => {
    // Send a message that triggers slow thinking (gives us time to observe)
    await page.getByRole('textbox', { name: 'Type a message...' }).fill('slow streaming test');
    await page.getByRole('textbox', { name: 'Type a message...' }).press('Enter');

    // Should see Running indicator
    await expect(page.getByText('Running')).toBeVisible({ timeout: 5000 });
  });

  test('should show Idle indicator when process completes', async ({ page }) => {
    // Send a quick message
    await page.getByRole('textbox', { name: 'Type a message...' }).fill('echo hello');
    await page.getByRole('textbox', { name: 'Type a message...' }).press('Enter');

    // Wait for response to complete
    await expect(page.getByText('Echo: echo hello')).toBeVisible({ timeout: 10000 });

    // Should show Idle indicator
    await expect(page.getByText('Idle')).toBeVisible({ timeout: 5000 });
  });

  test('should show confirmation dialog when Stop button is clicked', async ({ page }) => {
    // Send a slow message
    await page.getByRole('textbox', { name: 'Type a message...' }).fill('slow streaming test');
    await page.getByRole('textbox', { name: 'Type a message...' }).press('Enter');

    // Wait for Running indicator
    await expect(page.getByText('Running')).toBeVisible({ timeout: 5000 });

    // Click Stop button
    await page.getByRole('button', { name: 'Stop' }).click();

    // Should see confirmation dialog
    await expect(page.getByText('Stop Claude Code process?')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('should close confirmation dialog when Cancel is clicked', async ({ page }) => {
    // Send a slow message
    await page.getByRole('textbox', { name: 'Type a message...' }).fill('slow streaming test');
    await page.getByRole('textbox', { name: 'Type a message...' }).press('Enter');

    // Wait for Running indicator
    await expect(page.getByText('Running')).toBeVisible({ timeout: 5000 });

    // Click Stop button
    await page.getByRole('button', { name: 'Stop' }).click();

    // Click Cancel
    await page.getByRole('button', { name: 'Cancel' }).click();

    // Dialog should be hidden
    await expect(page.getByText('Stop Claude Code process?')).not.toBeVisible();

    // Process should still be running
    await expect(page.getByText('Running')).toBeVisible();
  });

  test('should stop process and show Idle when Stop is confirmed', async ({ page }) => {
    // Send a slow message
    await page.getByRole('textbox', { name: 'Type a message...' }).fill('slow streaming test');
    await page.getByRole('textbox', { name: 'Type a message...' }).press('Enter');

    // Wait for Running indicator
    await expect(page.getByText('Running')).toBeVisible({ timeout: 5000 });

    // Click Stop button
    await page.getByRole('button', { name: 'Stop' }).click();

    // Click Stop in confirmation dialog (target the button inside the dialog)
    const confirmationDialog = page.getByRole('dialog', { name: 'Stop confirmation' });
    await confirmationDialog.getByRole('button', { name: 'Stop' }).click();

    // Should show Idle indicator (process stopped)
    await expect(page.getByText('Idle')).toBeVisible({ timeout: 5000 });

    // Confirmation dialog should be hidden
    await expect(page.getByText('Stop Claude Code process?')).not.toBeVisible();
  });

  test('should hide Stop button when process is idle', async ({ page }) => {
    // Wait for initial Idle state
    await expect(page.getByText('Idle')).toBeVisible({ timeout: 5000 });

    // Stop button should not be visible
    await expect(page.getByRole('button', { name: 'Stop' })).not.toBeVisible();
  });
});
