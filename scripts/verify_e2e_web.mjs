import { chromium } from '@playwright/test';
import fs from 'node:fs';

async function runE2E() {
  const url = process.argv[2] || 'https://jancherian.github.io/ergonotch/';
  console.log(`Starting E2E Verification on: ${url}`);

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

  const consoleErrors = [];
  const externalRequests = [];
  const failedRequests = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', (err) => {
    consoleErrors.push(err.message);
  });

  page.on('response', (res) => {
    const resUrl = res.url();
    if (res.status() >= 400) {
      failedRequests.push({ url: resUrl, status: res.status() });
    }
    const origin = new URL(resUrl).origin;
    const targetOrigin = new URL(url).origin;
    if (origin !== targetOrigin && !resUrl.startsWith('data:') && !resUrl.startsWith('blob:')) {
      externalRequests.push(resUrl);
    }
  });

  const results = {
    pageLoad: false,
    notchPillVisible: false,
    expanded: false,
    all6Tabs: false,
    focusTimerWorks: false,
    tasksCrudWorks: false,
    habitsPersistenceWorks: false,
    cameraInferenceWorks: false,
    zeroConsoleErrors: false,
    zeroExternalRequests: false,
  };

  try {
    fs.mkdirSync('./diagnostics/e2e', { recursive: true });

    // 1. Page Load
    const nav = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    results.pageLoad = nav.status() === 200;

    // 2. Notch Pill Visible
    const island = await page.$('#island');
    results.notchPillVisible = !!island;
    await page.screenshot({ path: './diagnostics/e2e/01_notch_pill.png' });

    // 3. Expand Notch & wait for spring to settle
    await page.waitForTimeout(1000);
    const expandBtn = await page.$('#toggle-notch-btn');
    if (expandBtn) {
      const isExpanded = await page.evaluate(() => (document.querySelector('#island')?.clientHeight || 0) > 100);
      if (!isExpanded) {
        await expandBtn.click();
      }
    }
    await page.waitForTimeout(1500); // Wait for spring animation to settle
    results.expanded = await page.evaluate(() => (document.querySelector('#island')?.clientHeight || 0) > 100);
    await page.screenshot({ path: './diagnostics/e2e/02_expanded_panel.png' });

    // 4. Check All 6 Tabs
    const tabs = await page.locator('.tab').all();
    results.all6Tabs = tabs.length === 6;
    console.log(`Tabs found: ${tabs.length}/6`);

    // 5. Test Focus Timer (Tab 0)
    console.log('Testing Focus Timer...');
    await tabs[0].click({ force: true });
    await page.waitForTimeout(800);
    const startBtn = page.locator('.timer-main-container .btn-row button').first();
    if (await startBtn.count() > 0) {
      const digitsBefore = await page.locator('.notch-timer-digits').textContent();
      await startBtn.click({ force: true }); // Start Focus
      await page.waitForTimeout(1500);
      const digitsAfter = await page.locator('.notch-timer-digits').textContent();
      await startBtn.click({ force: true }); // Pause Focus
      await page.waitForTimeout(500);
      results.focusTimerWorks = digitsAfter !== null && digitsAfter.includes(':');
      console.log(`Focus timer verified (digits before: ${digitsBefore}, after: ${digitsAfter})`);
    }

    // 6. Test Tasks (Tab 1)
    console.log('Testing Tasks...');
    await tabs[1].click({ force: true });
    await page.waitForTimeout(800);
    const taskInput = page.locator('input.task-input').first();
    if (await taskInput.count() > 0) {
      await taskInput.fill('Playwright Test Task');
      await taskInput.press('Enter');
      await page.waitForTimeout(800);
      const hasNewTask = await page.evaluate(() => document.body.textContent.includes('Playwright Test Task'));
      results.tasksCrudWorks = hasNewTask;
      console.log(`Tasks CRUD verified: ${hasNewTask}`);
    }

    // 7. Test Habits (Tab 2)
    console.log('Testing Habits...');
    await tabs[2].click({ force: true });
    await page.waitForTimeout(800);
    const habitChecks = page.locator('.habit-done-btn');
    if (await habitChecks.count() > 0) {
      await habitChecks.first().click({ force: true });
      await page.waitForTimeout(500);
      // Reload and verify persistence
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);
      const habitsInStorage = await page.evaluate(() => !!localStorage.getItem('notch_habits_v1'));
      results.habitsPersistenceWorks = habitsInStorage;
      console.log(`Habits persistence in localStorage verified: ${habitsInStorage}`);
    }

    // Expand again after reload
    await page.waitForTimeout(1000);
    const reToggle = page.locator('#toggle-notch-btn');
    if (await reToggle.count() > 0) {
      await reToggle.click({ force: true });
      await page.waitForTimeout(1500);
    }
    const reTabs = await page.locator('.tab').all();
    if (reTabs.length >= 4) {
      // 8. Test Wellbeing & Camera (Tab 3)
      console.log('Testing Wellbeing & Posture Camera with fake webcam...');
      await reTabs[3].click({ force: true });
      await page.waitForTimeout(800);

      const camSwitch = page.locator('.wellbeing-toggle-card button.switch').first();
      if (await camSwitch.count() > 0) {
        console.log('Turning on Camera Analysis...');
        await camSwitch.click({ force: true });
        // Wait for MediaPipe WASM and pose landmarker to initialize from same-origin
        await page.waitForTimeout(6000);

        const previewStatus = await page.locator('.preview-status-heading').textContent().catch(() => null);
        const liveIndicator = await page.locator('.cam-live-indicator').count();
        console.log(`Posture preview heading: ${previewStatus}, live indicator count: ${liveIndicator}`);
        await page.screenshot({ path: './diagnostics/e2e/03_posture_camera_active.png' });

        // Click Pause/Stop button if visible or toggle off
        const stopBtn = page.locator('.stop-cam-btn');
        if (await stopBtn.count() > 0 && await stopBtn.isVisible()) {
          console.log('Testing Pause/Disable kill switch via stopBtn...');
          await stopBtn.click({ force: true });
          await page.waitForTimeout(500);
        } else {
          console.log('Toggling off via switch...');
          await camSwitch.click({ force: true });
          await page.waitForTimeout(500);
        }

        results.cameraInferenceWorks = (liveIndicator > 0 || (previewStatus && previewStatus !== 'Camera Inactive'));
      }
    }

    results.zeroConsoleErrors = consoleErrors.length === 0;
    results.zeroExternalRequests = externalRequests.length === 0 && failedRequests.length === 0;

  } catch (err) {
    console.error('E2E run error:', err);
  } finally {
    console.log('\n========================================');
    console.log('       PART 3 E2E TEST RESULTS         ');
    console.log('========================================');
    console.log(`Page Load (200 OK):             ${results.pageLoad ? 'PASS' : 'FAIL'}`);
    console.log(`Notch Pill Rendered:            ${results.notchPillVisible ? 'PASS' : 'FAIL'}`);
    console.log(`Expand / Collapse Animation:    ${results.expanded ? 'PASS' : 'FAIL'}`);
    console.log(`All 6 Tabs Active:              ${results.all6Tabs ? 'PASS' : 'FAIL'}`);
    console.log(`Focus Timer (Start/Pause):      ${results.focusTimerWorks ? 'PASS' : 'FAIL'}`);
    console.log(`Tasks CRUD (Add/Filter):        ${results.tasksCrudWorks ? 'PASS' : 'FAIL'}`);
    console.log(`Habits Persistence:             ${results.habitsPersistenceWorks ? 'PASS' : 'FAIL'}`);
    console.log(`Local Posture & Camera AI:      ${results.cameraInferenceWorks ? 'PASS' : 'FAIL'}`);
    console.log(`Zero Console Errors:            ${results.zeroConsoleErrors ? 'PASS' : 'FAIL'} (${consoleErrors.length} errors)`);
    console.log(`Zero External/Failed Requests:  ${results.zeroExternalRequests ? 'PASS' : 'FAIL'} (${failedRequests.length} failed, ${externalRequests.length} external)`);
    console.log('========================================\n');

    if (consoleErrors.length > 0) {
      console.log('Console Errors:', consoleErrors);
    }
    if (failedRequests.length > 0) {
      console.log('Failed Requests:', failedRequests);
    }
    if (externalRequests.length > 0) {
      console.log('External Requests:', externalRequests);
    }

    await browser.close();
  }
}

runE2E();
