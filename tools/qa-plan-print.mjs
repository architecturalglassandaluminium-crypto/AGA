export default async function run(page) {
  // Seed a project with one task, then drive the diary and check the print wiring.
  await page.addInitScript(() => {
    localStorage.setItem('apc-projects', JSON.stringify([{
      id: 'PR-2026-001', name: 'Print plan check', customer: 'Test', address: '1 Site Rd',
      start: '2026-10-01', end: '2026-10-20', status: 'in-progress', lead: 'Sipho',
      items: [{ source: 'Manual', task: 'Excavation', quantity: 1, duration: 480, days: 1, daysOverridden: false, quoteId: '', start: '2026-10-01', startPinned: true, finish: '2026-10-01', owner: 'Crew A', dependsOn: '', resources: 'TLB', notes: '', stage: 'In progress' }]
    }]));
  });
  await page.goto('http://127.0.0.1:8800/trades/coatings/index.html', { waitUntil: 'load' });

  // Navigate through the real nav item: the app boots on the quote view.
  await page.waitForSelector('#planning-view', { state: 'attached' });
  await page.evaluate(() => document.querySelector('.nav-item[data-view="planning"]').click());
  await page.waitForFunction(() => document.getElementById('planning-view').classList.contains('active-view'), null, { timeout: 10000 });

  // Open the seeded project via its own select, then switch to the One project tab.
  // The select lives inside the hidden #planning-single panel; pick via the DOM
  // so the hidden state does not block Playwright's visibility checks.
  await page.evaluate(() => {
    const select = document.getElementById('planning-project-select');
    select.value = '0';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('.planning-tab[data-planning-view="single"]').click();
  });
  await page.waitForFunction(() => !document.getElementById('planning-single').hidden, null, { timeout: 10000 });

  // Add a diary note via the input + button
  await page.fill('.planning-diary-input', 'Rain stopped work after 10am');
  await page.evaluate(() => document.querySelector('.planning-diary-button').click());

  // Read back what actually happened, without a fixed-count wait.
  const state = await page.evaluate(() => ({
    entries: [...document.querySelectorAll('.planning-diary-entry')].map(e => ({
      date: e.querySelector('b')?.textContent,
      text: e.querySelector('span')?.textContent
    })),
    printButton: !!document.getElementById('print-plan'),
    diaryAddOnScreen: !!document.querySelector('.planning-diary-add'),
    rowTask: document.querySelector('.planning-task')?.value,
    toast: document.getElementById('toast')?.textContent
  }));
  if (!state.printButton) throw new Error('no print button');
  if (state.entries.length !== 1 || !state.entries[0].date || state.entries[0].text !== 'Rain stopped work after 10am') {
    throw new Error('diary entry wrong: ' + JSON.stringify(state));
  }

  // Emulate print media and check what survives onto the page.
  await page.emulateMedia({ media: 'print' });
  const printState = await page.evaluate(() => {
    const vis = (el) => { if (!el) return 'missing'; const cs = getComputedStyle(el); return cs.display === 'none' ? 'hidden' : 'shown'; };
    return {
      sidebar: vis(document.querySelector('.sidebar')),
      printButton: vis(document.getElementById('print-plan')),
      diaryAdd: vis(document.querySelector('.planning-diary-add')),
      diaryEntry: vis(document.querySelector('.planning-diary-entry')),
      diaryText: document.querySelector('.planning-diary-entry span')?.textContent,
      taskInput: vis(document.querySelector('.planning-task')),
      singleView: vis(document.querySelector('.planning-single')),
      overview: vis(document.querySelector('.planning-overview')),
      timeline: vis(document.querySelector('.planning-timeline'))
    };
  });
  await page.emulateMedia({ media: 'screen' });

  if (printState.sidebar !== 'hidden') throw new Error('sidebar should hide in print');
  if (printState.printButton !== 'hidden') throw new Error('print button should hide in print');
  if (printState.diaryAdd !== 'hidden') throw new Error('diary input should hide in print');
  if (printState.diaryEntry !== 'shown') throw new Error('diary entry should print');
  if (printState.diaryText !== 'Rain stopped work after 10am') throw new Error('diary text lost in print');
  if (printState.taskInput !== 'shown') throw new Error('task values should print');
  if (printState.singleView !== 'shown') throw new Error('single view should print');
  if (printState.overview !== 'hidden') throw new Error('overview should hide in print');
  return { diary: state.entries, print: printState };
}
