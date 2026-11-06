// one-off: what does CoinCodex answer for coins we couldn't match (removed after the check)
const q = async s => { const r = await fetch('https://coincodex.com/api/v1/assets/get_asset_list?' + s + '&limit=1000'); const j = await r.json().catch(() => null); return { status: r.status, keys: j && Object.keys(j), n: j && Array.isArray(j.data) ? j.data.length : null, data: j && Array.isArray(j.data) ? j.data : j }; };
for (const s of ['select_bysymbol=BNB,WLD,PI,SKY,NIGHT,GT,HTX,KITE', 'select_byslug=binancecoin,bnb,worldcoin,pi-network,sky,midnight']) {
  const r = await q(s); console.log('Q', s, 'status', r.status, 'n', r.n, 'keys', r.keys);
  for (const x of (Array.isArray(r.data) ? r.data : []).slice(0, 30)) console.log('  ', JSON.stringify({ symbol: x.symbol, display_symbol: x.display_symbol, name: x.name, slug: x.slug, not: x.not_trading_anymore, mc: x.market_cap_usd || x.last_market_cap_usd }));
  if (!Array.isArray(r.data)) console.log('  ', JSON.stringify(r.data).slice(0, 500));
}
