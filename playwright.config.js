// @ts-check
const fs = require('fs');
const { defineConfig, devices } = require('@playwright/test');

// Edge staat standaard op Windows 11; anders de door Playwright geinstalleerde Chromium.
const EDGE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];
const hasEdge = EDGE_PATHS.some((p) => fs.existsSync(p));

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: [['list']],
  timeout: 30000,
  use: {
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'iphone',
      use: { ...devices['iPhone 14'] }
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(hasEdge ? { channel: 'msedge' } : {}),
        viewport: { width: 390, height: 844 },
        hasTouch: true
      }
    }
  ],
  webServer: {
    command: 'node tests/tools/serve.js 8765',
    url: 'http://localhost:8765/index.html',
    reuseExistingServer: true,
    timeout: 15000
  }
});
