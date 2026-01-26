import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // Run tests sequentially for stability
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html'], ['list']],
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:5175',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Use dev:once to start only client and server
    // Use alternate ports (3003/5175) to avoid conflicts with running dev:stable instances
    // CONTAINER_DISABLED=true avoids container-related WebSocket conflicts
    command: 'USE_MOCK=true CONTAINER_DISABLED=true AGENTDOCK_PORT=3003 AGENTDOCK_CLIENT_PORT=5175 VITE_SERVER_PORT=3003 pnpm dev:once',
    url: 'http://localhost:3003/health',
    reuseExistingServer: !process.env.CI,
    cwd: '../..',
    timeout: 60000,
  },
});
