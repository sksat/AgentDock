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

    // Send a message to initialize the session and get model info
    await input.fill('echo test');
    await input.press('Enter');

    // Wait for response to complete (which means system_info was received)
    await expect(page.getByText('Echo: echo test')).toBeVisible({ timeout: 10000 });

    // Wait for model info to appear in status bar (lowercase)
    await expect(page.getByText(/sonnet|opus|haiku/i)).toBeVisible({ timeout: 5000 });

    // Type /model command
    await input.fill('/model');

    // Should open model selector popover with all options
    await expect(page.getByRole('option', { name: /Opus/ })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('option', { name: /Haiku/ })).toBeVisible();
    await expect(page.getByRole('option', { name: /Sonnet/ })).toBeVisible();
  });

  test('should select model from /model popover', async ({ page }) => {
    const input = page.getByRole('textbox', { name: 'Type a message...' });

    // Send a message to initialize the session and get model info
    await input.fill('echo test');
    await input.press('Enter');

    // Wait for response to complete
    await expect(page.getByText('Echo: echo test')).toBeVisible({ timeout: 10000 });

    // Wait for model info to appear
    await expect(page.getByText(/sonnet|opus|haiku/i)).toBeVisible({ timeout: 5000 });

    // Type /model command
    await input.fill('/model');

    // Wait for popover
    await expect(page.getByRole('option', { name: /Opus/ })).toBeVisible({ timeout: 5000 });

    // Select Opus
    await page.getByRole('option', { name: /Opus/ }).click();

    // Input should be cleared after selection
    await expect(input).toHaveValue('');
  });
});
