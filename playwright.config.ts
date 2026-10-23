import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1, timeout: 45000,
  use: { baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000', trace: 'retain-on-failure', screenshot: 'only-on-failure',
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] } },
  webServer: process.env.E2E_BASE_URL ? undefined : { command: 'npm run start', url: 'http://localhost:3000/api/health', reuseExistingServer: true, timeout: 60000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
});
