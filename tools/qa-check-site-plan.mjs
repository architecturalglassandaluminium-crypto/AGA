export default async function run(page) {
  // Wait for the app's DOM to be ready (#planning-view is initially display:none until active)
  await page.waitForSelector('#planning-view', { state: 'attached' });

  // Navigate directly inside the page via its nav item click
  await page.evaluate(() => {
    const item = document.querySelector('.nav-item[data-view="planning"]');
    if (item) item.click();
  });

  // Wait for planning view to become active
  await page.waitForFunction(() => {
    const v = document.getElementById('planning-view');
    return v && v.classList.contains('active-view');
  });

  // Switch to the single-project view tab
  await page.evaluate(() => {
    const tab = document.querySelector('.planning-tab[data-planning-view="single"]');
    if (tab) tab.click();
  });

  // Add a fresh task row
  await page.evaluate(() => {
    const btn = document.getElementById('add-planning-task');
    if (btn) btn.click();
  });

  // Inspect the created row and all its inputs. The single-project
  // headings are read from #planning-single so the overview table's
  // own .planning-headings block (different columns) is not counted.
  return await page.evaluate(() => {
    const row = document.querySelector('#planning-list .planning-row');
    if (!row) return { error: 'no row created' };
    const headings = [...document.querySelectorAll('#planning-single .planning-headings span')].map(s => s.textContent.trim()).filter(Boolean);
    return {
      hasTask: !!row.querySelector('.planning-task'),
      hasOwner: !!row.querySelector('.planning-owner'),
      hasStart: !!row.querySelector('.planning-start'),
      hasDays: !!row.querySelector('.planning-days'),
      hasFinish: !!row.querySelector('.planning-finish'),
      hasDepends: !!row.querySelector('.planning-depends'),
      hasResources: !!row.querySelector('.planning-resources'),
      hasNotes: !!row.querySelector('.planning-notes'),
      hasStage: !!row.querySelector('.planning-stage'),
      headingsCount: headings.length,
      headingsText: headings
    };
  });
}
