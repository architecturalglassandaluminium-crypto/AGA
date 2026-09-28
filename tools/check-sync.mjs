// End-to-end round trip against the DEPLOYED cloud function.
//
// Answers one question that no offline test can: does sync actually
// work end to end, right now, against the real deployment? It saves a
// throwaway quote, reads it back, checks the trade separation, tries to
// delete it from the WRONG trade, and finally deletes it properly.
//
// Run on demand, not as part of `npm run test`: the tests are offline
// and deterministic, this talks to a live project.
//
//     npm run check:sync
//
// Exit code 0 when every step behaves, 1 otherwise.
//
// It cleans up after itself - the test quote is deleted at the end - so
// it is safe to run against the live database.
import { readFileSync } from 'node:fs';

const cfg = readFileSync('supabase-config.js', 'utf8');
const url = cfg.match(/SUPABASE_URL\s*=\s*"([^"]+)"/)[1];
const key = cfg.match(/SUPABASE_ANON_KEY\s*=\s*"([^"]+)"/)[1];
const base = `${url}/functions/v1/cloud`;

const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { console.log(`  ok   ${name}`); pass++; }
  else { console.log(`  FAIL ${name} ${detail}`); fail++; }
}

async function call(q, init = {}) {
  const r = await fetch(`${base}${q}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await r.text();
  let body = null;
  try { body = JSON.parse(t); } catch { body = t; }
  return { status: r.status, body };
}

const id = `TEST-ROUNDTRIP-${Date.now()}`;

console.log('\n--- status ---');
{
  const { status, body } = await call('?action=status');
  check('status 200 and configured:true', status === 200 && body.configured === true, JSON.stringify(body));
}

console.log('\n--- list (aps) ---');
{
  const { status, body } = await call('?action=list&trade=aps');
  check('list 200 with a quotes array', status === 200 && Array.isArray(body.quotes), JSON.stringify(body));
}

console.log('\n--- list rejects a missing trade ---');
{
  const { status, body } = await call('?action=list');
  check('400 and a clear error', status === 400 && /trade/i.test(body.error || ''), JSON.stringify(body));
}

console.log('\n--- list rejects an unknown trade ---');
{
  const { status, body } = await call('?action=list&trade=nonsense');
  check('400 and a clear error', status === 400 && /trade/i.test(body.error || ''), JSON.stringify(body));
}

console.log('\n--- save ---');
{
  const quote = { id, customer: { name: 'Round Trip Test' }, totals: { total: 123.45 } };
  const { status, body } = await call('?action=save&trade=aps', {
    method: 'POST',
    body: JSON.stringify({ id, quote })
  });
  check('save 200 and echoes the id', status === 200 && body.saved === id, JSON.stringify(body));
}

console.log('\n--- list shows the saved quote, body intact ---');
{
  const { status, body } = await call('?action=list&trade=aps');
  const row = (body.quotes || []).find(q => q.id === id);
  check('the quote is listed', status === 200 && !!row, JSON.stringify(body).slice(0, 200));
  check('its body survived the round trip',
    row && row.body && row.body.customer && row.body.customer.name === 'Round Trip Test',
    row ? JSON.stringify(row.body).slice(0, 120) : 'no row');
}

console.log('\n--- the trade column keeps the books apart ---');
{
  const { body } = await call('?action=list&trade=apc');
  const leaked = (body.quotes || []).some(q => q.id === id);
  check('an aps quote does NOT appear in the apc list', !leaked);
}

console.log('\n--- save stamps the calling trade ---');
{
  const { body } = await call('?action=list&trade=aps');
  const row = (body.quotes || []).find(q => q.id === id);
  check('the row came back from the aps book', !!row);
}

console.log('\n--- delete is scoped to the calling trade ---');
{
  // Try to delete our aps quote while claiming to be apc. It must not delete.
  const wrong = await call('?action=delete&trade=apc', { method: 'POST', body: JSON.stringify({ id }) });
  check('delete from the wrong trade returns 200 but removes nothing', wrong.status === 200);

  const { body } = await call('?action=list&trade=aps');
  const stillThere = (body.quotes || []).some(q => q.id === id);
  check('the aps quote SURVIVED a delete issued as apc', stillThere,
    'this is the bug the trade-scoped delete was added for');
}

console.log('\n--- delete from the right trade ---');
{
  const { status, body } = await call('?action=delete&trade=aps', { method: 'POST', body: JSON.stringify({ id }) });
  check('delete 200 and echoes the id', status === 200 && body.deleted === id, JSON.stringify(body));

  const { body: after } = await call('?action=list&trade=aps');
  const gone = !(after.quotes || []).some(q => q.id === id);
  check('the quote is gone', gone);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);