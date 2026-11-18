// Samsam Portfolio — the Arabic wording for every English text on screen (used by samsam-lang.js when the app is in Arabic).
// Style: how traders and investors speak (not word-for-word); terms traders say in English (DCA, ETF, Staking…) stay or sit beside the Arabic.
// Key = the English exactly as the app shows it (without leading emoji/marks or a trailing ":" / "…").
(function () {
  if (!window.CPLang || !CPLang.ar) return;
  var A = CPLang.add, R = CPLang.rx;
  var n = function (x) { return '⁦' + x + '⁩'; };   // a number / price kept left-to-right inside Arabic
  var MON = { Jan: 'يناير', Feb: 'فبراير', Mar: 'مارس', Apr: 'أبريل', May: 'مايو', Jun: 'يونيو', Jul: 'يوليو', Aug: 'أغسطس', Sep: 'سبتمبر', Sept: 'سبتمبر', Oct: 'أكتوبر', Nov: 'نوفمبر', Dec: 'ديسمبر',
    January: 'يناير', February: 'فبراير', March: 'مارس', April: 'أبريل', June: 'يونيو', July: 'يوليو', August: 'أغسطس', September: 'سبتمبر', October: 'أكتوبر', November: 'نوفمبر', December: 'ديسمبر' };
  var MRX = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)';
  var ampm = function (x) { return x === 'AM' ? 'ص' : 'م'; };
  var time = function (s) { var m = /^(\d{1,2}:\d\d)\s?(AM|PM)$/.exec(s); return m ? m[1] + ' ' + ampm(m[2]) : s; };
  var date = function (s) {   // "Nov 16, 2026" · "November 16, 2026" · "16 Nov 2026" · "Nov 16" · "Nov 16, 11:07 PM"
    var m = new RegExp('^' + MRX + ' (\\d{1,2})(?:, (\\d{4}))?(?:, (\\d{1,2}:\\d\\d\\s?[AP]M))?$').exec(s);
    if (m) return m[2] + ' ' + MON[m[1]] + (m[3] ? ' ' + m[3] : '') + (m[4] ? '، ' + time(m[4]) : '');
    m = new RegExp('^(\\d{1,2}) ' + MRX + '(?: (\\d{4}))?$').exec(s);
    if (m) return m[1] + ' ' + MON[m[2]] + (m[3] ? ' ' + m[3] : '');
    return null;
  };
  CPLang.date2 = date;
  // Arabic counting: 1 يوم · 2 يومين · 3–10 أيام · 11+ يوم
  var pl = function (k, one, two, few, many) { k = +k; return k === 1 ? one : k === 2 ? two : (k % 100 >= 3 && k % 100 <= 10) ? k + ' ' + few : k + ' ' + (many === 'يوم' && k % 100 >= 11 ? 'يوماً' : many); };

  // ── times and dates ──
  R(/^(\d{1,2}:\d\d)\s?(AM|PM)$/, function (_, t, p) { return t + ' ' + ampm(p); });
  R(new RegExp('^' + MRX + ' \\d{1,2}(?:, \\d{4})?(?:, \\d{1,2}:\\d\\d\\s?[AP]M)?$'), function (s) { return date(s); });
  R(new RegExp('^\\d{1,2} ' + MRX + '(?: \\d{4})?$'), function (s) { return date(s); });
  R(/^Live · Updated (.+)$/, function (_, t) { return 'مباشر · آخر تحديث ' + time(t); });
  R(/^Updated (.+)$/, function (_, t) { return 'آخر تحديث ' + (date(t) || (/ago$|^just now$/.test(t) ? CPLang.t(t) : time(t))); });
  R(/^Synced (.+)$/, function (_, t) { return 'تمت المزامنة ' + (date(t) || time(t)); });
  R(/^Last backup: (.+)$/, function (_, t) { return 'آخر نسخة احتياطية: ' + (t === 'Never' ? 'لا توجد' : (date(t) || (/ago$|^just now$/.test(t) ? CPLang.t(t) : n(t)))); });
  R(/^Use the original baseline \((.+)\)$/, function (_, t) { return 'الرجوع لتاريخ الأساس الأصلي (' + (date(t) || t) + ')'; });
  R(/^(\d+) \/ (\d+) targets met$/, function (_, a, b) { return 'تحقق ' + a + ' من ' + b + ' أهداف'; });
  R(/^— \/ — targets met$/, 'الأهداف المحققة: — / —');
  R(/^([\d.]+%) complete$/, function (_, p) { return 'مكتمل ' + n(p); });
  R(/^Building charts from real prices… (\d+) \/ (\d+) coins$/, function (_, a, b) { return 'جاري بناء الرسوم من الأسعار الفعلية… ' + a + ' / ' + b + ' عملة'; });
  R(/^Building from real prices… (\d+) \/ (\d+) coins$/, function (_, a, b) { return 'جاري البناء من الأسعار الفعلية… ' + a + ' / ' + b + ' عملة'; });
  R(/^from (\d+) sells?$/, function (_, a) { return 'من ' + pl(a, 'عملية بيع واحدة', 'عمليتين بيع', 'عمليات بيع', 'عملية بيع'); });
  R(/^Cost: (.+)$/, function (_, v) { return 'التكلفة: ' + n(v); });
  R(/^(.+) · (.+) added$/, function (_, a, b) { return n(a) + ' · مضاف ' + n(b); });
  R(/^Value change (\S+) = (\S+) from prices, (\S+) (added|taken out)$/, function (_, a, b, c, w) { return 'تغيّر القيمة ' + n(a) + ' = ' + n(b) + ' من حركة الأسعار، ' + n(c) + (w === 'added' ? ' مضاف' : ' مسحوب'); });
  R(/^(.+) realized ([+−-]) (.+) unrealized = (.+)$/, function (_, a, op, b, c) { return 'محقق ' + n(a) + ' ' + op + ' غير محقق ' + n(b) + ' = ' + n(c); });
  R(/^(\d+) sells?(?: · after (.+) selling fees)?$/, function (_, a, f) { return pl(a, 'عملية بيع واحدة', 'عمليتين بيع', 'عمليات بيع', 'عملية بيع') + (f ? ' · بعد خصم رسوم بيع ' + n(f) : ''); });
  R(/^(\d+) of (\d+)$/, '$1 من $2');
  R(/^categories on target · band ±([\d.]+) pts$/, 'تصنيفات على الهدف · الهامش ±$1 نقطة');
  R(/^(\d+) to rebalance$/, function (_, a) { return a + ' بحاجة إلى إعادة توازن'; });
  R(/^(.+) · (.+) taken out$/, function (_, a, b) { return n(a) + ' · مسحوب ' + n(b); });
  R(/^Tap for details — Realized (.+) \+ Unrealized (.+)$/, function (_, a, b) { return 'اضغط للتفاصيل — محقق ' + n(a) + ' + غير محقق ' + n(b); });
  R(/^(Best|Worst) Performer: (.+)$/, function (_, w, v) { return (w === 'Best' ? 'الأفضل أداءً: ' : 'الأسوأ أداءً: ') + n(v); });
  R(/^(.+) · (\d+) of (\d+) on · brief (.+)$/, function (_, l, a, b, t) { return a + ' من ' + b + ' مفعّلة · ' + (l === 'English' ? n('English') : 'العربية') + ' · الملخص ' + t; });
  R(/^Version$/, 'الإصدار');

  // ── a coin's buttons and links (tooltips, screen readers) ──
  R(/^Buy ([A-Z0-9.]{2,12})$/, 'شراء $1'); R(/^Sell ([A-Z0-9.]{2,12})$/, 'بيع $1');
  R(/^(?:Open )?([A-Z0-9.]{2,12}) transactions$/, 'معاملات $1');
  R(/^More actions for (.+)$/, 'خيارات أكثر لـ $1');
  R(/^Change the category of (.+)$/, 'تغيير تصنيف $1');
  R(/^Set a manual price for (.+)$/, 'إدخال سعر يدوي لـ $1');
  R(/^(.+?)(?: links)?: Liq\.Map, Prediction, CMC$/, 'روابط $1: خريطة التصفيات، التوقعات، CMC');
  R(/^Open (.+) on CoinMarketCap(?: \(new tab\))?$/, 'فتح $1 على CoinMarketCap');
  R(/^(.+) — open on CoinMarketCap$/, '$1 — فتح على CoinMarketCap');
  R(/^Open the (.+) liquidation heatmap on CoinGlass \(new tab\)$/, 'خريطة تصفيات $1 على CoinGlass');
  R(/^Open the (.+) price prediction on CoinCodex \(new tab\)$/, 'توقعات سعر $1 على CoinCodex');
  R(/^CoinCodex has no price prediction page for (.+)$/, 'لا توجد صفحة توقعات لـ $1 على CoinCodex');
  R(/^Category (.+) — change for (.+)$/, function (_, c, s) { return 'التصنيف: ' + CPLang.t(c) + ' — تغيير لـ ' + s; });
  R(/^(.+) — tap to change the category of (.+)$/, function (_, c, s) { return CPLang.t(c) + ' — اضغط لتغيير تصنيف ' + s; });
  R(/^Note for (.+?): (.+)$/, 'ملاحظة $1: $2');
  R(/^About (.+)$/, function (_, x) { var v = CPLang.t(x); return v === x ? null : 'عن ' + v; });

  A({
    // ── the app ──
    'Cute Portfolio': 'Cute Portfolio', 'Cute Portfolio Report': 'تقرير Cute Portfolio',
    'Loading Cute Portfolio': 'جاري تحميل Cute Portfolio', 'Loading your portfolio': 'جاري تحميل محفظتك', 'Loading portfolio': 'جاري تحميل المحفظة', 'Loading': 'جاري التحميل',
    'Cute Portfolio — Home': 'Cute Portfolio — الرئيسية', 'Performance — Cute Portfolio': 'الأداء — Cute Portfolio',
    'Market Hub — Cute Portfolio': 'مركز السوق — Cute Portfolio', 'Accumulation Plan — Cute Portfolio': 'خطة التجميع — Cute Portfolio',
    'Main': 'الرئيسية', 'Home': 'الرئيسية', 'Portfolio': 'المحفظة', 'Plan': 'الخطة', 'Market Hub': 'مركز السوق',
    'Overview': 'نظرة عامة', 'Performance': 'الأداء', 'Allocation': 'التوزيع',
    'Settings': 'الإعدادات', 'Back': 'رجوع', 'Back to top': 'للأعلى', 'Close': 'إغلاق', 'Cancel': 'إلغاء', 'Save': 'حفظ', 'Copy': 'نسخ',
    'Add': 'إضافة', 'Remove': 'حذف', 'Edit': 'تعديل', 'Delete': 'حذف', 'Done': 'تم', 'OK': 'تمام', 'Yes': 'نعم', 'No': 'لا', 'Check': 'تحقق',
    'View': 'طريقة العرض', 'Table': 'جدول', 'Cards': 'كروت', 'All': 'الكل', 'Total': 'الإجمالي', 'Other': 'أخرى', 'Free': 'مجاني',
    'Live': 'مباشر', 'Live ·': 'مباشر ·', 'Updated': 'آخر تحديث', 'Connecting': 'جاري الاتصال', 'Synced': 'متزامن', 'Saving': 'جاري الحفظ', 'Syncing': 'جاري المزامنة',
    'Saved prices': 'أسعار محفوظة', 'Offline': 'بدون إنترنت', 'Fetching live prices': 'جاري جلب الأسعار المباشرة',
    'Fetch failed — using saved prices': 'تعذّر التحميل — نعرض الأسعار المحفوظة',
    'Why saved prices?': 'لماذا أسعار محفوظة؟', 'About offline': 'عن العمل بدون إنترنت',
    'The live prices could not be loaded just now (the price service was busy or the connection dropped) — you see the prices saved last time. The app tries again by itself in a moment.':
      'تعذّر تحميل الأسعار المباشرة حالياً (خدمة الأسعار مشغولة أو انقطع الاتصال) — تظهر آخر أسعار محفوظة، وسيعيد التطبيق المحاولة تلقائياً بعد لحظات.',
    'No internet right now — you see the prices saved last time. They update by themselves when you are back online.':
      'لا يوجد اتصال بالإنترنت حالياً — تظهر آخر أسعار محفوظة، وستتحدث تلقائياً عند عودة الاتصال.',
    'Cloud sync': 'المزامنة السحابية', 'Cloud sync: Synced': 'المزامنة السحابية: متزامن', 'Cloud sync: Connecting': 'المزامنة السحابية: جاري الاتصال',
    'Cloud: not synced yet': 'السحابة: لم تتم المزامنة بعد', 'Cloud: connecting': 'السحابة: جاري الاتصال', 'Baseline': 'تاريخ الأساس',
    'Dark mode on — switch to light mode': 'الوضع الداكن — التبديل للفاتح', 'Light mode on — switch to dark mode': 'الوضع الفاتح — التبديل للداكن',
    'AI Analysis': 'تحليل AI', 'AI Analysis (drag to move)': 'تحليل AI (اسحب لتحريكه)',
    'Premium member & supporter — thank you!': 'عضو مميز وداعم — شكراً لك!', 'Supporter — thank you!': 'داعم — شكراً لك!',

    // ── sign in & first set-up ──
    'Sign in to load your portfolio. Your data is stored privately in the cloud and stays the same on every device.': 'سجّل الدخول لتحميل محفظتك. بياناتك محفوظة بشكل خاص على السحابة، وهي نفسها على جميع أجهزتك.',
    'Sign in with Google': 'الدخول بحساب Google', 'or with any e-mail (iCloud, Outlook…) — no password': 'أو بأي إيميل (iCloud، Outlook…) — بدون كلمة مرور',
    'Email me a sign-in link': 'أرسل لي رابط الدخول بالبريد', 'you@example.com': 'you@example.com', 'Sign in': 'تسجيل الدخول', 'Sign out': 'تسجيل الخروج',
    'Signed in': 'تم تسجيل الدخول', 'Signed in as': 'مسجّل باسم', 'Signed out': 'تم تسجيل الخروج', 'Not signed in': 'غير مسجّل', 'Sign in first.': 'سجّل الدخول الأول.',
    'Use another account': 'استخدام حساب آخر', 'Type a valid e-mail address.': 'أدخل بريداً إلكترونياً صحيحاً.',
    'Type the e-mail address the sign-in link was sent to.': 'أدخل البريد الذي أُرسل إليه رابط الدخول.',
    'Sent ✅ Open the link in the e-mail on this device (check spam too).': 'تم الإرسال ✅ افتح الرابط من بريدك على هذا الجهاز نفسه (تحقق من مجلد Spam أيضاً).',
    'Your sign-in expired. Sign in again.': 'انتهت جلسة الدخول. سجّل الدخول مرة أخرى.',
    'That code did not work.': 'هذا الرمز غير صالح.',
    "No code? Ask Dr. Samir Saad for an invite link — or, if you're in the Telegram bot already, send it /app with this e-mail.": 'ليس لديك رمز؟ اطلب رابط دعوة من د. سمير سعد — أو إن كنت في بوت تليجرام، أرسل له /app مع هذا البريد.',
    'Set up your cloud portfolio (one time)': 'تجهيز محفظتك على السحابة (مرة واحدة)',
    'The cloud is empty. Choose where your real data is. Do this on the device that has your': 'السحابة فارغة. اختر مكان بياناتك الحقيقية. قم بذلك من الجهاز الذي عليه',
    'most up-to-date': 'أحدث نسخة', 'portfolio — all other devices will then load it automatically.': 'من محفظتك — وبعدها ستحمّلها جميع الأجهزة الأخرى تلقائياً.',
    'This device has no saved portfolio.': 'لا توجد محفظة محفوظة على هذا الجهاز.', 'This device has': 'على هذا الجهاز',
    'Import a backup file': 'استيراد ملف نسخة احتياطية', 'Start from the Oct-15 starting portfolio': 'البدء من محفظة 15 أكتوبر',
    'Start from the Oct-15 starting portfolio?': 'البدء من محفظة 15 أكتوبر؟',
    "Before uploading, an encrypted backup file of this device's data is downloaded first.": 'قبل الرفع، يتم أولاً تنزيل ملف نسخة احتياطية مشفّر لبيانات هذا الجهاز.',
    "Upload this device's data": 'رفع بيانات هذا الجهاز', 'Uploading': 'جاري الرفع', 'Backup before upload': 'نسخة احتياطية قبل الرفع',
    'Use this only if no device has your real data.': 'استخدم هذا فقط إذا لم يكن أي جهاز يحمل بياناتك الحقيقية.',
    'This portfolio is already set up in the cloud.': 'هذه المحفظة مُعدّة على السحابة بالفعل.',
    'Your portfolio is new and private — only you can see it.': 'محفظتك جديدة وخاصة — لا يراها أحد غيرك.',
    'Then add your coins with': 'ثم أضف عملاتك من',
    'One-time setup needed': 'يلزم إعداد لمرة واحدة', 'Your cloud portfolio is empty. Open the main': 'محفظتك على السحابة فارغة. افتح صفحة',
    'Portfolio page': 'المحفظة الرئيسية', 'to import your data.': 'لاستيراد بياناتك.',
    'No portfolio data found.': 'لا توجد بيانات محفظة.', 'Open the main app first.': 'افتح التطبيق الرئيسي أولاً.',
    'You are offline. Changes are kept on this device and sent when the connection returns.': 'أنت غير متصل بالإنترنت. التغييرات محفوظة على الجهاز وستُرسل عند عودة الاتصال.',
    'No connection to the cloud right now.': 'لا يوجد اتصال بالسحابة حالياً.',
    'Could not reach the server — check the internet and try again.': 'تعذّر الوصول إلى الخادم — تحقق من الإنترنت وحاول مرة أخرى.',
    'The cloud is busy (quota reached). Your change is kept — try again later.': 'السحابة مشغولة (تم بلوغ الحد اليومي). التغيير محفوظ — حاول لاحقاً.',
    'Still loading your portfolio — try again in a moment': 'ما زالت محفظتك قيد التحميل — حاول مرة أخرى بعد لحظة',
    'Your portfolio is still loading from the cloud. Please try again in a moment.': 'ما زالت محفظتك قيد التحميل من السحابة. حاول مرة أخرى بعد لحظة.',
    'Sync problem — tap': 'مشكلة في المزامنة — اضغط',

    // ── header strip: dates, baseline, the four totals ──
    'What is the baseline?': 'ما هو تاريخ الأساس؟', 'Change the baseline date': 'تغيير تاريخ الأساس',
    'Total Portfolio': 'إجمالي المحفظة', 'All Time Profit': 'إجمالي الربح', 'All Time Profit — show details': 'إجمالي الربح — عرض التفاصيل',
    'All Time Profit = sells (realized) + Holdings − Cost Basis': 'إجمالي الربح = البيع (المحقق) + قيمة الأصول − تكلفة الشراء',
    'BTC Accumulated': 'البيتكوين المُجمَّع', 'Altcoins Accumulated': 'العملات البديلة المُجمَّعة',
    'BTC / USD': 'BTC / USD', 'Open the Market tab': 'فتح مركز السوق', 'Total market cap — open the Market tab': 'القيمة السوقية الإجمالية — فتح مركز السوق',
    'Market Cap': 'القيمة السوقية', 'Total market cap': 'القيمة السوقية الإجمالية', 'Fear & Greed': 'الخوف والطمع', 'Fear and Greed': 'مؤشر الخوف والطمع',
    'Fear and Greed — open the Market tab': 'مؤشر الخوف والطمع — فتح مركز السوق',
    'Extreme Fear': 'خوف شديد', 'Fear': 'خوف', 'Neutral': 'محايد', 'Greed': 'طمع', 'Extreme Greed': 'طمع شديد',
    'BTC Dominance': 'هيمنة البيتكوين', 'Bitcoin dominance': 'هيمنة البيتكوين', 'Bitcoin dominance — open the Market tab': 'هيمنة البيتكوين — فتح مركز السوق',
    'Explore': 'استكشف', 'Explore the market': 'استكشف السوق', 'Explore the market — open the Market tab': 'استكشف السوق — فتح مركز السوق', 'Altcoin Season': 'موسم العملات البديلة',
    "Today's Movers": 'الأكثر حركة اليوم', '24h · All Coins': '24 ساعة · كل العملات', 'Best Performer': 'الأفضل أداءً', 'Worst Performer': 'الأسوأ أداءً',
    'Best and worst performer appear once live prices load.': 'يظهر الأفضل والأسوأ أداءً بعد تحميل الأسعار المباشرة.',
    'Appears once prices load.': 'يظهر بعد تحميل الأسعار.', 'Appears once the BTC price loads.': 'يظهر بعد تحميل سعر البيتكوين.',
    'Top Gainers': 'الأكثر ربحاً', 'Top Performers': 'الأفضل أداءً', 'Top Losers': 'الأكثر خسارة', 'Top Performers · USD': 'الأفضل أداءً · USD',

    // ── charts ──
    'Holdings': 'الأصول', 'Holdings — open the Portfolio Value chart (Performance)': 'الأصول — فتح رسم قيمة المحفظة (الأداء)',
    'the holdings change': 'تغيّر قيمة الأصول', 'Portfolio Performance': 'أداء المحفظة', 'Portfolio Allocation': 'توزيع المحفظة',
    'Portfolio allocation by category': 'توزيع المحفظة حسب التصنيف', 'How is this chart calculated?': 'كيف يُحسب هذا الرسم؟', 'How is it calculated?': 'كيف يُحسب؟',
    'BTC Trend': 'اتجاه البيتكوين', 'Gold Trend ✨': 'اتجاه الذهب ✨', 'Whole portfolio': 'المحفظة كاملة', 'Altcoins only': 'العملات البديلة فقط', 'Altcoins profit': 'ربح العملات البديلة', 'Silver Trend': 'اتجاه الفضة', 'Silver Trend:': 'اتجاه الفضة:', 'Show / hide this line': 'إظهار / إخفاء هذا الخط', 'Gold Trend ✨:': 'اتجاه الذهب ✨:', 'BTC Trend %': 'اتجاه البيتكوين %', 'All Time Profit %': 'إجمالي الربح %',
    'Collecting data… chart appears after first price update': 'جاري جمع البيانات… سيظهر الرسم بعد أول تحديث للأسعار',
    'Collecting data… the chart fills in as snapshots are recorded.': 'جاري جمع البيانات… سيكتمل الرسم مع تسجيل اللقطات.',
    'Collecting data… the chart fills in as hourly snapshots are recorded.': 'جاري جمع البيانات… سيكتمل الرسم مع تسجيل لقطة كل ساعة.',
    'Building charts from real prices': 'جاري بناء الرسوم من الأسعار الفعلية', 'No history yet': 'لا يوجد سجل بعد',
    'Show the Portfolio Value chart': 'عرض رسم قيمة المحفظة', 'Hide the Portfolio Value chart': 'إخفاء رسم قيمة المحفظة',
    'Total Value': 'القيمة الإجمالية', 'Cost': 'التكلفة', 'Portfolio Value': 'قيمة المحفظة', 'Portfolio Value range': 'مدة رسم قيمة المحفظة',
    'Portfolio vs BTC': 'المحفظة مقابل البيتكوين', 'Performance vs BTC': 'الأداء مقابل البيتكوين', 'vs BTC': 'مقابل BTC', 'Chart range': 'مدة الرسم',
    'BTC Benchmark': 'مقارنة بالبيتكوين', 'The same money kept in BTC': 'نفس المبلغ لو كان في البيتكوين', 'Whole Portfolio': 'المحفظة كاملة', 'Your portfolio': 'محفظتك',
    'Last 24 hours': 'آخر 24 ساعة', 'Last 7 days': 'آخر 7 أيام', 'Last 30 days': 'آخر 30 يوم', 'Last 90 days': 'آخر 90 يوم', 'All time': 'من البداية', 'Last session': 'الجلسة السابقة',
    '12 months': '12 شهر', '30 days': '30 يوم', 'Explore ↗': 'استكشف ↗',

    // ── Accumulation Plan card ──
    'Accumulation Plan': 'خطة التجميع', 'Overall Progress': 'التقدّم الإجمالي',

    // ── the coin list ──
    'Add New Coin': 'إضافة عملة جديدة', 'Add a new coin to your portfolio': 'إضافة عملة جديدة لمحفظتك', 'Add a new coin, or a Buy for a coin you hold': 'إضافة عملة جديدة، أو شراء لعملة تملكها',
    'Category': 'التصنيف', 'All Coins': 'كل العملات', 'Choose a category': 'اختر تصنيفاً', 'Change category': 'تغيير التصنيف',
    'Search coin': 'ابحث عن عملة', 'Search a coin': 'ابحث عن عملة', 'Search your coins': 'ابحث في عملاتك',
    'Signal filter': 'فلتر الإشارة', 'Filter by signal': 'فلترة حسب الإشارة', 'All signals': 'كل الإشارات', 'All Types': 'كل الأنواع',
    'Asset': 'العملة', 'Coin': 'العملة', 'Amount': 'الكمية', 'Avg. Buy Price': 'متوسط سعر الشراء', 'Cost Basis': 'تكلفة الشراء', 'Current Price': 'السعر الحالي', 'Current': 'الحالي',
    'Holdings / Current Value': 'الأصول / القيمة الحالية', 'Holdings value': 'قيمة الأصول', 'Value': 'القيمة', 'Unrealized Profit': 'ربح غير محقق',
    'Signal': 'الإشارة', 'Actions': 'إجراءات', 'Hold': 'احتفاظ', 'Reinforce': 'تعزيز', 'Sell/Convert': 'بيع / تحويل', 'Sell / Convert': 'بيع / تحويل', 'Sell / Convert to BTC': 'بيع / تحويل لبيتكوين',
    '(Reinforce)': '(تعزيز)', '(Sell / Convert)': '(بيع / تحويل)', 'Reinforce · Sell %': 'تعزيز · بيع %',
    'Change the Signal thresholds': 'تعديل حدود الإشارة', 'Sold out': 'تم البيع بالكامل',
    'Buy': 'شراء', 'Sell': 'بيع', 'Transfer In': 'إيداع', 'Transfer Out': 'سحب', 'Reward': 'مكافأة', 'History': 'السجل', 'Transaction': 'معاملة',
    'Remove Coin': 'حذف العملة', 'from your active portfolio?': 'من محفظتك النشطة؟',
    'Liq.Map': 'خريطة التصفيات', 'Liquidation Map': 'خريطة التصفيات', 'Liquidation Map (try — no futures found)': 'خريطة التصفيات (تجريبي — لا توجد عقود آجلة)',
    'Prediction': 'التوقعات', 'Price Prediction': 'توقعات السعر', 'No prediction': 'لا توجد توقعات', 'CMC': 'CMC', 'links that leave the app': 'روابط خارج البرنامج',
    'Amount changes only through Buy / Sell / Transfer': 'تتغير الكمية فقط عبر الشراء / البيع / التحويل', 'Calculated from Buy / Sell / Transfer': 'محسوبة من الشراء / البيع / التحويل',
    'Set a manual price (only used when there is no live market price)': 'إدخال سعر يدوي (يُستخدم فقط عند عدم توفر سعر سوق مباشر)',
    'Sort by All Time Profit (tap again to flip)': 'ترتيب حسب إجمالي الربح (اضغط مرة أخرى للعكس)', 'Sort by value (tap again to flip)': 'ترتيب حسب القيمة (اضغط مرة أخرى للعكس)',
    'Profit in dollars or percent': 'الربح بالدولار أو بالنسبة', 'Rank by': 'ترتيب حسب',
    'Asset Strategy & Notes': 'استراتيجية العملة وملاحظات', 'Your plan for this coin — targets, why you bought or sold…': 'خطتك لهذه العملة — الأهداف، ولماذا اشتريت أو بعت…',
    'Edit opening position': 'تعديل المركز الافتتاحي', 'Opening amount': 'الكمية الافتتاحية', 'Opening': 'افتتاحي', 'Save opening position': 'حفظ المركز الافتتاحي',
    'The position you held before the first transaction in this list. All buys, sells and transfers after it are recalculated from these numbers.':
      'المركز الذي كنت تملكه قبل أول معاملة في هذه القائمة. تُحسب جميع عمليات الشراء والبيع والتحويل بعده من هذه الأرقام.',
    'Transaction History —': 'سجل المعاملات —', 'Transaction History': 'سجل المعاملات',
    'Add a Buy, Sell or Transfer for this coin': 'إضافة شراء أو بيع أو تحويل لهذه العملة',

    // ── default categories ──
    'Bitcoin': 'بيتكوين', 'Layer 1 Blockchains': 'شبكات الطبقة الأولى (L1)', 'Layer 2 Blockchains': 'شبكات الطبقة الثانية (L2)',
    'Layer 0 & Interoperability': 'الربط بين الشبكات (L0)', 'AI & DePIN': 'الذكاء الاصطناعي و DePIN', 'DeFi & RWA': 'التمويل اللامركزي و RWA',
    'Precious Metals': 'المعادن الثمينة', '🥇 Buy Gold (24k)': '🥇 شراء ذهب (عيار 24)', '🥈 Buy Silver (999)': '🥈 شراء فضة (999)', 'Add Buy': 'إضافة الشراء', '⚖️ Grams': '⚖️ جرام', '🪙 Tokens / oz': '🪙 توكن / أونصة', 'Price per gram': 'سعر الجرام', 'Price per token': 'سعر التوكن', '🧾 Total paid': '🧾 المبلغ الإجمالي', 'Where is it kept?': 'أين تحفظه؟', '🏦 Where is it kept?': '🏦 أين تحفظه؟', 'Amount (tokens)': 'الكمية (توكن)', 'Total paid (USD)': 'المبلغ المدفوع (دولار)', 'Buy price per token': 'سعر شراء التوكن', 'Buy date': 'تاريخ الشراء', '🏠 Home safe': '🏠 خزنة المنزل', '🏦 Bank safe box': '🏦 خزنة البنك', '🏪 With the dealer': '🏪 عند التاجر', '📱 Digital (app / token)': '📱 رقمي (تطبيق / توكن)', '👜 With me': '👜 معي', '📍 Other': '📍 مكان آخر', '🏦 Where is your Gold (24k) kept?': '🏦 أين تحفظ ذهبك؟', '🏦 Where is your Silver (999) kept?': '🏦 أين تحفظ فضتك؟', 'e.g. My office safe': 'مثلاً: خزنة المكتب', 'Metals ›': 'المعادن ›', 'History — edit or delete': 'السجل: تعديل أو حذف', '🏦 Set where it is kept': '🏦 حدد مكان الحفظ', 'Where it is kept — tap to change': 'مكان الحفظ — اضغط للتغيير', '🥇 Precious Metals': '🥇 المعادن الثمينة', 'Your gold and silver — open the Metals page': 'ذهبك وفضتك — افتح صفحة المعادن', '🥇 Gold 24k': '🥇 ذهب عيار 24', '🥈 Silver': '🥈 فضة', 'held in grams': 'بالجرام', 'Amount (grams)': 'الكمية (جرام)', 'Buy price per gram': 'سعر شراء الجرام', 'Amount bought (grams)': 'الكمية المشتراة (جرام)', 'Amount sold (grams)': 'الكمية المباعة (جرام)', 'Amount transferred in (grams)': 'الكمية المودَعة (جرام)', 'Amount transferred out (grams)': 'الكمية المسحوبة (جرام)', 'Amount received (grams)': 'الكمية المستلمة (جرام)', 'Price per gram (USD)': 'سعر الجرام (دولار)', 'Sell price per gram (USD)': 'سعر بيع الجرام (دولار)', 'Cost / value per gram at transfer (USD)': 'تكلفة / قيمة الجرام عند التحويل (دولار)', 'Gold (24k)': 'الذهب (عيار 24)', 'Silver (999)': 'الفضة (999)', 'Gold 24k': 'ذهب عيار 24', 'Silver': 'فضة', 'grams': 'جرام',
    'Oracles & Middleware': 'الأوراكل والبنية الوسيطة', 'Meme & Utility Tokens': 'عملات الميم والمنفعة', 'Web3 & Gaming': 'Web3 والألعاب', 'Launchpad': 'منصات الإطلاق',
    'Stablecoins': 'العملات المستقرة', 'Stablecoin': 'عملات مستقرة', 'Layer 1': 'الطبقة الأولى (L1)', 'Layer 2': 'الطبقة الثانية (L2)', 'Layer 0': 'الطبقة صفر (L0)',
    'DePIN': 'DePIN', 'AI': 'الذكاء الاصطناعي', 'Memes': 'عملات الميم', 'Meme': 'عملات الميم', 'Gaming': 'الألعاب', 'Oracles': 'الأوراكل', 'Privacy': 'الخصوصية', 'Exchange Tokens': 'عملات المنصات',

    // ── AI report window ──
    'AI Analysis Report —': 'تقرير التحليل بالذكاء الاصطناعي —', 'Claude AI': 'Claude AI', 'Regenerate': 'إعادة الإنشاء',
    'Free: make the report in the Claude app, then paste it here': 'مجاناً: أنشئ التقرير في تطبيق Claude ثم الصقه هنا',
    'Write the report here again (uses your API credit)': 'إعادة كتابة التقرير هنا (يستخدم رصيد الـ API الخاص بك)',
    'Copy the report as text — paste it into Claude or your notes': 'نسخ التقرير كنص — الصقه في Claude أو في ملاحظاتك',
    'Save the report as a PDF (Print → Save as PDF)': 'حفظ التقرير PDF (طباعة ← حفظ كـ PDF)',

    // ── baseline & signal thresholds windows ──
    'Baseline Date': 'تاريخ الأساس',
    "The day your coins are compared with Bitcoin. Pick a date: the app looks up BTC's daily price, or use the price you actually paid for your BTC that day.":
      'اليوم الذي تُقارن فيه عملاتك بالبيتكوين. اختر تاريخاً: يجلب التطبيق سعر البيتكوين في ذلك اليوم، أو أدخل السعر الذي اشتريت به فعلاً.',
    'Date': 'التاريخ', 'BTC Price on That Day (USD)': 'سعر البيتكوين في ذلك اليوم (USD)', 'BTC Price': 'سعر البيتكوين', 'BTC reference price': 'سعر البيتكوين المرجعي',
    'The baseline date cannot be in the future.': 'لا يمكن أن يكون تاريخ الأساس في المستقبل.', 'No BTC price for that day': 'لا يوجد سعر للبيتكوين في هذا اليوم',
    'Pick a valid date and a BTC price above 0.': 'اختر تاريخاً صحيحاً وسعر بيتكوين أكبر من صفر.',
    'Signal Thresholds': 'حدود الإشارة',
    "When a coin's price is below your Avg. Buy Price by these amounts, its Signal changes. Same on every page and device.":
      'عندما ينخفض سعر العملة عن متوسط سعر شرائك بهذه النسب، تتغير الإشارة. الإعداد نفسه في جميع الصفحات والأجهزة.',
    'Reinforce — when the price is this much below your Avg. Buy Price (or more)': 'تعزيز — عندما يكون السعر أقل من متوسط سعر الشراء بهذه النسبة (أو أكثر)',
    'Reinforce: percent below your Avg. Buy Price': 'تعزيز: النسبة تحت متوسط سعر الشراء',
    'Sell / Convert to BTC — when it is more than this much below': 'بيع / تحويل لبيتكوين — عندما يكون أقل بأكثر من هذه النسبة',
    'Sell / Convert: percent below your Avg. Buy Price': 'بيع / تحويل: النسبة تحت متوسط سعر الشراء',
    'Smart check vs BTC': 'فحص ذكي مقابل البيتكوين',
    "Also looks at the coin's last 30 and 90 days vs BTC: no Reinforce for a coin that keeps losing to BTC (15+ points behind on both), no Sell / Convert for one that is beating BTC on both — those stay Hold.":
      'يراعي أيضاً أداء العملة خلال آخر 30 و 90 يوماً مقابل البيتكوين: لا تعزيز لعملة تتراجع أمام البيتكوين باستمرار (متأخرة 15 نقطة أو أكثر في الفترتين)، ولا بيع / تحويل لعملة متفوقة على البيتكوين في الفترتين — تبقى هذه على احتفاظ.',
    'Use the defaults (−5% / −20%)': 'استخدام الافتراضي (−5% / −20%)',
    'Sell / Convert must be lower than Reinforce (between −99% and +100%).': 'يجب أن يكون حد البيع / التحويل أقل من حد التعزيز (بين −99% و +100%).',

    // ── Allocation ──
    'Target allocation': 'التوزيع المستهدف',
    'Set the share you want for each category (Bitcoin included) — see how far you are from it, and exactly what to buy (or trim) to get back.':
      'حدّد النسبة التي تريدها لكل تصنيف (بما فيها البيتكوين) — واعرف مدى ابتعادك عنها، وما الذي تشتريه (أو تخفّفه) بالضبط للعودة إليها.',
    'Set my targets': 'تحديد أهدافي', 'The share you want for each category. They must add up to 100%.': 'النسبة التي تريدها لكل تصنيف. يجب أن يكون المجموع 100%.',
    'The targets must add up to 100%.': 'يجب أن يكون مجموع الأهداف 100%.', 'Total 100% ✓': 'الإجمالي 100% ✓', 'Use my current split': 'استخدام توزيعي الحالي', 'Add a group': 'إضافة مجموعة',
    'Band — how far a category may drift before it counts as off target': 'الهامش — مقدار الابتعاد المسموح قبل اعتبار التصنيف خارج الهدف',
    'Rebalance with': 'إعادة التوازن بـ', 'New money': 'مبلغ جديد', 'Full rebalance': 'إعادة توازن كاملة', 'Amount to invest': 'المبلغ المراد استثماره',
    'Buy and trim so every group is on target (your total stays the same)': 'شراء وتخفيف حتى تبلغ كل مجموعة هدفها (يبقى الإجمالي كما هو)',
    'Back to Holdings': 'رجوع للأصول',

    // ── All Time Profit window ──
    'Realized Profit': 'ربح محقق', 'No sells yet': 'لا يوجد بيع بعد',
    'Coins you still hold, at today’s price': 'العملات التي ما زلت تملكها، بسعر اليوم', 'What the coins you hold cost (fees included)': 'تكلفة العملات التي تملكها (شاملة الرسوم)',
    'Realized Profit + Unrealized Profit': 'الربح المحقق + الربح غير المحقق', '(added up over every sell)': '(مجموع كل عمليات البيع)',
    '(Sell Price − Avg Buy Price) × Amount Sold − Selling Fee': '(سعر البيع − متوسط سعر الشراء) × الكمية المباعة − رسوم البيع',
    '(Current Price − Avg Buy Price) × Amount Held': '(السعر الحالي − متوسط سعر الشراء) × الكمية المحتفظ بها',
    'Avg Buy Price × Amount Held': 'متوسط سعر الشراء × الكمية المحتفظ بها', 'Avg Buy Price': 'متوسط سعر الشراء', '(updated on every buy)': '(يتحدّث مع كل شراء)',
    '(Amount Held × Avg Buy Price + Buy Price × Amount Bought + Buying Fee) ÷ (Amount Held + Amount Bought)': '(الكمية المحتفظ بها × متوسط سعر الشراء + سعر الشراء × الكمية المشتراة + رسوم الشراء) ÷ (الكمية المحتفظ بها + الكمية المشتراة)',
    '(on everything invested — coins held and coins already sold)': '(على كل ما استُثمر — العملات التي تملكها والتي بِيعت)',
    'All Time Profit ÷ (Cost Basis + Cost of Coins Sold) × 100': 'إجمالي الربح ÷ (تكلفة الشراء + تكلفة العملات المباعة) × 100',
    'Sells don’t change the Avg Buy Price. Transfers in add coins at the price you enter; transfers out and network fees only lower the amount held.':
      'البيع لا يغيّر متوسط سعر الشراء. الإيداع يضيف عملات بالسعر الذي تدخله، والسحب ورسوم الشبكة يقلّلان الكمية فقط.',
    'Invest': 'استثمر', 'without selling anything': 'دون بيع أي شيء', 'Edit': 'تعديل',

    // ── Performance page ──
    'All Time Profit Breakdown': 'تفاصيل إجمالي الربح', 'Unrealized': 'غير محقق', 'Realized': 'محقق', 'from sells': 'من عمليات البيع', '+ Unrealized': '+ غير محقق',
    'Rewards & mining': 'المكافآت والتعدين', 'Rewards and mining': 'المكافآت والتعدين',
    'None yet — staking rewards, mined BTC and airdrops show here': 'لا يوجد بعد — تظهر هنا مكافآت الـ Staking والبيتكوين المُعدَّن والـ Airdrops',
    'No rewards or mined coins': 'لا توجد مكافآت أو عملات مُعدَّنة', 'Staking rewards': 'مكافآت الـ Staking', 'Airdrops & other free coins': 'الـ Airdrops والعملات المجانية',
    'Wallets & exchanges': 'المحافظ والمنصات', 'Wallets & Exchanges': 'المحافظ والمنصات', 'Wallets and exchanges': 'المحافظ والمنصات', 'Wallets & check': 'المحافظ والمطابقة',
    'Compare your real wallets with the app': 'قارن محافظك الحقيقية بالتطبيق', 'Exchanges · live balances': 'المنصات · الأرصدة المباشرة', 'Import from exchange': 'استيراد من منصة',
    'A CSV file from Binance, Gate or another exchange → your buys and sells': 'ملف CSV من Binance أو Gate أو أي منصة ← عمليات الشراء والبيع',
    'Binance · Gate — live balances straight from the exchange: later': 'Binance · Gate — الأرصدة المباشرة من المنصة: قريباً',

    // ── add / transaction window (the parts that show on these pages) ──
    'Add Transaction': 'إضافة معاملة', 'Transaction type': 'نوع المعاملة', 'Add to Portfolio': 'إضافة للمحفظة', '+ Buy': '+ شراء', '− Sell': '− بيع', '+ Add': '+ إضافة',
    '— search by symbol or name': '— ابحث بالرمز أو الاسم', 'e.g. XRP or Ripple': 'مثلاً XRP أو Ripple', 'Full Name': 'الاسم الكامل', 'Filled by search': 'يُملأ من البحث',
    'Fee (USD)': 'الرسوم (USD)', 'Optional': 'اختياري', '(optional)': '(اختياري)', 'CoinGecko ID': 'معرّف CoinGecko', 'Auto': 'تلقائي', 'auto': 'تلقائي',
    'CoinMarketCap Page': 'صفحة CoinMarketCap', 'Pay from': 'الدفع من', 'Stablecoin the buy is paid from': 'العملة المستقرة التي ستدفع منها',
    'Network & where held': 'الشبكة ومكان الحفظ', 'Pick the coin first': 'اختر العملة أولاً', 'New Category Name': 'اسم التصنيف الجديد', 'Enter Custom Category...': 'أدخل تصنيفاً جديداً...',
    'Saved for this coin and added to the category filters.': 'حُفظ لهذه العملة وأُضيف إلى فلاتر التصنيف.',
    'From': 'من', 'Where the coins came from': 'مصدر العملات', 'Staking': 'Staking', 'Mining': 'تعدين', 'Airdrop': 'Airdrop', 'How': 'الطريقة',
    'Enter staking rewards by hand or automatically': 'إدخال مكافآت الـ Staking يدوياً أو تلقائياً', 'Manual': 'يدوي', 'Automatic': 'تلقائي', 'APY': 'العائد السنوي (APY)',
    '(% a year — from your wallet or exchange)': '(% سنوياً — من محفظتك أو المنصة)', 'Price per coin (USD)': 'سعر العملة (USD)', 'Buying fee': 'رسوم الشراء',
    '(USD, optional — added to Cost Basis)': '(USD، اختياري — يُضاف إلى تكلفة الشراء)', 'Fee paid in': 'الرسوم مدفوعة بـ', 'USD': 'USD',
    'Network fee to your wallet': 'رسوم الشبكة لمحفظتك', '(optional — e.g. Binance → your cold wallet)': '(اختياري — مثلاً Binance ← محفظتك الباردة)', 'Network fee in': 'رسوم الشبكة بـ',
    'Add the money to': 'إضافة المبلغ إلى', 'Stablecoin that receives the money': 'العملة المستقرة التي ستستلم المبلغ', 'Transfer fee': 'رسوم التحويل', '(in coin, optional)': '(بالعملة، اختياري)',
    'Date & time': 'التاريخ والوقت', 'Note': 'ملاحظة', 'e.g. from Binance, to cold wallet': 'مثلاً من Binance، إلى المحفظة الباردة',
    'Import many from an exchange file (CSV)': 'استيراد معاملات متعددة من ملف منصة (CSV)',
    'Manage Categories': 'إدارة التصنيفات', '— rename, colour, add, delete': '— تغيير الاسم، اللون، إضافة، حذف',
    'Changes apply everywhere at once — every page, filter, chart and device.': 'تُطبّق التغييرات في كل مكان مرة واحدة — كل صفحة وفلتر ورسم وجهاز.', 'New Category': 'تصنيف جديد',
    'Amount and price must be positive numbers': 'يجب أن تكون الكمية والسعر أرقاماً موجبة', 'Add the coin first': 'أضف العملة أولاً', 'Add coin': 'إضافة عملة',
    'Reward (staking / mining)': 'مكافأة (Staking / تعدين)', 'Sold them? Record a': 'بعتها؟ سجّل',

    // ── Settings ──
    'Account & data': 'الحساب والبيانات', 'Account': 'الحساب', 'Backup': 'النسخ الاحتياطي', 'backup': 'النسخ الاحتياطي', 'Back up now': 'انسخ الآن', 'Recover Data': 'استرجاع البيانات', 'recover': 'استرجاع البيانات',
    'Telegram': 'تليجرام', 'Telegram alerts': 'تنبيهات تليجرام', 'Link your portfolio to the Telegram bot': 'ربط محفظتك ببوت تليجرام', 'Link the Telegram bot': 'ربط بوت تليجرام',
    'Join Cute Portfolio Signals': 'انضم لقناة Cute Portfolio Signals', 'Join Cute Portfolio Community': 'انضم لمجتمع Cute Portfolio',
    'The market pulse twice a day · ⭐ on posts you like': 'نبض السوق مرتين يومياً · ⭐ على المنشورات التي تعجبك', 'Chat · suggestions · bugs · the guide · news': 'دردشة · اقتراحات · مشاكل · الدليل · الأخبار',
    'One tap — the bot shows your portfolio': 'ضغطة واحدة — ويعرض البوت محفظتك', 'One tap — then the bot shows your portfolio, alerts, morning & evening': 'ضغطة واحدة — ويعرض البوت محفظتك والتنبيهات صباحاً ومساءً',
    'Open the bot': 'افتح البوت', 'Your code (10 minutes)': 'رمزك (10 دقائق)', 'Could not make a code —': 'تعذّر إنشاء رمز —',
    '— or tap “Open the bot”. The bot then reads this portfolio for you (only you).': '— أو اضغط "افتح البوت". سيقرأ البوت بعدها هذه المحفظة لك (لك وحدك).',
    'AI': 'الذكاء الاصطناعي', 'AI Analysis & questions': 'تحليل AI والأسئلة', 'My Claude key': 'مفتاح Claude الخاص بي',
    'Optional · your own key = 100 questions & 10 reports a day': 'اختياري · مفتاحك الخاص = 100 سؤال و 10 تقارير في اليوم',
    'Removed — you are back on the standard limits.': 'تمت الإزالة — عدت إلى الحدود العادية.',
    'It is sent once, checked with Claude, then kept encrypted — nobody can see it again. Remove it any time.': 'يُرسل مرة واحدة ويُتحقق منه مع Claude، ثم يُحفظ مشفّراً — لا يمكن لأحد رؤيته مرة أخرى. يمكنك إزالته في أي وقت.',
    'Admin': 'الإدارة', 'Admin dashboard': 'لوحة الإدارة', 'Support': 'الدعم', 'Support Cute Portfolio & Channel 💛': 'ادعم Cute Portfolio والقناة 💛',
    'Display': 'العرض', 'Language': 'اللغة', 'Theme': 'المظهر', 'Light': 'فاتح', 'Dark': 'داكن', 'Charts open on': 'الرسوم تفتح على', 'Lists shown as': 'عرض القوائم كـ',
    'About': 'حول', 'Guide': 'الدليل', 'How the app and the bot work · English / العربية': 'كيف يعمل التطبيق والبوت · English / العربية',
    'Install the app': 'تثبيت التطبيق', 'Browser menu → Install app': 'قائمة المتصفح ← تثبيت التطبيق', 'Add it to your home screen — opens like an app': 'أضفه إلى الشاشة الرئيسية — يفتح كتطبيق',
    'On your home screen': 'على الشاشة الرئيسية', '· works offline': '· يعمل دون إنترنت', 'Safari: Share → Add to Home Screen': 'Safari: مشاركة ← إضافة للشاشة الرئيسية',
    'Cute Portfolio is already on your home screen — it opens like an app, also without internet (with your last numbers).': 'Cute Portfolio موجود بالفعل على الشاشة الرئيسية — يفتح كتطبيق، وكذلك دون إنترنت (بآخر أرقامك).',
    'Wallets, Import and Rewards are on': 'المحافظ والاستيراد والمكافآت موجودة في', '· DCA and the Exit plan on': '· الشراء الدوري وخطة الخروج في',
    '· Signal thresholds, Categories and the Baseline on': '· حدود الإشارة والتصنيفات وتاريخ الأساس في', '· Target allocation on': '· التوزيع المستهدف في',
    'Reset portfolio': 'إعادة ضبط المحفظة', 'Reset to Oct-15 starting portfolio': 'إعادة الضبط لمحفظة 15 أكتوبر',
    'Reset all starting coins to their Oct-15 quantities and prices? Your transaction history is kept.': 'إعادة جميع العملات الأساسية إلى كمياتها وأسعارها في 15 أكتوبر؟ سيبقى سجل المعاملات كما هو.',
    'Import this backup?': 'استيراد هذه النسخة الاحتياطية؟', 'This file is not a Cute Portfolio backup.': 'هذا الملف ليس نسخة احتياطية من Cute Portfolio.',
    'Encryption is not available in this browser.': 'التشفير غير متاح في هذا المتصفح.', 'Restore data': 'استرجاع البيانات', 'Restore settings': 'استرجاع الإعدادات',
    'Back up in Settings': 'انسخ احتياطياً من الإعدادات',

    // ── footer ──
    '© 2026 Dr. Samir Saad': '© 2026 د. سمير سعد', 'Dr. Samir Saad': 'د. سمير سعد',
  });

  // ════════ Phase 2: the Plan (Accumulation · DCA · Exit Strategy), Add / Edit transaction, a coin's History ════════
  var DAY = { Sunday: 'الأحد', Monday: 'الاثنين', Tuesday: 'الثلاثاء', Wednesday: 'الأربعاء', Thursday: 'الخميس', Friday: 'الجمعة', Saturday: 'السبت' };
  var dt = function (s) { return date(s) || s; };
  R(/^(\$[\d,.]+) every (other )?(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)$/, function (_, a, o, d) { return n(a) + (o ? ' كل أسبوعين يوم ' : ' كل ') + DAY[d]; });
  R(/^(\$[\d,.]+) on the (\d+)(?:st|nd|rd|th) of each month$/, function (_, a, d) { return n(a) + ' يوم ' + d + ' من كل شهر'; });
  R(/^Next (.+)$/, function (_, d) { var v = date(d); return v ? 'التالي ' + v : null; });
  R(/^on (.+)$/, function (_, d) { var v = date(d); return v ? 'يوم ' + v : null; });
  R(/^Was due (.+)$/, function (_, d) { return 'كان موعده ' + dt(d); });
  R(/^kept (\d+) of (\d+)$/, 'نُفّذ $1 من $2');
  R(/^target in (\d+) buys?$/, function (_, a) { return 'الهدف بعد ' + pl(a, 'مرة شراء واحدة', 'مرتين شراء', 'مرات شراء', 'مرة شراء'); });
  R(/^(\d+) days?$/, function (_, a) { return pl(a, 'يوم', 'يومين', 'أيام', 'يوم'); });
  R(/^(\d+) to buy now$/, '$1 للشراء الآن');
  R(/^(\d+) in progress$/, '$1 قيد التنفيذ');
  R(/^Sell ([\d.,]+) ([A-Z0-9.]+)$/, function (_, q, c) { return 'بيع ' + n(q + ' ' + c); });
  R(/^Take profit (\d)$/, 'جني الأرباح $1');
  R(/^moonbag (.+)$/, function (_, q) { return 'Moonbag ' + n(q); });
  R(/^now (.+)$/, function (_, v) { return 'الآن ' + n(v); });
  R(/^Target (.+)$/, function (_, v) { return /[a-z]{3}/.test(v) ? null : 'الهدف ' + n(v); });
  R(/^Progress (.+%)$/, function (_, v) { return 'التقدّم ' + n(v); });
  R(/^(.+%) vs your Avg\. Buy Price$/, function (_, v) { return n(v) + ' مقابل متوسط سعر شرائك'; });
  R(/^(\d+) of (\d+) done$/, '$1 من $2 تمت');
  R(/^(.+%) (above|below) target$/, function (_, v, w) { return n(v) + (w === 'above' ? ' فوق الهدف' : ' تحت الهدف'); });
  R(/^base (\S+) \((.+)\)$/, function (_, v, d) { return 'الأساس ' + n(v) + ' (' + dt(d) + ')'; });
  R(/^(\d+) (coins|assets)$/, function (_, a) { return pl(a, 'عملة واحدة', 'عملتين', 'عملات', 'عملة'); });
  R(/^Auto (×.+)$/, function (_, x) { return 'تلقائي ' + n(x); });
  R(/^Reserve (\d+)% Moonbag$/, 'الاحتفاظ بـ $1% كـ Moonbag');
  R(/^holding (.+)$/, function (_, q) { return 'لديك ' + n(q); });
  R(/^Sort: (.+)$/, function (_, x) { return 'ترتيب: ' + CPLang.t(x); });
  R(/^([A-Z0-9.]{2,12}) Transactions$/, 'معاملات $1');
  R(/^Add (Buy|Sell|Transfer In|Transfer Out|Reward)$/, function (_, k) { return 'إضافة ' + CPLang.t(k); });
  R(/^Edit (Buy|Sell|Transfer In|Transfer Out|Reward)$/, function (_, k) { return 'تعديل ' + CPLang.t(k); });
  R(/^\(USD, optional — turned into (.+) at the price above\)$/, '(USD، اختياري — يُحوَّل إلى $1 بالسعر أعلاه)');
  R(/^\(in ([A-Z0-9.]+), optional\)$/, '(بالـ $1، اختياري)');
  R(/^(.+)% of the portfolio in stablecoins$/, function (_, v) { return n(v + '%') + ' من المحفظة في عملات مستقرة'; });
  R(/^Last price update · added to plan (.+)$/, 'آخر تحديث للسعر · أُضيفت إلى الخطة $1');
  R(/^Add a Buy for (.+)$/, 'إضافة شراء لـ $1');
  R(/^Change the (buy-at percent|target amount|schedule) (?:for|of) (.+)$/, function (_, k, c) { return { 'buy-at percent': 'تعديل نسبة الدخول لـ ', 'target amount': 'تعديل الكمية المستهدفة لـ ', schedule: 'تعديل جدول ' }[k] + c; });
  R(/^Remove (.+) from (?:the exit )?plan$/, function (s, c) { return 'حذف ' + c + (/exit/.test(s) ? ' من خطة الخروج' : ' من الخطة'); });
  R(/^(?:DCA )?calculator for (.+)$/, 'حاسبة الشراء الدوري لـ $1');
  R(/^Your default steps:? (.+)$/, function (_, x) { return 'خطواتك الافتراضية ' + n(x); });
  R(/^Already following (.+) your average buy price$/, function (_, x) { return 'متابع بالفعل ' + n(x) + ' من متوسط سعر شرائك'; });
  R(/^You can’t (sell|transfer out) (.+)$/, function (_, k, x) { return (k === 'sell' ? 'لا يمكنك بيع ' : 'لا يمكنك سحب ') + x; });
  R(/^Did you mean \$(.+)\?$/, function (_, x) { return 'تقصد ' + n('$' + x) + '؟'; });
  R(/^Opening position \(Oct-15 start\)$/, 'المركز الافتتاحي (بداية 15 أكتوبر)');
  R(/^Holdings after: (.+)$/, function (_, x) { return 'الأصول بعدها: ' + n(x); });

  A({
    // ── Plan tabs and the four totals ──
    'In the market': 'في السوق', 'Accumulation': 'التجميع', 'Exit Strategy': 'استراتيجية الخروج', 'Exit plan': 'خطة الخروج', 'Exit Plan': 'خطة الخروج',
    'Total Target Value': 'إجمالي قيمة الأهداف', 'At current prices': 'بالأسعار الحالية', 'Current Holdings': 'الأصول الحالية', 'In plan': 'ضمن الخطة',
    'Total Pending Cost': 'إجمالي التكلفة المتبقية', 'To complete plan': 'لإكمال الخطة', 'Coins Completed': 'العملات المكتملة', '— in progress': '— قيد التنفيذ',
    'Overall Accumulation Progress': 'التقدّم الإجمالي للتجميع', 'the plan totals': 'إجماليات الخطة', 'Plan Totals': 'إجماليات الخطة',
    'Add to Plan': 'إضافة للخطة', 'Add any coin to your plan — even one you don\'t own yet': 'أضف أي عملة إلى خطتك — حتى لو لم تكن تملكها بعد',
    'No coins in your accumulation plan yet.': 'لا توجد عملات في خطة التجميع بعد.', 'Click': 'اضغط', 'Tap': 'اضغط', 'to get started.': 'للبداية.', 'to Plan': 'للخطة',
    'Add Coin to Plan': 'إضافة عملة للخطة', 'Add Coin to Accumulation Plan': 'إضافة عملة لخطة التجميع', 'Search Coin': 'ابحث عن عملة', 'Select coin': 'اختر العملة',
    'e.g. BTC, Ethereum': 'مثلاً BTC، Ethereum', '(already in plan)': '(موجودة في الخطة)', 'In Portfolio': 'في المحفظة',
    'Still loading — not saved': 'ما زال التحميل جارياً — لم يُحفظ', 'Not saved — see sync status': 'لم يُحفظ — راجع حالة المزامنة', 'Up to date': 'محدّث',
    // ── plan table / cards ──
    'Target Amount': 'الكمية المستهدفة', 'Actual Amount': 'الكمية الحالية', 'Pending Amount': 'الكمية المتبقية', 'Buy At': 'سعر الدخول', 'Buy at %': 'سعر الدخول %',
    'Cost to Target': 'تكلفة الوصول للهدف', 'Progress': 'التقدّم', 'Price Alert': 'تنبيه سعري', '% of Target': '% من الهدف', 'Set target': 'حدد الهدف', 'Set %': 'حدد %',
    'Remove from plan': 'حذف من الخطة', 'No price': 'لا يوجد سعر', 'Toggle positive/negative': 'تبديل موجب / سالب', 'Price $': 'السعر $', 'Price': 'السعر',
    'Alert when price drops to or below this value': 'نبّهني عندما يصل السعر إلى هذه القيمة أو أقل', 'Clear alert': 'مسح التنبيه', 'Hit!': 'تحقق!', 'Hit': 'تحقق',
    'Target already reached!': 'تحقق الهدف بالفعل!', 'Target hit': 'تحقق الهدف', 'BUY NOW': 'اشترِ الآن', 'Change the target amount': 'تعديل الكمية المستهدفة',
    'Change the buy-at % (e.g. -20 = buy 20% below the current price)': 'تعديل نسبة الدخول (مثلاً ‎-20 = الشراء تحت السعر الحالي بـ 20%)',
    "Buy when the price is this % away from today's price. Today's price is saved as the base, so the target stays fixed until you change it.\n-20 = 20% below · 10 = 10% above · empty = none":
      'اشترِ عندما يبتعد السعر بهذه النسبة عن سعر اليوم. يُحفظ سعر اليوم كأساس، فيبقى الهدف ثابتاً حتى تغيّره.\n‎-20 = أقل بـ 20% · 10 = أعلى بـ 10% · فارغ = بدون',
    'I want to buy 20% below current price': 'أريد الشراء بسعر أقل من الحالي بـ 20%', 'This does NOT affect your portfolio.': 'هذا لا يؤثر على محفظتك.',
    'A tool to organise and follow your own plan — not financial advice.': 'أداة لتنظيم خطتك ومتابعتها — وليست نصيحة مالية.',
    'Last price update': 'آخر تحديث للسعر', '24h change': 'التغيّر في 24 ساعة', 'Open': 'فتح', 'Hide': 'إخفاء', 'Show': 'عرض', 'Enter': 'إدخال', 'Ready': 'جاهز',
    // ── plan vs target allocation ──
    'Plan vs target allocation': 'الخطة مقابل التوزيع المستهدف', 'Set targets ›': 'حدد الأهداف ›', 'Set targets': 'حدد الأهداف', 'Allocation ›': 'التوزيع ›',
    '✓ On target': '✓ على الهدف', 'On target': 'على الهدف', '↓ Priority': '↓ أولوية', '↑ Over target': '↑ فوق الهدف', 'Priority': 'أولوية', 'Over target': 'فوق الهدف',
    'Set a target allocation (Portfolio → Allocation) to see whether finishing this plan keeps your categories where you want them, and which coins to buy first.':
      'حدّد التوزيع المستهدف (المحفظة ← التوزيع) لترى هل إكمال هذه الخطة يُبقي تصنيفاتك حيث تريد، وأي العملات تشتري أولاً.',
    // ── DCA ──
    'DCA schedule': 'جدول الشراء الدوري (DCA)', 'DCA — regular buys': 'الشراء الدوري (DCA)', 'DCA schedule (regular buys)': 'الشراء الدوري (DCA)',
    'Dollar-Cost Averaging plan': 'خطة متوسط التكلفة (DCA)', 'Regular buy': 'شراء دوري', 'Regular buy — pick a coin': 'شراء دوري — اختر العملة', 'Next: the schedule': 'التالي: الجدول',
    'A regular buy for any coin — it joins your plan': 'شراء دوري لأي عملة — تُضاف إلى خطتك',
    'No regular buys yet. Pick any coin and an amount — the Plan shows each buy day, and Telegram reminds you.': 'لا يوجد شراء دوري بعد. اختر أي عملة ومبلغاً — وستعرض الخطة كل يوم شراء، وسيذكّرك تليجرام.',
    'Amount each time (USD)': 'المبلغ كل مرة (USD)', 'How often': 'كم مرة', 'Weekly': 'كل أسبوع', 'Every 2 weeks': 'كل أسبوعين', 'Monthly': 'كل شهر',
    'Day': 'اليوم', 'Day of the month': 'يوم في الشهر', 'Day of the week': 'يوم في الأسبوع',
    'Sunday': 'الأحد', 'Monday': 'الاثنين', 'Tuesday': 'الثلاثاء', 'Wednesday': 'الأربعاء', 'Thursday': 'الخميس', 'Friday': 'الجمعة', 'Saturday': 'السبت',
    'Show me over (months)': 'اعرض على مدة (بالأشهر)', 'Coins each buy': 'العملات في كل شراء', 'Per month': 'في الشهر', 'Total Coins': 'إجمالي العملات', 'Total Invested': 'إجمالي المستثمر',
    'First buy': 'أول شراء', 'Time to reach target': 'وقت الوصول للهدف',
    'Save it as your schedule: the Plan shows each buy day and whether you kept it, and Telegram reminds you on the day.': 'احفظه كجدول لك: ستعرض الخطة كل يوم شراء وهل نفّذته، وسيذكّرك تليجرام في يومه.',
    'Remove schedule': 'حذف الجدول', 'Save schedule': 'حفظ الجدول', '✓ Bought': '✓ تم الشراء', 'Today': 'اليوم', 'Next': 'التالي', 'Missed': 'فات موعده', 'Was due': 'كان موعده', 'target reached': 'تم بلوغ الهدف',
    'Change the schedule': 'تعديل الجدول', 'Please select a coin first.': 'اختر عملة أولاً.',
    'Searching CoinGecko': 'جاري البحث في CoinGecko', 'Search failed': 'فشل البحث', 'You are offline — search needs internet.': 'أنت غير متصل بالإنترنت — البحث يتطلب اتصالاً.',
    'No coins found. Try a different search.': 'لا توجد عملات. جرّب بحثاً آخر.', "Type a coin name or symbol — any coin, even one you don't own yet.": 'اكتب اسم العملة أو رمزها — أي عملة، حتى لو لم تكن تملكها.',
    'CoinGecko is busy — wait a few seconds and type again.': 'CoinGecko مشغول — انتظر بضع ثوانٍ ثم اكتب مرة أخرى.',
    // ── Exit Strategy ──
    'Macro Exit Indicators': 'مؤشرات الخروج الكبرى', 'Macro exit indicators': 'مؤشرات الخروج الكبرى', 'Edit targets': 'تعديل الأهداف', 'Signals Hit': 'الإشارات المتحققة',
    'USDT Dominance': 'هيمنة USDT', 'ETH / BTC': 'ETH / BTC', 'Waiting': 'انتظار', 'Close': 'إغلاق', 'Reached': 'تحقق', 'Below range': 'تحت النطاق', 'Above range': 'فوق النطاق', 'In range': 'داخل النطاق',
    'BTC.D at or under (%)': 'هيمنة BTC عند أو تحت (%)', 'USDT.D range — from (%)': 'نطاق هيمنة USDT — من (%)', 'USDT.D range — to (%)': 'نطاق هيمنة USDT — إلى (%)', 'ETH / BTC at or over': 'ETH / BTC عند أو فوق',
    'Your own levels — the page compares, it doesn’t predict the top.': 'مستوياتك أنت — الصفحة تقارن ولا تتنبأ بالقمة.',
    'Cash-out Progress': 'تقدّم جني الأرباح', 'Cash and stablecoins': 'الكاش والعملات المستقرة', 'in stablecoins': 'في عملات مستقرة', 'Realized profit': 'الربح المحقق',
    'Exit steps done': 'خطوات الخروج المنفذة', 'Projected cash-out': 'جني الأرباح المتوقع', 'Exit plan steps': 'خطوات خطة الخروج',
    'No coins in your exit plan yet.': 'لا توجد عملات في خطة الخروج بعد.', 'Add to Exit Plan': 'إضافة لخطة الخروج', 'to Exit Plan': 'لخطة الخروج',
    'and choose the coins you want to take profit on.': 'واختر العملات التي تريد جني أرباحها.',
    'Search the exit plan': 'ابحث في خطة الخروج', 'Every coin you hold is already in the exit plan.': 'جميع عملاتك موجودة بالفعل في خطة الخروج.',
    'Your coins and transactions are not touched.': 'لن تتأثر عملاتك ومعاملاتك.', 'Remove from the exit plan': 'حذف من خطة الخروج',
    'Plan order': 'ترتيب الخطة', 'Asset A–Z': 'العملة أ–ي', 'Price vs average': 'السعر مقابل المتوسط', 'Closest to TP1': 'الأقرب لـ TP1', 'Closest to TP2': 'الأقرب لـ TP2', 'Closest to TP3': 'الأقرب لـ TP3',
    'Cash out': 'جني الأرباح', 'Net profit': 'صافي الربح', 'Sort': 'ترتيب', 'Value': 'القيمة',
    'Target hit — sell': 'تحقق الهدف — بِع', 'Moonbag kept': 'Moonbag محفوظ', 'Set a price': 'حدد سعر', 'Plan amount': 'كمية الخطة', 'Average buy price': 'متوسط سعر الشراء',
    'Price you set': 'السعر الذي حددته', 'Sell %': 'نسبة البيع %', 'Tap a row to edit': 'اضغط على أي صف للتعديل',
    'You now hold': 'لديك الآن', 'Bought since': 'اشتريت منذ ذلك الحين', 'Sold since': 'بعت منذ ذلك الحين',
    'Bought after the coin joined the plan — added to the plan amount': 'اشتُريت بعد دخول العملة الخطة — أُضيفت إلى كمية الخطة',
    'Follows your average buy price — buy more and it moves with it': 'يتبع متوسط سعر شرائك — إذا اشتريت مجدداً يتحرك معه',
    // ── Add / Edit transaction ──
    'Add Buy': 'إضافة شراء', 'Add Sell': 'إضافة بيع', 'Add Transfer In': 'إضافة إيداع', 'Add Transfer Out': 'إضافة سحب', 'Add Reward': 'إضافة مكافأة',
    'Amount bought': 'الكمية المشتراة', 'Amount sold': 'الكمية المباعة', 'Amount transferred in': 'الكمية المودَعة', 'Amount transferred out': 'الكمية المسحوبة', 'Amount received': 'الكمية المستلمة',
    'Sell price per coin (USD)': 'سعر بيع العملة (USD)', 'Cost / value per coin at transfer (USD)': 'التكلفة / القيمة للعملة وقت التحويل (USD)',
    'Selling fee': 'رسوم البيع', '(USD, optional — subtracted from Realized Profit)': '(USD، اختياري — تُخصم من الربح المحقق)',
    'Raises your holdings and updates the average buy price.': 'يزيد أصولك ويحدّث متوسط سعر الشراء.',
    'Lowers your holdings at the current average cost and records realized profit/loss.': 'يقلّل أصولك بمتوسط التكلفة الحالي ويسجّل الربح / الخسارة المحققة.',
    'Coins arriving from outside this portfolio. The cost per coin goes into your average buy price (use your original purchase price, or 0 for mined/free coins). The fee is deducted from the amount received.':
      'عملات واردة من خارج هذه المحفظة. تدخل تكلفة العملة في متوسط سعر شرائك (استخدم سعر شرائك الأصلي، أو 0 للعملات المُعدَّنة / المجانية). وتُخصم الرسوم من الكمية المستلمة.',
    'Staking, mining or airdrop coins that arrived in your wallet. They come in at $0 cost, so your holdings go up and the average buy price goes down — the reward is pure profit.':
      'عملات Staking أو تعدين أو Airdrop وصلت إلى محفظتك. تدخل بتكلفة صفر، فتزيد أصولك وينخفض متوسط سعر الشراء — والمكافأة ربح صافٍ.',
    'Coins leaving this portfolio (e.g. to another wallet you don’t track). Average buy price is unchanged and no profit/loss is recorded. The fee is also deducted.':
      'عملات خارجة من هذه المحفظة (مثلاً إلى محفظة أخرى لا تتابعها). لا يتغير متوسط سعر الشراء ولا يُسجّل ربح / خسارة. وتُخصم الرسوم أيضاً.',
    'Set network & where held': 'حدد الشبكة ومكان الحفظ', 'Network & where held — used by the wallet check': 'الشبكة ومكان الحفظ — بتُستخدم في مطابقة المحافظ',
    'USDC (new)': 'USDC (جديدة)', '(new)': '(جديدة)', 'Add the money to USDT': 'إضافة الفلوس لـ USDT', 'Not enough': 'غير كافٍ', 'now': 'الآن',
    'Save changes': 'حفظ التعديلات', 'Edit transaction': 'تعديل المعاملة', 'Change transaction': 'تعديل المعاملة', 'Delete transaction': 'حذف المعاملة', 'Delete transaction?': 'حذف المعاملة؟',
    'Holdings and averages are worked out again.': 'تُعاد حساب الأصول والمتوسطات.', 'Holdings, average buy price and profit are worked out again from your history.': 'يُعاد حساب الأصول ومتوسط سعر الشراء والربح من سجلك.',
    'Holdings and average cost will be recalculated automatically on all devices.': 'سيُعاد حساب الأصول ومتوسط التكلفة تلقائياً على جميع الأجهزة.',
    'Symbol is required.': 'الرمز مطلوب.', 'Pick the coin from the search list (or type only its symbol, e.g. XRP).': 'اختر العملة من قائمة البحث (أو اكتب رمزها فقط، مثلاً XRP).',
    'Enter a valid quantity.': 'أدخل كمية صحيحة.', 'Enter a valid buy price.': 'أدخل سعر شراء صحيحاً.', 'Enter a quantity greater than 0.': 'أدخل كمية أكبر من صفر.', 'Enter a price greater than 0.': 'أدخل سعراً أكبر من صفر.',
    'Fee cannot be negative.': 'لا يمكن أن تكون الرسوم سالبة.', 'Fee must be smaller than the amount transferred in.': 'يجب أن تكون الرسوم أقل من الكمية المودَعة.', 'Date cannot be in the future.': 'لا يمكن أن يكون التاريخ في المستقبل.',
    'Enter a valid date.': 'أدخل تاريخاً صحيحاً.', 'The start date cannot be in the future.': 'لا يمكن أن يكون تاريخ البداية في المستقبل.', 'The start date can be at most 5 years ago.': 'لا يمكن أن يتجاوز تاريخ البداية 5 سنوات مضت.',
    'Enter the amount you have staked.': 'أدخل الكمية الموضوعة في الـ Staking.', 'Enter the APY, e.g. 6.5 for 6.5% a year.': 'أدخل العائد السنوي APY، مثلاً 6.5 تعني 6.5% سنوياً.',
    'Enter a quantity and price (0 or more).': 'أدخل الكمية والسعر (صفر أو أكثر).',
    'CoinGecko ID looks wrong — pick the coin from the search list.': 'يبدو أن معرّف CoinGecko غير صحيح — اختر العملة من قائمة البحث.',
    'CoinMarketCap page: use lowercase letters, digits and dashes only.': 'صفحة CoinMarketCap: استخدم أحرفاً إنجليزية صغيرة وأرقاماً وشرطات فقط.',
    'Add without live price?': 'إضافة بدون سعر مباشر؟', 'Add anyway': 'أضف على أي حال',
    'Staking reward': 'مكافأة Staking', 'Mining reward': 'مكافأة تعدين', 'Change staking': 'تعديل الـ Staking', 'Amount staked': 'الكمية في الـ Staking', 'Staking since': 'Staking من تاريخ',
    'Start staking': 'بدء الـ Staking', 'Stop staking': 'إيقاف الـ Staking', 'Staking reward · auto': 'مكافأة Staking · تلقائي', 'Not a reward (plain Transfer In)': 'ليست مكافأة (إيداع عادي)',
    'Could not change it': 'تعذّر التعديل', 'Could not stop it': 'تعذّر الإيقاف', 'staking': 'Staking', 'e.g. SOL staking (Tangem)': 'مثلاً SOL staking (Tangem)',
    'This coin is not on automatic staking': 'هذه العملة ليست على Staking تلقائي', 'Enter the amount staked and an APY above 0%': 'أدخل الكمية في الـ Staking وعائداً سنوياً أكبر من 0%',
    'Paid': 'المدفوع', 'Pays': 'يدفع', 'Adds': 'يضيف', 'Arrives in your wallet': 'يصل إلى محفظتك', '· cost added': '· أُضيفت التكلفة', '$0 cost': 'تكلفة صفر',
    'A later sell/transfer would then exceed your holdings.': 'عندها سيصبح بيع / سحب لاحق أكبر من أصولك.',
    // ── a coin's page & History ──
    'Transactions': 'المعاملات', 'Total Bought': 'إجمالي الشراء', 'Total Sold': 'إجمالي البيع', 'Profit': 'ربح', 'Loss': 'خسارة',
    'Opening position': 'المركز الافتتاحي', 'Manual edit': 'تعديل يدوي', 'Wallet check': 'مطابقة المحفظة', 'Mining reward · wallet check': 'مكافأة تعدين · مطابقة المحفظة',
    'You hold none of this coin now': 'لا تملك من هذه العملة حالياً', 'BTC is always Hold': 'البيتكوين دائماً احتفاظ', 'Typing': 'جاري الكتابة', 'Saved': 'تم الحفظ', 'Not saved —': 'لم يُحفظ —',
    'Category —': 'التصنيف —', 'Use default': 'استخدم الافتراضي', 'Rename': 'تغيير الاسم',
    'New name for this category — every coin in it, every filter and chart follow.': 'اسم جديد لهذا التصنيف — ستتبعه كل عملاته وكل فلتر ورسم.',
    'Name of the new category. Move coins into it with Change Category.': 'اسم التصنيف الجديد. انقل العملات إليه من تغيير التصنيف.',
    'Rewards & Mining': 'المكافآت والتعدين', 'Target Allocation': 'التوزيع المستهدف', 'DCA Schedule (Regular Buys)': 'الشراء الدوري (DCA)', 'Plan vs Target Allocation': 'الخطة مقابل التوزيع المستهدف', 'Exit Plan Steps': 'خطوات خطة الخروج',
    'Initial position': 'المركز الافتتاحي', 'Re-added coin': 'عملة أُعيدت إضافتها', 'Removed from portfolio': 'أُزيلت من المحفظة', 'Recovered from backup': 'استُعيدت من النسخة الاحتياطية',
  });
  // ════════ Fixes from the real portfolio (17 Nov) ════════
  R(/^(\$[\d,.]+)\/mo$/, function (_, a) { return n(a) + ' شهرياً'; });
  R(/^(.+) in (\d+) days$/, function (_, a, d) { return n(a) + ' خلال ' + pl(d, 'يوم', 'يومين', 'أيام', 'يوم'); });
  R(/^(\d+) wallets?$/, function (_, a) { return pl(a, 'محفظة واحدة', 'محفظتين', 'محافظ', 'محفظة'); });
  R(/^(\d+) to look at$/, '$1 تحتاج مراجعة');
  R(/^([A-Z0-9.]{2,12}) \((Reinforce|Hold|Sell \/ Convert)\)$/, function (_, c, k) { return c + ' (' + CPLang.t(k) + ')'; });
  R(/^target (.+%)$/, function (_, v) { return 'الهدف ' + n(v); });
  R(/^sold (.+)$/, function (_, q) { return 'بِيع ' + n(q); });
  R(/^vs BTC (.+) pts \(30d\), (.+) pts \(90d\)$/, function (_, a, b) { return 'مقابل BTC: ' + n(a) + ' نقطة (30 يوم)، ' + n(b) + ' نقطة (90 يوم)'; });
  R(/^categories on target — today (\d+) of (\d+)\. Today → after the plan · band ±([\d.]+) pts\.$/, 'تصنيفات على الهدف — واليوم $1 من $2. اليوم ← بعد الخطة · الهامش ±$3 نقطة.');
  R(/^categories on target\. Today → after the plan · band ±([\d.]+) pts\.$/, 'تصنيفات على الهدف. اليوم ← بعد الخطة · الهامش ±$1 نقطة.');
  R(/^(.+) is within your target allocation band$/, function (_, c) { return CPLang.t(c) + ' ضمن هامش التوزيع المستهدف'; });
  R(/^(.+) is ([\d.]+) pts above your target allocation — better to wait, or buy below-target categories first$/, function (_, c, p) { return CPLang.t(c) + ' فوق التوزيع المستهدف بـ ' + p + ' نقطة — الأفضل الانتظار، أو الشراء أولاً من التصنيفات الأقل من هدفها'; });
  R(/^(.+) is ([\d.]+) pts below your target allocation — buying (.+) moves you toward it$/, function (_, c, p, x) { return CPLang.t(c) + ' تحت التوزيع المستهدف بـ ' + p + ' نقطة — شراء ' + x + ' يقرّبك منه'; });
  R(/^Add (.+) to your portfolio$/, 'إضافة $1 لمحفظتك');
  R(/^View (.+) transactions$/, 'عرض معاملات $1');
  R(/^Smart: Hold instead of Sell \/ Convert — (.+) is ahead of BTC over 30 and 90 days$/, 'فحص ذكي: احتفاظ بدل بيع / تحويل — $1 متفوقة على البيتكوين في آخر 30 و 90 يوم');
  R(/^Smart: Hold instead of Reinforce — (.+) is behind BTC over 30 and 90 days$/, 'فحص ذكي: احتفاظ بدل تعزيز — $1 متأخرة عن البيتكوين في آخر 30 و 90 يوم');
  R(/^(.+): no futures found on the exchanges we check \((.+)\) — CoinGlass may have no map for it, open it to see$/, '$1: لا توجد عقود آجلة على المنصات التي نراجعها ($2) — قد لا تتوفر لها خريطة في CoinGlass، افتحها للتحقق');
  R(/^Change this (Buy|Sell|Transfer In|Transfer Out|Reward)$/, function (_, k) { return 'تعديل ' + CPLang.t(k) + ''; });
  R(/^Delete this (Buy|Sell|Transfer In|Transfer Out|Reward)$/, function (_, k) { return 'حذف ' + CPLang.t(k) + ''; });
  // the line under Add transaction
  R(/^(\$[\d,.]+) in ([A-Z0-9.]+)$/, function (_, a, c) { return n(a) + ' بالـ ' + c; });
  R(/^(\$[\d,.]+) from ([A-Z0-9.]+)$/, function (_, a, c) { return n(a) + ' من ' + c; });
  R(/^(.+) left$/, function (_, q) { return /[a-z]{3}/.test(q) ? null : 'متبقي ' + n(q); });
  R(/^\(≈ (.+) now\)$/, function (_, v) { return '(≈ ' + n(v) + ' الآن)'; });
  R(/^\((.+) \+ fee (.+)\)$/, function (_, a, b) { return '(' + n(a) + ' + رسوم ' + n(b) + ')'; });
  R(/^\((.+) − fees? (.+)\)$/, function (_, a, b) { return '(' + n(a) + ' − رسوم ' + n(b) + ')'; });
  R(/^Not enough (\S+) to pay this \(you have (.+)\) — saved (?:as a plain Buy|without paying from it)\. Tick “Pay from” to use it anyway\.$/, function (_, c, h) { return 'الـ ' + c + ' غير كافٍ للدفع (لديك ' + n(h) + ') — سُجّل كشراء عادي. فعّل "الدفع من" إذا أردت استخدامه رغم ذلك.'; });
  R(/^Not enough (\S+): you have (.+), this (?:buy )?costs (.+)\. Untick “Pay from” to (?:add|record) it without\.$/, function (_, c, h, v) { return 'الـ ' + c + ' غير كافٍ: لديك ' + n(h) + ' وهذا الشراء بقيمة ' + n(v) + '. ألغِ تفعيل "الدفع من" لتسجيله بدونه.'; });
  R(/^From the start date to now: (\d+) weekly rewards?, \+(.+)$/, function (_, k, q) { return 'من تاريخ البداية حتى الآن: ' + pl(k, 'مكافأة أسبوعية', 'مكافأتين أسبوعيتين', 'مكافآت أسبوعية', 'مكافأة أسبوعية') + '، ' + n('+' + q); });
  R(/^(\d+) regular buys?$/, function (_, a) { return pl(a, 'شراء دوري واحد', 'عمليتين شراء دوري', 'عمليات شراء دوري', 'عملية شراء دوري'); });

  A({
    'Rebalance': 'إعادة التوازن', 'no coin in this category yet — pick one to add': 'لا توجد عملة في هذا التصنيف بعد — اختر واحدة لإضافتها',
    "At today's prices. Coins to use: Reinforce first; to trim, Sell / Convert first. A plan to check, not advice.":
      'بأسعار اليوم. العملات المقترحة: التي عليها تعزيز أولاً؛ وللتخفيف، التي عليها بيع / تحويل أولاً. خطة للمراجعة، وليست نصيحة.',
    'points away from your target': 'نقاط البُعد عن هدفك', 'after the plan: points from your target': 'بعد الخطة: البُعد عن هدفك بالنقاط', 'Show the categories': 'عرض التصنيفات',
    'Altcoin Season — open the Market tab': 'موسم العملات البديلة — فتح مركز السوق', 'Sold out — no coins held': 'بِيعت بالكامل — لا تملك عملات منها',
    'Top Performers': 'الأفضل والأسوأ أداءً', 'Top Performers · USD': 'الأفضل والأسوأ أداءً · USD',
    'not checked yet': 'لم تُطابَق بعد', 'all match': 'كله مطابق',
    'Your wallet': 'محفظتك', 'Cold wallet': 'محفظة باردة', 'Exchange': 'منصة', 'Hot wallet': 'محفظة ساخنة',
    'If you finish this plan (': 'إذا أكملت هذه الخطة (', "at today's prices):": 'بأسعار اليوم):', 'Your plan is complete —': 'اكتملت خطتك —',
    'Not Owned Yet': 'لا تملكها بعد', 'Change': 'تعديل',
    // the line under Add transaction
    'Total cost': 'إجمالي التكلفة', 'Holdings after': 'الأصول بعدها', 'Proceeds': 'حصيلة البيع', 'profit': 'ربح', 'loss': 'خسارة', 'fee': 'رسوم',
    'Received after fee': 'المستلم بعد الرسوم', 'cost added': 'التكلفة المضافة', 'Leaves portfolio incl. fee': 'الخارج من المحفظة شامل الرسوم',
    'Arrives in your wallet': 'يصل إلى محفظتك', 'to your portfolio': 'لمحفظتك', 'at': 'بـ', 'Cost Basis': 'تكلفة الشراء',
    'Booked as a': 'يُسجّل كـ', 'at $0 cost every 7 days': 'بتكلفة صفر كل 7 أيام', '— added right away': '— أُضيفت مباشرة',
    'What was earned so far is booked first at the old APY; the new numbers count from now.': 'يُسجّل ما تحقق حتى الآن أولاً بالعائد القديم، وتُحتسب الأرقام الجديدة من الآن.',
  });
  // ════════ Phase 3: Market Hub, Altcoin Season, Recover, and the windows (wallets, import, rewards, support, AI, Telegram alerts) ════════
  R(/^(\d+) min ago$/, function (_, m) { return 'منذ ' + pl(m, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة'); });
  R(/^(\d+) h ago$/, function (_, h) { return 'منذ ' + pl(h, 'ساعة', 'ساعتين', 'ساعات', 'ساعة'); });
  R(/^(\d+) d ago$/, function (_, d) { return 'منذ ' + pl(d, 'يوم', 'يومين', 'أيام', 'يوم'); });
  R(/^Updated (\d+ (?:min|h|d) ago|just now)$/, function (_, x) { return 'آخر تحديث ' + (x === 'just now' ? 'الآن' : CPLang.t(x)); });
  R(/^Top (\d+)$/, 'أكبر $1');
  R(/^(.+%) to go$/, function (_, v) { return 'متبقي ' + n(v); });
  R(/^Networks: (.+)\. Staked coins are counted on Sui and the Cosmos family \(NEAR staked in a pool isn’t\)\.$/, function (_, l) { return 'الشبكات: ' + n(l) + '. تُحتسب العملات المرهونة (Staked) على Sui وعائلة Cosmos (ولا يُحتسب NEAR المرهون في Pool).'; });
  R(/^(\d+) of (\d+) questions$/, '$1 من $2 سؤال'); R(/^(\d+) of (\d+) quick reports$/, '$1 من $2 تقرير سريع');
  R(/^Today: (.+)$/, function (_, x) { return 'اليوم: ' + x.split(' · ').map(function (p) { return CPLang.t(p); }).join(' · '); });
  R(/^a month ago → (.+)$/, 'قبل شهر ← $1'); R(/^today$/, 'اليوم');
  R(/^Last backup: (.+)$/, function (_, t) { return 'آخر نسخة احتياطية: ' + (t === 'Never' ? 'لا توجد' : (date(t) || (/ago$|^just now$/.test(t) ? CPLang.t(t) : n(t)))); });

  A({
    // ── Market Hub ──
    'Market overview': 'نظرة على السوق', 'Loading the market': 'جاري تحميل السوق', 'Total Market Cap': 'القيمة السوقية الإجمالية', 'Volume 24h': 'حجم التداول 24 ساعة',
    'ETF money, last 7 days': 'تدفقات صناديق ETF، آخر 7 أيام', 'ETH ETFs': 'صناديق ETH', 'BTC ETFs': 'صناديق BTC', 'Yesterday': 'أمس', 'Last week': 'الأسبوع الماضي', 'Last month': 'الشهر الماضي',
    'Waiting for data': 'بانتظار البيانات', 'Altcoin Season starts at 75.': 'يبدأ موسم العملات البديلة عند 75.', 'Altcoin': 'العملات البديلة', 'Beating BTC': 'تتفوق على BTC', 'BTC (90 days)': 'BTC (90 يوماً)',
    'Market Dominance': 'الهيمنة السوقية', 'Others': 'أخرى', 'ETF Flows': 'تدفقات صناديق ETF', 'US spot': 'الفورية الأمريكية', 'Since launch': 'منذ الإطلاق',
    'Net money in or out of the US spot ETFs each trading day (no trading on weekends). Source:': 'صافي الأموال الداخلة إلى صناديق ETF الفورية الأمريكية أو الخارجة منها في كل يوم تداول (لا تداول في عطلة نهاية الأسبوع). المصدر:',
    ', saved by GitHub after the US market closes.': '، ويحفظها GitHub بعد إغلاق السوق الأمريكي.',
    'Watchlist': 'قائمة المتابعة', 'Market watchlist': 'قائمة متابعة السوق', 'In': 'في\u00a0', 'Stablecoins hidden': 'العملات المستقرة مخفية', 'Gainers': 'الأكثر ارتفاعاً', 'Losers': 'الأكثر انخفاضاً',
    'Add Custom Coin': 'إضافة عملة أخرى', 'Type a coin name or symbol — any coin listed on CoinGecko can be followed or added.': 'اكتب اسم العملة أو رمزها — يمكن متابعة أو إضافة أي عملة مدرجة في CoinGecko.',
    'Price /': 'السعر /', 'Prices': 'الأسعار', 'How many coins': 'عدد العملات', 'Period on a phone': 'المدة على الجوال', 'Sort by rank': 'ترتيب حسب الترتيب السوقي',
    '(live, plus a snapshot every ~30 min) · coins 101–500 topped up from Binance · Coin pages: CoinMarketCap (CoinGecko for coins it doesn\'t list) · Predictions: CoinCodex · ETF flows: SoSoValue · Market Dominance, Fear & Greed and the Altcoin Season Index:':
      '(مباشر، مع لقطة كل 30 دقيقة تقريباً) · العملات 101–500 تُستكمل من Binance · صفحات العملات: CoinMarketCap (و CoinGecko لما لا تدرجه) · التوقعات: CoinCodex · تدفقات ETF: SoSoValue · الهيمنة السوقية ومؤشر الخوف والطمع ومؤشر موسم العملات البديلة:',
    '(its own indexes — the numbers CoinMarketCap, Binance and CoinGlass show).': '(مؤشراتها الخاصة — الأرقام التي تعرضها CoinMarketCap و Binance و CoinGlass).',
    'Altcoin Season — open the full page': 'موسم العملات البديلة — فتح الصفحة الكاملة', '1 ETH in BTC — rising means ETH is beating Bitcoin': 'سعر 1 ETH بالبيتكوين — ارتفاعه يعني تفوق ETH على البيتكوين',
    'Top 50 coins vs BTC over 30 days (the 90-day number is still being prepared).': 'أكبر 50 عملة مقابل BTC خلال 30 يوماً (رقم 90 يوماً قيد التجهيز).',
    'No coin found on CoinGecko.': 'لم يتم العثور على العملة في CoinGecko.', 'CoinGecko search is busy right now (free limit) — try again in a minute.': 'بحث CoinGecko مشغول حالياً (الحد المجاني) — حاول بعد دقيقة.',
    'You are offline.': 'أنت غير متصل بالإنترنت.', 'Search failed — try again.': 'فشل البحث — حاول مرة أخرى.',
    'Sign in to keep a Watchlist — it syncs to all your devices.': 'سجّل الدخول لحفظ قائمة المتابعة — تتزامن مع جميع أجهزتك.', 'Could not save the Watchlist': 'تعذّر حفظ قائمة المتابعة',
    'In your Plan — open it': 'في خطتك — افتحها', 'Remove from Watchlist': 'إزالة من قائمة المتابعة', 'Add to Watchlist': 'إضافة إلى قائمة المتابعة',
    'Sign in first to add coins to your portfolio.': 'سجّل الدخول أولاً لإضافة عملات إلى محفظتك.', 'Sign in first to add coins to your plan.': 'سجّل الدخول أولاً لإضافة عملات إلى خطتك.', 'Could not add to Plan': 'تعذّرت الإضافة إلى الخطة',
    'CoinGecko’s free limit is busy — showing the newest saved numbers.': 'الحد المجاني لـ CoinGecko مشغول — تُعرض أحدث الأرقام المحفوظة.', 'CoinGecko is busy — prices from Binance.': 'CoinGecko مشغول — الأسعار من Binance.',
    'Market data isn’t reachable right now — trying again in a few minutes.': 'بيانات السوق غير متاحة حالياً — ستتم إعادة المحاولة خلال دقائق.', 'just now': 'الآن',
    'Rank': 'الترتيب', 'Name': 'الاسم', 'Market Cap': 'القيمة السوقية', 'Volume': 'حجم التداول',
    // ── Altcoin Season ──
    'Loading Altcoin Season': 'جاري تحميل موسم العملات البديلة', 'Couldn’t load — try again in a minute': 'تعذّر التحميل — حاول بعد دقيقة', 'Altcoin Season Index': 'مؤشر موسم العملات البديلة',
    'Bitcoin Season': 'موسم البيتكوين', 'Altcoin Season': 'موسم العملات البديلة', 'Neutral zone': 'منطقة محايدة', 'Leaning Altcoins': 'يميل للعملات البديلة', 'Leaning Bitcoin': 'يميل للبيتكوين', 'Altcoin season gauge': 'مقياس موسم العملات البديلة', 'Altcoin Season gauge': 'مقياس موسم العملات البديلة',
    'The share of the top 100 coins (no stablecoins, wrapped or staked tokens) that did better than BTC over the last 90 days. 75 or more is Altcoin Season, 25 or less is Bitcoin Season.':
      'نسبة العملات من أكبر 100 عملة (دون العملات المستقرة والمغلّفة والمرهونة) التي تفوقت على BTC خلال آخر 90 يوماً. 75 أو أكثر يعني موسم العملات البديلة، و25 أو أقل يعني موسم البيتكوين.',
    'How it moved': 'كيف تحرّك', 'Coins beating BTC': 'العملات المتفوقة على BTC', 'Your coins vs BTC': 'عملاتك مقابل BTC', 'Top 100 vs BTC': 'أكبر 100 مقابل BTC',
    'The Altcoin Season data isn’t available right now.': 'بيانات موسم العملات البديلة غير متاحة حالياً.',
    "Past days are worked out with today's top 100 coins (CoinMarketCap uses each day's own list), so older days can differ a little. From now on every day is saved with that day's list.":
      'تُحسب الأيام السابقة بقائمة أكبر 100 عملة اليوم (بينما تستخدم CoinMarketCap قائمة كل يوم)، لذا قد تختلف الأيام القديمة قليلاً. ومن الآن يُحفظ كل يوم بقائمته الخاصة.',
    'Period': 'المدة', 'Typical altcoin': 'العملة البديلة النموذجية', 'Gap': 'الفارق', 'Sign in to compare your coins with BTC.': 'سجّل الدخول لمقارنة عملاتك بـ BTC.',
    'Behind BTC': 'متأخرة عن BTC', 'Ahead of BTC': 'متقدمة على BTC', 'Yours': 'عملاتك', 'Show all': 'عرض الكل', 'Show less': 'عرض أقل',
    'and Binance (daily, 00:00 UTC), saved by GitHub with each market snapshot. The index follows the CoinMarketCap method. "vs BTC" = how the coin did against holding BTC over the same days.':
      'و Binance (يومياً، 00:00 UTC)، ويحفظها GitHub مع كل لقطة للسوق. ويتبع المؤشر طريقة CoinMarketCap. "مقابل BTC" = أداء العملة مقارنة بالاحتفاظ بـ BTC خلال الأيام نفسها.',
    'More about Altcoin Season': 'المزيد عن موسم العملات البديلة', 'Altcoin Season history': 'سجل موسم العملات البديلة', 'Getting ready': 'جاري التجهيز', 'No coins with 90 days of prices yet.': 'لا توجد عملات لها أسعار 90 يوماً بعد.',
    // ── Import ──
    'Import from an exchange': 'الاستيراد من منصة', "Add your exchange's": 'أضف ملف', 'trade history': 'سجل الصفقات', 'and': 'و', 'withdraw history': 'سجل السحب',
    '(CSV). Nothing is saved until you tap Add — you see every line first, and anything already in your portfolio is left out.': 'الخاص بمنصتك (CSV). لا يُحفظ شيء حتى تضغط إضافة — تراجع كل سطر أولاً، ويُستبعد ما هو موجود بالفعل في محفظتك.',
    'Choose CSV files': 'اختر ملفات CSV', 'Order no.': 'رقم الأمر', 'Transaction id': 'رقم المعاملة', 'The file is empty.': 'الملف فارغ.', 'Paid in': 'الدفع بـ', 'Unknown pair': 'زوج غير معروف',
    'Stablecoin swap': 'تبديل عملات مستقرة', 'No price in the file': 'لا يوجد سعر في الملف', 'Withdrawal not completed': 'السحب لم يكتمل', '(another exchange / not your wallet)': '(منصة أخرى / ليست محفظتك)',
    'Already in your portfolio (': 'موجودة بالفعل في محفظتك (', '(your newest entry)': '(أحدث إدخال لك)', 'Not a trade or withdraw history': 'ليس سجل صفقات أو سحب',
    'BTC sold on the exchange is mining income (not from your wallet)': 'البيتكوين المباع على المنصة دخل تعدين (ليس من محفظتك)', 'Already there': 'موجود بالفعل', 'Before date': 'قبل التاريخ', 'Nothing here.': 'لا يوجد شيء هنا.', 'Could not save': 'تعذّر الحفظ',
    // ── Rewards window ──
    'No rewards or mined coins yet.': 'لا توجد مكافآت أو عملات مُعدَّنة بعد.', 'Add them with': 'أضفها من', 'Add Transaction → Reward': 'إضافة معاملة ← مكافأة', '(staking, at $0 cost), or from': '(Staking، بتكلفة صفر)، أو من',
    'Wallets & check → Add as Reward': 'المحافظ والمطابقة ← إضافة كمكافأة', 'when your wallet has more. Mined BTC imported from Binance counts here too.': 'عندما تحتوي محفظتك على كمية أكبر. ويُحتسب هنا أيضاً البيتكوين المُعدَّن المستورد من Binance.',
    'Staking rewards, mined BTC, airdrops': 'مكافآت Staking، بيتكوين مُعدَّن، Airdrops', 'By coin': 'حسب العملة', 'By month': 'حسب الشهر',
    // ── Wallets window ──
    'Your wallets': 'محافظك', 'No wallet yet. Add the public address of each wallet you keep coins in (Tangem: tap the coin → Receive → copy).': 'لا توجد محفظة بعد. أضف العنوان العام لكل محفظة تحفظ فيها عملات (Tangem: اضغط على العملة ← استلام ← نسخ).',
    'Public addresses only — never type your recovery phrase or private key anywhere.': 'العناوين العامة فقط — لا تكتب أبداً عبارة الاسترداد أو المفتاح الخاص في أي مكان.', 'Check now': 'تحقق الآن', 'Paste a public address': 'الصق عنواناً عاماً', 'Name (optional)': 'الاسم (اختياري)',
    'Reading your wallets': 'جاري قراءة محافظك', 'Reading balances from the blockchain': 'جاري قراءة الأرصدة من البلوكتشين', 'CoinGecko is busy — waiting a moment': 'CoinGecko مشغول — انتظار لحظة',
    'Finding token contracts on CoinGecko': 'جاري البحث عن عقود الرموز في CoinGecko', 'Wallet has more': 'المحفظة فيها أكثر', 'App has more': 'التطبيق فيه أكثر', 'All match': 'كله مطابق',
    'On an exchange, staked, or in a wallet you haven’t added. Tap a coin to say where it is (Binance, Gate.io, staked…) or which network it’s on.':
      'على منصة، أو في Staking، أو في محفظة لم تضفها. اضغط على العملة لتحديد مكانها (Binance، Gate.io، Staking…) أو شبكتها.',
    'Their network didn’t answer this time — tap Check now again.': 'لم تستجب شبكتها هذه المرة — اضغط تحقق الآن مرة أخرى.',
    'CoinGecko was busy, so these weren’t looked up yet — tap Check now again (what was found is remembered).': 'كان CoinGecko مشغولاً فلم يُبحث عن هذه بعد — اضغط تحقق الآن مرة أخرى (ما تم العثور عليه محفوظ).',
    'Not found on the networks of your wallets — tap the coin to pick its network (and paste its contract if it’s a token).': 'غير موجودة على شبكات محافظك — اضغط على العملة لاختيار شبكتها (والصق عقدها إن كانت رمزاً).',
    'Not linked to CoinGecko.': 'غير مرتبطة بـ CoinGecko.', 'Their own blockchain (can’t be read here).': 'بلوكتشين خاص بها (لا يمكن قراءته هنا).', 'Compares every coin you hold with these wallets.': 'يقارن كل عملة تملكها بهذه المحافظ.',
    'Not an address of a network the check can read (see the list below).': 'ليس عنواناً لشبكة يمكن قراءتها (راجع القائمة أدناه).', 'Already in the list.': 'موجود بالفعل في القائمة.', 'Found by the wallet check': 'وُجدت عبر مطابقة المحافظ',
    'CoinGecko doesn’t list a network for it — add it below.': 'لا يذكر CoinGecko شبكة لها — أضفها أدناه.', 'Network and where held —': 'الشبكة ومكان الحفظ —', 'Pick the network first.': 'اختر الشبكة أولاً.',
    'An EVM token contract is 0x followed by 40 letters / digits.': 'عقد رمز EVM هو 0x متبوعاً بـ 40 حرفاً / رقماً.', 'That doesn’t look like a contract address.': 'لا يبدو هذا عنوان عقد.', 'Add as Reward': 'إضافة كمكافأة', 'Add wallet': 'إضافة محفظة', 'Address': 'العنوان', 'Network': 'الشبكة',
    // ── AI analysis start screen (English report chosen inside the Arabic app keeps its own words) ──
    'AI Analysis Report': 'تقرير تحليل AI', 'Not yet fetched this session': 'لم يُجلب بعد في هذه الجلسة', 'Copy failed': 'فشل النسخ', 'Save as PDF': 'حفظ PDF',
    'Not ready — try again': 'غير جاهز — حاول مرة أخرى', 'Tap again to copy': 'اضغط مرة أخرى للنسخ', 'Copied — paste it in Claude': 'تم النسخ — الصقه في Claude', "Paste Claude's reply here": 'الصق رد Claude هنا', 'Show report': 'عرض التقرير',
    "That doesn't look like the report — paste Claude's whole reply.": 'لا يبدو هذا التقرير — الصق رد Claude كاملاً.', 'Sign in first': 'سجّل الدخول أولاً', 'The AI report is only for signed-in accounts. Sign in, then try again.': 'تقرير AI متاح للحسابات المسجّلة فقط. سجّل الدخول ثم حاول مرة أخرى.',
    'Daily limit reached': 'تم بلوغ الحد اليومي', 'Analysis failed': 'فشل التحليل', 'Empty response from AI': 'رد فارغ من AI', 'Claude returned an empty report. Please try again.': 'أعاد Claude تقريراً فارغاً. حاول مرة أخرى.',
    'Connection error': 'خطأ في الاتصال', 'Could not reach the analysis service. Check your internet connection and try again.': 'تعذّر الوصول إلى خدمة التحليل. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.',
    'Claude AI is reading the market and analyzing your portfolio': 'يقرأ Claude AI السوق ويحلل محفظتك', 'This takes 10–30 seconds': 'يستغرق ذلك من 10 إلى 30 ثانية',
    // ── Telegram alerts window ──
    'Sent by your bot. GitHub checks every 30 minutes, after the market update.': 'يرسلها البوت الخاص بك. يتحقق GitHub كل 30 دقيقة بعد تحديث السوق.', 'Reports': 'التقارير', 'Alerts': 'التنبيهات',
    'Morning brief': 'الملخص الصباحي', 'Your portfolio, movers and the market, every day': 'محفظتك والأكثر حركة والسوق، كل يوم', 'Weekly report': 'التقرير الأسبوعي', 'Friday morning: the week vs BTC': 'صباح الجمعة: الأسبوع مقابل BTC',
    'Big moves': 'التحركات الكبيرة', 'BTC or your portfolio moves this much': 'عندما يتحرك BTC أو محفظتك بهذه النسبة', 'Signal changes': 'تغيّر الإشارات', 'A coin turns Reinforce, Hold or Sell / Convert': 'عندما تتحول عملة إلى تعزيز أو احتفاظ أو بيع / تحويل',
    'Plan targets': 'أهداف الخطة', 'A coin reaches its Accumulation Plan target': 'عندما تبلغ عملة هدفها في خطة التجميع', 'Buy-price alerts': 'تنبيهات سعر الشراء', 'A plan coin drops to the alert price you set on it': 'عندما تنخفض عملة في الخطة إلى سعر التنبيه الذي حددته',
    'Take-profit levels': 'مستويات جني الأرباح', 'A coin reaches TP1 / TP2 / TP3 of your exit plan': 'عندما تبلغ عملة TP1 / TP2 / TP3 في خطة الخروج', 'Exit levels': 'مستويات الخروج',
    'BTC dominance, USDT dominance, ETH/BTC at your exit targets': 'هيمنة BTC وهيمنة USDT و ETH/BTC عند أهداف الخروج', 'Allocation drift': 'انحراف التوزيع', 'A category moves outside your target allocation band': 'عندما يخرج تصنيف عن هامش التوزيع المستهدف',
    'DCA reminders': 'تذكيرات الشراء الدوري', 'Your regular buys: on the day, and 2 days late if not bought': 'مشترياتك الدورية: في يومها، وبعد يومين إن لم تُنفَّذ', 'Market extremes': 'الحالات القصوى للسوق',
    'Extreme Fear / Greed, Altcoin / Bitcoin Season': 'خوف / طمع شديد، موسم العملات البديلة / البيتكوين', 'Big ETF days': 'أيام ETF الكبيرة', 'BTC or ETH spot ETFs move at least': 'عندما تتحرك صناديق BTC أو ETH الفورية بما لا يقل عن',
    'Data warnings': 'تحذيرات البيانات', 'A price or market source stops updating': 'عندما يتوقف مصدر سعر أو سوق عن التحديث', 'Quiet': 'الهدوء', 'Quiet hours 00:00–07:00': 'ساعات الهدوء 00:00–07:00',
    'Alerts wait until morning, except very big moves (2× your %)': 'تنتظر التنبيهات حتى الصباح، ما عدا التحركات الكبيرة جداً (ضعف نسبتك)',
    'Times are Riyadh time. Each alert comes once; it can come again only after the condition went away.': 'الأوقات بتوقيت الرياض. كل تنبيه يصل مرة واحدة، ولا يتكرر إلا بعد زوال الحالة ثم عودتها.',
    'Saved — the next check uses these settings.': 'تم الحفظ — سيستخدم الفحص القادم هذه الإعدادات.', 'Language of the messages': 'لغة الرسائل', 'Brief at': 'وقت الملخص',
    // ── Settings dialogs (shown line by line) ──
    'Every AI question and quick report is paid to Claude (Anthropic) one by one — that\'s the only reason for daily limits.': 'كل سؤال AI وكل تقرير سريع يُدفع لـ Claude (Anthropic) بشكل منفصل — وهذا هو السبب الوحيد للحدود اليومية.',
    '🆓 Free for everyone, no limit: the full AI Analysis report with your own Claude app (AI Analysis → Copy for Claude → paste).': '🆓 مجاني للجميع وبلا حدود: تقرير تحليل AI الكامل عبر تطبيق Claude الخاص بك (تحليل AI ← نسخ لـ Claude ← لصق).',
    '🧠 Questions to the bot: 5 a day · ⭐ Premium 20 · 🔑 your own Claude key 100.': '🧠 أسئلة للبوت: 5 يومياً · ⭐ المميز 20 · 🔑 مفتاح Claude الخاص بك 100.',
    '📊 Quick reports here: ⭐ Premium 3 a day · 🔑 your own key 10.': '📊 التقارير السريعة هنا: ⭐ المميز 3 يومياً · 🔑 مفتاحك الخاص 10.', '🎙 Voice notes: ⭐ Premium or your own key.': '🎙 الرسائل الصوتية: ⭐ المميز أو مفتاحك الخاص.',
    'Optional — your own Claude key gives you more AI, paid by you to Anthropic (a question costs about a cent or two).': 'اختياري — مفتاح Claude الخاص بك يمنحك استخداماً أكبر لـ AI، وتدفع تكلفته لـ Anthropic (السؤال يكلّف سنتاً أو سنتين تقريباً).',
    '🤖 In the bot: 100 AI questions a day (instead of 5) · 🎙 voice notes': '🤖 في البوت: 100 سؤال AI يومياً (بدلاً من 5) · 🎙 رسائل صوتية', '📊 In the app: 10 quick AI Analysis reports a day': '📊 في التطبيق: 10 تقارير تحليل AI سريعة يومياً',
    '🔑 It is not ⭐ Premium or 💛 Supporter (those are Telegram Stars) — everything else stays the same.': '🔑 لا يجعلك ⭐ مميزاً أو 💛 داعماً (فهذه عبر Telegram Stars) — ويبقى كل شيء آخر كما هو.',
    'How to get one: console.anthropic.com → sign in → Billing (add a little credit) → API keys → Create key → copy it here.': 'طريقة الحصول عليه: console.anthropic.com ← تسجيل الدخول ← Billing (أضف رصيداً بسيطاً) ← API keys ← Create key ← انسخه هنا.',
    'Free & non-profit · optional support · ⭐ Premium': 'مجاني وغير ربحي · دعم اختياري · ⭐ المميز', '✅ Linked — the bot reads your portfolio (only for you)': '✅ مرتبط — يقرأ البوت محفظتك (لك وحدك)',
    'Why there are limits · free ways · more': 'لماذا توجد حدود · طرق مجانية · المزيد', 'None yet': 'لا يوجد بعد', '🔑 Your own key': '🔑 مفتاحك الخاص',
    'On iPhone: tap Share (the square with the arrow — in the address bar or the menu) → “Add to Home Screen” → Add. (If you don\'t see it, open this page in Safari.)': 'على iPhone: اضغط مشاركة (المربع بالسهم — في شريط العنوان أو القائمة) ← "إضافة إلى الشاشة الرئيسية" ← إضافة. (إن لم تجدها، افتح هذه الصفحة في Safari.)',
    'In Safari: tap Share (the square with the arrow) → “Add to Home Screen” → Add.': 'في Safari: اضغط مشاركة (المربع بالسهم) ← "إضافة إلى الشاشة الرئيسية" ← إضافة.',
    'In DuckDuckGo: open the menu (top right) → “Add to Home Screen”.': 'في DuckDuckGo: افتح القائمة (أعلى اليمين) ← "إضافة إلى الشاشة الرئيسية".',
    'In Samsung Internet: tap ☰ (menu, bottom right) → “Add page to” → “Home screen”.': 'في Samsung Internet: اضغط ☰ (القائمة، أسفل اليمين) ← "إضافة الصفحة إلى" ← "الشاشة الرئيسية".',
    'In Firefox: tap ⋮ (menu) → “Add app to Home screen” (or “Install”).': 'في Firefox: اضغط ⋮ (القائمة) ← "إضافة التطبيق إلى الشاشة الرئيسية" (أو "تثبيت").',
    'In Opera: tap ⋮ (menu) → “Add to → Home screen”.': 'في Opera: اضغط ⋮ (القائمة) ← "إضافة إلى ← الشاشة الرئيسية".',
    'In Chrome: tap ⋮ (menu) → “Install app” or “Add to Home screen”.': 'في Chrome: اضغط ⋮ (القائمة) ← "تثبيت التطبيق" أو "إضافة إلى الشاشة الرئيسية".',
    'In Edge: tap ⋯ (menu, bottom) → “Add to phone” → “Install”.': 'في Edge: اضغط ⋯ (القائمة، بالأسفل) ← "إضافة إلى الهاتف" ← "تثبيت".',
    "In your browser's menu, look for “Add to Home screen” (or “Install app”). Chrome and Samsung Internet support it best.": 'ابحث في قائمة المتصفح عن "إضافة إلى الشاشة الرئيسية" (أو "تثبيت التطبيق"). يدعمها Chrome و Samsung Internet بشكل أفضل.',
    // ── Support window ──
    '(renews by itself)': '(يتجدد تلقائياً)', '⭐ — thank you!': '⭐ — شكراً لك!', 'Telegram opened — confirm there. Thank you 💛 (come back here to see your badge).': 'فُتح تليجرام — أكّد هناك. شكراً لك 💛 (ارجع هنا لترى شارتك).',
    'Link the Telegram bot first (one tap above).': 'اربط بوت تليجرام أولاً (ضغطة واحدة بالأعلى).', "You're subscribed already — thank you!": 'أنت مشترك بالفعل — شكراً لك!',
    // ── Recover ──
    "Find Changes That Didn't Reach the Cloud": 'البحث عن تغييرات لم تصل إلى السحابة', 'Pick a source. This page compares it with your cloud portfolio coin by coin and lists any transactions the cloud is missing.': 'اختر مصدراً. تقارنه هذه الصفحة بمحفظتك على السحابة عملةً عملة، وتعرض أي معاملات ناقصة في السحابة.',
    'Nothing changes until you press “Restore selected”': 'لا يتغير شيء حتى تضغط "استرجاع المحدد"', ', and a backup of the cloud is downloaded first.': '، ويتم أولاً تنزيل نسخة احتياطية من السحابة.',
    'This device': 'هذا الجهاز', 'Old cloud (JSONBin)': 'السحابة القديمة (JSONBin)', 'Backup file': 'ملف نسخة احتياطية', 'Data this browser saved with the previous version of the app (kept on this device, encrypted). Run this on': 'بيانات حفظها هذا المتصفح مع الإصدار السابق من التطبيق (محفوظة على هذا الجهاز ومشفّرة). نفّذ هذا على',
    'each': 'كل', 'phone and computer you used.': 'جوال وكمبيوتر استخدمته.', 'Compare this device': 'مقارنة هذا الجهاز', 'The old app saved to JSONBin. Paste your JSONBin': 'كان التطبيق القديم يحفظ في JSONBin. الصق',
    'Master Key': 'Master Key', '(JSONBin dashboard → API Keys). It is used once, only in this browser, and is not saved.': 'الخاص بك (لوحة JSONBin ← API Keys). يُستخدم مرة واحدة في هذا المتصفح فقط ولا يُحفظ.',
    'Bin ID': 'Bin ID', 'Compare old cloud': 'مقارنة السحابة القديمة', 'encrypted backup (asks for its password), an older': 'نسخة احتياطية مشفّرة (تطلب كلمة المرور)، أو ملف أقدم', 'file, or a JSON export from JSONBin.': '، أو ملف JSON مُصدَّر من JSONBin.',
    'Choose file': 'اختر ملفاً', 'Missing transactions': 'المعاملات الناقصة', 'Coin balances': 'أرصدة العملات',
    'Rows in amber differ from the cloud. Tick a coin to set it to the source\'s quantity and average price (recorded as an “Edit” in its history, so it can be undone). “After” shows the result of your selection.':
      'الصفوف باللون الكهرماني تختلف عن السحابة. حدّد عملة لضبطها على كمية المصدر ومتوسط سعره (تُسجّل كـ"تعديل" في سجلها ويمكن التراجع عنها). ويعرض "بعد" نتيجة اختيارك.',
    'Select all different': 'تحديد كل المختلف', 'Clear': 'مسح', 'Show unchanged coins': 'عرض العملات غير المتغيرة', 'Hide unchanged coins': 'إخفاء العملات غير المتغيرة', 'Accumulation targets & DCA': 'أهداف التجميع والشراء الدوري',
    'Settings in the backup that differ from the cloud now. Ticked ones are put back exactly as they were in the backup.': 'إعدادات في النسخة الاحتياطية تختلف عن السحابة حالياً. تُعاد المحددة منها كما كانت تماماً في النسخة الاحتياطية.',
    'Restore selected': 'استرجاع المحدد', 'Restore selected?': 'استرجاع المحدد؟', 'Signal thresholds': 'حدود الإشارة', 'Exit plan (steps, macro targets, coins)': 'خطة الخروج (الخطوات، الأهداف الكبرى، العملات)', 'Category names & colours': 'أسماء التصنيفات وألوانها',
    'No missing transactions.': 'لا توجد معاملات ناقصة.', 'Cloud now': 'السحابة الآن', 'Cloud target': 'هدف السحابة', 'Source target': 'هدف المصدر', 'Safety backup first': 'نسخة احتياطية للأمان أولاً',
    'Your current cloud data is saved to an encrypted file before anything changes. Choose a password (8+ characters).': 'تُحفظ بيانات السحابة الحالية في ملف مشفّر قبل أي تغيير. اختر كلمة مرور (8 أحرف أو أكثر).',
    'Restore cancelled — nothing was changed.': 'أُلغي الاسترجاع — لم يتغير شيء.', 'Recovered from': 'استُرجع من',
    'This browser has no data saved by the previous version of the app. Try your other device, the old cloud or a backup file.': 'لا توجد في هذا المتصفح بيانات محفوظة من الإصدار السابق. جرّب جهازك الآخر أو السحابة القديمة أو ملف نسخة احتياطية.',
    'Enter the Bin ID and Master Key.': 'أدخل Bin ID و Master Key.', 'Key not accepted by JSONBin (check it, or use the newest key).': 'لم يقبل JSONBin المفتاح (تحقق منه أو استخدم أحدث مفتاح).',
    'This bin has no portfolio data.': 'لا توجد بيانات محفظة في هذا الـ Bin.', 'No portfolio found in this file.': 'لم يتم العثور على محفظة في هذا الملف.',
    // ── Cloud messages ──
    'Invalid coin symbol (letters, digits, . _ - only)': 'رمز عملة غير صالح (أحرف وأرقام و . _ - فقط)', 'Invalid transaction type': 'نوع معاملة غير صالح', 'Invalid date': 'تاريخ غير صالح',
    'Only a Transfer In at $0 cost can be marked as a reward': 'يمكن تحديد الإيداع بتكلفة صفر فقط كمكافأة', "This entry can't be changed here": 'لا يمكن تعديل هذا الإدخال هنا',
    'This one was made from another transaction — change that one and it follows': 'هذه المعاملة ناتجة عن معاملة أخرى — عدّل تلك وستتبعها', 'From selling': 'من البيع', 'Paid for buying': 'مدفوع للشراء',
    'Categories not loaded': 'لم تُحمَّل التصنيفات', 'Rename category': 'تغيير اسم التصنيف', 'Category colour': 'لون التصنيف', 'Reset category': 'إعادة ضبط التصنيف',
    'Built-in categories can be renamed, not deleted': 'يمكن تغيير أسماء التصنيفات الأساسية دون حذفها', 'Delete category': 'حذف التصنيف', 'Unknown category': 'تصنيف غير معروف',
    'Another device is importing right now — wait a minute and reload.': 'جهاز آخر يستورد الآن — انتظر دقيقة ثم أعد التحميل.', 'Permission denied — this account is not allowed by the database rules.': 'تم رفض الإذن — هذا الحساب غير مسموح به في قواعد قاعدة البيانات.',
    'Cloud not configured': 'السحابة غير مُعدّة', 'Offline · saved on device': 'غير متصل · محفوظ على الجهاز',
    'A copy of this device\'s data is saved first, encrypted. Choose a password (8+ characters) — you need it only to open that file.': 'تُحفظ أولاً نسخة مشفّرة من بيانات هذا الجهاز. اختر كلمة مرور (8 أحرف أو أكثر) — تحتاجها فقط لفتح ذلك الملف.',
  });
  // ════════ Fixes from the real portfolio (17 Nov, afternoon) ════════
  R(new RegExp('^' + MRX + ' (\\d{4})$'), function (_, m, y) { return MON[m] + ' ' + y; });
  R(/^(\d+) days ago$/, function (_, d) { return 'منذ ' + pl(d, 'يوم', 'يومين', 'أيام', 'يوم'); });
  R(/^Stablecoins hidden \((.+)\)$/, function (_, l) { return 'العملات المستقرة مخفية (' + n(l) + ')'; });
  R(/^of (\d+)$/, 'من $1');
  R(/^of (\d+) beat BTC$/, 'من $1 تفوقت على BTC');
  R(/^of (\d+) ahead of BTC \((\d+) days\)$/, 'من $1 متقدمة على BTC ($2 يوماً)');
  R(/^\((\d+) days\)$/, '($1 يوماً)');
  R(/^coin (.+)$/, function (_, v) { return /[a-z]{3}/.test(v) ? null : 'العملة ' + n(v); });
  R(/^Beat BTC \((\d+) days\)$/, 'تفوقت على BTC ($1 يوماً)');
  R(/^Your coins \((\d+) days\)$/, 'عملاتك ($1 يوماً)');
  R(/^Your coins did (.+) better than the same money in BTC over the last (\d+) days\.$/, function (_, v, d) { return 'حققت عملاتك أداءً أفضل بـ ' + n(v) + ' من المبلغ نفسه في BTC خلال آخر ' + d + ' يوماً.'; });
  R(/^The same money in BTC would have done (.+) better over the last (\d+) days\.$/, function (_, v, d) { return 'كان المبلغ نفسه في BTC سيحقق أداءً أفضل بـ ' + n(v) + ' خلال آخر ' + d + ' يوماً.'; });
  R(/^(.+) you got without buying$/, '$1 حصلت عليها دون شراء');
  R(/^(?:coins you got without buying|(.+) you got without buying) · (\d+) times? · at today’s prices$/, function (_, c, k) { return (c ? c + ' حصلت عليها' : 'عملات حصلت عليها') + ' دون شراء · ' + pl(k, 'مرة واحدة', 'مرتين', 'مرات', 'مرة') + ' · بأسعار اليوم'; });
  R(/^(.+)% of your (\S+) came free$/, function (_, p, c) { return n(p + '%') + ' من ' + c + ' لديك جاءت مجاناً'; });
  R(/^last (.+)$/, function (_, d) { var v = date(d); return v ? 'آخر مرة ' + v : null; });
  R(/^(.+) · rewards (.+)$/, function (_, a, b) { return n(a) + ' · مكافآت ' + n(b); });
  R(/^Today's number is CoinMarketCap's official Altcoin Season Index[\s\S]*$/, function (s) {
    return s.replace(/^Today's number is CoinMarketCap's official Altcoin Season Index \((\d+)\); the coin lists below are worked out from (?:CoinMarketCap's|the) top 100 with CoinGecko's prices(?: \((\d+) by that count\))?\. ?/, function (_, a, b) { return 'رقم اليوم هو مؤشر موسم العملات البديلة الرسمي من CoinMarketCap (' + a + ')؛ وقوائم العملات أدناه محسوبة من أكبر 100 عملة بأسعار CoinGecko' + (b ? ' (' + b + ' بهذا الحساب)' : '') + '. '; })
      .replace("Past days are worked out with today's top 100 coins (CoinMarketCap uses each day's own list), so older days can differ a little. From now on every day is saved with that day's list.", 'تُحسب الأيام السابقة بقائمة أكبر 100 عملة اليوم (بينما تستخدم CoinMarketCap قائمة كل يوم)، لذا قد تختلف الأيام القديمة قليلاً. ومن الآن يُحفظ كل يوم بقائمته الخاصة.')
      .replace(/ ?BTC and USDT Dominance before (.+?) are estimated from prices and USDT's market cap \(the real figures are saved every day since\)\./, function (_, d) { return ' هيمنة BTC و USDT قبل ' + (date(d) || d) + ' مقدّرة من الأسعار والقيمة السوقية لـ USDT (والأرقام الفعلية تُحفظ يومياً منذ ذلك الحين).'; });
  });
  // tooltips on Market Hub
  R(/^Add (.+) to Watchlist$/, 'إضافة $1 إلى قائمة المتابعة'); R(/^Remove (.+) from Watchlist$/, 'إزالة $1 من قائمة المتابعة');
  R(/^Add (.+) to your portfolio or plan$/, 'إضافة $1 إلى محفظتك أو خطتك');
  R(/^(.+) — show Liq\.Map, Prediction and CoinMarketCap$/, '$1 — عرض خريطة التصفيات والتوقعات و CoinMarketCap');
  R(/^(.+) links: Liquidation Map, Prediction, CoinMarketCap$/, 'روابط $1: خريطة التصفيات، التوقعات، CoinMarketCap');
  R(/^Fear and Greed (\d+) of 100: (.+)$/, function (_, v, l) { return 'الخوف والطمع ' + v + ' من 100: ' + CPLang.t(l); });
  R(/^Altcoin [Ss]eason (\d+) of 100: (.+)$/, function (_, v, l) { return 'موسم العملات البديلة ' + v + ' من 100: ' + CPLang.t(l); });
  R(/^(\d+) of (\d+) beat BTC over (\d+) days$/, '$1 من $2 تفوقت على BTC خلال $3 يوماً');

  A({
    'Share of the top 100 coins that beat BTC over the last 90 days. Altcoin Season starts at': 'نسبة العملات من أكبر 100 عملة التي تفوقت على BTC خلال آخر 90 يوماً. يبدأ موسم العملات البديلة عند',
    'In portfolio': 'في المحفظة', 'In your portfolio': 'في محفظتك', 'In your Accumulation Plan': 'في خطة التجميع', 'Filter': 'تصفية',
    'Year high': 'أعلى قراءة خلال السنة', 'Year low': 'أدنى قراءة خلال السنة', 'a month ago →': 'قبل شهر ←', 'You': 'أنت', 'the best ·': 'الأفضل ·', 'the yardstick': 'المرجع',
    'of 100, over 7 · 30 · 90 days': 'من 100، خلال 7 · 30 · 90 يوماً', 'of your altcoins': 'من عملاتك البديلة',
    'Over the last 7 days': 'خلال آخر 7 أيام تفوقت', 'Over the last 7 days only': 'خلال آخر 7 أيام تفوقت فقط', 'of the coins beat BTC, against': 'من العملات على BTC، مقابل',
    'over 90 days — altcoins are gaining on BTC lately.': 'خلال 90 يوماً — العملات البديلة تقترب من BTC مؤخراً.', 'over 90 days — BTC has been pulling ahead lately.': 'خلال 90 يوماً — BTC يبتعد بالصدارة مؤخراً.',
    'The last 7 days (': 'آخر 7 أيام (', 'beat BTC) look like the last 90 days (': 'تفوقت على BTC) تشبه آخر 90 يوماً (', ') — no change of direction yet.': ') — لا تغيّر في الاتجاه بعد.',
    'Airdrops': 'Airdrops', 'you hold none now': 'لا تملك منها حالياً',
    'Values use today’s price. Rewards come in at $0 cost, so they lower your average buy price — they’re already part of your All Time Profit.': 'القيم بسعر اليوم. تدخل المكافآت بتكلفة صفر، فتخفض متوسط سعر الشراء — وهي محتسبة بالفعل في إجمالي الربح.',
    'iShares Bitcoin Trust': 'iShares Bitcoin Trust',
  });
  R(/^Show all (\d+)$/, 'عرض الكل ($1)');
  R(/^@ (.+) · fee (.+)$/, function (_, a, b) { return n('@ ' + a) + ' · رسوم ' + n(b); });
  R(/^With the amounts you hold today · (\d+) coins? without 90 days of prices left out\. Stablecoins aren't counted as altcoins\.$/, function (_, k) { return 'بالكميات التي تملكها اليوم · استُبعدت ' + pl(k, 'عملة واحدة', 'عملتان', 'عملات', 'عملة') + ' ليس لها أسعار 90 يوماً. ولا تُحتسب العملات المستقرة ضمن العملات البديلة.'; });
  R(/^With the amounts you hold today\. Stablecoins aren't counted as altcoins\.$/, 'بالكميات التي تملكها اليوم. ولا تُحتسب العملات المستقرة ضمن العملات البديلة.');
  A({ 'Altcoin Season — Cute Portfolio': 'موسم العملات البديلة — Cute Portfolio', 'Recover — Cute Portfolio': 'استرجاع البيانات — Cute Portfolio' });
  // ════════ Admin dashboard (owner only) ════════
  R(/^today 🧠 (\d+)\/(\d+) · 📊 (\d+)\/(\d+) · since (.+)$/, function (_, a, b, c, d, j) { return 'اليوم 🧠 ' + n(a + '/' + b) + ' · 📊 ' + n(c + '/' + d) + ' · منذ ' + (date(j) || n(j)); });
  R(/^📱 App: (.+?)( · 🔗 portfolio linked| · not linked)$/, function (_, e, l) { return '📱 التطبيق: ' + (e === 'not yet' ? 'ليس بعد' : n(e)) + (/not linked/.test(l) ? ' · غير مرتبط' : ' · 🔗 المحفظة مرتبطة'); });
  R(/^(⭐ Premium(?: until (.+?))? \((Stars|gift)\)|Not premium)((?: · .+)?)$/, function (_, p, u, src, rest) {
    var h = p === 'Not premium' ? 'غير مميز' : '⭐ مميز' + (u ? ' حتى ' + (date(u) || n(u)) : '') + (src === 'Stars' ? ' (Stars)' : ' (هدية)');
    return h + (rest || '').replace(/ · 💛 Supporter \((\d+) ⭐\)/, ' · 💛 داعم ($1 ⭐)').replace(/ · 🔑 own Claude key \(…(.+?)\)/, ' · 🔑 مفتاح Claude خاص (…$1)').replace(' · ⏸ paused', ' · ⏸ موقوف مؤقتاً');
  });
  R(/^⏸ (\d+) paused · max$/, '⏸ $1 موقوف مؤقتاً · الحد الأقصى');
  R(/^Stars (\d+) · gift (\d+)$/, 'Stars $1 · هدية $2'); R(/^premium (\d+) · support (\d+)$/, 'مميز $1 · دعم $2');
  R(/^≈ (.+) paid by members$/, function (_, v) { return '≈ ' + n(v) + ' دفعها الأعضاء'; }); R(/^a month ≈ (.+)$/, function (_, v) { return 'شهرياً ≈ ' + n(v); });
  R(/^Members \((\d+)\)$/, 'الأعضاء ($1)'); R(/^Payments \((\d+)\)$/, 'المدفوعات ($1)');
  R(/^The same code works in both — one use, (\d+) days\. They can link the other one later \(Settings → Link the Telegram bot\)\.$/, function (_, d) { return 'الرمز نفسه يعمل في الاثنين — استخدام واحد، لمدة ' + pl(d, 'يوم', 'يومين', 'أيام', 'يوم') + '. ويمكنهم ربط الآخر لاحقاً (الإعدادات ← ربط بوت تليجرام).'; });
  R(/^(.+) · removed (.+)$/, function (_, nm, d) { return nm + ' · أُزيل ' + (date(d) || n(d)); });
  R(/^Remove (.+)\? They lose the bot AND the app \(their e-mail leaves the access list\)\. Their portfolio data stays in Firebase, and you can ↩️ restore them for 60 days\.$/, 'إزالة $1؟ سيفقد البوت والتطبيق معاً (يُحذف بريده من قائمة الدخول). تبقى بيانات محفظته في Firebase، ويمكنك ↩️ استرجاعه خلال 60 يوماً.');
  A({
    'Admin dashboard': 'لوحة الإدارة', 'Refresh': 'تحديث', '👥 Members': '👥 الأعضاء', 'max': 'الحد الأقصى', '⭐ Premium now': '⭐ المميزون الآن', '💛 Supporters': '💛 الداعمون',
    '⭐ This month': '⭐ هذا الشهر', '⭐ All time': '⭐ منذ البداية', '💲 Premium price': '💲 سعر الاشتراك المميز', 'Invite': 'الدعوة', '➕ New invite code': '➕ رمز دعوة جديد', 'Code': 'الرمز',
    '📱 Open the app': '📱 فتح التطبيق', '(no Telegram needed)': '(دون الحاجة إلى تليجرام)', '🤖 Open the bot': '🤖 فتح البوت', 'Copy app link': 'نسخ رابط التطبيق', 'Copy bot link': 'نسخ رابط البوت', 'Share…': 'مشاركة…',
    'Search name, @user or e-mail': 'ابحث بالاسم أو @المستخدم أو البريد', 'No one matches.': 'لا يوجد تطابق.', 'Nobody yet — make an invite code above.': 'لا يوجد أحد بعد — أنشئ رمز دعوة بالأعلى.',
    'Removed (kept 60 days)': 'المحذوفون (يُحفظون 60 يوماً)', '↩️ Restore': '↩️ استرجاع', 'Stars': 'Stars', 'premium subscriptions, renewals and support': 'الاشتراكات المميزة والتجديدات والدعم',
    '⭐ renewal': '⭐ تجديد', '⭐ premium': '⭐ مميز', '💛 support': '💛 دعم', 'No payments yet.': 'لا توجد مدفوعات بعد.', "Withdraw the Stars yourself: the bot's balance → Fragment.": 'اسحب الـ Stars بنفسك: رصيد البوت ← Fragment.',
    '📱 app only': '📱 التطبيق فقط', '⏳ Asks to open the app with': '⏳ يطلب فتح التطبيق بالبريد', '✅ Allow': '✅ سماح', '❌ No': '❌ رفض',
    '🎁 ⭐ +30 days': '🎁 ⭐ +30 يوماً', '🎁 ⭐ +365 days': '🎁 ⭐ +365 يوماً', '☆ End premium': '☆ إنهاء المميز', '▶️ Resume': '▶️ استئناف', '⏸ Pause': '⏸ إيقاف مؤقت', '🗑 Remove member': '🗑 إزالة العضو',
    'removes the premium extras only; they keep using the bot and the app (standard limits). Happens by itself when a subscription or gift ends': 'يزيل مزايا المميز فقط؛ ويستمر في استخدام البوت والتطبيق (بالحدود العادية). ويحدث تلقائياً عند انتهاء الاشتراك أو الهدية',
    'the bot goes quiet for them (no answers, radars or daily messages); the app keeps working. ▶️ Resume brings everything back': 'يتوقف البوت عن الرد عليه (لا إجابات ولا رادارات ولا رسائل يومية)؛ ويستمر التطبيق في العمل. و▶️ استئناف يعيد كل شيء',
    'out of the bot': 'يخرج من البوت', 'the app; their data stays. ↩️ Restore within 60 days.': 'التطبيق؛ وتبقى بياناته. ويمكن ↩️ استرجاعه خلال 60 يوماً.',
    'Just want to stop them for a while? Use ⏸ Pause instead.': 'تريد إيقافه فترة فقط؟ استخدم ⏸ إيقاف مؤقت بدلاً من ذلك.', 'Remove member': 'إزالة العضو',
    "↩️ Restored — they're back as they were.": '↩️ تم الاسترجاع — عاد كما كان.', 'Copied ✅': 'تم النسخ ✅', 'support': 'دعم', 'premium': 'مميز',
  });
  // 💤 idle members / 📖 reads (Admin dashboard)
  R(/^💤 idle since (.+)$/, function (_, d) { return '💤 خامل منذ ' + (date(d) || n(d)); });
  R(/^Last active (today|yesterday|(\d+) days ago|—)$/, function (_, w, k) { return 'آخر نشاط ' + (w === 'today' ? 'اليوم' : w === 'yesterday' ? 'أمس' : w === '—' ? '—' : 'منذ ' + pl(k, 'يوم', 'يومين', 'أيام', 'يوم')); });
  R(/^(\d+) reads today$/, function (_, k) { return k + ' قراءة اليوم'; });
  R(/^💤 Idle for (\d+) days — you may remove them$/, function (_, k) { return '💤 خامل منذ ' + pl(k, 'يوم', 'يومين', 'أيام', 'يوم') + ' — يمكنك إزالته'; });
  R(/^no use for (\d+)\+ days$/, 'بلا استخدام منذ $1 يوماً أو أكثر');
  R(/^the bot's Firebase reads · you (\d+)$/, 'قراءات البوت من Firebase · أنت $1');
  A({ '💤 Idle': '💤 الخاملون', '📖 Reads today': '📖 قراءات اليوم' });
  // 📖 all of today's Firebase reads / 📊 what gets used (Admin dashboard)
  R(/^of ([\d,]+) · 📱 app ([\d,]+) · 🤖 round ([\d,]+) · ⚙️ bot ([\d,]+)$/, function (_, l, a, r, w) { return 'من ' + n(l) + ' · 📱 التطبيق ' + n(a) + ' · 🤖 جولة البوت ' + n(r) + ' · ⚙️ باقي البوت ' + n(w); });
  R(/^Last 7 days \((\d+)\)$/, 'آخر 7 أيام ($1)'); R(/^today ([\d,]+)$/, 'اليوم $1');
  R(/^🤖 button (.+)$/, '🤖 زر $1'); R(/^🤖 keyboard (.+)$/, '🤖 لوحة الأزرار $1'); R(/^📱 screen (.+)$/, '📱 شاشة $1');
  A({ '📖 Firebase reads today': '📖 قراءات Firebase اليوم', '📊 What gets used': '📊 ما الذي يُستخدم', 'commands, buttons, voice, Mini App and app screens — counts only': 'الأوامر والأزرار والصوت والـ Mini App وشاشات التطبيق — أعداد فقط',
    '💬 Questions / tickers typed': '💬 أسئلة ورموز مكتوبة', '🎙️ Voice notes': '🎙️ رسائل صوتية', '🖼️ Photos': '🖼️ صور', '📊 Mini App opened': '📊 فتح الـ Mini App', '📸 Image cards sent': '📸 بطاقات صور أُرسلت',
    'Nothing counted yet — counts start with this update.': 'لا توجد أعداد بعد — يبدأ العدّ مع هذا التحديث.' });
})();
