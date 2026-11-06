// one-off: can GitHub read the ETF flow tables? prints status, size and the start of the table
const urls = ['https://farside.co.uk/btc/', 'https://farside.co.uk/eth/', 'https://farside.co.uk/bitcoin-etf-flow-all-data/', 'https://farside.co.uk/ethereum-etf-flow-all-data/'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
for (const u of urls) {
  try {
    const r = await fetch(u, { headers: { 'user-agent': UA, accept: 'text/html' } });
    const t = await r.text();
    const i = t.indexOf('<table');
    console.log('URL', u, 'status', r.status, 'len', t.length, 'tables', (t.match(/<table/g) || []).length);
    console.log('TITLE', (t.match(/<title>([^<]*)/) || [])[1]);
    if (i >= 0) { const tb = t.slice(i, i + 200000); const rows = tb.split(/<tr/).slice(0, 6).map(x => x.replace(/<[^>]+>/g, '|').replace(/\s+/g, ' ').replace(/\|+\s*\|+/g, '|').slice(0, 400)); console.log('HEAD', rows.join('\n')); const last = tb.split('</table>')[0].split(/<tr/).slice(-6).map(x => x.replace(/<[^>]+>/g, '|').replace(/\s+/g, ' ').replace(/\|+\s*\|+/g, '|').slice(0, 400)); console.log('TAIL', last.join('\n')); }
    else console.log('BODY', t.slice(0, 600).replace(/\s+/g, ' '));
  } catch (e) { console.log('URL', u, 'ERR', e.message); }
}
