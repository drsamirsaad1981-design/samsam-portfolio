// Samsam Portfolio — one dictionary for every UI label (all pages, cards, table, forms, exports).
// Change a wording here and it changes everywhere.
//  • JavaScript templates use  SAMSAM_LABELS.AMOUNT  etc.
//  • Static HTML uses  <span data-label="AMOUNT">Amount</span>  — filled from this file on load.
(function () {
  var L = {
    AMOUNT: 'Amount',
    AVG_BUY_PRICE: 'Avg. Buy Price',
    CURRENT_PRICE: 'Current Price',
    PORTFOLIO_VS_BTC: 'Portfolio vs BTC',      // labels are Title Case everywhere
    COST_BASIS: 'Cost Basis',
    HOLDINGS_VALUE: 'Holdings / Current Value',
    PNL: 'P&L',
    SIGNAL: 'Signal',
    BUY: 'Buy',
    SELL: 'Sell',
    TRANSFER_IN: 'Transfer In',
    TRANSFER_OUT: 'Transfer Out',
    ALL_TYPES: 'All Types',
    HISTORY: 'History',
    REMOVE: 'Remove',
    ADD_COIN: 'Add New Coin',
    // Accumulation Plan (table and cards use the same words)
    TARGET_AMOUNT: 'Target Amount',
    ACTUAL_AMOUNT: 'Actual Amount',
    PENDING_AMOUNT: 'Pending Amount',
    BUY_AT: 'Buy At',
    COST_TO_TARGET: 'Cost to Target',
    PROGRESS: 'Progress',
    PRICE_ALERT: 'Price Alert',
  };
  window.SAMSAM_LABELS = Object.freeze(L);
  function apply(root) {
    (root || document).querySelectorAll('[data-label]').forEach(function (el) {
      var k = el.getAttribute('data-label');
      if (L[k] && el.textContent !== L[k]) el.textContent = L[k];
    });
  }
  window.SamsamLabels = { apply: apply };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { apply(); });
  else apply();
})();
