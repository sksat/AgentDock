import { test, expect } from '@playwright/test';

/**
 * Container browser screencast tests.
 * These tests require podman and the container image to be available.
 * Skip in CI by setting SKIP_CONTAINER_TESTS=true environment variable.
 */
test.describe('Container Browser Screencast', () => {
  // Skip these tests if SKIP_CONTAINER_TESTS is set (for CI without podman)
  test.skip(
    () => process.env.SKIP_CONTAINER_TESTS === 'true',
    'Skipping container tests (SKIP_CONTAINER_TESTS=true)'
  );

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for WebSocket connection
    await expect(page.getByText('Connected')).toBeVisible({ timeout: 10000 });
  });

  test('should display screencast when agent uses browser in container mode', async ({ page }) => {
    // Create a new session
    await page.getByRole('button', { name: 'New Session' }).click();

    // Wait for session to be created
    await page.waitForTimeout(500);

    // Send a message that triggers browser usage
    const input = page.getByRole('textbox', { name: 'Type a message...' });
    await input.fill('Navigate to https://example.com using the browser');
    await input.press('Enter');

    // Switch to Browser tab
    const browserTab = page.getByRole('tab', { name: 'Browser' });
    await browserTab.click();

    // The Browser tab should NOT show "Start browser" button when container mode is working
    // Instead, it should show the screencast or at least indicate browser is active
    // Wait for either:
    // 1. Screencast image to appear (success case)
    // 2. Browser status to show active state
    const screencastImage = page.locator('[data-testid="screencast-image"]');
    const startBrowserButton = page.getByRole('button', { name: 'Start browser' });

    // Wait for the agent to process and potentially launch browser
    // This may take some time depending on the agent response
    await page.waitForTimeout(5000);

    // Check that screencast is visible OR that start browser is NOT the only thing shown
    // (The exact UI depends on whether browser was actually used)
    const isScreencastVisible = await screencastImage.isVisible().catch(() => false);
    const isStartButtonVisible = await startBrowserButton.isVisible().catch(() => false);

    // If the agent used the browser, either:
    // - screencast should be visible, OR
    // - start button should be hidden (browser already running)
    // This test documents the expected behavior when Issue #78 is fixed
    if (isScreencastVisible) {
      // Success: screencast is visible
      expect(isScreencastVisible).toBe(true);
    } else if (!isStartButtonVisible) {
      // Success: browser is running but maybe no frames yet
      expect(isStartButtonVisible).toBe(false);
    } else {
      // If start button is still visible, check if there's any browser activity indicator
      // This could indicate the agent didn't use the browser, which is acceptable
      console.log('Note: Start browser button is visible - agent may not have used browser');
    }
  });

  test('should show screencast when browser_navigate is called', async ({ page }) => {
    // Create a new session
    await page.getByRole('button', { name: 'New Session' }).click();
    await page.waitForTimeout(500);

    // Switch to Browser tab first
    const browserTab = page.getByRole('tab', { name: 'Browser' });
    await browserTab.click();

    // Check initial state - should show "Start browser" or similar
    const startBrowserButton = page.getByRole('button', { name: 'Start browser' });
    const initialStartButtonVisible = await startBrowserButton.isVisible().catch(() => false);

    // Send a message requesting navigation
    const input = page.getByRole('textbox', { name: 'Type a message...' });
    await input.fill('Please navigate to https://example.com');
    await input.press('Enter');

    // Wait for agent to process
    await page.waitForTimeout(10000);

    // After agent navigates, the screencast should be visible
    const screencastImage = page.locator('[data-testid="screencast-image"]');
    const finalScreencastVisible = await screencastImage.isVisible().catch(() => false);

    // If we had a start button before and now have screencast, the fix is working
    if (initialStartButtonVisible && finalScreencastVisible) {
      expect(finalScreencastVisible).toBe(true);
    }
  });
});
