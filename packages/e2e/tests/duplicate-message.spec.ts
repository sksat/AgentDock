import { test, expect } from '@playwright/test';

test.describe('Duplicate Message Prevention', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for WebSocket connection
    await expect(page.getByText('Connected')).toBeVisible({ timeout: 10000 });
  });

  test('should not duplicate user messages on 2nd post', async ({ page }) => {
    // Create session with first message
    await page.getByRole('textbox', { name: 'Type a message...' }).fill('First message');
    await page.getByRole('textbox', { name: 'Type a message...' }).press('Enter');

    // Wait for first response
    await expect(page.getByText('I understand your request')).toBeVisible({ timeout: 10000 });

    // Send second message
    await page.getByRole('textbox', { name: 'Type a message...' }).fill('Second message');
    await page.getByRole('textbox', { name: 'Type a message...' }).press('Enter');

    // Wait for second response
    await expect(page.getByText('I understand your request').nth(1)).toBeVisible({ timeout: 10000 });

    // Count user messages with "Second message"
    // There should be exactly 1 instance of "Second message"
    const secondMessageElements = page.locator('[data-testid="message-item"]').filter({
      hasText: 'Second message'
    });

    const count = await secondMessageElements.count();
    expect(count).toBe(1);
  });

  test('should maintain correct message count for multiple posts', async ({ page }) => {
    const input = page.getByRole('textbox', { name: 'Type a message...' });
    const assistantResponses = page.getByText('I understand your request');

    // Send 3 messages sequentially
    const messages = ['Message A', 'Message B', 'Message C'];

    for (const msg of messages) {
      const prevCount = await assistantResponses.count();

      await input.fill(msg);
      await input.press('Enter');

      // Wait for user message to appear
      await expect(page.getByText(msg)).toBeVisible({ timeout: 5000 });

      // Wait for a new assistant response to be added
      await expect(assistantResponses).toHaveCount(prevCount + 1, { timeout: 10000 });
    }

    // Verify each message appears exactly once
    for (const msg of messages) {
      const messageElements = page.locator('[data-testid="message-item"]').filter({
        hasText: msg
      });
      const count = await messageElements.count();
      expect(count).toBe(1);
    }
  });

  test('should not duplicate messages when adding to existing conversation', async ({ page }) => {
    // Send first message to establish baseline
    await page.getByRole('textbox', { name: 'Type a message...' }).fill('Test message');
    await page.getByRole('textbox', { name: 'Type a message...' }).press('Enter');

    // Wait for response
    await expect(page.getByText('I understand your request')).toBeVisible({ timeout: 10000 });

    // Count all message items after first exchange
    const messageItems = page.locator('[data-testid="message-item"]');
    const totalBefore = await messageItems.count();

    // Send another message
    await page.getByRole('textbox', { name: 'Type a message...' }).fill('Another message');
    await page.getByRole('textbox', { name: 'Type a message...' }).press('Enter');

    // Wait for second response
    await expect(page.getByText('I understand your request').nth(1)).toBeVisible({ timeout: 10000 });

    // Count message items after second message
    const totalAfter = await messageItems.count();

    // Should add exactly 2 messages: 1 user + 1 assistant
    // (Not 3 or more due to duplication)
    expect(totalAfter - totalBefore).toBe(2);
  });
});
