import { test, expect } from '@playwright/test';

test.describe('Permission mode toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Connected')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'New Session' }).click();
  });

  test('should display current permission mode', async ({ page }) => {
    // Default mode is "Ask before edits"
    await expect(page.getByRole('button', { name: /Ask before edits/i })).toBeVisible();
  });

  test('should cycle through permission modes on click', async ({ page }) => {
    const permissionButton = page.getByRole('button', { name: /Ask before edits/i });
    await expect(permissionButton).toBeVisible();

    // Click to switch to auto-edit
    await permissionButton.click();
    await expect(page.getByRole('button', { name: /Edit automatically/i })).toBeVisible();

    // Click to switch to plan mode
    await page.getByRole('button', { name: /Edit automatically/i }).click();
    await expect(page.getByRole('button', { name: /Plan mode/i })).toBeVisible();

    // Click to cycle back to ask
    await page.getByRole('button', { name: /Plan mode/i }).click();
    await expect(page.getByRole('button', { name: /Ask before edits/i })).toBeVisible();
  });

  test('should toggle permission mode with Shift+Tab', async ({ page }) => {
    const input = page.getByRole('textbox', { name: 'Type a message...' });
    await input.focus();

    // Initial state
    await expect(page.getByRole('button', { name: /Ask before edits/i })).toBeVisible();

    // Press Shift+Tab
    await page.keyboard.press('Shift+Tab');

    // Should switch to auto-edit
    await expect(page.getByRole('button', { name: /Edit automatically/i })).toBeVisible();
  });
});

test.describe('Model selector', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Connected')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'New Session' }).click();
  });

  test('should detect /model command and open selector', async ({ page }) => {
    const input = page.getByRole('textbox', { name: 'Type a message...' });

    // Type /model command
    await input.fill('/model');

    // Should open model selector popover
    await expect(page.getByText('Opus')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Haiku')).toBeVisible();
  });

  test('should select model from /model popover', async ({ page }) => {
    const input = page.getByRole('textbox', { name: 'Type a message...' });

    // Type /model command
    await input.fill('/model');

    // Wait for popover
    await expect(page.getByText('Opus')).toBeVisible({ timeout: 5000 });

    // Select Opus
    await page.getByRole('button', { name: /Opus/ }).click();

    // Input should be cleared after selection
    await expect(input).toHaveValue('');
  });
});
