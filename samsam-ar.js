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

  // ── times and dates ──
  R(/^(\d{1,2}:\d\d)\s?(AM|PM)$/, function (_, t, p) { return t + ' ' + ampm(p); });
  R(new RegExp('^' + MRX + ' \\d{1,2}(?:, \\d{4})?(?:, \\d{1,2}:\\d\\d\\s?[AP]M)?$'), function (s) { return date(s); });
  R(new RegExp('^\\d{1,2} ' + MRX + '(?: \\d{4})?$'), function (s) { return date(s); });
  R(/^Live · Updated (.+)$/, function (_, t) { return 'مباشر · آخر تحديث ' + time(t); });
  R(/^Updated (.+)$/, function (_, t) { return 'آخر تحديث ' + (date(t) || time(t)); });
  R(/^Synced (.+)$/, function (_, t) { return 'تمت المزامنة ' + (date(t) || time(t)); });
  R(/^Last backup: (.+)$/, function (_, t) { return 'آخر نسخة احتياطية: ' + (t === 'Never' ? 'لا توجد' : (date(t) || n(t))); });
  R(/^Use the original baseline \((.+)\)$/, function (_, t) { return 'الرجوع لتاريخ الأساس الأصلي (' + (date(t) || t) + ')'; });
  R(/^(\d+) \/ (\d+) targets met$/, function (_, a, b) { return 'تحقق ' + a + ' من ' + b + ' أهداف'; });
  R(/^— \/ — targets met$/, 'الأهداف المحققة: — / —');
  R(/^([\d.]+%) complete$/, function (_, p) { return 'مكتمل ' + n(p); });
  R(/^Building charts from real prices… (\d+) \/ (\d+) coins$/, function (_, a, b) { return 'جاري بناء الرسوم من الأسعار الفعلية… ' + a + ' / ' + b + ' عملة'; });
  R(/^Building from real prices… (\d+) \/ (\d+) coins$/, function (_, a, b) { return 'جاري البناء من الأسعار الفعلية… ' + a + ' / ' + b + ' عملة'; });
  R(/^from (\d+) sells?$/, function (_, a) { return 'من ' + a + (a === '1' ? ' عملية بيع' : ' عمليات بيع'); });
  R(/^Cost: (.+)$/, function (_, v) { return 'التكلفة: ' + n(v); });
  R(/^(.+) · (.+) added$/, function (_, a, b) { return n(a) + ' · مضاف ' + n(b); });
  R(/^Value change (\S+) = (\S+) from prices, (\S+) (added|taken out)$/, function (_, a, b, c, w) { return 'تغيّر القيمة ' + n(a) + ' = ' + n(b) + ' من حركة الأسعار، ' + n(c) + (w === 'added' ? ' مضاف' : ' مسحوب'); });
  R(/^(.+) realized ([+−-]) (.+) unrealized = (.+)$/, function (_, a, op, b, c) { return 'محقق ' + n(a) + ' ' + op + ' غير محقق ' + n(b) + ' = ' + n(c); });
  R(/^(\d+) sells?(?: · after (.+) selling fees)?$/, function (_, a, f) { return a + (a === '1' ? ' عملية بيع' : ' عمليات بيع') + (f ? ' · بعد خصم رسوم بيع ' + n(f) : ''); });
  R(/^(\d+) of (\d+)$/, '$1 من $2');
  R(/^categories on target · band ±([\d.]+) pts$/, 'تصنيفات على الهدف · الهامش ±$1 نقطة');
  R(/^(\d+) to rebalance$/, function (_, a) { return a + ' محتاج' + (a === '1' ? '' : 'ين') + ' إعادة توازن'; });
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
    'Why saved prices?': 'ليه أسعار محفوظة؟', 'About offline': 'عن العمل بدون إنترنت',
    'The live prices could not be loaded just now (the price service was busy or the connection dropped) — you see the prices saved last time. The app tries again by itself in a moment.':
      'تعذّر تحميل الأسعار المباشرة حالياً (خدمة الأسعار مشغولة أو الاتصال انقطع) — تشوف آخر أسعار محفوظة، والبرنامج هيحاول تاني لوحده بعد لحظات.',
    'No internet right now — you see the prices saved last time. They update by themselves when you are back online.':
      'مفيش إنترنت حالياً — تشوف آخر أسعار محفوظة، وهتتحدث لوحدها أول ما الاتصال يرجع.',
    'Cloud sync': 'المزامنة السحابية', 'Cloud sync: Synced': 'المزامنة السحابية: متزامن', 'Cloud sync: Connecting': 'المزامنة السحابية: جاري الاتصال',
    'Cloud: not synced yet': 'السحابة: لم تتم المزامنة بعد', 'Cloud: connecting': 'السحابة: جاري الاتصال', 'Baseline': 'تاريخ الأساس',
    'Dark mode on — switch to light mode': 'الوضع الداكن — التبديل للفاتح', 'Light mode on — switch to dark mode': 'الوضع الفاتح — التبديل للداكن',
    'AI Analysis': 'تحليل AI', 'AI Analysis (drag to move)': 'تحليل AI (اسحب لتحريكه)',
    'Premium member & supporter — thank you!': 'عضو مميز وداعم — شكراً لك!', 'Supporter — thank you!': 'داعم — شكراً لك!',

    // ── sign in & first set-up ──
    'Sign in to load your portfolio. Your data is stored privately in the cloud and stays the same on every device.': 'سجّل الدخول لتحميل محفظتك. بياناتك محفوظة بشكل خاص على السحابة ونفسها على كل أجهزتك.',
    'Sign in with Google': 'الدخول بحساب Google', 'or with any e-mail (iCloud, Outlook…) — no password': 'أو بأي إيميل (iCloud، Outlook…) — بدون كلمة مرور',
    'Email me a sign-in link': 'ابعتلي رابط الدخول على الإيميل', 'you@example.com': 'you@example.com', 'Sign in': 'تسجيل الدخول', 'Sign out': 'تسجيل الخروج',
    'Signed in': 'تم تسجيل الدخول', 'Signed in as': 'مسجّل باسم', 'Signed out': 'تم تسجيل الخروج', 'Not signed in': 'غير مسجّل', 'Sign in first.': 'سجّل الدخول الأول.',
    'Use another account': 'استخدام حساب آخر', 'Type a valid e-mail address.': 'اكتب إيميل صحيح.',
    'Type the e-mail address the sign-in link was sent to.': 'اكتب الإيميل اللي اتبعت عليه رابط الدخول.',
    'Sent ✅ Open the link in the e-mail on this device (check spam too).': 'تم الإرسال ✅ افتح الرابط من الإيميل على نفس الجهاز ده (شوف الـ Spam كمان).',
    'Your sign-in expired. Sign in again.': 'انتهت جلسة الدخول. سجّل الدخول تاني.',
    'That code did not work.': 'الكود ده ما اشتغلش.',
    "No code? Ask Dr. Samir Saad for an invite link — or, if you're in the Telegram bot already, send it /app with this e-mail.": 'معندكش كود؟ اطلب رابط دعوة من د. سمير سعد — أو لو إنت في بوت تليجرام، ابعتله /app مع الإيميل ده.',
    'Set up your cloud portfolio (one time)': 'تجهيز محفظتك على السحابة (مرة واحدة)',
    'The cloud is empty. Choose where your real data is. Do this on the device that has your': 'السحابة فاضية. اختار مكان بياناتك الحقيقية. اعمل ده من الجهاز اللي عليه',
    'most up-to-date': 'أحدث نسخة', 'portfolio — all other devices will then load it automatically.': 'من محفظتك — وبعدها كل الأجهزة التانية هتحمّلها تلقائياً.',
    'This device has no saved portfolio.': 'الجهاز ده مفيهوش محفظة محفوظة.', 'This device has': 'الجهاز ده عليه',
    'Import a backup file': 'استيراد ملف نسخة احتياطية', 'Start from the Oct-15 starting portfolio': 'البدء من محفظة 15 أكتوبر',
    'Start from the Oct-15 starting portfolio?': 'البدء من محفظة 15 أكتوبر؟',
    "Before uploading, an encrypted backup file of this device's data is downloaded first.": 'قبل الرفع، هيتحمّل الأول ملف نسخة احتياطية مشفّر لبيانات الجهاز ده.',
    "Upload this device's data": 'رفع بيانات الجهاز ده', 'Uploading': 'جاري الرفع', 'Backup before upload': 'نسخة احتياطية قبل الرفع',
    'Use this only if no device has your real data.': 'استخدم ده بس لو مفيش جهاز عليه بياناتك الحقيقية.',
    'This portfolio is already set up in the cloud.': 'المحفظة دي متجهزة على السحابة بالفعل.',
    'Your portfolio is new and private — only you can see it.': 'محفظتك جديدة وخاصة — محدش يشوفها غيرك.',
    'Then add your coins with': 'وبعدها ضيف عملاتك من',
    'One-time setup needed': 'محتاج تجهيز لمرة واحدة', 'Your cloud portfolio is empty. Open the main': 'محفظتك على السحابة فاضية. افتح صفحة',
    'Portfolio page': 'المحفظة الرئيسية', 'to import your data.': 'لاستيراد بياناتك.',
    'No portfolio data found.': 'مفيش بيانات محفظة.', 'Open the main app first.': 'افتح البرنامج الرئيسي الأول.',
    'You are offline. Changes are kept on this device and sent when the connection returns.': 'إنت بدون إنترنت. التغييرات محفوظة على الجهاز وهتتبعت أول ما الاتصال يرجع.',
    'No connection to the cloud right now.': 'مفيش اتصال بالسحابة حالياً.',
    'Could not reach the server — check the internet and try again.': 'تعذّر الوصول للسيرفر — اتأكد من الإنترنت وحاول تاني.',
    'The cloud is busy (quota reached). Your change is kept — try again later.': 'السحابة مشغولة (وصلنا للحد اليومي). التغيير محفوظ — حاول بعدين.',
    'Still loading your portfolio — try again in a moment': 'لسه بنحمّل محفظتك — حاول تاني بعد لحظة',
    'Your portfolio is still loading from the cloud. Please try again in a moment.': 'محفظتك لسه بتتحمّل من السحابة. حاول تاني بعد لحظة.',
    'Sync problem — tap': 'مشكلة في المزامنة — اضغط',

    // ── header strip: dates, baseline, the four totals ──
    'What is the baseline?': 'إيه هو تاريخ الأساس؟', 'Change the baseline date': 'تغيير تاريخ الأساس',
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
    'Best and worst performer appear once live prices load.': 'الأفضل والأسوأ أداءً يظهروا أول ما الأسعار المباشرة تتحمّل.',
    'Appears once prices load.': 'يظهر بعد تحميل الأسعار.', 'Appears once the BTC price loads.': 'يظهر بعد تحميل سعر البيتكوين.',
    'Top Gainers': 'الأكثر ربحاً', 'Top Performers': 'الأفضل أداءً', 'Top Losers': 'الأكثر خسارة', 'Top Performers · USD': 'الأفضل أداءً · USD',

    // ── charts ──
    'Holdings': 'الأصول', 'Holdings — open the Portfolio Value chart (Performance)': 'الأصول — فتح رسم قيمة المحفظة (الأداء)',
    'the holdings change': 'تغيّر قيمة الأصول', 'Portfolio Performance': 'أداء المحفظة', 'Portfolio Allocation': 'توزيع المحفظة',
    'Portfolio allocation by category': 'توزيع المحفظة حسب التصنيف', 'How is this chart calculated?': 'إزاي الرسم ده بيتحسب؟', 'How is it calculated?': 'إزاي بيتحسب؟',
    'BTC Trend': 'اتجاه البيتكوين', 'BTC Trend %': 'اتجاه البيتكوين %', 'All Time Profit %': 'إجمالي الربح %',
    'Collecting data… chart appears after first price update': 'جاري جمع البيانات… الرسم هيظهر بعد أول تحديث للأسعار',
    'Collecting data… the chart fills in as snapshots are recorded.': 'جاري جمع البيانات… الرسم هيكمل مع تسجيل اللقطات.',
    'Collecting data… the chart fills in as hourly snapshots are recorded.': 'جاري جمع البيانات… الرسم هيكمل مع تسجيل لقطة كل ساعة.',
    'Building charts from real prices': 'جاري بناء الرسوم من الأسعار الفعلية', 'No history yet': 'لا يوجد سجل بعد',
    'Show the Portfolio Value chart': 'عرض رسم قيمة المحفظة', 'Hide the Portfolio Value chart': 'إخفاء رسم قيمة المحفظة',
    'Total Value': 'القيمة الإجمالية', 'Cost': 'التكلفة', 'Portfolio Value': 'قيمة المحفظة', 'Portfolio Value range': 'مدة رسم قيمة المحفظة',
    'Portfolio vs BTC': 'المحفظة مقابل البيتكوين', 'Performance vs BTC': 'الأداء مقابل البيتكوين', 'vs BTC': 'مقابل BTC', 'Chart range': 'مدة الرسم',
    'BTC Benchmark': 'مقارنة بالبيتكوين', 'The same money kept in BTC': 'نفس الفلوس لو كانت في البيتكوين', 'Whole Portfolio': 'المحفظة كاملة', 'Your portfolio': 'محفظتك',
    'Last 24 hours': 'آخر 24 ساعة', 'Last 7 days': 'آخر 7 أيام', 'Last 30 days': 'آخر 30 يوم', 'Last 90 days': 'آخر 90 يوم', 'All time': 'من البداية', 'Last session': 'الجلسة السابقة',
    '12 months': '12 شهر', '30 days': '30 يوم', 'Explore ↗': 'استكشف ↗',

    // ── Accumulation Plan card ──
    'Accumulation Plan': 'خطة التجميع', 'Overall Progress': 'التقدّم الإجمالي',

    // ── the coin list ──
    'Add New Coin': 'إضافة عملة جديدة', 'Add a new coin to your portfolio': 'إضافة عملة جديدة لمحفظتك', 'Add a new coin, or a Buy for a coin you hold': 'إضافة عملة جديدة، أو شراء لعملة عندك',
    'Category': 'التصنيف', 'All Coins': 'كل العملات', 'Choose a category': 'اختار تصنيف', 'Change category': 'تغيير التصنيف',
    'Search coin': 'ابحث عن عملة', 'Search a coin': 'ابحث عن عملة', 'Search your coins': 'ابحث في عملاتك',
    'Signal filter': 'فلتر الإشارة', 'Filter by signal': 'فلترة حسب الإشارة', 'All signals': 'كل الإشارات', 'All Types': 'كل الأنواع',
    'Asset': 'العملة', 'Coin': 'العملة', 'Amount': 'الكمية', 'Avg. Buy Price': 'متوسط سعر الشراء', 'Cost Basis': 'تكلفة الشراء', 'Current Price': 'السعر الحالي', 'Current': 'الحالي',
    'Holdings / Current Value': 'الأصول / القيمة الحالية', 'Holdings value': 'قيمة الأصول', 'Value': 'القيمة', 'Unrealized Profit': 'ربح غير محقق',
    'Signal': 'الإشارة', 'Actions': 'إجراءات', 'Hold': 'احتفاظ', 'Reinforce': 'تعزيز', 'Sell/Convert': 'بيع / تحويل', 'Sell / Convert': 'بيع / تحويل', 'Sell / Convert to BTC': 'بيع / تحويل لبيتكوين',
    '(Reinforce)': '(تعزيز)', '(Sell / Convert)': '(بيع / تحويل)', 'Reinforce · Sell %': 'تعزيز · بيع %',
    'Change the Signal thresholds': 'تعديل حدود الإشارة', 'Sold out': 'تم البيع بالكامل',
    'Buy': 'شراء', 'Sell': 'بيع', 'Transfer In': 'إيداع', 'Transfer Out': 'سحب', 'Reward': 'مكافأة', 'History': 'السجل', 'Transaction': 'معاملة',
    'Remove Coin': 'حذف العملة', 'from your active portfolio?': 'من محفظتك النشطة؟',
    'Liq.Map': 'خريطة التصفيات', 'Liquidation Map': 'خريطة التصفيات', 'Liquidation Map (try — no futures found)': 'خريطة التصفيات (تجربة — مفيش عقود آجلة)',
    'Prediction': 'التوقعات', 'Price Prediction': 'توقعات السعر', 'No prediction': 'لا توجد توقعات', 'CMC': 'CMC', 'links that leave the app': 'روابط خارج البرنامج',
    'Amount changes only through Buy / Sell / Transfer': 'الكمية تتغير بس من الشراء / البيع / التحويل', 'Calculated from Buy / Sell / Transfer': 'محسوبة من الشراء / البيع / التحويل',
    'Set a manual price (only used when there is no live market price)': 'إدخال سعر يدوي (بيُستخدم بس لو مفيش سعر سوق مباشر)',
    'Sort by All Time Profit (tap again to flip)': 'ترتيب حسب إجمالي الربح (اضغط تاني للعكس)', 'Sort by value (tap again to flip)': 'ترتيب حسب القيمة (اضغط تاني للعكس)',
    'Profit in dollars or percent': 'الربح بالدولار أو بالنسبة', 'Rank by': 'ترتيب حسب',
    'Asset Strategy & Notes': 'استراتيجية العملة وملاحظات', 'Your plan for this coin — targets, why you bought or sold…': 'خطتك للعملة دي — الأهداف، وليه اشتريت أو بعت…',
    'Edit opening position': 'تعديل المركز الافتتاحي', 'Opening amount': 'الكمية الافتتاحية', 'Opening': 'افتتاحي', 'Save opening position': 'حفظ المركز الافتتاحي',
    'The position you held before the first transaction in this list. All buys, sells and transfers after it are recalculated from these numbers.':
      'المركز اللي كان عندك قبل أول معاملة في القايمة دي. كل عمليات الشراء والبيع والتحويل بعده بتتحسب من الأرقام دي.',
    'Transaction History —': 'سجل المعاملات —', 'Transaction History': 'سجل المعاملات',
    'Add a Buy, Sell or Transfer for this coin': 'إضافة شراء أو بيع أو تحويل للعملة دي',

    // ── default categories ──
    'Bitcoin': 'بيتكوين', 'Layer 1 Blockchains': 'شبكات الطبقة الأولى (L1)', 'Layer 2 Blockchains': 'شبكات الطبقة الثانية (L2)',
    'Layer 0 & Interoperability': 'الطبقة صفر والربط بين الشبكات', 'AI & DePIN': 'الذكاء الاصطناعي و DePIN', 'DeFi & RWA': 'التمويل اللامركزي و RWA',
    'Oracles & Middleware': 'الأوراكل والبنية الوسيطة', 'Meme & Utility Tokens': 'عملات الميم والمنفعة', 'Web3 & Gaming': 'Web3 والألعاب', 'Launchpad': 'منصات الإطلاق',
    'Stablecoins': 'العملات المستقرة', 'Stablecoin': 'عملات مستقرة', 'Layer 1': 'الطبقة الأولى (L1)', 'Layer 2': 'الطبقة الثانية (L2)', 'Layer 0': 'الطبقة صفر (L0)',
    'DePIN': 'DePIN', 'AI': 'الذكاء الاصطناعي', 'Memes': 'عملات الميم', 'Meme': 'عملات الميم', 'Gaming': 'الألعاب', 'Oracles': 'الأوراكل', 'Privacy': 'الخصوصية', 'Exchange Tokens': 'عملات المنصات',

    // ── AI report window ──
    'AI Analysis Report —': 'تقرير تحليل AI —', 'Claude AI': 'Claude AI', 'Regenerate': 'إعادة الإنشاء',
    'Free: make the report in the Claude app, then paste it here': 'مجاناً: اعمل التقرير في تطبيق Claude والصقه هنا',
    'Write the report here again (uses your API credit)': 'كتابة التقرير هنا من جديد (بيستخدم رصيد الـ API بتاعك)',
    'Copy the report as text — paste it into Claude or your notes': 'نسخ التقرير كنص — الصقه في Claude أو ملاحظاتك',
    'Save the report as a PDF (Print → Save as PDF)': 'حفظ التقرير PDF (طباعة ← حفظ كـ PDF)',

    // ── baseline & signal thresholds windows ──
    'Baseline Date': 'تاريخ الأساس',
    "The day your coins are compared with Bitcoin. Pick a date: the app looks up BTC's daily price, or use the price you actually paid for your BTC that day.":
      'اليوم اللي عملاتك بتتقارن فيه بالبيتكوين. اختار تاريخ: البرنامج بيجيب سعر البيتكوين في اليوم ده، أو اكتب السعر اللي اشتريت بيه فعلاً.',
    'Date': 'التاريخ', 'BTC Price on That Day (USD)': 'سعر البيتكوين في اليوم ده (USD)', 'BTC Price': 'سعر البيتكوين', 'BTC reference price': 'سعر البيتكوين المرجعي',
    'The baseline date cannot be in the future.': 'تاريخ الأساس ما ينفعش يكون في المستقبل.', 'No BTC price for that day': 'مفيش سعر بيتكوين لليوم ده',
    'Pick a valid date and a BTC price above 0.': 'اختار تاريخ صحيح وسعر بيتكوين أكبر من صفر.',
    'Signal Thresholds': 'حدود الإشارة',
    "When a coin's price is below your Avg. Buy Price by these amounts, its Signal changes. Same on every page and device.":
      'لما سعر العملة ينزل تحت متوسط سعر شرائك بالنسب دي، الإشارة بتتغير. نفس الإعداد في كل الصفحات والأجهزة.',
    'Reinforce — when the price is this much below your Avg. Buy Price (or more)': 'تعزيز — لما السعر يبقى تحت متوسط سعر الشراء بالنسبة دي (أو أكتر)',
    'Reinforce: percent below your Avg. Buy Price': 'تعزيز: النسبة تحت متوسط سعر الشراء',
    'Sell / Convert to BTC — when it is more than this much below': 'بيع / تحويل لبيتكوين — لما يبقى تحت بأكتر من النسبة دي',
    'Sell / Convert: percent below your Avg. Buy Price': 'بيع / تحويل: النسبة تحت متوسط سعر الشراء',
    'Smart check vs BTC': 'فحص ذكي مقابل البيتكوين',
    "Also looks at the coin's last 30 and 90 days vs BTC: no Reinforce for a coin that keeps losing to BTC (15+ points behind on both), no Sell / Convert for one that is beating BTC on both — those stay Hold.":
      'بيبص كمان على أداء العملة آخر 30 و 90 يوم مقابل البيتكوين: مفيش تعزيز لعملة بتخسر قدام البيتكوين باستمرار (متأخرة 15 نقطة أو أكتر في الاتنين)، ومفيش بيع / تحويل لعملة متفوقة على البيتكوين في الاتنين — دول يفضلوا احتفاظ.',
    'Use the defaults (−5% / −20%)': 'استخدام الافتراضي (−5% / −20%)',
    'Sell / Convert must be lower than Reinforce (between −99% and +100%).': 'حد البيع / التحويل لازم يكون أقل من حد التعزيز (بين −99% و +100%).',

    // ── Allocation ──
    'Target allocation': 'التوزيع المستهدف',
    'Set the share you want for each category (Bitcoin included) — see how far you are from it, and exactly what to buy (or trim) to get back.':
      'حدد النسبة اللي عاوزها لكل تصنيف (ومعاهم البيتكوين) — وشوف إنت بعيد عنها قد إيه، وبالظبط تشتري إيه (أو تخفف إيه) عشان ترجع لها.',
    'Set my targets': 'تحديد أهدافي', 'The share you want for each category. They must add up to 100%.': 'النسبة اللي عاوزها لكل تصنيف. لازم المجموع يكون 100%.',
    'The targets must add up to 100%.': 'لازم مجموع الأهداف يكون 100%.', 'Total 100% ✓': 'الإجمالي 100% ✓', 'Use my current split': 'استخدام توزيعي الحالي', 'Add a group': 'إضافة مجموعة',
    'Band — how far a category may drift before it counts as off target': 'الهامش — قد إيه التصنيف يبعد قبل ما يعتبر خارج الهدف',
    'Rebalance with': 'إعادة التوازن بـ', 'New money': 'فلوس جديدة', 'Full rebalance': 'إعادة توازن كاملة', 'Amount to invest': 'المبلغ المراد استثماره',
    'Buy and trim so every group is on target (your total stays the same)': 'شراء وتخفيف لحد ما كل مجموعة توصل لهدفها (الإجمالي بيفضل زي ما هو)',
    'Back to Holdings': 'رجوع للأصول',

    // ── All Time Profit window ──
    'Realized Profit': 'ربح محقق', 'No sells yet': 'لا يوجد بيع بعد',
    'Coins you still hold, at today’s price': 'العملات اللي لسه معاك، بسعر النهارده', 'What the coins you hold cost (fees included)': 'تكلفة العملات اللي معاك (شامل الرسوم)',
    'Realized Profit + Unrealized Profit': 'الربح المحقق + الربح غير المحقق', '(added up over every sell)': '(مجموع كل عمليات البيع)',
    '(Sell Price − Avg Buy Price) × Amount Sold − Selling Fee': '(سعر البيع − متوسط سعر الشراء) × الكمية المباعة − رسوم البيع',
    '(Current Price − Avg Buy Price) × Amount Held': '(السعر الحالي − متوسط سعر الشراء) × الكمية المحتفظ بها',
    'Avg Buy Price × Amount Held': 'متوسط سعر الشراء × الكمية المحتفظ بها', 'Avg Buy Price': 'متوسط سعر الشراء', '(updated on every buy)': '(بيتحدّث مع كل شراء)',
    '(Amount Held × Avg Buy Price + Buy Price × Amount Bought + Buying Fee) ÷ (Amount Held + Amount Bought)': '(الكمية المحتفظ بها × متوسط سعر الشراء + سعر الشراء × الكمية المشتراة + رسوم الشراء) ÷ (الكمية المحتفظ بها + الكمية المشتراة)',
    '(on everything invested — coins held and coins already sold)': '(على كل اللي اتستثمر — العملات اللي معاك واللي اتباعت)',
    'All Time Profit ÷ (Cost Basis + Cost of Coins Sold) × 100': 'إجمالي الربح ÷ (تكلفة الشراء + تكلفة العملات المباعة) × 100',
    'Sells don’t change the Avg Buy Price. Transfers in add coins at the price you enter; transfers out and network fees only lower the amount held.':
      'البيع ما بيغيّرش متوسط سعر الشراء. الإيداع بيضيف عملات بالسعر اللي بتكتبه، والسحب ورسوم الشبكة بيقللوا الكمية بس.',
    'Invest': 'استثمر', 'without selling anything': 'من غير ما تبيع حاجة', 'Edit': 'تعديل',

    // ── Performance page ──
    'All Time Profit Breakdown': 'تفاصيل إجمالي الربح', 'Unrealized': 'غير محقق', 'Realized': 'محقق', 'from sells': 'من عمليات البيع', '+ Unrealized': '+ غير محقق',
    'Rewards & mining': 'المكافآت والتعدين', 'Rewards and mining': 'المكافآت والتعدين',
    'None yet — staking rewards, mined BTC and airdrops show here': 'لا يوجد بعد — مكافآت الـ Staking والبيتكوين المُعدَّن والـ Airdrops بيظهروا هنا',
    'No rewards or mined coins': 'مفيش مكافآت أو عملات معدّنة', 'Staking rewards': 'مكافآت الـ Staking', 'Airdrops & other free coins': 'الـ Airdrops والعملات المجانية',
    'Wallets & exchanges': 'المحافظ والمنصات', 'Wallets and exchanges': 'المحافظ والمنصات', 'Wallets & check': 'المحافظ والمطابقة',
    'Compare your real wallets with the app': 'قارن محافظك الحقيقية بالبرنامج', 'Import from exchange': 'استيراد من منصة',
    'A CSV file from Binance, Gate or another exchange → your buys and sells': 'ملف CSV من Binance أو Gate أو أي منصة ← عمليات الشراء والبيع',
    'Binance · Gate — live balances straight from the exchange: later': 'Binance · Gate — الأرصدة المباشرة من المنصة: قريباً',

    // ── add / transaction window (the parts that show on these pages) ──
    'Add Transaction': 'إضافة معاملة', 'Transaction type': 'نوع المعاملة', 'Add to Portfolio': 'إضافة للمحفظة', '+ Buy': '+ شراء', '− Sell': '− بيع', '+ Add': '+ إضافة',
    '— search by symbol or name': '— ابحث بالرمز أو الاسم', 'e.g. XRP or Ripple': 'مثلاً XRP أو Ripple', 'Full Name': 'الاسم الكامل', 'Filled by search': 'بيتملي من البحث',
    'Fee (USD)': 'الرسوم (USD)', 'Optional': 'اختياري', '(optional)': '(اختياري)', 'CoinGecko ID': 'معرّف CoinGecko', 'Auto': 'تلقائي', 'auto': 'تلقائي',
    'CoinMarketCap Page': 'صفحة CoinMarketCap', 'Pay from': 'الدفع من', 'Stablecoin the buy is paid from': 'العملة المستقرة اللي هتدفع منها',
    'Network & where held': 'الشبكة ومكان الحفظ', 'Pick the coin first': 'اختار العملة الأول', 'New Category Name': 'اسم التصنيف الجديد', 'Enter Custom Category...': 'اكتب تصنيف جديد...',
    'Saved for this coin and added to the category filters.': 'اتحفظ للعملة دي واتضاف لفلاتر التصنيف.',
    'From': 'من', 'Where the coins came from': 'العملات جت منين', 'Staking': 'Staking', 'Mining': 'تعدين', 'Airdrop': 'Airdrop', 'How': 'الطريقة',
    'Enter staking rewards by hand or automatically': 'إدخال مكافآت الـ Staking يدوي أو تلقائي', 'Manual': 'يدوي', 'Automatic': 'تلقائي', 'APY': 'العائد السنوي (APY)',
    '(% a year — from your wallet or exchange)': '(% في السنة — من محفظتك أو المنصة)', 'Price per coin (USD)': 'سعر العملة (USD)', 'Buying fee': 'رسوم الشراء',
    '(USD, optional — added to Cost Basis)': '(USD، اختياري — بيتضاف لتكلفة الشراء)', 'Fee paid in': 'الرسوم مدفوعة بـ', 'USD': 'USD',
    'Network fee to your wallet': 'رسوم الشبكة لمحفظتك', '(optional — e.g. Binance → your cold wallet)': '(اختياري — مثلاً Binance ← محفظتك الباردة)', 'Network fee in': 'رسوم الشبكة بـ',
    'Add the money to': 'إضافة الفلوس لـ', 'Stablecoin that receives the money': 'العملة المستقرة اللي هتستلم الفلوس', 'Transfer fee': 'رسوم التحويل', '(in coin, optional)': '(بالعملة، اختياري)',
    'Date & time': 'التاريخ والوقت', 'Note': 'ملاحظة', 'e.g. from Binance, to cold wallet': 'مثلاً من Binance، للمحفظة الباردة',
    'Import many from an exchange file (CSV)': 'استيراد معاملات كتير من ملف منصة (CSV)',
    'Manage Categories': 'إدارة التصنيفات', '— rename, colour, add, delete': '— تغيير الاسم، اللون، إضافة، حذف',
    'Changes apply everywhere at once — every page, filter, chart and device.': 'التغييرات بتتطبق في كل مكان مرة واحدة — كل صفحة وفلتر ورسم وجهاز.', 'New Category': 'تصنيف جديد',
    'Amount and price must be positive numbers': 'الكمية والسعر لازم يكونوا أرقام موجبة', 'Add the coin first': 'ضيف العملة الأول', 'Add coin': 'إضافة عملة',
    'Reward (staking / mining)': 'مكافأة (Staking / تعدين)', 'Sold them? Record a': 'بعتها؟ سجّل',

    // ── Settings ──
    'Account & data': 'الحساب والبيانات', 'Account': 'الحساب', 'Backup': 'النسخ الاحتياطي', 'backup': 'النسخ الاحتياطي', 'Back up now': 'انسخ الآن', 'Recover Data': 'استرجاع البيانات', 'recover': 'استرجاع البيانات',
    'Telegram': 'تليجرام', 'Telegram alerts': 'تنبيهات تليجرام', 'Link your portfolio to the Telegram bot': 'ربط محفظتك ببوت تليجرام', 'Link the Telegram bot': 'ربط بوت تليجرام',
    'Join Cute Portfolio Signals': 'انضم لقناة Cute Portfolio Signals', 'Join Cute Portfolio Community': 'انضم لمجتمع Cute Portfolio',
    'The market pulse twice a day · ⭐ on posts you like': 'نبض السوق مرتين في اليوم · ⭐ على البوستات اللي تعجبك', 'Chat · suggestions · bugs · the guide · news': 'دردشة · اقتراحات · مشاكل · الدليل · الأخبار',
    'One tap — the bot shows your portfolio': 'ضغطة واحدة — والبوت يعرض محفظتك', 'One tap — then the bot shows your portfolio, alerts, morning & evening': 'ضغطة واحدة — والبوت يعرض محفظتك والتنبيهات صباحاً ومساءً',
    'Open the bot': 'افتح البوت', 'Your code (10 minutes)': 'الكود بتاعك (10 دقايق)', 'Could not make a code —': 'تعذّر إنشاء كود —',
    '— or tap “Open the bot”. The bot then reads this portfolio for you (only you).': '— أو اضغط "افتح البوت". البوت بعدها هيقرأ المحفظة دي ليك (إنت بس).',
    'AI': 'الذكاء الاصطناعي', 'AI Analysis & questions': 'تحليل AI والأسئلة', 'My Claude key': 'مفتاح Claude الخاص بي',
    'Optional · your own key = 100 questions & 10 reports a day': 'اختياري · مفتاحك الخاص = 100 سؤال و 10 تقارير في اليوم',
    'Removed — you are back on the standard limits.': 'اتشال — رجعت للحدود العادية.',
    'It is sent once, checked with Claude, then kept encrypted — nobody can see it again. Remove it any time.': 'بيتبعت مرة واحدة، بيتأكد منه مع Claude، وبعدها بيتحفظ مشفّر — محدش يقدر يشوفه تاني. تقدر تشيله في أي وقت.',
    'Admin': 'الإدارة', 'Admin dashboard': 'لوحة الإدارة', 'Support': 'الدعم', 'Support Cute Portfolio & Channel 💛': 'ادعم Cute Portfolio والقناة 💛',
    'Display': 'العرض', 'Language': 'اللغة', 'Theme': 'المظهر', 'Light': 'فاتح', 'Dark': 'داكن', 'Charts open on': 'الرسوم تفتح على', 'Lists shown as': 'عرض القوايم كـ',
    'About': 'حول', 'Guide': 'الدليل', 'How the app and the bot work · English / العربية': 'إزاي البرنامج والبوت بيشتغلوا · English / العربية',
    'Install the app': 'تثبيت التطبيق', 'Browser menu → Install app': 'قايمة المتصفح ← تثبيت التطبيق', 'Add it to your home screen — opens like an app': 'ضيفه للشاشة الرئيسية — يفتح زي التطبيق',
    'On your home screen': 'على الشاشة الرئيسية', '· works offline': '· يشتغل بدون إنترنت', 'Safari: Share → Add to Home Screen': 'Safari: مشاركة ← إضافة للشاشة الرئيسية',
    'Cute Portfolio is already on your home screen — it opens like an app, also without internet (with your last numbers).': 'Cute Portfolio موجود بالفعل على الشاشة الرئيسية — بيفتح زي التطبيق، وكمان بدون إنترنت (بآخر أرقامك).',
    'Wallets, Import and Rewards are on': 'المحافظ والاستيراد والمكافآت موجودين في', '· DCA and the Exit plan on': '· الشراء الدوري وخطة الخروج في',
    '· Signal thresholds, Categories and the Baseline on': '· حدود الإشارة والتصنيفات وتاريخ الأساس في', '· Target allocation on': '· التوزيع المستهدف في',
    'Reset portfolio': 'إعادة ضبط المحفظة', 'Reset to Oct-15 starting portfolio': 'إعادة الضبط لمحفظة 15 أكتوبر',
    'Reset all starting coins to their Oct-15 quantities and prices? Your transaction history is kept.': 'إعادة كل العملات الأساسية لكمياتها وأسعارها يوم 15 أكتوبر؟ سجل المعاملات هيفضل زي ما هو.',
    'Import this backup?': 'استيراد النسخة الاحتياطية دي؟', 'This file is not a Cute Portfolio backup.': 'الملف ده مش نسخة احتياطية من Cute Portfolio.',
    'Encryption is not available in this browser.': 'التشفير مش متاح في المتصفح ده.', 'Restore data': 'استرجاع البيانات', 'Restore settings': 'استرجاع الإعدادات',
    'Back up in Settings': 'انسخ احتياطياً من الإعدادات',

    // ── footer ──
    '© 2026 Dr. Samir Saad': '© 2026 د. سمير سعد', 'Dr. Samir Saad': 'د. سمير سعد',
  });
})();
