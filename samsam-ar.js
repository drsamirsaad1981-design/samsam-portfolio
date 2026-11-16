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
  var pl = function (k, one, two, few, many) { k = +k; return k === 1 ? one : k === 2 ? two : (k % 100 >= 3 && k % 100 <= 10) ? k + ' ' + few : k + ' ' + many; };

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
  R(/^from (\d+) sells?$/, function (_, a) { return 'من ' + pl(a, 'عملية بيع واحدة', 'عمليتين بيع', 'عمليات بيع', 'عملية بيع'); });
  R(/^Cost: (.+)$/, function (_, v) { return 'التكلفة: ' + n(v); });
  R(/^(.+) · (.+) added$/, function (_, a, b) { return n(a) + ' · مضاف ' + n(b); });
  R(/^Value change (\S+) = (\S+) from prices, (\S+) (added|taken out)$/, function (_, a, b, c, w) { return 'تغيّر القيمة ' + n(a) + ' = ' + n(b) + ' من حركة الأسعار، ' + n(c) + (w === 'added' ? ' مضاف' : ' مسحوب'); });
  R(/^(.+) realized ([+−-]) (.+) unrealized = (.+)$/, function (_, a, op, b, c) { return 'محقق ' + n(a) + ' ' + op + ' غير محقق ' + n(b) + ' = ' + n(c); });
  R(/^(\d+) sells?(?: · after (.+) selling fees)?$/, function (_, a, f) { return pl(a, 'عملية بيع واحدة', 'عمليتين بيع', 'عمليات بيع', 'عملية بيع') + (f ? ' · بعد خصم رسوم بيع ' + n(f) : ''); });
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
    'Wallets & exchanges': 'المحافظ والمنصات', 'Wallets & Exchanges': 'المحافظ والمنصات', 'Wallets and exchanges': 'المحافظ والمنصات', 'Wallets & check': 'المحافظ والمطابقة',
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

  // ════════ Phase 2: the Plan (Accumulation · DCA · Exit Strategy), Add / Edit transaction, a coin's History ════════
  var DAY = { Sunday: 'الأحد', Monday: 'الاثنين', Tuesday: 'الثلاثاء', Wednesday: 'الأربعاء', Thursday: 'الخميس', Friday: 'الجمعة', Saturday: 'السبت' };
  var dt = function (s) { return date(s) || s; };
  R(/^(\$[\d,.]+) every (other )?(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)$/, function (_, a, o, d) { return n(a) + (o ? ' كل أسبوعين يوم ' : ' كل ') + DAY[d]; });
  R(/^(\$[\d,.]+) on the (\d+)(?:st|nd|rd|th) of each month$/, function (_, a, d) { return n(a) + ' يوم ' + d + ' من كل شهر'; });
  R(/^Next (.+)$/, function (_, d) { var v = date(d); return v ? 'الجاي ' + v : null; });
  R(/^on (.+)$/, function (_, d) { var v = date(d); return v ? 'يوم ' + v : null; });
  R(/^Was due (.+)$/, function (_, d) { return 'كان ميعاده ' + dt(d); });
  R(/^kept (\d+) of (\d+)$/, 'التزمت بـ $1 من $2');
  R(/^target in (\d+) buys?$/, function (_, a) { return 'الهدف بعد ' + pl(a, 'مرة شراء واحدة', 'مرتين شراء', 'مرات شراء', 'مرة شراء'); });
  R(/^(\d+) days?$/, function (_, a) { return pl(a, 'يوم', 'يومين', 'أيام', 'يوم'); });
  R(/^(\d+) regular buys?$/, function (_, a) { return a + ' شراء دوري'; });
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
  R(/^holding (.+)$/, function (_, q) { return 'معاك ' + n(q); });
  R(/^Sort: (.+)$/, function (_, x) { return 'ترتيب: ' + CPLang.t(x); });
  R(/^([A-Z0-9.]{2,12}) Transactions$/, 'معاملات $1');
  R(/^Add (Buy|Sell|Transfer In|Transfer Out|Reward)$/, function (_, k) { return 'إضافة ' + CPLang.t(k); });
  R(/^Edit (Buy|Sell|Transfer In|Transfer Out|Reward)$/, function (_, k) { return 'تعديل ' + CPLang.t(k); });
  R(/^\(USD, optional — turned into (.+) at the price above\)$/, '(USD، اختياري — بيتحوّل لـ $1 بالسعر اللي فوق)');
  R(/^\(in ([A-Z0-9.]+), optional\)$/, '(بالـ $1، اختياري)');
  R(/^(.+)% of the portfolio in stablecoins$/, function (_, v) { return n(v + '%') + ' من المحفظة في عملات مستقرة'; });
  R(/^Last price update · added to plan (.+)$/, 'آخر تحديث للسعر · اتضافت للخطة $1');
  R(/^Add a Buy for (.+)$/, 'إضافة شراء لـ $1');
  R(/^Change the (buy-at percent|target amount|schedule) (?:for|of) (.+)$/, function (_, k, c) { return { 'buy-at percent': 'تعديل نسبة الدخول لـ ', 'target amount': 'تعديل الكمية المستهدفة لـ ', schedule: 'تعديل جدول ' }[k] + c; });
  R(/^Remove (.+) from (?:the exit )?plan$/, function (s, c) { return 'حذف ' + c + (/exit/.test(s) ? ' من خطة الخروج' : ' من الخطة'); });
  R(/^(?:DCA )?calculator for (.+)$/, 'حاسبة الشراء الدوري لـ $1');
  R(/^Your default steps:? (.+)$/, function (_, x) { return 'خطواتك الافتراضية ' + n(x); });
  R(/^Already following (.+) your average buy price$/, function (_, x) { return 'متابع بالفعل ' + n(x) + ' من متوسط سعر شرائك'; });
  R(/^You can’t (sell|transfer out) (.+)$/, function (_, k, x) { return (k === 'sell' ? 'ما ينفعش تبيع ' : 'ما ينفعش تسحب ') + x; });
  R(/^Did you mean \$(.+)\?$/, function (_, x) { return 'تقصد ' + n('$' + x) + '؟'; });
  R(/^Opening position \(Oct-15 start\)$/, 'المركز الافتتاحي (بداية 15 أكتوبر)');
  R(/^Holdings after: (.+)$/, function (_, x) { return 'الأصول بعدها: ' + n(x); });

  A({
    // ── Plan tabs and the four totals ──
    'In the market': 'في السوق', 'Accumulation': 'التجميع', 'Exit Strategy': 'استراتيجية الخروج', 'Exit plan': 'خطة الخروج', 'Exit Plan': 'خطة الخروج',
    'Total Target Value': 'إجمالي قيمة الأهداف', 'At current prices': 'بالأسعار الحالية', 'Current Holdings': 'الأصول الحالية', 'In plan': 'ضمن الخطة',
    'Total Pending Cost': 'إجمالي التكلفة المتبقية', 'To complete plan': 'لإكمال الخطة', 'Coins Completed': 'العملات المكتملة', '— in progress': '— قيد التنفيذ',
    'Overall Accumulation Progress': 'التقدّم الإجمالي للتجميع', 'the plan totals': 'إجماليات الخطة', 'Plan Totals': 'إجماليات الخطة',
    'Add to Plan': 'إضافة للخطة', 'Add any coin to your plan — even one you don\'t own yet': 'ضيف أي عملة لخطتك — حتى لو لسه ما عندكش منها',
    'No coins in your accumulation plan yet.': 'لسه مفيش عملات في خطة التجميع.', 'Click': 'اضغط', 'Tap': 'اضغط', 'to get started.': 'للبداية.', 'to Plan': 'للخطة',
    'Add Coin to Plan': 'إضافة عملة للخطة', 'Add Coin to Accumulation Plan': 'إضافة عملة لخطة التجميع', 'Search Coin': 'ابحث عن عملة', 'Select coin': 'اختار العملة',
    'e.g. BTC, Ethereum': 'مثلاً BTC، Ethereum', '(already in plan)': '(موجودة في الخطة)', 'In Portfolio': 'في المحفظة',
    'Still loading — not saved': 'لسه بيحمّل — ما اتحفظش', 'Not saved — see sync status': 'ما اتحفظش — شوف حالة المزامنة', 'Up to date': 'محدّث',
    // ── plan table / cards ──
    'Target Amount': 'الكمية المستهدفة', 'Actual Amount': 'الكمية الحالية', 'Pending Amount': 'الكمية المتبقية', 'Buy At': 'سعر الدخول', 'Buy at %': 'سعر الدخول %',
    'Cost to Target': 'تكلفة الوصول للهدف', 'Progress': 'التقدّم', 'Price Alert': 'تنبيه سعري', '% of Target': '% من الهدف', 'Set target': 'حدد الهدف', 'Set %': 'حدد %',
    'Remove from plan': 'حذف من الخطة', 'No price': 'لا يوجد سعر', 'Toggle positive/negative': 'تبديل موجب / سالب', 'Price $': 'السعر $', 'Price': 'السعر',
    'Alert when price drops to or below this value': 'نبّهني لما السعر ينزل للقيمة دي أو تحتها', 'Clear alert': 'مسح التنبيه', 'Hit!': 'تحقق!', 'Hit': 'تحقق',
    'Target already reached!': 'الهدف اتحقق بالفعل!', 'Target hit': 'الهدف اتحقق', 'BUY NOW': 'اشترِ الآن', 'Change the target amount': 'تعديل الكمية المستهدفة',
    'Change the buy-at % (e.g. -20 = buy 20% below the current price)': 'تعديل نسبة الدخول (مثلاً ‎-20 = الشراء تحت السعر الحالي بـ 20%)',
    "Buy when the price is this % away from today's price. Today's price is saved as the base, so the target stays fixed until you change it.\n-20 = 20% below · 10 = 10% above · empty = none":
      'اشتري لما السعر يبعد بالنسبة دي عن سعر النهارده. سعر النهارده بيتحفظ كأساس، فالهدف بيفضل ثابت لحد ما تغيّره.\n‎-20 = تحت بـ 20% · 10 = فوق بـ 10% · فاضي = بدون',
    'I want to buy 20% below current price': 'عاوز أشتري تحت السعر الحالي بـ 20%', 'This does NOT affect your portfolio.': 'ده ما بيأثرش على محفظتك.',
    'A tool to organise and follow your own plan — not financial advice.': 'أداة لتنظيم ومتابعة خطتك الخاصة — مش نصيحة مالية.',
    'Last price update': 'آخر تحديث للسعر', '24h change': 'التغيّر في 24 ساعة', 'Open': 'فتح', 'Hide': 'إخفاء', 'Show': 'عرض', 'Enter': 'إدخال', 'Ready': 'جاهز',
    // ── plan vs target allocation ──
    'Plan vs target allocation': 'الخطة مقابل التوزيع المستهدف', 'Set targets ›': 'حدد الأهداف ›', 'Set targets': 'حدد الأهداف', 'Allocation ›': 'التوزيع ›',
    '✓ On target': '✓ على الهدف', 'On target': 'على الهدف', '↓ Priority': '↓ أولوية', '↑ Over target': '↑ فوق الهدف', 'Priority': 'أولوية', 'Over target': 'فوق الهدف',
    'Set a target allocation (Portfolio → Allocation) to see whether finishing this plan keeps your categories where you want them, and which coins to buy first.':
      'حدد التوزيع المستهدف (المحفظة ← التوزيع) عشان تشوف هل إكمال الخطة دي هيخلي تصنيفاتك في المكان اللي عاوزه، وأنهي عملات تشتريها الأول.',
    // ── DCA ──
    'DCA schedule': 'جدول الشراء الدوري (DCA)', 'DCA — regular buys': 'الشراء الدوري (DCA)', 'DCA schedule (regular buys)': 'الشراء الدوري (DCA)',
    'Dollar-Cost Averaging plan': 'خطة متوسط التكلفة (DCA)', 'Regular buy': 'شراء دوري', 'Regular buy — pick a coin': 'شراء دوري — اختار العملة', 'Next: the schedule': 'التالي: الجدول',
    'A regular buy for any coin — it joins your plan': 'شراء دوري لأي عملة — بتدخل خطتك',
    'No regular buys yet. Pick any coin and an amount — the Plan shows each buy day, and Telegram reminds you.': 'لسه مفيش شراء دوري. اختار أي عملة ومبلغ — والخطة هتعرض كل يوم شراء، وتليجرام هيفكّرك.',
    'Amount each time (USD)': 'المبلغ كل مرة (USD)', 'How often': 'كل قد إيه', 'Weekly': 'كل أسبوع', 'Every 2 weeks': 'كل أسبوعين', 'Monthly': 'كل شهر',
    'Day': 'اليوم', 'Day of the month': 'يوم في الشهر', 'Day of the week': 'يوم في الأسبوع',
    'Sunday': 'الأحد', 'Monday': 'الاثنين', 'Tuesday': 'الثلاثاء', 'Wednesday': 'الأربعاء', 'Thursday': 'الخميس', 'Friday': 'الجمعة', 'Saturday': 'السبت',
    'Show me over (months)': 'اعرضلي على مدة (شهور)', 'Coins each buy': 'العملات في كل شراء', 'Per month': 'في الشهر', 'Total Coins': 'إجمالي العملات', 'Total Invested': 'إجمالي المستثمر',
    'First buy': 'أول شراء', 'Time to reach target': 'وقت الوصول للهدف',
    'Save it as your schedule: the Plan shows each buy day and whether you kept it, and Telegram reminds you on the day.': 'احفظه كجدول ليك: الخطة هتعرض كل يوم شراء وهل التزمت بيه، وتليجرام هيفكّرك في يومه.',
    'Remove schedule': 'حذف الجدول', 'Save schedule': 'حفظ الجدول', '✓ Bought': '✓ تم الشراء', 'Today': 'النهارده', 'Next': 'الجاي', 'Missed': 'فات', 'Was due': 'كان ميعاده', 'target reached': 'وصلت للهدف',
    'Change the schedule': 'تعديل الجدول', 'Please select a coin first.': 'اختار عملة الأول.',
    'Searching CoinGecko': 'جاري البحث في CoinGecko', 'Search failed': 'البحث فشل', 'You are offline — search needs internet.': 'إنت بدون إنترنت — البحث محتاج إنترنت.',
    'No coins found. Try a different search.': 'مفيش عملات. جرّب بحث تاني.', "Type a coin name or symbol — any coin, even one you don't own yet.": 'اكتب اسم العملة أو رمزها — أي عملة، حتى لو ما عندكش منها.',
    'CoinGecko is busy — wait a few seconds and type again.': 'CoinGecko مشغول — استنى ثواني واكتب تاني.',
    // ── Exit Strategy ──
    'Macro Exit Indicators': 'مؤشرات الخروج الكبرى', 'Macro exit indicators': 'مؤشرات الخروج الكبرى', 'Edit targets': 'تعديل الأهداف', 'Signals Hit': 'الإشارات المتحققة',
    'USDT Dominance': 'هيمنة USDT', 'ETH / BTC': 'ETH / BTC', 'Waiting': 'انتظار', 'Close': 'إغلاق', 'Reached': 'تحقق', 'Below range': 'تحت النطاق', 'Above range': 'فوق النطاق', 'In range': 'داخل النطاق',
    'BTC.D at or under (%)': 'هيمنة BTC عند أو تحت (%)', 'USDT.D range — from (%)': 'نطاق هيمنة USDT — من (%)', 'USDT.D range — to (%)': 'نطاق هيمنة USDT — إلى (%)', 'ETH / BTC at or over': 'ETH / BTC عند أو فوق',
    'Your own levels — the page compares, it doesn’t predict the top.': 'مستوياتك إنت — الصفحة بتقارن، مش بتتوقع القمة.',
    'Cash-out Progress': 'تقدّم جني الأرباح', 'Cash and stablecoins': 'الكاش والعملات المستقرة', 'in stablecoins': 'في عملات مستقرة', 'Realized profit': 'الربح المحقق',
    'Exit steps done': 'خطوات الخروج المنفذة', 'Projected cash-out': 'جني الأرباح المتوقع', 'Exit plan steps': 'خطوات خطة الخروج',
    'No coins in your exit plan yet.': 'لسه مفيش عملات في خطة الخروج.', 'Add to Exit Plan': 'إضافة لخطة الخروج', 'to Exit Plan': 'لخطة الخروج',
    'and choose the coins you want to take profit on.': 'واختار العملات اللي عاوز تجني أرباحها.',
    'Search the exit plan': 'ابحث في خطة الخروج', 'Every coin you hold is already in the exit plan.': 'كل العملات اللي معاك موجودة بالفعل في خطة الخروج.',
    'Your coins and transactions are not touched.': 'عملاتك ومعاملاتك مش هتتلمس.', 'Remove from the exit plan': 'حذف من خطة الخروج',
    'Plan order': 'ترتيب الخطة', 'Asset A–Z': 'العملة أ–ي', 'Price vs average': 'السعر مقابل المتوسط', 'Closest to TP1': 'الأقرب لـ TP1', 'Closest to TP2': 'الأقرب لـ TP2', 'Closest to TP3': 'الأقرب لـ TP3',
    'Cash out': 'جني الأرباح', 'Net profit': 'صافي الربح', 'Sort': 'ترتيب', 'Value': 'القيمة',
    'Target hit — sell': 'الهدف اتحقق — بيع', 'Moonbag kept': 'Moonbag محفوظ', 'Set a price': 'حدد سعر', 'Plan amount': 'كمية الخطة', 'Average buy price': 'متوسط سعر الشراء',
    'Price you set': 'السعر اللي حددته', 'Sell %': 'نسبة البيع %', 'Tap a row to edit': 'اضغط على أي صف للتعديل',
    'You now hold': 'معاك دلوقتي', 'Bought since': 'اشتريت من وقتها', 'Sold since': 'بعت من وقتها',
    'Bought after the coin joined the plan — added to the plan amount': 'اتشترت بعد ما العملة دخلت الخطة — اتضافت لكمية الخطة',
    'Follows your average buy price — buy more and it moves with it': 'بيتبع متوسط سعر شرائك — لو اشتريت تاني بيتحرك معاه',
    // ── Add / Edit transaction ──
    'Add Buy': 'إضافة شراء', 'Add Sell': 'إضافة بيع', 'Add Transfer In': 'إضافة إيداع', 'Add Transfer Out': 'إضافة سحب', 'Add Reward': 'إضافة مكافأة',
    'Amount bought': 'الكمية المشتراة', 'Amount sold': 'الكمية المباعة', 'Amount transferred in': 'الكمية المودَعة', 'Amount transferred out': 'الكمية المسحوبة', 'Amount received': 'الكمية المستلمة',
    'Sell price per coin (USD)': 'سعر بيع العملة (USD)', 'Cost / value per coin at transfer (USD)': 'التكلفة / القيمة للعملة وقت التحويل (USD)',
    'Selling fee': 'رسوم البيع', '(USD, optional — subtracted from Realized Profit)': '(USD، اختياري — بتتخصم من الربح المحقق)',
    'Raises your holdings and updates the average buy price.': 'بيزوّد أصولك ويحدّث متوسط سعر الشراء.',
    'Lowers your holdings at the current average cost and records realized profit/loss.': 'بيقلل أصولك بمتوسط التكلفة الحالي ويسجّل الربح / الخسارة المحققة.',
    'Coins arriving from outside this portfolio. The cost per coin goes into your average buy price (use your original purchase price, or 0 for mined/free coins). The fee is deducted from the amount received.':
      'عملات جاية من برّه المحفظة دي. تكلفة العملة بتدخل في متوسط سعر شرائك (استخدم سعر شرائك الأصلي، أو 0 للعملات المعدّنة / المجانية). والرسوم بتتخصم من الكمية المستلمة.',
    'Staking, mining or airdrop coins that arrived in your wallet. They come in at $0 cost, so your holdings go up and the average buy price goes down — the reward is pure profit.':
      'عملات Staking أو تعدين أو Airdrop وصلت محفظتك. بتدخل بتكلفة صفر، فأصولك بتزيد ومتوسط سعر الشراء بيقل — والمكافأة ربح صافي.',
    'Coins leaving this portfolio (e.g. to another wallet you don’t track). Average buy price is unchanged and no profit/loss is recorded. The fee is also deducted.':
      'عملات خارجة من المحفظة دي (مثلاً لمحفظة تانية مش متابعها). متوسط سعر الشراء ما بيتغيرش ومفيش ربح / خسارة بتتسجل. والرسوم بتتخصم كمان.',
    'Set network & where held': 'حدد الشبكة ومكان الحفظ', 'Network & where held — used by the wallet check': 'الشبكة ومكان الحفظ — بتُستخدم في مطابقة المحافظ',
    'USDC (new)': 'USDC (جديدة)', '(new)': '(جديدة)', 'Add the money to USDT': 'إضافة الفلوس لـ USDT', 'Not enough': 'مش كفاية', 'now': 'الآن',
    'Save changes': 'حفظ التعديلات', 'Edit transaction': 'تعديل المعاملة', 'Change transaction': 'تعديل المعاملة', 'Delete transaction': 'حذف المعاملة', 'Delete transaction?': 'حذف المعاملة؟',
    'Holdings and averages are worked out again.': 'الأصول والمتوسطات بتتحسب من جديد.', 'Holdings, average buy price and profit are worked out again from your history.': 'الأصول ومتوسط سعر الشراء والربح بيتحسبوا من جديد من سجلك.',
    'Holdings and average cost will be recalculated automatically on all devices.': 'الأصول ومتوسط التكلفة هيتحسبوا تلقائياً على كل الأجهزة.',
    'Symbol is required.': 'الرمز مطلوب.', 'Pick the coin from the search list (or type only its symbol, e.g. XRP).': 'اختار العملة من قايمة البحث (أو اكتب رمزها بس، مثلاً XRP).',
    'Enter a valid quantity.': 'اكتب كمية صحيحة.', 'Enter a valid buy price.': 'اكتب سعر شراء صحيح.', 'Enter a quantity greater than 0.': 'اكتب كمية أكبر من صفر.', 'Enter a price greater than 0.': 'اكتب سعر أكبر من صفر.',
    'Fee cannot be negative.': 'الرسوم ما ينفعش تكون بالسالب.', 'Fee must be smaller than the amount transferred in.': 'الرسوم لازم تكون أقل من الكمية المودَعة.', 'Date cannot be in the future.': 'التاريخ ما ينفعش يكون في المستقبل.',
    'Enter a valid date.': 'اكتب تاريخ صحيح.', 'The start date cannot be in the future.': 'تاريخ البداية ما ينفعش يكون في المستقبل.', 'The start date can be at most 5 years ago.': 'تاريخ البداية أقصاه من 5 سنين.',
    'Enter the amount you have staked.': 'اكتب الكمية اللي عاملها Staking.', 'Enter the APY, e.g. 6.5 for 6.5% a year.': 'اكتب العائد السنوي APY، مثلاً 6.5 يعني 6.5% في السنة.',
    'Enter a quantity and price (0 or more).': 'اكتب الكمية والسعر (صفر أو أكتر).',
    'CoinGecko ID looks wrong — pick the coin from the search list.': 'معرّف CoinGecko شكله غلط — اختار العملة من قايمة البحث.',
    'CoinMarketCap page: use lowercase letters, digits and dashes only.': 'صفحة CoinMarketCap: استخدم حروف إنجليزي صغيرة وأرقام وشرطات بس.',
    'Add without live price?': 'إضافة من غير سعر مباشر؟', 'Add anyway': 'أضف برضه',
    'Staking reward': 'مكافأة Staking', 'Mining reward': 'مكافأة تعدين', 'Change staking': 'تعديل الـ Staking', 'Amount staked': 'الكمية في الـ Staking', 'Staking since': 'Staking من تاريخ',
    'Start staking': 'بدء الـ Staking', 'Stop staking': 'إيقاف الـ Staking', 'Staking reward · auto': 'مكافأة Staking · تلقائي', 'Not a reward (plain Transfer In)': 'مش مكافأة (إيداع عادي)',
    'Could not change it': 'تعذّر التعديل', 'Could not stop it': 'تعذّر الإيقاف', 'staking': 'Staking', 'e.g. SOL staking (Tangem)': 'مثلاً SOL staking (Tangem)',
    'This coin is not on automatic staking': 'العملة دي مش على Staking تلقائي', 'Enter the amount staked and an APY above 0%': 'اكتب الكمية في الـ Staking وعائد سنوي أكبر من 0%',
    'Paid': 'المدفوع', 'Pays': 'بيدفع', 'Adds': 'بيضيف', 'Arrives in your wallet': 'هيوصل محفظتك', '· cost added': '· التكلفة اتضافت', '$0 cost': 'تكلفة صفر',
    'A later sell/transfer would then exceed your holdings.': 'وقتها بيع / سحب بعد كده هيبقى أكبر من أصولك.',
    // ── a coin's page & History ──
    'Transactions': 'المعاملات', 'Total Bought': 'إجمالي الشراء', 'Total Sold': 'إجمالي البيع', 'Profit': 'ربح', 'Loss': 'خسارة',
    'Opening position': 'المركز الافتتاحي', 'Manual edit': 'تعديل يدوي', 'Wallet check': 'مطابقة المحفظة', 'Mining reward · wallet check': 'مكافأة تعدين · مطابقة المحفظة',
    'You hold none of this coin now': 'ما عندكش من العملة دي دلوقتي', 'BTC is always Hold': 'البيتكوين دايماً احتفاظ', 'Typing': 'بتكتب', 'Saved': 'اتحفظ', 'Not saved —': 'ما اتحفظش —',
    'Category —': 'التصنيف —', 'Use default': 'استخدم الافتراضي', 'Rename': 'تغيير الاسم',
    'New name for this category — every coin in it, every filter and chart follow.': 'اسم جديد للتصنيف ده — كل عملاته وكل فلتر ورسم هيتبعوه.',
    'Name of the new category. Move coins into it with Change Category.': 'اسم التصنيف الجديد. انقل العملات له من تغيير التصنيف.',
    'Rewards & Mining': 'المكافآت والتعدين', 'Target Allocation': 'التوزيع المستهدف', 'DCA Schedule (Regular Buys)': 'الشراء الدوري (DCA)', 'Plan vs Target Allocation': 'الخطة مقابل التوزيع المستهدف', 'Exit Plan Steps': 'خطوات خطة الخروج',
    'Initial position': 'المركز الافتتاحي', 'Re-added coin': 'عملة اتضافت تاني', 'Removed from portfolio': 'اتشالت من المحفظة', 'Recovered from backup': 'اترجعت من النسخة الاحتياطية',
  });
})();
