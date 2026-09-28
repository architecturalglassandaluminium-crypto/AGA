/*
 * QA for the AGA trade switcher.
 *
 * Drives the switcher through all three trades and reports what each
 * one actually rendered. Run with the browser-automation skill:
 *
 *   node <skill>/browser.mjs http://127.0.0.1:8800/ --script tools/qa-trades.mjs
 *
 * Clicks are made on the real buttons, scoped to the top document.
 * Once an embedded trade frame exists, an unscoped locator can resolve
 * inside that frame instead of the header, so everything here is
 * pinned to the main frame.
 */
export default async function run(page, ui) {
  const results = {};
  const main = page.mainFrame();

  // A brand-new service worker takes over on first load and reloads the
  // page, which would wipe the script mid-run. Load once, let that
  // settle, then work on the second load.
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.trade-frame-holder', {
    state: 'attached',
    timeout: 15000
  });

  // --- Glass & Aluminium is where the app starts ---
  results.glass = await readMain(main);

  // --- Plumbing ---
  await clickTrade(main, 'Plumbing');
  await waitForTrade(main, 'Plumbing');
  await page.waitForTimeout(2000);
  results.plumbing = await readMain(main);
  results.plumbingApp = await readFrame(page, 'trades/plumbing');

  // --- Performance Coatings ---
  await clickTrade(main, 'Performance Coatings');
  await waitForTrade(main, 'Performance Coatings');
  await page.waitForTimeout(2000);
  results.coatings = await readMain(main);
  results.coatingsApp = await readFrame(page, 'trades/coatings');

  // --- Back to Glass: the production app must come back cleanly ---
  await clickTrade(main, 'Glass & Aluminium');
  await waitForTrade(main, 'Glass & Aluminium');
  await page.waitForTimeout(500);
  results.backToGlass = await readMain(main);

  return results;
}

function clickTrade(main, label) {
  return main
    .locator('.trade-button', { hasText: label })
    .first()
    .click();
}

/* Wait until the named button is the one marked active. */
function waitForTrade(main, label) {
  return main
    .locator('.trade-button.active', { hasText: label })
    .first()
    .waitFor({ state: 'visible', timeout: 15000 });
}

async function readMain(main) {
  return main.evaluate(() => {
    const nav = document.querySelector('.main-navigation');
    const container = document.querySelector('.app-container');
    const tradeView = document.getElementById('trade-view');
    return {
      activeTrade: document.querySelector('.trade-button.active')?.textContent.trim(),
      navDisplay: nav ? getComputedStyle(nav).display : 'missing',
      containerDisplay: container ? getComputedStyle(container).display : 'missing',
      tradeViewHidden: tradeView ? tradeView.hidden : 'missing',
      bodyClass: document.body.className,
      frames: [...document.querySelectorAll('.trade-frame')].map(f => ({
        src: f.getAttribute('src'),
        hidden: f.hidden
      }))
    };
  });
}

async function readFrame(page, pathPart) {
  const frame = page.frames().find(f => f.url().includes(pathPart));
  if (!frame) return 'frame not found';

  return {
    url: frame.url(),
    title: await frame.title(),
    heading: await frame.evaluate(() => {
      const h = document.getElementById('page-title');
      return h ? h.textContent.trim() : 'missing';
    }),
    navItems: await frame.evaluate(() =>
      [...document.querySelectorAll('.nav-item')].map(n =>
        n.textContent.replace(/\s+/g, ' ').trim()
      )
    )
  };
}