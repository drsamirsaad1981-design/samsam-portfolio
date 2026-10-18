// samsam-chart.js — one canvas line-chart renderer for every chart in the app.
//   • X axis is real time: 24h ranges show clock times (03:00, 09:00, 15:00 …),
//     longer ranges show dates (18 Oct) — no more repeated "18 Oct … 18 Oct".
//   • Y axis uses "nice" steps with enough decimals that no two labels repeat
//     ($10.70K, $10.75K, $10.80K / 1.25%, 1.50% …).
//   • Smooth monotone curve (never overshoots the real data) + soft gradient fill.
//
// SamsamChart.draw(canvas, {
//   height: 200,
//   series: [{ points: [{t, v}], color: '#22c55e', fill: true, width: 2.5, dashed: false }],
//   format: 'usd' | 'pct',
// })
(function () {
  function niceStep(range, target) {
    if (!(range > 0) || !isFinite(range)) return 1;
    var raw = range / (target || 4), mag = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / mag;
    return (n < 1.5 ? 1 : n < 2.25 ? 2 : n < 3.5 ? 2.5 : n < 7.5 ? 5 : 10) * mag;
  }
  function decimalsFor(step) { // enough decimals to show the step, so labels never repeat
    if (!(step > 0)) return 0;
    var d = 0; while (d < 6 && Math.abs(Math.round(step * Math.pow(10, d)) - step * Math.pow(10, d)) > 1e-6) d++;
    return d;
  }
  function yFormatter(format, step, maxAbs) {
    if (format === 'pct') { var dp = decimalsFor(step); return function (v) { return (v > 0 ? '+' : '') + v.toFixed(dp) + '%'; }; }
    if (maxAbs >= 1e6) { var dm = Math.max(1, decimalsFor(step / 1e6)); return function (v) { return '$' + (v / 1e6).toFixed(Math.min(dm, 3)) + 'M'; }; }
    if (maxAbs >= 1e4) { var dk = Math.max(1, decimalsFor(step / 1e3)); return function (v) { return '$' + (v / 1e3).toFixed(Math.min(dk, 3)) + 'K'; }; }
    var d = Math.min(decimalsFor(step), 6);
    return function (v) { return '$' + v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); };
  }
  // Time ticks at round boundaries; label style depends on the visible span.
  var H = 3600e3, D = 24 * H;
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var dayMon = function (t) { var d = new Date(t); return d.getDate() + ' ' + MON[d.getMonth()]; };
  function timeTicks(t0, t1, maxTicks) {
    var span = t1 - t0, out = [];
    var hhmm = function (t) { var d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
    if (!(span > 0)) return { ticks: [t0], fmt: function (t) { return dayMon(t) + ' ' + hhmm(t); } };
    if (span <= 1.6 * D) {
      var steps = [1, 2, 3, 4, 6, 12].map(function (h) { return h * H; });
      var st = steps.find(function (s) { return span / s <= maxTicks; }) || 12 * H;
      var d0 = new Date(t0); d0.setMinutes(0, 0, 0);
      var start = d0.getTime(); while ((new Date(start).getHours() * H) % st !== 0 || start < t0) start += H;
      for (var t = start; t <= t1; t += st) out.push(t);
      return { ticks: out, fmt: hhmm };
    }
    var dayStep = [1, 2, 3, 7, 14, 30, 60, 90].find(function (n) { return span / (n * D) <= maxTicks; }) || 180;
    var s0 = new Date(t0); s0.setHours(0, 0, 0, 0); var tt = s0.getTime(); if (tt < t0) tt += D;
    for (; tt <= t1; tt += dayStep * D) out.push(tt);
    var withYear = span > 300 * D;
    return { ticks: out, fmt: function (t) { var d = new Date(t); return withYear ? MON[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2) : dayMon(t); } };
  }
  // Monotone cubic (Fritsch–Carlson): smooth, but never above/below the real values.
  function smoothPath(ctx, pts, moveFirst) {
    var n = pts.length; if (!n) return;
    if (moveFirst) ctx.moveTo(pts[0][0], pts[0][1]); else ctx.lineTo(pts[0][0], pts[0][1]);
    if (n < 3) { for (var k = 1; k < n; k++) ctx.lineTo(pts[k][0], pts[k][1]); return; }
    var dx = [], dy = [], m = [], tan = [];
    for (var i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; dy[i] = pts[i + 1][1] - pts[i][1]; m[i] = dx[i] ? dy[i] / dx[i] : 0; }
    tan[0] = m[0]; tan[n - 1] = m[n - 2];
    for (i = 1; i < n - 1; i++) tan[i] = (m[i - 1] * m[i] <= 0) ? 0 : (m[i - 1] + m[i]) / 2;
    for (i = 0; i < n - 1; i++) {
      if (m[i] === 0) { tan[i] = 0; tan[i + 1] = 0; continue; }
      var a = tan[i] / m[i], b = tan[i + 1] / m[i], s = a * a + b * b;
      if (s > 9) { var tau = 3 / Math.sqrt(s); tan[i] = tau * a * m[i]; tan[i + 1] = tau * b * m[i]; }
    }
    for (i = 0; i < n - 1; i++) {
      var h = dx[i] / 3;
      ctx.bezierCurveTo(pts[i][0] + h, pts[i][1] + h * tan[i], pts[i + 1][0] - h, pts[i + 1][1] - h * tan[i + 1], pts[i + 1][0], pts[i + 1][1]);
    }
  }
  function hexToRgba(hex, a) {
    var h = hex.replace('#', ''); if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h, 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function draw(canvas, o) {
    var dpr = window.devicePixelRatio || 1;
    // Width available inside the parent (clientWidth includes padding, so subtract it)
    var par = canvas.parentElement, W = 340;
    if (par && par.clientWidth) { var cs = getComputedStyle(par); W = par.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0); }
    else if (canvas.offsetWidth) W = canvas.offsetWidth;
    W = Math.max(120, Math.floor(W));
    var Hh = o.height || 160;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(Hh * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = Hh + 'px';
    var ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, Hh);
    var dark = document.documentElement.getAttribute('data-theme') !== 'light';
    var grid = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
    var label = dark ? 'rgba(148,163,184,0.75)' : 'rgba(100,116,139,0.85)';
    var series = (o.series || []).filter(function (s) { return s.points && s.points.length; });
    if (!series.length) return;
    var all = []; series.forEach(function (s) { s.points.forEach(function (p) { all.push(p); }); });
    var t0 = Math.min.apply(null, all.map(function (p) { return p.t; })), t1 = Math.max.apply(null, all.map(function (p) { return p.t; }));
    var vMin = Math.min.apply(null, all.map(function (p) { return p.v; })), vMax = Math.max.apply(null, all.map(function (p) { return p.v; }));
    if (vMin === vMax) { var bump = Math.abs(vMin) * 0.01 || 1; vMin -= bump; vMax += bump; }
    var step = niceStep(vMax - vMin, Hh >= 180 ? 5 : 4);
    var axMin = Math.floor(vMin / step) * step, axMax = Math.ceil(vMax / step) * step;
    if (axMax - axMin < step) axMax = axMin + step;
    var fmtY = yFormatter(o.format, step, Math.max(Math.abs(axMin), Math.abs(axMax)));
    var ticksY = []; for (var v = axMin; v <= axMax + step / 1e6; v += step) ticksY.push(+v.toFixed(10));
    ctx.font = '10px Inter, system-ui, sans-serif';
    var lw = Math.max.apply(null, ticksY.map(function (t) { return ctx.measureText(fmtY(t)).width; })) + 10;
    var pad = { top: 10, bottom: 22, left: 6, right: Math.max(lw, 36) };
    var cW = W - pad.left - pad.right, cH = Hh - pad.top - pad.bottom;
    var span = t1 - t0;
    var toX = function (t, i, n) { return pad.left + (span > 0 ? (t - t0) / span : (n > 1 ? i / (n - 1) : 0.5)) * cW; };
    var toY = function (val) { return pad.top + (1 - (val - axMin) / (axMax - axMin)) * cH; };
    // grid + Y labels
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ticksY.forEach(function (t) {
      var y = Math.round(toY(t)) + 0.5;
      ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = label; ctx.fillText(fmtY(t), W - 2, y);
    });
    // X labels (time)
    var maxTicks = Math.max(2, Math.floor(cW / 70));
    var tt = timeTicks(t0, t1, maxTicks);
    ctx.textBaseline = 'alphabetic'; ctx.fillStyle = label;
    tt.ticks.forEach(function (t) {
      var x = toX(t, 0, 1), txt = tt.fmt(t), w = ctx.measureText(txt).width;
      ctx.textAlign = 'center';
      x = Math.min(Math.max(x, pad.left + w / 2), W - pad.right - w / 2);
      ctx.fillText(txt, x, Hh - 5);
    });
    // series
    series.forEach(function (s) {
      var n = s.points.length;
      var pts = s.points.map(function (p, i) { return [toX(p.t, i, n), toY(p.v)]; });
      if (s.fill) {
        var g = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
        g.addColorStop(0, hexToRgba(s.color, dark ? 0.30 : 0.22)); g.addColorStop(1, hexToRgba(s.color, 0));
        ctx.beginPath(); smoothPath(ctx, pts, true);
        ctx.lineTo(pts[n - 1][0], pad.top + cH); ctx.lineTo(pts[0][0], pad.top + cH); ctx.closePath();
        ctx.fillStyle = g; ctx.fill();
      }
      ctx.beginPath(); ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 2;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash(s.dashed ? [5, 4] : []);
      smoothPath(ctx, pts, true); ctx.stroke(); ctx.setLineDash([]);
    });
  }
  window.SamsamChart = { draw: draw, _niceStep: niceStep, _yFormatter: yFormatter, _timeTicks: timeTicks };
})();
