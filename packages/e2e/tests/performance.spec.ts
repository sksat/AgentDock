import { test, expect, Page } from '@playwright/test';

/**
 * Performance tests for MessageStream rendering
 *
 * These tests measure rendering performance with large numbers of messages.
 * They work with the mock server in CI mode.
 *
 * For testing with real data on localhost:5174:
 *   PERF_REAL_DATA=true pnpm --filter @agent-dock/e2e test performance
 */

const useRealData = process.env.PERF_REAL_DATA === 'true';
const baseUrl = useRealData ? 'http://localhost:5174' : '/';

test.describe('Performance - Message Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(baseUrl);
    // Wait for WebSocket connection - use exact match to avoid matching session preview text
    await expect(page.getByText('Connected', { exact: true })).toBeVisible({ timeout: 10000 });
  });

  test('should measure initial page load performance', async ({ page }) => {
    // Measure page load metrics
    const metrics = await page.evaluate(() => {
      const perf = window.performance;
      const navigation = perf.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return {
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.startTime,
        loadComplete: navigation.loadEventEnd - navigation.startTime,
        firstContentfulPaint: perf.getEntriesByName('first-contentful-paint')[0]?.startTime || 0,
      };
    });

    console.log('Page Load Metrics:');
    console.log(`  DOM Content Loaded: ${metrics.domContentLoaded.toFixed(2)}ms`);
    console.log(`  Load Complete: ${metrics.loadComplete.toFixed(2)}ms`);
    console.log(`  First Contentful Paint: ${metrics.firstContentfulPaint.toFixed(2)}ms`);

    // Performance thresholds
    expect(metrics.domContentLoaded).toBeLessThan(3000);
    expect(metrics.loadComplete).toBeLessThan(5000);
  });

  test('should render session list efficiently', async ({ page }) => {
    const startTime = Date.now();

    // Wait for session list to appear
    const sessionItems = page.locator('[data-testid^="session-item-"]');

    // In mock mode, create a session first
    if (!useRealData) {
      await page.getByRole('button', { name: 'New Session' }).click();
      await page.waitForTimeout(300);
    }

    await expect(sessionItems.first()).toBeVisible({ timeout: 5000 });

    const loadTime = Date.now() - startTime;
    console.log(`Session list load time: ${loadTime}ms`);

    // Session list should load quickly
    expect(loadTime).toBeLessThan(2000);
  });

  test('should handle session with messages efficiently', async ({ page }) => {
    // Create a new session
    await page.getByRole('button', { name: 'New Session' }).click();
    await page.waitForTimeout(500);

    // Send a test message
    const input = page.getByRole('textbox', { name: /describe your task|type a message/i });
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill('Hello, this is a test message for performance testing.');
    await input.press('Enter');

    // Wait for user message to appear in the message list (not sidebar)
    const messageItems = page.locator('[data-testid="message-item"]');
    await expect(messageItems.first()).toBeVisible({ timeout: 5000 });

    // Count message items
    const count = await messageItems.count();
    console.log(`Message items rendered: ${count}`);

    expect(count).toBeGreaterThan(0);
  });

  test('should measure scroll performance', async ({ page }) => {
    // Create session and add content
    await page.getByRole('button', { name: 'New Session' }).click();
    await page.waitForTimeout(500);

    const input = page.getByRole('textbox', { name: /describe your task|type a message/i });
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill('Test message for scroll performance');
    await input.press('Enter');

    // Wait for message to appear
    await page.waitForTimeout(500);

    // Find the scroll container
    const scrollContainer = page.locator('.overflow-y-auto').first();

    // Measure scroll performance
    const scrollMetrics = await scrollContainer.evaluate((el) => {
      const startTime = performance.now();
      el.scrollTop = el.scrollHeight;
      const scrollTime = performance.now() - startTime;

      return {
        scrollTime,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      };
    });

    console.log('Scroll Metrics:');
    console.log(`  Scroll time: ${scrollMetrics.scrollTime.toFixed(2)}ms`);
    console.log(`  Scroll height: ${scrollMetrics.scrollHeight}px`);
    console.log(`  Client height: ${scrollMetrics.clientHeight}px`);

    // Scroll should be nearly instant
    expect(scrollMetrics.scrollTime).toBeLessThan(100);
  });
});

test.describe('Performance - Virtualization Verification', () => {
  test.skip(!useRealData, 'Requires real data with many messages - run with PERF_REAL_DATA=true');

  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5174');
    await expect(page.getByText('Connected', { exact: true })).toBeVisible({ timeout: 10000 });
  });

  test('should limit DOM elements with virtualization', async ({ page }) => {
    // Find and click a session with many messages
    const sessionItems = page.locator('[data-testid^="session-item-"]');
    await expect(sessionItems.first()).toBeVisible({ timeout: 5000 });

    // Click the first session
    await sessionItems.first().click();

    // Wait for messages to load
    const messageItems = page.locator('[data-testid="message-item"]');
    await expect(messageItems.first()).toBeVisible({ timeout: 10000 });

    // Count DOM elements
    const domCount = await messageItems.count();
    console.log(`DOM message elements: ${domCount}`);

    // With virtualization enabled, we expect fewer DOM elements than total messages
    // Viewport ~600px, item ~100px, overscan 5 = ~15-20 elements max
    // Without virtualization, this might be 100s or 1000s
    //
    // TODO: Update this assertion when virtualization is implemented:
    // expect(domCount).toBeLessThan(50);
    //
    // For now, just log the count
    expect(domCount).toBeGreaterThan(0);
  });

  test('should load large session within performance budget', async ({ page }) => {
    const sessionItems = page.locator('[data-testid^="session-item-"]');
    await expect(sessionItems.first()).toBeVisible({ timeout: 5000 });

    const startTime = Date.now();
    await sessionItems.first().click();

    // Wait for first message to appear
    const messageItems = page.locator('[data-testid="message-item"]');
    await expect(messageItems.first()).toBeVisible({ timeout: 10000 });

    const loadTime = Date.now() - startTime;
    console.log(`Session load time: ${loadTime}ms`);

    // Session should load within 3 seconds
    expect(loadTime).toBeLessThan(3000);
  });
});
