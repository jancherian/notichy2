import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

async function diagnose() {
  const targetUrl = process.argv[2] || 'https://jancherian.github.io/ergonotch/';
  console.log(`Diagnosing URL: ${targetUrl}`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--no-sandbox',
    ],
  });

  const context = await browser.newContext({
    permissions: ['camera', 'notifications'],
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  const consoleLogs = [];
  const networkRequests = [];
  const failedRequests = [];

  page.on('console', (msg) => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
  });

  page.on('pageerror', (err) => {
    consoleLogs.push({ type: 'pageerror', text: err.message, stack: err.stack });
  });

  page.on('requestfailed', (req) => {
    failedRequests.push({ url: req.url(), failure: req.failure()?.errorText });
  });

  page.on('response', (res) => {
    networkRequests.push({ url: res.url(), status: res.status() });
    if (res.status() >= 400) {
      failedRequests.push({ url: res.url(), status: res.status() });
    }
  });

  try {
    const res = await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
    console.log(`Initial page response status: ${res?.status()}`);

    fs.mkdirSync('./diagnostics', { recursive: true });
    await page.screenshot({ path: './diagnostics/initial_load.png' });

    // Wait 2s for any initial scripts
    await page.waitForTimeout(2000);

    // Check if notch elements exist
    const rootExists = await page.$('#root');
    const islandExists = await page.$('#island');
    const bannerExists = await page.$('.web-preview-banner');
    console.log(`DOM elements: #root=${!!rootExists}, #island=${!!islandExists}, .web-preview-banner=${!!bannerExists}`);

    // Try clicking toggle button if available
    const toggleBtn = await page.$('#toggle-notch-btn');
    if (toggleBtn) {
      console.log('Clicking #toggle-notch-btn...');
      await toggleBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: './diagnostics/after_toggle_click.png' });
    }

    // Check tabs
    const tabs = await page.$$('.tab-btn');
    console.log(`Found ${tabs.length} tabs`);

  } catch (err) {
    console.error('Diagnosis error:', err);
  } finally {
    console.log('\n--- CONSOLE LOGS ---');
    consoleLogs.forEach((log) => console.log(`[${log.type}] ${log.text}`));

    console.log('\n--- FAILED / >= 400 REQUESTS ---');
    failedRequests.forEach((req) => console.log(req));

    console.log('\n--- TOTAL REQUESTS ---');
    console.log(`Total: ${networkRequests.length}`);

    await browser.close();
  }
}

diagnose();

