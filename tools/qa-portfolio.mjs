export default async function run(page) {
    await page.evaluate(() => {
        localStorage.setItem('aga_projects', JSON.stringify([{ id: 'g1', projectNumber: 'AGA-1', projectName: 'Glass job', customerName: 'Glass customer', windows: [], dueDate: '2026-01-01' }]));
        localStorage.setItem('apc-projects', JSON.stringify([{ id: 'c1', name: 'Coat job', customer: 'Coat customer', items: [], status: 'complete' }]));
        document.getElementById('portfolioButton').click();
    });
    const first = await page.locator('#portfolioList .portfolio-card').allTextContents();
    await page.locator('#portfolioCompany').selectOption('coatings');
    const filtered = await page.locator('#portfolioList .portfolio-card').allTextContents();
    await page.locator('#portfolioList .portfolio-card button').click();
    await page.waitForFunction(() => document.querySelector('.trade-frame:not([hidden])')?.contentWindow?.document.getElementById('planning-single')?.hidden === false);
    const opened = await page.evaluate(() => document.querySelector('.trade-frame:not([hidden])').contentWindow.document.getElementById('project-name').value);
    await page.evaluate(() => document.getElementById('portfolioButton').click());
    await page.locator('#portfolioCompany').selectOption('glass');
    await page.locator('#portfolioList .portfolio-card button').click();
    await page.waitForFunction(() => document.querySelector('.trade-frame:not([hidden])')?.contentWindow?.document.getElementById('planning-single')?.hidden === false);
    const coatings = await page.evaluate(() => document.querySelector('.trade-frame:not([hidden])').contentWindow.document.getElementById('project-name').value);
    if (!first.some(text => text.includes('Glass job')) || !filtered.some(text => text.includes('Coat job')) || opened !== 'Coat job' || coatings !== 'Coat job') throw new Error('Portfolio navigation did not open the expected projects');
    return { companies: first.length, filtered: filtered.length, opened, coatings };
}
