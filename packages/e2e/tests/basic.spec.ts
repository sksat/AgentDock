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
    const sidebar = page.locator('[data-testid="sidebar"]');
    const sessionItems = sidebar.locator('[data-testid^="session-item-"]');

    // Get count before clicking (may have sessions from previous tests)
    const countBefore = await sessionItems.count();

    await page.getByRole('button', { name: 'New Session' }).click();

    // Wait a bit for the session to be created
    await page.waitForTimeout(300);

    // Should see at least one more session
    const countAfter = await sessionItems.count();
    expect(countAfter).toBeGreaterThan(countBefore);
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

  test('should allow typing when connected even without session selected', async ({ page }) => {
    // This test verifies that the input is enabled when connected
    // The auto-create functionality is tested implicitly in other tests
    const input = page.getByRole('textbox', { name: 'Type a message...' });

    // Input should be enabled because we're connected
    await expect(input).toBeEnabled();

    // Create a session and send a message
    await input.fill('Hello from test');
    await input.press('Enter');

    // Should see the message and response
    await expect(page.getByText('Hello from test')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('I understand your request')).toBeVisible({ timeout: 10000 });
  });

  test('should delete a session', async ({ page }) => {
    // Get sidebar and session items
    const sidebar = page.locator('[data-testid="sidebar"]');
    const sessionItems = sidebar.locator('[data-testid^="session-item-"]');

    // Create a session first
    await page.getByRole('button', { name: 'New Session' }).click();

    // Wait for session to appear
    await expect(sessionItems.first()).toBeVisible({ timeout: 5000 });

    // Get the session count before deletion
    const countBefore = await sessionItems.count();

    // Hover the last session to show delete button
    const lastSession = sessionItems.last();
    await lastSession.hover();
    await page.waitForTimeout(100); // Wait for hover state
    const deleteBtn = sidebar.getByRole('button', { name: /Delete/ }).last();
    await expect(deleteBtn).toBeVisible({ timeout: 2000 });
    await deleteBtn.click();

    // Wait for deletion to complete
    await page.waitForTimeout(300);

    // Verify the count decreased or "No sessions" is shown
    if (countBefore === 1) {
      await expect(page.getByText('No sessions')).toBeVisible({ timeout: 5000 });
    } else {
      await expect(sessionItems).toHaveCount(countBefore - 1, { timeout: 5000 });
    }
  });
});
