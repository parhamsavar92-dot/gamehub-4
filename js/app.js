/* =========================================================
   GameHub — منطق کامل سایت
   نکته صادقانه: این یک اپ فرانت‌اند است. همه‌چیز (کاربرها،
   اخبار، کامنت‌ها، پیام‌ها) در localStorage همین مرورگر
   ذخیره می‌شود. رصد "خودکار" اخبار از یک استخر تیتر از پیش
   نوشته‌شده شبیه‌سازی می‌شود، نه کراول واقعی کل اینترنت،
   چون این صفحه سرور ندارد.
   ========================================================= */

const OWNER_USERNAME = 'parham-savar';
const OWNER_PASSWORD = 'Parham@Owner2026';
const OWNER_DISPLAY   = 'Parham savar';
const ADMIN_CONTACT   = '__admin_support__'; // مخاطب مجازی «پشتیبانی سایت» — پیام‌های ادمین به کاربر از این مسیر می‌روند تا کاربر واقعاً ببیندشان

/* ---------- ابزار کمکی ---------- */
function simpleHash(str){
  let h = 0;
  for (let i=0;i<str.length;i++){ h = (h*31 + str.charCodeAt(i)) | 0; }
  return 'h' + Math.abs(h).toString(36);
}
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function nowStr(){
  const d = new Date();
  return d.toLocaleTimeString('fa-IR');
}
function startSiteClock(){
  const el = document.getElementById('siteClock');
  if(!el) return;
  function tick(){ el.textContent = new Date().toLocaleTimeString('fa-IR'); tickUpdateCountdown(); }
  tick();
  setInterval(tick, 1000);
}
/* اطلاعات شبکه — کشور/شهر تقریبی از روی IP (نه GPS) از یه سرویس عمومی رایگان،
   و یه تأخیر تقریبی (نه پینگ واقعی بازی؛ فقط زمان رفت‌وبرگشت به همون سرویس).
   نکته صادقانه: اگه شبکه‌ی کاربر به این سرویس دسترسی نداشته باشه، بی‌خطر مخفی می‌شه. */
async function fetchNetInfo(){
  const el=document.getElementById('netInfo'); if(!el) return;
  const region=(Intl.DateTimeFormat().resolvedOptions().timeZone||'Unknown').replace('_',' ');
  const start=performance.now();
  try{
    const r=await fetch('/api/net/ping',{cache:'no-store',credentials:'same-origin'});
    const ping=Math.max(0,Math.round(performance.now()-start));
    el.textContent=`🌐 ${navigator.onLine?'آنلاین':'آفلاین'} · پینگ ${ping}ms · ریجن ${region}`;
    document.getElementById('serverStatus')?.replaceChildren(document.createTextNode('سرور آنلاین'));
  }catch(e){
    const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
    const type=connection&&(connection.effectiveType||connection.type);
    el.textContent=`🌐 ${navigator.onLine?'آنلاین':'آفلاین'} · ${type||'شبکه نامشخص'} · ریجن ${region}`;
    document.getElementById('serverStatus')?.replaceChildren(document.createTextNode('حالت محلی / بدون بک‌اند'));
  }
}

function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>t.classList.add('hidden'), 2600);
}
function save(key, val){
  try{
    localStorage.setItem(key, JSON.stringify(val));
    if(CLOUD_KEY_MAP[key]) scheduleCloudPush();
    return true;
  }catch(e){
    console.warn('GameHub storage save failed:', key, e);
    toast('فضای ذخیره‌سازی مرورگر پر شده است.');
    return false;
  }
}
function load(key, fallback){
  try{
    const v = localStorage.getItem(key);
    if(v===null) return fallback;
    const parsed = JSON.parse(v);
    return parsed ?? fallback;
  }catch(e){
    return fallback;
  }
}

/* =========================================================
   همگام‌سازی ابری با بک‌اند SQLite خود سایت — اخبار/اعضا/لیدربورد/
   کامنت‌ها و بقیه داده‌های مشترک بین همه بازدیدکننده‌ها یکسان است.
   داده روی سرور در gamehub.sqlite ذخیره می‌شود.
   ========================================================= */
const CLOUD_URL = '/api'; // داده مشترک از بک‌اند SQLite خود سایت؛ کلید محرمانه فقط روی سرور است.
/* نگاشت کلیدهای localStorage به فیلدهای state سرور — فقط داده‌های مشترک بین همه کاربران */
const CLOUD_KEY_MAP = {
  gh_news:'news', gh_users:'users', gh_comments:'comments', gh_banned:'banned',
  gh_leaderboard:'leaderboard', gh_explore:'explore', gh_shorts:'shorts',
  gh_polls:'polls', gh_bug_reports:'bugReports', gh_news_suggestions:'newsSuggestions',
  gh_activity_log:'activityLog', gh_player_activity:'playerActivityLog',
  gh_aboutus_text:'aboutUsText', gh_aboutus_msgs:'aboutUsMsgs',
  gh_dms:'dms', gh_explore_comments:'exploreComments', gh_broadcast_log:'broadcastLog',
  gh_roblox_news:'robloxNews', gh_anime_news:'animeNews',
  gh_announce:'announce', gh_tags:'tags', gh_xp_config:'xpConfig', gh_badges:'badges',
  gh_seo:'seo', gh_custom_pages:'customPages', gh_reactions:'reactions',
  gh_featured:'featured', gh_user_xp:'userXp', gh_admin_extras:'adminExtras', gh_member_roles:'memberRoles', gh_verified:'verified', gh_member_roles:'memberRoles'
};
const CLOUD_DEFAULTS = {
  news:[], users:[], comments:{}, banned:[], leaderboard:[], explore:[], shorts:[],
  polls:[], bugReports:[], newsSuggestions:[], activityLog:[], playerActivityLog:[],
  aboutUsText:'', aboutUsMsgs:[], dms:{}, exploreComments:{}, broadcastLog:[],
  robloxNews:[], animeNews:[],
  announce:null, tags:['همه','RPG','اکشن','تحریریه','رصد خودکار'],
  xpConfig:{like:2,comment:5,gameWin:15}, badges:[], seo:{title:'GameHub — اخبار گیم',desc:'',keywords:''},
  customPages:[], reactions:['👍','🔥','❤️','😂','😮'], featured:[], userXp:{}, adminExtras:{}, memberRoles:{}, verified:[], memberRoles:{}
};
let cloudPushTimer = null;
let cloudPullInFlight = null;
let cloudSyncing = false;
const BACKEND_KEYS = Object.values(CLOUD_KEY_MAP);
function backendAvailable(){ return location.protocol.startsWith('http') && !location.hostname.endsWith('file'); }
function scheduleCloudPush(){
  clearTimeout(cloudPushTimer);
  cloudPushTimer=setTimeout(()=>backendSyncPush(),500);
}
async function backendSyncPush(){
  if(!backendAvailable()) return false;
  // دادهٔ عمومی بدون لاگین هم روی سرور نوشته می‌شود (همگانی واقعی)
  let ok = true;
  for(const [lsKey, key] of Object.entries(CLOUD_KEY_MAP)){
    try{
      const def = (CLOUD_DEFAULTS[key] !== undefined) ? CLOUD_DEFAULTS[key] : [];
      const val = load(lsKey, def);
      const r = await fetch('/api/state/'+encodeURIComponent(key),{
        method:'PUT', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({value:val})
      });
      if(!r.ok) ok = false;
    }catch(e){
      console.warn('GameHub cloud push failed for', key, e);
      ok = false;
    }
  }
  return ok;
}
async function backendSyncPull(){
  if(!backendAvailable() || cloudSyncing) return false;
  cloudSyncing=true;
  try{
    // فقط داده‌های مشترک/عمومی؛ تنظیمات شخصی (تم، زبان و …) محلی می‌مانند
    let any = false;
    for(const [lsKey,key] of Object.entries(CLOUD_KEY_MAP)){
      try{
        const r=await fetch('/api/state/'+encodeURIComponent(key),{credentials:'include',cache:'no-store'});
        if(!r.ok) continue;
        const j=await r.json();
        if(j.value!==null && j.value!==undefined){
          localStorage.setItem(lsKey, JSON.stringify(j.value));
          any = true;
        }
      }catch(e){}
    }
    return any || true;
  }finally{ cloudSyncing=false; }
}
function cloudPull(){ if(cloudPullInFlight) return cloudPullInFlight; cloudPullInFlight=backendSyncPull().finally(()=>cloudPullInFlight=null); return cloudPullInFlight; }

/* ---------- استخر داده‌های نمایشی برای رصد خودکار ----------
   نکته: این لیست شبیه‌سازی رصد اخبار گیم از فیدهای عمومی است
   (نه کراول زندهٔ کل اینترنت). داده‌ها بعد از رصد در سرور ذخیره می‌شوند. */
const SCAN_POOL = [
  {title:'الدن رینگ: نایت‌رِین آپدیت بزرگ بعدی را دریافت می‌کند', tag:'RPG', src:'زومجی'},
  {title:'گاد آو وار: راگناروک نسخه PC می‌گیرد', tag:'اکشن', src:'GameSpot'},
  {title:'جزئیات تازه از GTA 6 منتشر شد', tag:'رصد خودکار', src:'Polygon'},
  {title:'نینتندو فروش سوییچ ۲ را اعلام کرد', tag:'رصد خودکار', src:'PC Gamer'},
  {title:'بلیزارد فصل جدید دیابلو ۴ را معرفی کرد', tag:'RPG', src:'Eurogamer'},
  {title:'کپکام از رزیدنت اویل جدید رونمایی کرد', tag:'اکشن', src:'زومجی'},
  {title:'فیفا سوپر ساکر رویداد جام‌جهانی ۲۰۲۶ را می‌زبانی می‌کند', tag:'رصد خودکار', src:'GameSpot'},
  {title:'استودیو From Software بازی جدیدش را تیز کرد', tag:'RPG', src:'Polygon'},
  {title:'آپدیت امنیتی بزرگ برای اکانت‌های روبلاکس', tag:'رصد خودکار', src:'PC Gamer'},
  {title:'راکستار زمان انتشار تریلر بعدی را اعلام کرد', tag:'رصد خودکار', src:'Eurogamer'},
  {title:'والو جزئیات تازه از دیفلاک ۲ منتشر کرد', tag:'رصد خودکار', src:'زومجی'},
  {title:'اکتیویژن فصل جدید Warzone را معرفی کرد', tag:'اکشن', src:'IGN'},
  {title:'یوبی‌سافت تاریخ انتشار اساسینز کرید جدید را اعلام کرد', tag:'رصد خودکار', src:'GameSpot'},
  {title:'CD Projekt جزئیات ویچر ۴ را به اشتراک گذاشت', tag:'RPG', src:'Eurogamer'},
  {title:'مایکروسافت گیم‌پس بازی‌های تازه اضافه کرد', tag:'رصد خودکار', src:'PC Gamer'},
  {title:'سونی رویداد استیت آو پلی جدید را برنامه‌ریزی کرد', tag:'رصد خودکار', src:'IGN'},
  {title:'اسکوئر اینیکس از فاینال فانتزی جدید رونمایی کرد', tag:'RPG', src:'Polygon'},
  {title:'ریاضی جدید eSports جام جهانی گیمینگ اعلام شد', tag:'رصد خودکار', src:'زومجی'},
  {title:'اپیک گیمز بازی رایگان هفته را معرفی کرد', tag:'رصد خودکار', src:'GameSpot'},
  {title:'بتسدا آپدیت بزرگ استارفیلد را منتشر کرد', tag:'RPG', src:'IGN'},
  {title:'نتیجه تورنمنت جهانی دوتا ۲ اعلام شد', tag:'اکشن', src:'Eurogamer'},
  {title:'کپکام مانستر هانتر جدید را تیز کرد', tag:'اکشن', src:'زومجی'},
  {title:'نینتندو دایرکت جدید تاریخ گرفت', tag:'رصد خودکار', src:'PC Gamer'},
  {title:'استودیو ریاکتور جزئیات بازی نسل بعد را فاش کرد', tag:'رصد خودکار', src:'IGN'},
  {title:'ماینکرافت آپدیت بزرگ نسخه جاوا و Bedrock را منتشر کرد', tag:'رصد خودکار', src:'PC Gamer'},
  {title:'ماینکرافت رویداد فصلی تازه با بلوک‌ها و موجودات جدید آورد', tag:'رصد خودکار', src:'زومجی'},
  {title:'مایکروسافت آمار جدید فروش ماینکرافت را اعلام کرد', tag:'رصد خودکار', src:'IGN'},
  {title:'ماینکرافت مارکت‌پلیس نقشه‌ها و اسکین‌های تازه اضافه کرد', tag:'رصد خودکار', src:'GameSpot'},
];
const NEWS_SOURCES_LIST = ['زومجی','GameSpot','Polygon','PC Gamer','Eurogamer','IGN'];
const ROBLOX_SECTIONS = [
  {h:'روبلاکس چیست و روی چه دستگاه‌هایی می‌آید', p:'روبلاکس یک پلتفرم بازی‌سازی و بازی است که کاربران در آن تجربه‌های خودشان را می‌سازند. روی موبایل، تبلت، ویندوز، مک، Xbox و هدست‌های VR در دسترس است.'},
  {h:'آمار پلتفرم (بر اساس گزارش رسمی سهامداران، سه‌ماهه اول ۲۰۲۶)', p:'روبلاکس در سه‌ماهه اول ۲۰۲۶ به‌طور میانگین ۱۳۲ میلیون کاربر فعال روزانه (DAU) و ۳۸۱.۸ میلیون کاربر فعال ماهانه (MAU) داشته؛ رشد ۳۵٪ نسبت به سال قبل. کاربران در این بازه ۳۱ میلیارد ساعت روی پلتفرم وقت گذاشته‌اند (۴۳٪ رشد سالانه) و بیش از ۴۴ میلیون بازی/تجربه روی پلتفرم منتشر شده. رکورد هم‌زمانی بازیکنان ۴۷.۴ میلیون نفر (مرداد ۲۰۲۵) است.'},
  {h:'درآمد و اقتصاد سازنده‌ها', p:'درآمد سه‌ماهه اول ۲۰۲۶ حدود ۱.۴ میلیارد دلار بوده (رشد ۳۹٪ سالانه). سازنده‌ها در سال ۲۰۲۵ مجموعاً بیش از ۱.۵ میلیارد دلار از طریق برنامه Developer Exchange درآمد داشته‌اند.'},
  {h:'روبوکس و اقتصاد داخل بازی', p:'روبوکس ارز داخلی روبلاکس است که برای خرید آیتم، لباس و ورود به تجربه‌های خاص استفاده می‌شود؛ سازنده‌ها می‌توانند آن را به پول واقعی تبدیل کنند.'},
  {h:'Roblox Studio برای سازنده‌ها', p:'ابزار رایگان ساخت بازی روبلاکس که با اسکریپت Lua، ساخت جهان‌های سه‌بعدی و انتشار مستقیم روی پلتفرم را ممکن می‌کند. طبق آمار اخیر، حدود ۷۰٪ دارایی‌های تازه با کمک ابزارهای هوش مصنوعی ساخته می‌شوند.'},
  {h:'ایمنی، حساب Kids و کنترل والدین', p:'روبلاکس حساب مخصوص کودکان و ابزار کنترل والدین دارد. از ژانویه ۲۰۲۶ احراز سن برای استفاده از چت الزامی شده است.'},
  {h:'قابلیت Moments برای کلیپ کوتاه', p:'کاربران می‌توانند کلیپ‌های کوتاه از لحظات داخل بازی خود را ضبط و با دیگران به اشتراک بگذارند.'},
  {h:'ایونت جام جهانی ۲۰۲۶ روی FIFA Super Soccer', p:'تجربه‌ای رسمی مرتبط با جام جهانی ۲۰۲۶ داخل روبلاکس با فعالیت و رویدادهای ویژه.'},
  {h:'لیست تجربه‌های معروف برای شروع', p:'Brookhaven RP با بیش از ۶۹ میلیارد بازدید کل، پربازدیدترین تجربه روبلاکس است. Adopt Me، Blox Fruits و Pet Simulator هم از تجربه‌های محبوب برای شروع هستند.'},
  {h:'توزیع جغرافیایی کاربران', p:'منطقه آسیا-اقیانوسیه با حدود ۳۰٪ کاربران فعال روزانه، بزرگ‌ترین بازار روبلاکس است؛ پس از آن آمریکای شمالی و اروپا قرار دارند. حدود ۸۰٪ نشست‌های کاربران از موبایل انجام می‌شود.'},
];
const ROBLOX_SCAN_POOL = [
  {title:'روبلاکس ابزار جدید ایمنی کودکان را فعال کرد', src:'Roblox Blog'},
  {title:'رویداد جام جهانی ۲۰۲۶ در FIFA Super Soccer آغاز شد', src:'Roblox Blog'},
  {title:'آپدیت Roblox Studio سرعت ساخت را بالا برد', src:'Roblox Blog'},
  {title:'تجربه جدید Blox Fruits آیتم‌های تازه گرفت', src:'Roblox News'},
  {title:'روبلاکس قابلیت جدید چت صوتی را گسترش داد', src:'Roblox Blog'},
  {title:'Adopt Me رویداد فصلی تازه‌ای منتشر کرد', src:'Roblox News'},
  {title:'روبلاکس گزارش درآمد سازندگان را اعلام کرد', src:'Roblox Blog'},
  {title:'Brookhaven بروزرسانی نقشه بزرگ دریافت کرد', src:'Roblox News'},
  {title:'روبلاکس ابزار هوش مصنوعی برای سازنده‌ها معرفی کرد', src:'Roblox Blog'},
  {title:'Pet Simulator رویداد محدود جدید را آغاز کرد', src:'Roblox News'},
];
const ANIME_SECTIONS = [
  {h:'انیمه چیست', p:'انیمه سبکی از انیمیشن ژاپنی است که طیف گسترده‌ای از ژانرها (اکشن، فانتزی، رمانتیک، ترسناک) را پوشش می‌دهد و معمولاً بر اساس مانگا (کمیک ژاپنی) ساخته می‌شود.'},
  {h:'پلتفرم‌های پخش رسمی', p:'Crunchyroll، Netflix و Prime Video از پلتفرم‌های اصلی پخش قانونی انیمه با زیرنویس و دوبله هستند.'},
  {h:'فصل‌های پخش', p:'انیمه‌های جدید معمولاً در چهار فصل تقویمی (زمستان، بهار، تابستان، پاییز) هرکدام با ده‌ها عنوان تازه پخش می‌شوند.'},
  {h:'انیمه و بازی‌های ویدیویی', p:'بسیاری از بازی‌های محبوب (مثل Genshin Impact و بازی‌های ژانر گاچا) الهام‌گرفته از سبک بصری انیمه هستند و جامعه مشترکی با طرفداران انیمه دارند.'},
];
const ANIME_SCAN_POOL = [
  {title:'فصل تازه انیمه Jujutsu Kaisen تاریخ پخش گرفت', src:'Crunchyroll News'},
  {title:'اقتباس انیمه‌ای مانگای جدید تأیید شد', src:'Anime News Network'},
  {title:'فیلم سینمایی انیمه‌ای پرفروش هفته اکران شد', src:'Crunchyroll News'},
  {title:'استودیو انیمیشن ژاپنی پروژه تازه‌ای اعلام کرد', src:'Anime News Network'},
  {title:'بازی گاچا الهام‌گرفته از انیمه رکورد دانلود زد', src:'Crunchyroll News'},
  {title:'دوبله فارسی یک انیمه محبوب منتشر شد', src:'Anime News Network'},
];
const MEME_TEMPLATES = [
  'وقتی بالاخره باس فاینال رو شکست میدی 🎮',
  'من که فکر میکردم سیو کردم... 💀',
  'رفیقت وقتی تو تیم ورک نمیکنه 😤',
  'وقتی گرافیک بازی جدید رو میبینی 🤯',
  'آپدیت جدید بازی وقتی باگ داره 🐛',
  'وقتی سرور گیم آنلاین قطع میشه وسط بازی 😭',
  'من: امشب فقط یه گیم میزنم / ساعت ۴ صبح: 🫠',
  'وقتی هم‌تیمیت میکروفونشو باز میذاره 🎤',
  'وقتی بعد از ۵۰ بار امتحان بالاخره رد میشی 🏆',
  'گیمر واقعی وقتی برق میره وسط رید باس 😤⚡',
  'وقتی دوستت میگه بیا یه بازی دیگه امتحان کنیم و تو کل شب رو با اون میگذرونی 🎮',
  'من قبل از آپدیت: هایپ 🔥 / بعد از آپدیت: 💀',
  'وقتی NPC از تو باهوش‌تره 🤖',
  'وقتی حریف با پینگ ۹۹۹ همه رو میزنه 😵',
];
/* استخر تریلرهای رسمی برای شورتس — شناسه‌های واقعی یوتیوب، تأییدشده */
const SHORTS_POOL = [
  {id:'MqLM4MV0Fls', title:'الدن رینگ: نایت‌رِین — تریلر رسمی انتشار'},
  {id:'lUcLfc8uqjk', title:'الدن رینگ: نایت‌رِین — تریلر معرفی کامل'},
  {id:'rUBt1BRtTww', title:'گاد آو وار راگناروک — تریلر رسمی انتشار 4K'},
  {id:'KXYuOcP6gpI', title:'گاد آو وار راگناروک — تریلر انتشار'},
  {id:'g-WKpapqVU8', title:'رددد ردمپشن ۲ — تریلر انتشار نسخه PC'},
  {id:'HVRzx17WHVk', title:'رددد ردمپشن ۲ — تریلر رسمی انتشار'},
  {id:'o3V-GvvRjDM', title:'The Last of Us Part II — تریلر سینمایی'},
  {id:'1O6Qstncpnc', title:'Horizon Forbidden West — تریلر گیم‌پلی'},
  {id:'2X_2IdybTV0', title:'Cyberpunk 2077 — تریلر آپدیت بزرگ'},
  {id:'SS6a6xTb2iM', title:'Black Myth: Wukong — تریلر رسمی'},
  {id:'u3w-kMN-h6A', title:'GTA VI — تریلر رسمی راک‌استار'},
  {id:'hh5HV4Lmdl4', title:'Starfield — تریلر گیم‌پلی بثسدا'},
];

/* =========================================================
   وضعیت برنامه — همه در localStorage
   ========================================================= */
const State = {
  get news(){ return load('gh_news', null) ?? State.seedNews(); },
  set news(v){ save('gh_news', v); scheduleCloudPush(); },
  seedNews(){
    const seed = SCAN_POOL.slice(0,4).map((s,i)=>({
      id: uid(), title: s.title, tag: s.tag, body: s.title + '. این خبر به‌صورت خودکار از فید عمومی ' + s.src + ' رصد شده و خلاصه اولیه آن نمایش داده می‌شده است. برای مطالعه کامل به صفحه اصلی منبع مراجعه کن.',
      source: s.src, sourceUrl:'#', ts: Date.now() - i*3600000, likes: Math.floor(Math.random()*40),
      likedBy:[], imageRemoved:false, textRemoved:false, auto:true
    }));
    save('gh_news', seed);
    return seed;
  },
  get comments(){ return load('gh_comments', {}); },
  set comments(v){ save('gh_comments', v); scheduleCloudPush(); },
  get users(){ return load('gh_users', []); },
  set users(v){ save('gh_users', v); scheduleCloudPush(); },
  get banned(){ return load('gh_banned', []); },
  set banned(v){ save('gh_banned', v); scheduleCloudPush(); },
  get admins(){
    let a = load('gh_admins', null);
    if(!a){
      a = [{username: OWNER_USERNAME, hash: simpleHash(OWNER_PASSWORD), role:'owner', display:OWNER_DISPLAY}];
      save('gh_admins', a);
    }
    return a;
  },
  set admins(v){ save('gh_admins', v); },
  get deletedTitles(){ return load('gh_deleted_titles', []); },
  set deletedTitles(v){ save('gh_deleted_titles', v); },
  get broadcastLog(){ return load('gh_broadcast_log', []); },
  set broadcastLog(v){ save('gh_broadcast_log', v); },
  get dms(){ return load('gh_dms', {}); },
  set dms(v){ save('gh_dms', v); },
  get explore(){ return load('gh_explore', null) ?? State.seedExplore(); },
  set explore(v){ save('gh_explore', v); scheduleCloudPush(); },
  seedExplore(){
    const items = [];
    State.news.slice(0,3).forEach(n=>items.push({id:uid(),type:'news',title:n.title,likes:Math.floor(Math.random()*60),comments:Math.floor(Math.random()*10),ts:Date.now()}));
    MEME_TEMPLATES.slice(0,4).forEach(m=>items.push({id:uid(),type:'meme',title:m,likes:Math.floor(Math.random()*90),comments:Math.floor(Math.random()*15),ts:Date.now()}));
    SHORTS_POOL.slice(0,3).forEach(s=>items.push({id:uid(),type:'video',title:s.title,vid:s.id,likes:Math.floor(Math.random()*50),comments:0,ts:Date.now()}));
    save('gh_explore', items);
    scheduleCloudPush();
    return items;
  },
  get settings(){ return load('gh_settings', {theme:'dark', density:'normal', lang:'fa'}); },
  set settings(v){ save('gh_settings', v); },
  get savedNews(){ return load('gh_saved', []); },
  set savedNews(v){ save('gh_saved', v); },
  get activityLog(){ return load('gh_activity_log', []); },
  set activityLog(v){ save('gh_activity_log', v); scheduleCloudPush(); },
  get reports(){ return load('gh_reports', []); },
  set reports(v){ save('gh_reports', v); },
  get scheduled(){ return load('gh_scheduled', []); },
  set scheduled(v){ save('gh_scheduled', v); },
  get maintenance(){ return load('gh_maintenance', false); },
  set maintenance(v){ save('gh_maintenance', v); },
  get pinnedId(){ return load('gh_pinned', null); },
  set pinnedId(v){ save('gh_pinned', v); },
  get verifiedUsers(){ return load('gh_verified', []); },
  set verifiedUsers(v){ save('gh_verified', v); },
  get memberRoles(){ return load('gh_member_roles', {}); },
  set memberRoles(v){ save('gh_member_roles', v); scheduleCloudPush(); },
  get commentsFrozen(){ return load('gh_comments_frozen', false); },
  set commentsFrozen(v){ save('gh_comments_frozen', v); },
  get shorts(){ return load('gh_shorts', null) ?? State.seedShorts(); },
  set shorts(v){ save('gh_shorts', v); scheduleCloudPush(); },
  seedShorts(){
    const seed = SHORTS_POOL.slice(0,6).map((s,i)=>({id:uid(), vid:s.id, title:s.title, likes:Math.floor(Math.random()*80), likedBy:[], ts:Date.now()-i*600000}));
    save('gh_shorts', seed);
    scheduleCloudPush();
    return seed;
  },
  get exploreComments(){ return load('gh_explore_comments', {}); },
  set exploreComments(v){ save('gh_explore_comments', v); },
  get moderationEnabled(){ return load('gh_moderation', false); },
  set moderationEnabled(v){ save('gh_moderation', v); },
  get pendingComments(){ return load('gh_pending_comments', []); },
  set pendingComments(v){ save('gh_pending_comments', v); },
  get loginHistory(){ return load('gh_login_history', []); },
  set loginHistory(v){ save('gh_login_history', v); },
  get rateLimitEnabled(){ return load('gh_rate_limit', true); },
  set rateLimitEnabled(v){ save('gh_rate_limit', v); },
  get newsArchive(){ return load('gh_news_archive', []); },
  set newsArchive(v){ save('gh_news_archive', v); },
  get customBadWords(){ return load('gh_custom_badwords', []); },
  set customBadWords(v){ save('gh_custom_badwords', v); },
  get signupLocked(){ return load('gh_signup_locked', false); },
  set signupLocked(v){ save('gh_signup_locked', v); },
  get securityToken(){ return load('gh_security_token', 'init'); },
  set securityToken(v){ save('gh_security_token', v); },
  get branding(){ return load('gh_branding', {siteName:'GameHub', tagline:'', icon:null}); },
  set branding(v){ save('gh_branding', v); },
  get hideSourceLinks(){ return load('gh_hide_source', false); },
  set hideSourceLinks(v){ save('gh_hide_source', v); },
  get homeFeedLimit(){ return load('gh_feed_limit', null); },
  set homeFeedLimit(v){ save('gh_feed_limit', v); },
  get welcomeDmEnabled(){ return load('gh_welcome_dm_enabled', false); },
  set welcomeDmEnabled(v){ save('gh_welcome_dm_enabled', v); },
  get welcomeDmText(){ return load('gh_welcome_dm_text', 'به گیم‌هاب خوش اومدی! اگه سوالی داشتی همینجا بنویس 👑'); },
  set welcomeDmText(v){ save('gh_welcome_dm_text', v); },
  get scheduledBroadcasts(){ return load('gh_scheduled_broadcasts', []); },
  set scheduledBroadcasts(v){ save('gh_scheduled_broadcasts', v); },
  get leaderboard(){ return load('gh_leaderboard', {}); },
  set leaderboard(v){ save('gh_leaderboard', v); scheduleCloudPush(); },
  get robloxSections(){ return load('gh_roblox_sections', null) ?? State.seedRobloxSections(); },
  set robloxSections(v){ save('gh_roblox_sections', v); },
  seedRobloxSections(){
    const seed = ROBLOX_SECTIONS.map(s=>({id:uid(), h:s.h, p:s.p}));
    save('gh_roblox_sections', seed);
    return seed;
  },
  get inviteCodes(){ return load('gh_invite_codes', []); },
  set inviteCodes(v){ save('gh_invite_codes', v); },
  get polls(){ return load('gh_polls', []); },
  set polls(v){ save('gh_polls', v); },
  get bugReports(){ return load('gh_bug_reports', []); },
  set bugReports(v){ save('gh_bug_reports', v); },
  get ownerNotes(){ return load('gh_owner_notes', ''); },
  set ownerNotes(v){ save('gh_owner_notes', v); },
  get aboutUsText(){ return load('gh_aboutus_text', 'گیم‌هاب یک سایت اخبار گیم است که با علاقه توسط Parham savar ساخته و مدیریت می‌شود. هدف ما آوردن تازه‌ترین اخبار دنیای گیم، یک سالن بازی سرگرم‌کننده، و یک جامعه‌ی کوچک و دوستانه برای گیمرهاست.'); },
  set aboutUsText(v){ save('gh_aboutus_text', v); },
  get aboutUsMsgs(){ return load('gh_aboutus_msgs', []); },
  set aboutUsMsgs(v){ save('gh_aboutus_msgs', v); },
  get newsSuggestions(){ return load('gh_news_suggestions', []); },
  set newsSuggestions(v){ save('gh_news_suggestions', v); },
  get eventMode(){ return load('gh_event_mode', ''); },
  set eventMode(v){ save('gh_event_mode', v); },
  get updateCountdown(){ return load('gh_update_countdown', null); },
  set updateCountdown(v){ save('gh_update_countdown', v); },
  get adminRoomMsgs(){ return load('gh_admin_room', []); },
  set adminRoomMsgs(v){ save('gh_admin_room', v); },
  get playerActivityLog(){ return load('gh_player_activity', []); },
  set playerActivityLog(v){ save('gh_player_activity', v); },
  get animeSections(){ return load('gh_anime_sections', null) ?? State.seedAnimeSections(); },
  set animeSections(v){ save('gh_anime_sections', v); },
  seedAnimeSections(){
    const seed = ANIME_SECTIONS.map(s=>({id:uid(), h:s.h, p:s.p}));
    save('gh_anime_sections', seed);
    return seed;
  }
};

/* initCloudSync — با استفاده از cloudPull/cloudPush که بالاتر تعریف شدن،
   یه‌بار موقع بارگذاری داده‌های مشترک رو می‌گیره و بعد هر ۳۰ ثانیه چک می‌کنه. */
async function initCloudSync(){
  try{
    const ok = await cloudPull();
    if(ok){
      try{ renderNewsFeed(); }catch(e){}
      try{ renderPollWidget(); }catch(e){}
      try{ renderAdmin(); }catch(e){}
      try{ if(typeof renderExplore==='function') renderExplore(); }catch(e){}
      try{ if(typeof renderShorts==='function') renderShorts(); }catch(e){}
      try{ if(typeof renderLeaderboard==='function') renderLeaderboard(); }catch(e){}
      try{ if(typeof renderAboutUs==='function') renderAboutUs(); }catch(e){}
    }
  }catch(e){ console.warn('initCloudSync', e); }
  setInterval(()=>{ if(!document.hidden) cloudPull().then(ok=>{ if(ok){ try{ renderNewsFeed(); if(currentView==='explore') renderExplore(); if(currentView==='shorts') renderShorts(); }catch(e){} } }); }, 20000);
}

function isVerified(contact, name){
  if(name===OWNER_DISPLAY) return true;
  if((State.verifiedUsers||[]).includes(contact)) return true;
  const r = getMemberRole(contact);
  return !!(r.badges && r.badges.includes('tick'));
}
function isVip(contact){
  const r = getMemberRole(contact);
  return !!(r.badges && r.badges.includes('vip'));
}
function isCreator(contact){
  const r = getMemberRole(contact);
  return !!(r.badges && r.badges.includes('creator'));
}

function logActivity(text){
  const log = State.activityLog;
  log.unshift({id:uid(), text, who: currentAdmin ? (currentAdmin.display||currentAdmin.username) : 'سیستم', ts: Date.now()});
  State.activityLog = log.slice(0,150);
}
/* لاگ فعالیت بازیکن‌ها (نه ادمین‌ها) — برای دیدن اینکه کاربرا چیکار می‌کنن، سقف‌دار تا حجم نترکونه */
function logPlayerActivity(text){
  const log = State.playerActivityLog;
  const who = currentUser ? currentUser.name : 'مهمان';
  log.unshift({who, text, ts: Date.now()});
  State.playerActivityLog = log.slice(0,300);
}

let currentUser = load('gh_current_user', null);
let currentArticleId = null;
let currentView = 'home';
let ownerChatHistory = [];
let publicChatHistory = [];
let lockUntilTs = load('gh_admin_lock', 0);
let failCount = load('gh_admin_failcount', 0);

/* =========================================================
   فیلتر فحش ساده — تشخیص و بن خودکار
   ========================================================= */
const BAD_WORDS = ['کیر','کص','جنده','کونی','fuck','shit','bitch','عوضی مادر','لاشی'];
function containsProfanity(text){
  const t = (text||'').toLowerCase();
  const allWords = BAD_WORDS.concat(State.customBadWords||[]);
  return allWords.some(w => t.includes(w.toLowerCase()));
}
function isBanned(contact){
  return State.banned.includes(contact);
}
function banUser(contact){
  const b = State.banned;
  if(!b.includes(contact)){ b.push(contact); State.banned = b; }
}

/* =========================================================
   ناوبری بین ویوها
   ========================================================= */
function showView(name){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  const el = document.getElementById('view-'+name);
  if(el) el.classList.add('active');
  document.querySelectorAll('.navlink').forEach(b=>b.classList.toggle('active', b.dataset.view===name));
  document.querySelectorAll('.bnav').forEach(b=>b.classList.toggle('active', b.dataset.view===name));
  window.scrollTo({top:0,behavior:'smooth'});
  if(name==='home') renderNewsFeed();
  if(name==='admin') renderAdmin();
  if(name==='roblox') renderRoblox();
  if(name==='anime') renderAnime();
  if(name==='games') renderGlobalLeaderboard();
  if(name==='ai') renderPublicChat();
  if(name==='settings') renderSettings();
  if(name==='chat') renderChatTab();
  if(name==='explore') renderExplore();
  if(name==='profile') renderProfile();
  if(name==='shorts') renderShorts();
  if(name==='aboutus') renderAboutUsPublic();
  currentView = name;
}
document.querySelectorAll('[data-view]').forEach(btn=>{
  btn.addEventListener('click', ()=>showView(btn.dataset.view));
});
document.querySelectorAll('[data-back]').forEach(btn=>{
  btn.addEventListener('click', ()=>showView(btn.dataset.back));
});

/* =========================================================
   رندر کاور خبر (گرافیک داخلی — هرگز نمی‌شکند)
   ========================================================= */
function coverStyle(seedText){
  const palettes = [
    ['#7c5cff','#3a2f8f'], ['#d4a72c','#8a5c12'], ['#4cc38a','#1f6b48'],
    ['#e0546a','#7a1f30'], ['#2f8fd4','#123a52']
  ];
  let h=0; for(let i=0;i<seedText.length;i++) h += seedText.charCodeAt(i);
  const p = palettes[h % palettes.length];
  return `background:linear-gradient(135deg,${p[0]},${p[1]})`;
}
/* آیکون مرتبط با موضوع خبر — بر اساس کلیدواژه‌های عنوان/برچسب انتخاب می‌شود
   تا کاور خبر حداقل یه اشاره تصویری به موضوعش داشته باشه، نه فقط رنگ خام. */
function coverIcon(title, tag){
  const t = (title||'')+' '+(tag||'');
  if(/روبلاکس|Roblox/i.test(t)) return 'dice';
  if(/ماینکرافت|Minecraft/i.test(t)) return 'pickaxe';
  if(/انیمه|Anime/i.test(t)) return 'mask';
  if(/RPG|نقش‌آفرینی/i.test(t)) return 'sword';
  if(/اکشن|Action/i.test(t)) return 'sword';
  if(/فوتبال|فیفا|FIFA|جام جهانی/i.test(t)) return 'ball';
  if(/امنیت|هک|حساب/i.test(t)) return 'lock';
  if(/PC|کامپیوتر|رایانه/i.test(t)) return 'desktop';
  if(/موبایل|اندروید|آیفون/i.test(t)) return 'mobile';
  if(/آپدیت|بروزرسانی|Update/i.test(t)) return 'sparkle';
  if(/تریلر|رونمایی|معرفی/i.test(t)) return 'film';
  if(/تورنمنت|مسابقه|جام/i.test(t)) return 'trophy';
  return 'controller';
}
/* آیکون‌های برداری طراحی‌شده (نه ایموجی/استیکر) — همیشه یکسان رندر می‌شن،
   به هیچ فایل یا شبکه‌ای وابسته نیستن، پس هرگز نمی‌شکنن. */
const SVG_ICONS = {
  controller: `<path d="M18 26h28a10 10 0 0 1 10 10l2 12a6 6 0 0 1-11 4l-4-6H21l-4 6a6 6 0 0 1-11-4l2-12a10 10 0 0 1 10-10z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M25 33v8M21 37h8" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="43" cy="34" r="2.4" fill="currentColor"/><circle cx="49" cy="40" r="2.4" fill="currentColor"/>`,
  sword: `<path d="M14 50L38 26" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M34 22l8 8-4 4-8-8z" fill="currentColor"/><path d="M26 38l-6 2-2 6 6-2z" fill="currentColor"/><path d="M40 16l6 6" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`,
  ball: `<circle cx="32" cy="32" r="18" fill="none" stroke="currentColor" stroke-width="3"/><path d="M32 18l6 10-6 8-6-8z" fill="currentColor"/><path d="M32 14v4M32 46v4M16 26l4 2M44 26l-4 2M18 40l4-2M46 40l-4-2" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`,
  pickaxe: `<path d="M16 20c8-8 24-8 32 0" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M18 22l-6 6 6 6 6-6z" fill="currentColor"/><path d="M46 22l6 6-6 6-6-6z" fill="currentColor"/><path d="M32 20v28" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>`,
  film: `<rect x="12" y="18" width="40" height="28" rx="3" fill="none" stroke="currentColor" stroke-width="3"/><path d="M12 26h40M20 18l-4 8M32 18l-4 8M44 18l-4 8" stroke="currentColor" stroke-width="2.4"/>`,
  trophy: `<path d="M22 16h20v10a10 10 0 0 1-20 0z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M22 18h-6a6 6 0 0 0 6 10M42 18h6a6 6 0 0 1-6 10" fill="none" stroke="currentColor" stroke-width="3"/><path d="M32 36v8M24 48h16l-2-4H26z" fill="currentColor"/>`,
  lock: `<rect x="16" y="28" width="32" height="22" rx="4" fill="none" stroke="currentColor" stroke-width="3"/><path d="M22 28v-6a10 10 0 0 1 20 0v6" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="32" cy="39" r="3.2" fill="currentColor"/>`,
  desktop: `<rect x="12" y="14" width="40" height="26" rx="2" fill="none" stroke="currentColor" stroke-width="3"/><path d="M24 48h16M32 40v8" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`,
  mobile: `<rect x="20" y="10" width="24" height="44" rx="4" fill="none" stroke="currentColor" stroke-width="3"/><path d="M28 47h8" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`,
  dice: `<rect x="14" y="14" width="36" height="36" rx="6" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="24" cy="24" r="2.6" fill="currentColor"/><circle cx="40" cy="24" r="2.6" fill="currentColor"/><circle cx="32" cy="32" r="2.6" fill="currentColor"/><circle cx="24" cy="40" r="2.6" fill="currentColor"/><circle cx="40" cy="40" r="2.6" fill="currentColor"/>`,
  sparkle: `<path d="M32 12l4 14 14 4-14 4-4 14-4-14-14-4 14-4z" fill="currentColor"/>`,
  mask: `<circle cx="32" cy="32" r="18" fill="none" stroke="currentColor" stroke-width="3"/><path d="M24 26l4 4M40 26l-4 4" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M24 40q8 6 16 0" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`
};
function svgIcon(key){
  return `<svg viewBox="0 0 64 64" class="cover-svg-icon">${SVG_ICONS[key]||SVG_ICONS.controller}</svg>`;
}
function coverHtml(title, tag, sizeStyle){
  return `<div class="thumb-fallback" style="${coverStyle(title)};${sizeStyle||''}">
    <div class="cover-icon">${svgIcon(coverIcon(title, tag))}</div>
    <div class="cover-title">${esc(title.slice(0,60))}</div>
  </div>`;
}
/* اگه عکس واقعی (مثلاً تامبنیل یوتیوب) لود نشد، به‌جای باکس خالی یا شکسته
   یه کاور گرافیکی داخلی جایگزینش می‌کنیم — این عکس‌ها هرگز نباید خراب دیده بشن. */
function imgFallback(imgEl){
  const div = document.createElement('div');
  div.className = 'ethumb thumb-fallback';
  div.style.cssText = imgEl.getAttribute('data-fallback-style') + ';aspect-ratio:1/1.15;border-radius:0;';
  div.innerHTML = `<div class="cover-icon" style="font-size:28px;">${svgIcon('controller')}</div>`;
  imgEl.replaceWith(div);
}
/* همون منطق برای کاور خبرهای معمولی (اندازه متفاوت از اکسپلور) */
function imgFallbackThumb(imgEl){
  const div = document.createElement('div');
  div.className = 'thumb-fallback';
  div.style.cssText = imgEl.getAttribute('data-fallback-style');
  div.innerHTML = `<div class="cover-icon">${svgIcon('controller')}</div><div class="cover-title">${esc(imgEl.getAttribute('data-fallback-title')||'')}</div>`;
  imgEl.replaceWith(div);
}

/* =========================================================
   فید اخبار خانه
   ========================================================= */
let activeTag = 'all';
let searchTerm = '';

function visibleNews(){
  const items = State.news
    .filter(n=>!n.textRemoved || n.title) // حذف‌شده‌های کامل قبلاً از آرایه پاک می‌شوند
    .filter(n=> activeTag==='all' || n.tag===activeTag)
    .filter(n=> !searchTerm || n.title.includes(searchTerm) || (n.body||'').includes(searchTerm))
    .sort((a,b)=>b.ts-a.ts);
  const pinnedId = State.pinnedId;
  if(pinnedId){
    const idx = items.findIndex(n=>n.id===pinnedId);
    if(idx>0){ const [p] = items.splice(idx,1); items.unshift(p); }
  }
  const limit = State.homeFeedLimit;
  return limit ? items.slice(0, limit) : items;
}

function newsCardHtml(n){
  const excerpt = n.textRemoved ? '(متن این خبر توسط مدیر حذف شده است)' : (n.body||'').slice(0,110)+'…';
  const isAdmin = !!currentAdmin;
  const pinned = State.pinnedId === n.id;
  const cover = (n.imageUrl && !n.imageRemoved)
    ? `<img class="thumb" src="${esc(n.imageUrl)}" alt="" loading="lazy" onerror="imgFallbackThumb(this)" data-fallback-title="${esc(n.title.slice(0,40))}" data-fallback-style="${esc(coverStyle(n.title))}">`
    : coverHtml(n.title, n.tag);
  const liked = currentUser && n.likedBy && n.likedBy.includes(currentUser.contact);
  return `<div class="news-card" data-id="${n.id}">
    ${cover}
    <div class="news-meta">
      ${pinned ? '<span class="pin-badge">📌 ویژه</span>' : ''}
      <span class="badge">${esc(n.tag||'گیم')}</span>
      <span class="dim tiny">${esc(n.source||'تحریریه')} · ${new Date(n.ts).toLocaleDateString('fa-IR')}</span>
    </div>
    <div class="news-title">${esc(n.title)}</div>
    <div class="news-excerpt">${esc(excerpt)}</div>
    <div class="news-actions">
      <button class="like-btn ${liked?'liked':''}" data-id="${n.id}">❤ <span>${n.likes||0}</span></button>
      <button class="save-btn" data-id="${n.id}">🔖 ذخیره</button>
      <button class="share-btn" data-id="${n.id}">🔗 اشتراک</button>
      <button class="report-btn" data-id="${n.id}" data-title="${esc(n.title)}">🚩 گزارش</button>
      ${isAdmin ? `<button class="mbtn danger admin-del-news" data-id="${n.id}">حذف خبر</button>` : ''}
    </div>
  </div>`;
}

function renderNewsFeed(){
  try{ renderTrending(); }catch(e){}
  const wrap = document.getElementById('newsFeed');
  const items = visibleNews();
  wrap.innerHTML = items.length ? items.map(newsCardHtml).join('') : `<p class="dim">خبری پیدا نشد.</p>`;
  wrap.querySelectorAll('.news-card').forEach(card=>{
    card.addEventListener('click', (e)=>{
      if(e.target.closest('button')) return;
      openArticle(card.dataset.id);
    });
  });
  wrap.querySelectorAll('.like-btn').forEach(b=>b.addEventListener('click', e=>{e.stopPropagation(); toggleLike(b.dataset.id);}));
  wrap.querySelectorAll('.save-btn').forEach(b=>b.addEventListener('click', e=>{e.stopPropagation(); saveNews(b.dataset.id);}));
  wrap.querySelectorAll('.share-btn').forEach(b=>b.addEventListener('click', e=>{e.stopPropagation(); shareNews(b.dataset.id);}));
  wrap.querySelectorAll('.report-btn').forEach(b=>b.addEventListener('click', e=>{e.stopPropagation(); reportItem('news', b.dataset.id, b.dataset.title);}));
  wrap.querySelectorAll('.admin-del-news').forEach(b=>b.addEventListener('click', e=>{e.stopPropagation(); deleteNews(b.dataset.id); renderNewsFeed();}));
  renderPopular();
}
function renderPopular(){
  const wrap = document.getElementById('popularList');
  const top = [...State.news].sort((a,b)=>(b.likes||0)-(a.likes||0)).slice(0,5);
  wrap.innerHTML = top.map(n=>`<div class="manage-row" data-id="${n.id}" style="cursor:pointer"><span class="mtitle">${esc(n.title)}</span><span class="dim tiny">❤ ${n.likes||0}</span></div>`).join('') || '<p class="dim tiny">هنوز خبری نیست.</p>';
  wrap.querySelectorAll('.manage-row').forEach(r=>r.addEventListener('click', ()=>openArticle(r.dataset.id)));
}
function toggleLike(id){
  if(!currentUser){ openAuthModal(); return; }
  const news = State.news;
  const n = news.find(x=>x.id===id);
  if(!n) return;
  n.likedBy = n.likedBy || [];
  const idx = n.likedBy.indexOf(currentUser.contact);
  if(idx>=0){ n.likedBy.splice(idx,1); n.likes = Math.max(0,(n.likes||1)-1); }
  else { n.likedBy.push(currentUser.contact); n.likes = (n.likes||0)+1; }
  State.news = news;
  renderNewsFeed();
  if(currentArticleId===id) openArticle(id);
}
function saveNews(id){
  if(!currentUser){ openAuthModal(); return; }
  let s = State.savedNews;
  if(!s.includes(id)) s.push(id);
  State.savedNews = s;
  toast('خبر ذخیره شد. از پروفایل قابل مشاهده است.');
}
function shareNews(id){
  const url = location.href.split('#')[0] + '#article-' + id;
  if(navigator.share){ navigator.share({title:'GameHub', url}); }
  else { navigator.clipboard?.writeText(url); toast('لینک خبر کپی شد.'); }
}
function deleteNews(id){
  State.news = State.news.filter(n=>n.id!==id);
  const d = State.deletedTitles;
  const n = State.news.find(x=>x.id===id);
  State.deletedTitles = d;
  toast('خبر حذف شد و دیگر با رصد خودکار برنمی‌گردد.');
}

/* =========================================================
   جستجو و فیلتر برچسب
   ========================================================= */
document.getElementById('searchInput').addEventListener('input', e=>{ searchTerm = e.target.value.trim(); renderNewsFeed(); });
document.getElementById('tagFilter').addEventListener('click', e=>{
  const btn = e.target.closest('.tag'); if(!btn) return;
  document.querySelectorAll('#tagFilter .tag').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  activeTag = btn.dataset.tag;
  renderNewsFeed();
});
document.getElementById('scanNowBtn').addEventListener('click', ()=>{ runAutoScan(); toast('رصد انجام شد.'); });

/* =========================================================
   صفحه مقاله کامل
   ========================================================= */
function openArticle(id){
  const n = State.news.find(x=>x.id===id);
  if(!n) return;
  currentArticleId = id;
  const body = document.getElementById('articleBody');
  const cover = (n.imageUrl && !n.imageRemoved)
    ? `<img src="${esc(n.imageUrl)}" alt="" style="width:100%;border-radius:10px;margin-bottom:14px;height:220px;object-fit:cover;" onerror="imgFallbackThumb(this)" data-fallback-title="${esc(n.title.slice(0,50))}" data-fallback-style="${esc(coverStyle(n.title))};height:220px;font-size:22px;margin-bottom:14px;">`
    : coverHtml(n.title, n.tag, 'height:220px;margin-bottom:14px;');
  const fullText = expandNewsBody(n);
  const paragraphs = fullText.split(/\n+/).filter(Boolean).map(p=>{
    if(p.startsWith('•')) return `<li>${esc(p.replace(/^•\s*/,''))}</li>`;
    return `<p class="article-p">${esc(p)}</p>`;
  }).join('');
  // wrap consecutive li
  const htmlBody = paragraphs.replace(/(<li>.*?<\/li>)+/gs, m=>`<ul class="article-list">${m}</ul>`);
  body.innerHTML = `
    ${cover}
    <h1>${esc(n.title)}</h1>
    <p class="dim tiny">${esc(n.source||'تحریریه گیم‌هاب')} · ${new Date(n.ts).toLocaleString('fa-IR')} · <span class="badge">${esc(n.tag||'گیم')}</span> · زمان مطالعه حدود ${Math.max(1, Math.ceil(fullText.length/400))} دقیقه</p>
    <div class="article-content">${htmlBody}</div>
    <div class="side-card" style="margin-top:16px;">
      <p class="dim tiny">این گزارش توسط تحریریهٔ گیم‌هاب بر اساس منابع عمومی تنظیم شده و ممکن است با انتشار اطلاعات رسمی تکمیل شود.</p>
    </div>
    ${(n.source && n.source!=='تحریریه' && !State.hideSourceLinks) ? `<a class="article-source" href="${n.sourceUrl||'#'}" target="_blank" rel="noopener">منبع اصلی: ${esc(n.source)} ↗</a>` : ''}
  `;
  renderComments(id);
  showView('article');
}
function renderComments(id){
  const list = State.comments[id] || [];
  document.getElementById('commentCount').textContent = list.length;
  const wrap = document.getElementById('commentList');
  wrap.innerHTML = list.map(c=>`
    <div class="comment-item">
      <div class="comment-head">
        ${esc(c.name)} ${isVerified(c.contact, c.name) || c.verified ? tickSvg() : ''}
        <span class="dim tiny">· ${new Date(c.ts).toLocaleString('fa-IR')}</span>
        ${currentAdmin ? `<button class="comment-del" data-cid="${c.id}">حذف</button>` : `<button class="comment-del" data-report="${c.id}" data-ctext="${esc(c.text.slice(0,30))}">گزارش</button>`}
      </div>
      <div class="comment-text">${esc(c.text)}</div>
    </div>
  `).join('') || '<p class="dim tiny">هنوز دیدگاهی نیست. اولین نفر باش.</p>';
  wrap.querySelectorAll('.comment-del').forEach(b=>b.addEventListener('click', ()=>{
    const cs = State.comments;
    cs[id] = (cs[id]||[]).filter(c=>c.id!==b.dataset.cid);
    State.comments = cs;
    renderComments(id);
  }));

  const gate = document.getElementById('commentAuthGate');
  const form = document.getElementById('commentForm');
  if(State.commentsFrozen && !currentAdmin){
    gate.classList.remove('hidden');
    form.classList.add('hidden');
    gate.querySelector('p').textContent = 'دیدگاه‌های سایت فعلاً موقتاً بسته است.';
    return;
  }
  if(currentUser){ gate.classList.add('hidden'); form.classList.remove('hidden'); }
  else { gate.classList.remove('hidden'); form.classList.add('hidden'); }
}
/* صدای اعلان کوتاه — با Web Audio ساخته می‌شود، فایل خارجی نیست پس هرگز نمی‌شکند */
function playNotifySound(){
  if(State.settings.soundPref===false) return;
  try{
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 720;
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime+0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.25);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime+0.26);
  }catch(e){ /* بعضی مرورگرها بدون تعامل کاربر صدا را رد می‌کنند — بی‌خطر نادیده گرفته می‌شود */ }
}
function tickSvg(){
  return `<svg class="tick" viewBox="0 0 24 24"><path d="M12 2l2.4 2.2 3.2-.6 1 3.1 3.1 1-.6 3.2L23 14l-2.2 2.4.6 3.2-3.1 1-1 3.1-3.2-.6L12 26l-2.4-2.2-3.2.6-1-3.1-3.1-1 .6-3.2L1 14l2.2-2.4-.6-3.2 3.1-1 1-3.1 3.2.6z" fill="#3897f0"/><path d="M9.5 12.5l2 2 4-4.5" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
document.getElementById('commentForm').addEventListener('submit', e=>{
  e.preventDefault();
  if(!currentUser) return openAuthModal();
  if(State.commentsFrozen && !currentAdmin){ toast('دیدگاه‌های سایت فعلاً موقتاً بسته است.'); return; }
  if(isBanned(currentUser.contact)){ toast('حساب تو به‌دلیل نقض قوانین بن شده است.'); return; }
  if(rateLimited(currentUser.contact)){ toast('کمی صبر کن — حداکثر هر ۱۰ ثانیه یک دیدگاه.'); return; }
  const input = document.getElementById('commentInput');
  const text = input.value.trim();
  if(!text) return;
  if(containsProfanity(text)){
    banUser(currentUser.contact);
    toast('استفاده از الفاظ نامناسب — حساب تو بن شد.');
    input.value='';
    return;
  }
  if(State.moderationEnabled && !currentAdmin){
    const pending = State.pendingComments;
    pending.push({id:uid(), newsId:currentArticleId, name:currentUser.name, contact:currentUser.contact, text, ts:Date.now()});
    State.pendingComments = pending;
    input.value='';
    toast('دیدگاهت ثبت شد و منتظر تأیید مدیر است.');
    return;
  }
  const cs = State.comments;
  cs[currentArticleId] = cs[currentArticleId] || [];
  cs[currentArticleId].push({id:uid(), name: currentUser.name, contact: currentUser.contact, verified: isVerified(currentUser.contact, currentUser.name), text, ts: Date.now()});
  State.comments = cs;
  logPlayerActivity(`دیدگاه گذاشت: «${text.slice(0,40)}»`);
  input.value='';
  renderComments(currentArticleId);
});

/* =========================================================
   احراز هویت کاربران (ثبت‌نام ساده)
   ========================================================= */
function openAuthModal(){
  document.getElementById('authModal').classList.remove('hidden');
  document.getElementById('authInvite').classList.toggle('hidden', !State.signupLocked);
  setCaptcha();
}
document.querySelectorAll('[data-open-auth]').forEach(b=>b.addEventListener('click', openAuthModal));
document.getElementById('authClose').addEventListener('click', ()=>document.getElementById('authModal').classList.add('hidden'));

let captchaAnswer = 0;
function setCaptcha(){
  const a = Math.floor(Math.random()*8)+1, b = Math.floor(Math.random()*8)+1;
  captchaAnswer = a+b;
  document.getElementById('captchaQ').textContent = `${a} + ${b} = ؟`;
  document.getElementById('captchaA').value = '';
  document.getElementById('captchaCheck').checked = false;
}
document.getElementById('authForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const name = document.getElementById('authName').value.trim();
  const contact = document.getElementById('authContact').value.trim();
  const msg = document.getElementById('authMsg');
  const checked = document.getElementById('captchaCheck').checked;
  const answer = Number(document.getElementById('captchaA').value);
  if(!name || !contact){ msg.textContent = 'نام و ایمیل/شماره را وارد کن.'; return; }
  if(!checked || answer !== captchaAnswer){ msg.textContent = 'کپچا را درست کامل کن.'; return; }
  if(isBanned(contact)){ msg.textContent = 'این حساب بن شده است.'; return; }

  if(backendAvailable()) {
    try {
      const rr=await fetch('/api/auth/register',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,contact})});
      if(rr.ok){ const jj=await rr.json(); currentUser={...jj.user}; save('gh_current_user',currentUser); msg.textContent=''; document.getElementById('authModal').classList.add('hidden'); renderProfile(); renderChatTab(); renderExplore(); toast('حساب با موفقیت به سرور وصل شد.'); cloudPull(); return; }
    } catch(err){}
  }

  let users = State.users;
  let u = users.find(x=>x.contact===contact);
  const isNewUser = !u;
  if(isNewUser && State.signupLocked){
    const inviteCode = document.getElementById('authInvite').value.trim().toUpperCase();
    const codes = State.inviteCodes;
    const found = codes.find(c=>c.code===inviteCode);
    if(!found){ msg.textContent = 'ثبت‌نام قفل است — کد دعوت معتبر لازم داری.'; return; }
    if(found.used>=found.maxUses){ msg.textContent = 'این کد دعوت دیگر اعتبار ندارد.'; return; }
    found.used++;
    State.inviteCodes = codes;
  }
  if(!u){
    u = {name, contact, joinedAt: Date.now()};
    users.push(u);
    State.users = users;
  } else {
    u.name = name;
    State.users = users;
  }
  currentUser = u;
  save('gh_current_user', currentUser);
  document.getElementById('authModal').classList.add('hidden');
  toast(`خوش آمدی ${name}${name===OWNER_DISPLAY?' 👑':''}`);
  if(isNewUser && State.welcomeDmEnabled){
    const key = dmKey(contact, ADMIN_CONTACT);
    const dms = State.dms;
    dms[key] = dms[key] || [];
    dms[key].push({id:uid(), from:ADMIN_CONTACT, text: State.welcomeDmText, ts:Date.now()});
    State.dms = dms;
  }
  renderComments(currentArticleId);
  renderProfile();
  renderChatTab();
  updateNotifBadge();
});

/* =========================================================
   پنل ادمین — ورود
   ========================================================= */
let currentAdmin = load('gh_admin_session', null);
if(currentAdmin && currentAdmin.sessionToken && currentAdmin.sessionToken !== State.securityToken){
  currentAdmin = null;
  localStorage.removeItem('gh_admin_session');
}

document.getElementById('adminLoginForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const msg = document.getElementById('adminLoginMsg');
  if(Date.now() < lockUntilTs){
    const secs = Math.ceil((lockUntilTs - Date.now())/1000);
    msg.textContent = `به‌دلیل ورود غلط زیاد، پنل ${secs} ثانیه قفل است.`;
    return;
  }
  const u = document.getElementById('adminUser').value.trim();
  const p = document.getElementById('adminPass').value;
  if(backendAvailable()) {
    try { const rr=await fetch('/api/auth/admin-login',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); if(rr.ok){ const jj=await rr.json(); currentAdmin={username:u,display:OWNER_DISPLAY,role:jj.role,serverSession:true,perms:['publish','delete','message','ban','power','security','schedule','branding','backup','reports']}; save('gh_admin_session',currentAdmin); msg.textContent=''; renderAdmin(); applyMaintenanceGate(); toast('ورود امن سروری انجام شد.'); return; } } catch(err){}
  }
  const found = State.admins.find(a=>a.username===u && a.hash===simpleHash(p));
  if(!found){
    failCount++; save('gh_admin_failcount', failCount);
    recordLogin(u || '(خالی)', false, failCount>=3);
    if(failCount>=5){
      lockUntilTs = Date.now()+60000;
      save('gh_admin_lock', lockUntilTs);
      failCount = 0; save('gh_admin_failcount', 0);
      msg.textContent = 'پنل به‌مدت ۱ دقیقه قفل شد.';
    } else {
      msg.textContent = `نام کاربری یا رمز اشتباه است. (${5-failCount} تلاش باقی‌مانده)`;
    }
    return;
  }
  if(found.active===false){
    msg.textContent = 'این حساب ادمین غیرفعال شده است.';
    recordLogin(found.username, false, false);
    return;
  }
  if(found.expiresAt && Date.now() > found.expiresAt){
    msg.textContent = 'دسترسی این حساب منقضی شده است.';
    recordLogin(found.username, false, false);
    return;
  }
  failCount = 0; save('gh_admin_failcount', 0);
  currentAdmin = {...found, sessionToken: State.securityToken};
  save('gh_admin_session', currentAdmin);
  msg.textContent = '';
  recordLogin(found.username, true, false);
  renderAdmin();
  applyMaintenanceGate();
});
function recordLogin(who, success, suspicious){
  const h = State.loginHistory;
  h.unshift({who, success, suspicious: !!suspicious, ts:Date.now(), ua: navigator.userAgent.slice(0,80)});
  State.loginHistory = h.slice(0,100);
}
document.getElementById('adminLogoutBtn').addEventListener('click', ()=>{
  currentAdmin = null;
  localStorage.removeItem('gh_admin_session');
  renderAdmin();
  applyMaintenanceGate();
});

function renderAdmin(){
  const loginBox = document.getElementById('adminLoginBox');
  const panel = document.getElementById('adminPanel');
  if(!currentAdmin){
    loginBox.classList.remove('hidden');
    panel.classList.add('hidden');
    return;
  }
  loginBox.classList.add('hidden');
  panel.classList.remove('hidden');
  document.getElementById('adminWho').textContent = `${currentAdmin.display||currentAdmin.username} (${currentAdmin.role==='owner'?'مالک':'ادمین'})`;
  document.getElementById('adminsTabBtn').style.display = currentAdmin.role==='owner' ? '' : 'none';
  document.getElementById('ownerNotesTabBtn').style.display = currentAdmin.role==='owner' ? '' : 'none';
  applyPermissionGates();
  renderManageList();
  renderMembers();
  renderBanList();
  renderAdminList();
  renderSiteInfo();
  renderNewsFeed();
  renderActivityLog();
  renderReports();
  renderScheduleList();
  renderAnalytics();
  renderPowerTools();
  renderSecurity();
  renderAdminInbox();
  applyBranding();
  renderScheduledBroadcasts();
  renderGamesLeaderboardMgmt();
  renderRobloxSectionsList();
  renderRobloxNewsMgmt();
  renderShortsMgmt();
  renderExploreMgmt();
  renderInviteList();
  renderActivePollAdmin();
  renderBugReports();
  renderNewsSuggestList();
  renderAboutUsMsgsAdmin();
  renderDashboard();
  renderAdminRoom();
  try{ renderNewAdminPanes(); }catch(e){}
  try{ renderExtraAdminPanes(); }catch(e){}
  const notesEl = document.getElementById('ownerNotesText');
  if(notesEl && document.activeElement!==notesEl) notesEl.value = State.ownerNotes;
  const aboutEl = document.getElementById('aboutUsText');
  if(aboutEl && document.activeElement!==aboutEl) aboutEl.value = State.aboutUsText;
  const wdmText = document.getElementById('welcomeDmText');
  if(wdmText && !wdmText.value) wdmText.value = State.welcomeDmText;
  const homeLimitInput = document.getElementById('homeFeedLimitInput');
  if(homeLimitInput) homeLimitInput.value = State.homeFeedLimit || '';
}

/* --- صندوق پیام‌های ورودی پشتیبانی (پیام‌های کاربران به ادمین) --- */
function renderAdminInbox(){
  const wrap = document.getElementById('adminInboxList');
  if(!wrap) return;
  const rows = [];
  Object.entries(State.dms).forEach(([key, thread])=>{
    if(!key.includes(ADMIN_CONTACT)) return;
    const userContact = key.split('::').find(p=>p!==ADMIN_CONTACT);
    const fromUser = thread.filter(m=>m.from!==ADMIN_CONTACT);
    if(!fromUser.length) return;
    const last = fromUser[fromUser.length-1];
    rows.push({userContact, text:last.text, ts:last.ts});
  });
  rows.sort((a,b)=>b.ts-a.ts);
  wrap.innerHTML = rows.map(r=>`
    <div class="manage-row" data-reply="${esc(r.userContact)}" style="cursor:pointer;">
      <span class="mtitle">${esc(r.userContact)}: ${esc(r.text.slice(0,60))}</span>
      <span class="dim tiny">${new Date(r.ts).toLocaleString('fa-IR')}</span>
    </div>
  `).join('') || '<p class="dim tiny">پیامی از کاربران دریافت نشده.</p>';
  wrap.querySelectorAll('[data-reply]').forEach(el=>el.addEventListener('click', ()=>{
    document.getElementById('dmTarget').value = el.dataset.reply;
    document.getElementById('dmInput').focus();
  }));
}

/* --- گیت دسترسی بر اساس مجوزهای ادمین --- */
function hasPerm(perm){
  if(!currentAdmin) return false;
  if(currentAdmin.role==='owner') return true;
  return (currentAdmin.perms||[]).includes(perm);
}
function applyPermissionGates(){
  document.querySelector('[data-atab="publish"]').style.display = hasPerm('publish') ? '' : 'none';
  document.querySelector('[data-atab="manage"]').style.display = hasPerm('delete') ? '' : 'none';
  document.querySelector('[data-atab="messages"]').style.display = hasPerm('message') ? '' : 'none';
  document.querySelector('[data-atab="bans"]').style.display = hasPerm('ban') ? '' : 'none';
  document.querySelector('[data-atab="power"]').style.display = hasPerm('power') ? '' : 'none';
  document.querySelector('[data-atab="security"]').style.display = hasPerm('security') ? '' : 'none';
  document.querySelector('[data-atab="schedule"]').style.display = hasPerm('schedule') ? '' : 'none';
  document.querySelector('[data-atab="branding"]').style.display = hasPerm('branding') ? '' : 'none';
  document.querySelector('[data-atab="backup"]').style.display = hasPerm('backup') ? '' : 'none';
  document.querySelector('[data-atab="reports"]').style.display = hasPerm('reports') ? '' : 'none';
  document.querySelector('[data-atab="analytics"]').style.display = hasPerm('reports') ? '' : 'none';
}

/* --- تب‌های ادمین --- */
document.querySelectorAll('.atab').forEach(tab=>{
  tab.addEventListener('click', ()=>{
    document.querySelectorAll('.atab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.apane').forEach(p=>p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('apane-'+tab.dataset.atab).classList.add('active');
  });
});

/* --- انتشار خبر --- */
/* --- طراح ساده کاور خبر (canvas) --- */
const COVER_PALETTES = [['#7c5cff','#3a2f8f'],['#d4a72c','#8a5c12'],['#4cc38a','#1f6b48'],['#e0546a','#7a1f30'],['#2f8fd4','#123a52']];
let coverState = {colorIdx:0, icon:'controller'};
const coverIconImageCache = {};
function getCoverIconImage(key, cb){
  if(coverIconImageCache[key]){ cb(coverIconImageCache[key]); return; }
  const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${SVG_ICONS[key]||SVG_ICONS.controller}</svg>`;
  const img = new Image();
  img.onload = ()=>{ coverIconImageCache[key] = img; cb(img); };
  img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr.replace(/currentColor/g,'#ffffff'))));
}
function drawCoverPreview(){
  const canvas = document.getElementById('coverCanvas');
  const ctx = canvas.getContext('2d');
  const [c1,c2] = COVER_PALETTES[coverState.colorIdx];
  const grad = ctx.createLinearGradient(0,0,canvas.width,canvas.height);
  grad.addColorStop(0,c1); grad.addColorStop(1,c2);
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,canvas.width,canvas.height);
  const title = (document.getElementById('pubTitle').value.trim() || 'عنوان خبر').slice(0,50);
  getCoverIconImage(coverState.icon, img=>{
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img, canvas.width/2-45, 45, 90, 90);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px Vazirmatn, sans-serif';
    wrapCanvasText(ctx, title, canvas.width/2, 175, 420, 32);
  });
  document.getElementById('coverPreview').style.cssText = `background:linear-gradient(135deg,${c1},${c2});display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:var(--font-display);gap:6px;padding:10px;text-align:center;`;
  document.getElementById('coverPreview').innerHTML = `<div style="width:34px;height:34px;">${svgIcon(coverState.icon)}</div><div style="font-size:14px;">${esc(title)}</div>`;
}
function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight){
  const words = text.split(' ');
  let line = '', lines = [];
  words.forEach(w=>{
    const test = line + w + ' ';
    if(ctx.measureText(test).width > maxWidth && line){ lines.push(line); line = w + ' '; }
    else line = test;
  });
  lines.push(line);
  lines.slice(0,2).forEach((l,i)=>ctx.fillText(l.trim(), x, y + i*lineHeight));
}
document.getElementById('coverColorPicker').addEventListener('click', e=>{
  const btn = e.target.closest('[data-cc]'); if(!btn) return;
  coverState.colorIdx = Number(btn.dataset.cc);
  document.querySelectorAll('#coverColorPicker .opt-btn').forEach(b=>b.classList.toggle('active', b===btn));
  drawCoverPreview();
});
document.querySelectorAll('#coverEmojiPicker button[data-ce]').forEach(b=>{ b.innerHTML = svgIcon(b.dataset.ce); });
document.getElementById('coverEmojiPicker').addEventListener('click', e=>{
  const btn = e.target.closest('[data-ce]'); if(!btn) return;
  coverState.icon = btn.dataset.ce;
  document.querySelectorAll('#coverEmojiPicker button').forEach(b=>b.classList.toggle('active', b===btn));
  drawCoverPreview();
});
document.getElementById('pubTitle').addEventListener('input', drawCoverPreview);
document.getElementById('generateCoverBtn').addEventListener('click', ()=>{
  getCoverIconImage(coverState.icon, ()=>{
    drawCoverPreview();
    setTimeout(()=>{
      const canvas = document.getElementById('coverCanvas');
      document.getElementById('pubImage').value = canvas.toDataURL('image/png');
      toast('کاور ساخته شد و تو فیلد عکس گذاشته شد. حالا خبر رو منتشر کن.');
    }, 30);
  });
});
drawCoverPreview();

document.getElementById('publishForm').addEventListener('submit', e=>{
  e.preventDefault();
  if(!hasPerm('publish')){ toast('دسترسی انتشار خبر نداری.'); return; }
  const title = document.getElementById('pubTitle').value.trim();
  const tag = document.getElementById('pubTag').value.trim() || 'تحریریه';
  const body = document.getElementById('pubBody').value.trim();
  const imageUrl = document.getElementById('pubImage').value.trim();
  if(!title || !body) return;
  const news = State.news;
  news.unshift({id:uid(), title, tag, body, imageUrl: imageUrl || null, source:'تحریریه', sourceUrl:'#', ts:Date.now(), likes:0, likedBy:[], imageRemoved:false, textRemoved:false, auto:false});
  State.news = news;
  e.target.reset();
  document.getElementById('pubTag').value = 'تحریریه';
  toast('خبر منتشر شد.');
  logActivity(`خبر «${title}» منتشر شد.`);
  renderManageList();
  renderAnalytics();
});

/* --- مدیریت اخبار (ویرایش درجا + آرشیو به‌جای حذف قطعی) --- */
let manageSearchTerm = '';
function renderManageList(){
  const wrap = document.getElementById('manageList');
  const list = State.news.filter(n=>!manageSearchTerm || n.title.includes(manageSearchTerm));
  wrap.innerHTML = list.map(n=>`
    <div class="manage-row" data-row="${n.id}">
      <span class="mtitle">${esc(n.title)} <span class="dim tiny">(${esc(n.tag)} · ${readingTime(n.body)} دقیقه مطالعه · ${(n.body||'').split(/\s+/).length} کلمه)</span></span>
      <div class="mbtns">
        <button class="mbtn" data-act="edit" data-id="${n.id}">ویرایش</button>
        <button class="mbtn" data-act="copy" data-id="${n.id}">کپی متن</button>
        <button class="mbtn" data-act="img" data-id="${n.id}">حذف عکس</button>
        <button class="mbtn" data-act="text" data-id="${n.id}">حذف متن</button>
        <button class="mbtn" data-act="archive" data-id="${n.id}">آرشیو</button>
        <button class="mbtn danger" data-act="all" data-id="${n.id}">حذف کامل</button>
      </div>
    </div>
  `).join('') || '<p class="dim tiny">خبری موجود نیست.</p>';
  wrap.querySelectorAll('.mbtn').forEach(b=>b.addEventListener('click', ()=>{
    const id = b.dataset.id, act = b.dataset.act;
    if(act==='copy'){
      const n = State.news.find(x=>x.id===id);
      if(n) navigator.clipboard?.writeText(`${n.title}\n\n${n.body}`);
      toast('متن کامل خبر کپی شد.');
      return;
    }
    if(!hasPerm('delete')){ toast('دسترسی مدیریت خبر نداری.'); return; }
    let news = State.news;
    const target = news.find(x=>x.id===id);
    const tTitle = target ? target.title : '';
    if(act==='edit'){ openEditNews(id); return; }
    if(act==='all'){ news = news.filter(n=>n.id!==id); toast('خبر حذف شد.'); logActivity(`خبر «${tTitle}» حذف شد.`); }
    if(act==='img'){ if(target) target.imageRemoved=true; toast('عکس حذف شد.'); logActivity(`عکس خبر «${tTitle}» حذف شد.`); }
    if(act==='text'){ if(target) target.textRemoved=true; toast('متن حذف شد.'); logActivity(`متن خبر «${tTitle}» حذف شد.`); }
    if(act==='archive'){
      if(target){
        const arch = State.newsArchive; arch.unshift(target); State.newsArchive = arch.slice(0,200);
        news = news.filter(n=>n.id!==id);
      }
      toast('خبر آرشیو شد.'); logActivity(`خبر «${tTitle}» آرشیو شد.`);
    }
    State.news = news;
    renderManageList();
    renderNewsFeed();
    renderAnalytics();
    renderArchiveList();
  }));
}
document.getElementById('manageSearchInput').addEventListener('input', e=>{
  manageSearchTerm = e.target.value.trim();
  renderManageList();
});
function readingTime(text){ return Math.max(1, Math.round((text||'').split(/\s+/).length / 130)); }
function openEditNews(id){
  const n = State.news.find(x=>x.id===id);
  if(!n) return;
  const row = document.querySelector(`[data-row="${id}"]`);
  if(!row) return;
  row.outerHTML = `<div class="manage-row" style="flex-direction:column;align-items:stretch;gap:6px;" data-editrow="${id}">
    <input type="text" class="edit-title" value="${esc(n.title)}">
    <textarea class="edit-body" rows="4">${esc(n.body||'')}</textarea>
    <div class="mbtns">
      <button class="mbtn success" data-save="${id}">ذخیره</button>
      <button class="mbtn" data-cancel="${id}">انصراف</button>
    </div>
  </div>`;
  document.querySelector(`[data-save="${id}"]`).addEventListener('click', ()=>{
    const rowEl = document.querySelector(`[data-editrow="${id}"]`);
    const newTitle = rowEl.querySelector('.edit-title').value.trim();
    const newBody = rowEl.querySelector('.edit-body').value.trim();
    if(!newTitle || !newBody){ toast('عنوان و متن نباید خالی باشند.'); return; }
    const news = State.news;
    const target = news.find(x=>x.id===id);
    if(target){ target.title = newTitle; target.body = newBody; }
    State.news = news;
    logActivity(`خبر «${newTitle}» ویرایش شد.`);
    renderManageList(); renderNewsFeed();
    toast('خبر ویرایش شد.');
  });
  document.querySelector(`[data-cancel="${id}"]`).addEventListener('click', renderManageList);
}
function renderArchiveList(){
  const wrap = document.getElementById('archiveList');
  if(!wrap) return;
  wrap.innerHTML = State.newsArchive.map(n=>`
    <div class="manage-row"><span class="mtitle">${esc(n.title)}</span>
    <button class="mbtn success" data-restore="${n.id}">بازیابی</button></div>
  `).join('') || '<p class="dim tiny">آرشیو خالی است.</p>';
  wrap.querySelectorAll('[data-restore]').forEach(b=>b.addEventListener('click', ()=>{
    if(!hasPerm('delete')){ toast('دسترسی نداری.'); return; }
    const arch = State.newsArchive;
    const item = arch.find(x=>x.id===b.dataset.restore);
    if(!item) return;
    State.newsArchive = arch.filter(x=>x.id!==item.id);
    const news = State.news; news.unshift(item); State.news = news;
    renderArchiveList(); renderManageList(); renderNewsFeed();
    logActivity(`خبر «${item.title}» از آرشیو بازیابی شد.`);
    toast('خبر بازیابی شد.');
  }));
}

/* --- اعضا و آمار --- */
function getMemberRole(contact){
  const roles = State.memberRoles || {};
  return roles[contact] || { badges:[], staff:false, perms:[] };
}
function setMemberRole(contact, data){
  const roles = { ...(State.memberRoles||{}) };
  roles[contact] = data;
  State.memberRoles = roles;
}
function roleBadgesHtml(contact, name){
  if(name===OWNER_DISPLAY) return `<span class="role-badge tick" title="Verified">✓</span><span class="role-badge admin">مالک</span>`;
  const r = getMemberRole(contact);
  let h='';
  if(r.badges?.includes('tick') || (State.verifiedUsers||[]).includes(contact)) h+=`<span class="role-badge tick" title="Verified">✓</span>`;
  if(r.badges?.includes('vip')) h+=`<span class="role-badge vip">VIP</span>`;
  if(r.badges?.includes('creator')) h+=`<span class="role-badge creator">Creator</span>`;
  if(r.badges?.includes('mod')) h+=`<span class="role-badge mod">Mod</span>`;
  if(r.badges?.includes('legend')) h+=`<span class="role-badge legend">★</span>`;
  if(r.badges?.includes('early')) h+=`<span class="role-badge early">Early</span>`;
  if(r.staff) h+=`<span class="role-badge admin">Admin</span>`;
  return h;
}
function renderMembers(){
  const sm=document.getElementById('statMembers');
  if(sm) sm.textContent = State.users.length;
  const allComments = Object.values(State.comments||{}).flat();
  const sc=document.getElementById('statComments'); if(sc) sc.textContent = allComments.length;
  const sn=document.getElementById('statNews'); if(sn) sn.textContent = State.news.length;
  const weekAgo = Date.now() - 7*24*60*60*1000;
  const activeContacts = new Set();
  (State.users||[]).forEach(u=>{ if((u.joinedAt||0)>=weekAgo) activeContacts.add(u.contact); });
  allComments.forEach(c=>{ if(c.ts>=weekAgo && c.contact) activeContacts.add(c.contact); });
  const so=document.getElementById('statOnline'); if(so) so.textContent = activeContacts.size;
  const wrap = document.getElementById('memberList');
  if(!wrap) return;
  const PERM_OPTS = [
    ['publish','انتشار خبر'],['delete','حذف'],['message','پیام'],['ban','بن'],
    ['power','ابزار پیشرفته'],['security','امنیت'],['schedule','زمان‌بندی'],
    ['branding','برندینگ'],['backup','پشتیبان'],['reports','گزارش‌ها']
  ];
  wrap.innerHTML = (State.users||[]).map(u=>{
    const r = getMemberRole(u.contact);
    const badges = r.badges || [];
    const perms = r.perms || [];
    return `<div class="member-card-admin" data-contact="${esc(u.contact)}">
      <div class="manage-row" style="border:none;padding:0;margin:0">
        <span class="mtitle">${esc(u.name)} ${roleBadgesHtml(u.contact,u.name)}
          <span class="dim tiny">— ${esc(u.contact)}</span></span>
        <span class="dim tiny">${new Date(u.joinedAt||Date.now()).toLocaleDateString('fa-IR')}</span>
      </div>
      <div class="member-roles-row">
        <label class="dim tiny"><input type="checkbox" data-badge="tick" ${badges.includes('tick')||(State.verifiedUsers||[]).includes(u.contact)?'checked':''}> تیک آبی ✓</label>
        <label class="dim tiny"><input type="checkbox" data-badge="vip" ${badges.includes('vip')?'checked':''}> VIP 👑</label>
        <label class="dim tiny"><input type="checkbox" data-badge="creator" ${badges.includes('creator')?'checked':''}> کانتنت کریتور 🎬</label>
        <label class="dim tiny"><input type="checkbox" data-badge="mod" ${badges.includes('mod')?'checked':''}> ناظر 🛡️</label>
        <label class="dim tiny"><input type="checkbox" data-badge="legend" ${badges.includes('legend')?'checked':''}> لجند ⭐</label>
        <label class="dim tiny"><input type="checkbox" data-badge="early" ${badges.includes('early')?'checked':''}> Early Supporter</label>
        <label class="dim tiny"><input type="checkbox" data-staff ${r.staff?'checked':''}> نقش ادمین (دسترسی‌ها)</label>
      </div>
      <div class="member-roles-row perms-box" style="${r.staff?'':'display:none'}">
        ${PERM_OPTS.map(([k,lab])=>`<label class="dim tiny"><input type="checkbox" data-perm="${k}" ${perms.includes(k)?'checked':''}> ${lab}</label>`).join('')}
      </div>
      <button type="button" class="btn-accent" style="margin-top:8px;font-size:12px;padding:6px 12px" data-save-member-role="${esc(u.contact)}">ذخیره نقش</button>
    </div>`;
  }).join('') || '<p class="dim tiny">هنوز عضوی ثبت‌نام نکرده.</p>';

  wrap.querySelectorAll('[data-staff]').forEach(cb=>{
    cb.addEventListener('change', ()=>{
      const card = cb.closest('.member-card-admin');
      const box = card?.querySelector('.perms-box');
      if(box) box.style.display = cb.checked ? '' : 'none';
    });
  });
  wrap.querySelectorAll('[data-save-member-role]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const contact = btn.dataset.saveMemberRole;
      const card = btn.closest('.member-card-admin');
      if(!card) return;
      const badges = [];
      card.querySelectorAll('[data-badge]').forEach(c=>{ if(c.checked) badges.push(c.dataset.badge); });
      const staff = !!card.querySelector('[data-staff]')?.checked;
      const perms = [];
      card.querySelectorAll('[data-perm]').forEach(c=>{ if(c.checked) perms.push(c.dataset.perm); });
      setMemberRole(contact, { badges, staff, perms });
      // sync verified list for tick
      let ver = [...(State.verifiedUsers||[])];
      if(badges.includes('tick')){ if(!ver.includes(contact)) ver.push(contact); }
      else ver = ver.filter(x=>x!==contact);
      State.verifiedUsers = ver;
      // if staff, optionally add to admins list as non-owner with perms
      if(staff){
        let admins = State.admins.filter(a=>a.username!==contact && a.role!=='owner');
        // store staff by contact as pseudo admin entry
        const existing = State.admins.find(a=>a.contact===contact || a.username===contact);
        if(!existing){
          State.admins = [...State.admins, { username: contact, contact, display: (State.users.find(u=>u.contact===contact)||{}).name||contact, role:'admin', perms, hash:'' }];
        } else {
          State.admins = State.admins.map(a=>{
            if(a.contact===contact || a.username===contact) return {...a, perms, role:'admin'};
            return a;
          });
        }
      }
      renderMembers();
      toast('نقش «'+(State.users.find(u=>u.contact===contact)?.name||contact)+'» ذخیره شد');
      logActivity('نقش عضو به‌روز شد: '+contact);
      scheduleCloudPush();
    });
  });
}
function downloadCsv(filename, rows){
  const csv = rows.map(r=>r.map(cell=>`"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
document.getElementById('exportMembersCsv').addEventListener('click', ()=>{
  const rows = [['نام','تماس','تاریخ عضویت','تیک آبی']];
  State.users.forEach(u=>rows.push([u.name, u.contact, new Date(u.joinedAt).toLocaleDateString('fa-IR'), isVerified(u.contact,u.name)?'بله':'خیر']));
  downloadCsv('gamehub-members.csv', rows);
  logActivity('خروجی CSV اعضا گرفته شد.');
});
document.getElementById('exportNewsCsv').addEventListener('click', ()=>{
  const rows = [['عنوان','برچسب','منبع','تاریخ','لایک']];
  State.news.forEach(n=>rows.push([n.title, n.tag, n.source, new Date(n.ts).toLocaleDateString('fa-IR'), n.likes||0]));
  downloadCsv('gamehub-news.csv', rows);
  logActivity('خروجی CSV اخبار گرفته شد.');
});

/* --- پیام‌رسانی --- */
document.getElementById('broadcastForm').addEventListener('submit', e=>{
  e.preventDefault();
  if(!hasPerm('message')){ toast('دسترسی پیام‌رسانی نداری.'); return; }
  const text = document.getElementById('broadcastInput').value.trim();
  if(!text) return;
  const log = State.broadcastLog;
  const item = {id:uid(), text, ts:Date.now()};
  log.push(item);
  State.broadcastLog = log;
  save('gh_broadcast_last_shown', null);
  showBroadcast(item);
  e.target.reset();
  toast('پیام برای همه ارسال شد.');
  logActivity(`پیام همگانی ارسال شد: «${text.slice(0,40)}»`);
});
document.getElementById('dmForm').addEventListener('submit', e=>{
  e.preventDefault();
  if(!hasPerm('message')){ toast('دسترسی پیام‌رسانی نداری.'); return; }
  const target = document.getElementById('dmTarget').value.trim();
  const text = document.getElementById('dmInput').value.trim();
  if(!target || !text) return;
  const key = dmKey(target, ADMIN_CONTACT);
  const dms = State.dms;
  dms[key] = dms[key] || [];
  dms[key].push({id:uid(), from:ADMIN_CONTACT, text, ts:Date.now()});
  State.dms = dms;
  e.target.reset();
  toast('پیام خصوصی ارسال شد — کاربر آن را زیر «پشتیبانی سایت» در بخش چت می‌بیند.');
  logActivity(`پیام خصوصی برای «${target}» ارسال شد.`);
});
function showBroadcast(item){
  if(State.settings.broadcastPref===false) return;
  document.getElementById('broadcastText').textContent = item.text;
  document.getElementById('broadcast').classList.remove('hidden');
  playNotifySound();
}
document.getElementById('broadcastClose').addEventListener('click', ()=>{
  document.getElementById('broadcast').classList.add('hidden');
  const last = State.broadcastLog.slice(-1)[0];
  if(last) save('gh_broadcast_last_shown', last.id);
});

/* --- بن‌شده‌ها --- */
function renderBanList(){
  const wrap = document.getElementById('banList');
  wrap.innerHTML = State.banned.map(b=>`
    <div class="manage-row"><span class="mtitle">${esc(b)}</span>
    <button class="mbtn success" data-b="${esc(b)}">رفع بن</button></div>
  `).join('') || '<p class="dim tiny">کسی بن نیست.</p>';
  wrap.querySelectorAll('.mbtn').forEach(btn=>btn.addEventListener('click', ()=>{
    if(!hasPerm('ban')){ toast('دسترسی بن/رفع‌بن نداری.'); return; }
    State.banned = State.banned.filter(x=>x!==btn.dataset.b);
    renderBanList();
    toast('بن برداشته شد.');
    logActivity(`بن کاربر «${btn.dataset.b}» برداشته شد.`);
  }));
}

/* --- مدیریت ادمین‌ها (فقط مالک) --- */
document.getElementById('addAdminForm').addEventListener('submit', e=>{
  e.preventDefault();
  if(currentAdmin.role!=='owner'){ toast('فقط مالک می‌تواند ادمین بسازد.'); return; }
  const name = document.getElementById('newAdminName').value.trim();
  const pass = document.getElementById('newAdminPass').value;
  const label = document.getElementById('newAdminLabel').value.trim();
  const note = document.getElementById('newAdminNote').value.trim();
  const expiryStr = document.getElementById('newAdminExpiry').value;
  const expiresAt = expiryStr ? new Date(expiryStr+'T23:59:59').getTime() : null;
  if(!name || pass.length<8){ toast('رمز باید حداقل ۸ کاراکتر باشد.'); return; }
  const admins = State.admins;
  if(admins.some(a=>a.username===name)){ toast('این نام قبلاً استفاده شده.'); return; }
  const perms = Array.from(document.querySelectorAll('.permChk:checked')).map(c=>c.value);
  admins.push({username:name, hash:simpleHash(pass), role:'admin', display:name, label, note, expiresAt, active:true, perms, createdAt:Date.now()});
  State.admins = admins;
  e.target.reset();
  renderAdminList();
  toast('ادمین جدید اضافه شد.');
  logActivity(`ادمین جدید «${name}»${label?` (${label})`:''} با دسترسی‌های [${perms.join('، ')||'هیچ'}] ساخته شد.`);
});
function renderAdminList(){
  const wrap = document.getElementById('adminList');
  wrap.innerHTML = State.admins.map(a=>{
    const expired = a.expiresAt && Date.now() > a.expiresAt;
    const status = a.role==='owner' ? '' : (a.active===false ? ' — غیرفعال ⏸️' : (expired ? ' — منقضی‌شده ⌛' : ''));
    return `<div class="manage-row">
      <span class="mtitle">${esc(a.display||a.username)} — ${a.role==='owner'?'مالک 👑':'ادمین'}${a.label?` (${esc(a.label)})`:''}${status}
        ${a.expiresAt ? `<span class="dim tiny"> · تا ${new Date(a.expiresAt).toLocaleDateString('fa-IR')}</span>` : ''}
        ${a.note ? `<span class="dim tiny"> · یادداشت: ${esc(a.note)}</span>` : ''}
      </span>
      ${a.role!=='owner' && currentAdmin.role==='owner' ? `
        <div class="mbtns">
          <button class="mbtn ${a.active===false?'success':''}" data-toggle="${esc(a.username)}">${a.active===false?'فعال‌سازی':'غیرفعال‌سازی'}</button>
          <button class="mbtn danger" data-del="${esc(a.username)}">حذف</button>
        </div>` : ''}
    </div>`;
  }).join('');
  wrap.querySelectorAll('[data-del]').forEach(btn=>btn.addEventListener('click', ()=>{
    if(!confirm(`ادمین «${btn.dataset.del}» حذف شود؟`)) return;
    State.admins = State.admins.filter(a=>a.username!==btn.dataset.del);
    renderAdminList();
    toast('ادمین حذف شد.');
    logActivity(`ادمین «${btn.dataset.del}» حذف شد.`);
  }));
  wrap.querySelectorAll('[data-toggle]').forEach(btn=>btn.addEventListener('click', ()=>{
    const admins = State.admins;
    const a = admins.find(x=>x.username===btn.dataset.toggle);
    if(a){ a.active = a.active===false ? true : false; }
    State.admins = admins;
    renderAdminList();
    logActivity(`ادمین «${btn.dataset.toggle}» ${a.active===false?'غیرفعال':'فعال'} شد.`);
    toast('وضعیت ادمین تغییر کرد.');
  }));
}

/* =========================================================
   ابزارهای پیشرفته پنل — جستجوی کلی، تیک آبی، سنجاق، قفل دیدگاه، عملیات دسته‌جمعی
   ========================================================= */
function renderPowerTools(){
  renderVerifyList();
  renderPinList();
  renderStorageMeter();
  const freezeStat = document.getElementById('statCommentsFrozen');
  if(freezeStat) freezeStat.textContent = State.commentsFrozen ? 'بسته 🔒' : 'باز';
}
document.getElementById('powerSearch').addEventListener('input', e=>{
  const term = e.target.value.trim();
  const wrap = document.getElementById('powerSearchResults');
  if(!term){ wrap.innerHTML=''; return; }
  const newsMatches = State.news.filter(n=>n.title.includes(term)||(n.body||'').includes(term)).slice(0,6);
  const userMatches = State.users.filter(u=>u.name.includes(term)||u.contact.includes(term)).slice(0,6);
  let commentMatches = [];
  Object.entries(State.comments).forEach(([newsId, list])=>{
    list.forEach(c=>{ if(c.text.includes(term)) commentMatches.push({newsId, ...c}); });
  });
  commentMatches = commentMatches.slice(0,6);
  wrap.innerHTML = `
    ${newsMatches.length ? '<p class="dim tiny">📰 اخبار</p>' + newsMatches.map(n=>`<div class="manage-row" data-goto-news="${n.id}" style="cursor:pointer"><span class="mtitle">${esc(n.title)}</span></div>`).join('') : ''}
    ${userMatches.length ? '<p class="dim tiny">👤 اعضا</p>' + userMatches.map(u=>`<div class="manage-row"><span class="mtitle">${esc(u.name)} — ${esc(u.contact)}</span></div>`).join('') : ''}
    ${commentMatches.length ? '<p class="dim tiny">💬 دیدگاه‌ها</p>' + commentMatches.map(c=>`<div class="manage-row"><span class="mtitle">${esc(c.name)}: ${esc(c.text.slice(0,50))}</span></div>`).join('') : ''}
    ${!newsMatches.length && !userMatches.length && !commentMatches.length ? '<p class="dim tiny">چیزی پیدا نشد.</p>' : ''}
  `;
  wrap.querySelectorAll('[data-goto-news]').forEach(el=>el.addEventListener('click', ()=>openArticle(el.dataset.gotoNews)));
});

function renderVerifyList(){
  const wrap = document.getElementById('verifyList');
  if(!wrap) return;
  wrap.innerHTML = State.users.map(u=>{
    const v = isVerified(u.contact, u.name);
    return `<div class="manage-row">
      <span class="mtitle">${esc(u.name)} ${v?tickSvg():''} <span class="dim tiny">— ${esc(u.contact)}</span></span>
      ${u.name===OWNER_DISPLAY ? '<span class="dim tiny">مالک (همیشه تأیید)</span>' : `<button class="mbtn ${v?'danger':'success'}" data-c="${esc(u.contact)}">${v?'حذف تیک':'اعطای تیک'}</button>`}
    </div>`;
  }).join('') || '<p class="dim tiny">عضوی ثبت‌نام نکرده.</p>';
  wrap.querySelectorAll('.mbtn').forEach(btn=>btn.addEventListener('click', ()=>{
    const c = btn.dataset.c;
    let v = State.verifiedUsers;
    if(v.includes(c)){ v = v.filter(x=>x!==c); logActivity(`تیک آبی «${c}» حذف شد.`); }
    else { v.push(c); logActivity(`تیک آبی به «${c}» اعطا شد.`); }
    State.verifiedUsers = v;
    renderVerifyList();
    toast('وضعیت تیک آبی تغییر کرد.');
  }));
}
function renderPinList(){
  const wrap = document.getElementById('pinList');
  if(!wrap) return;
  wrap.innerHTML = State.news.slice(0,15).map(n=>`
    <div class="manage-row">
      <span class="mtitle">${State.pinnedId===n.id?'📌 ':''}${esc(n.title)}</span>
      <button class="mbtn ${State.pinnedId===n.id?'danger':''}" data-id="${n.id}">${State.pinnedId===n.id?'برداشتن سنجاق':'سنجاق کن'}</button>
    </div>
  `).join('') || '<p class="dim tiny">خبری نیست.</p>';
  wrap.querySelectorAll('.mbtn').forEach(btn=>btn.addEventListener('click', ()=>{
    State.pinnedId = State.pinnedId===btn.dataset.id ? null : btn.dataset.id;
    logActivity(State.pinnedId ? `خبری سنجاق شد.` : 'سنجاق خبر برداشته شد.');
    renderPinList(); renderNewsFeed();
    toast('وضعیت سنجاق تغییر کرد.');
  }));
}
document.getElementById('toggleFreezeComments').addEventListener('click', ()=>{
  if(!hasPerm('power')){ toast('دسترسی ابزارهای پیشرفته نداری.'); return; }
  State.commentsFrozen = !State.commentsFrozen;
  logActivity(`دیدگاه‌های کل سایت ${State.commentsFrozen?'بسته':'باز'} شد.`);
  renderPowerTools();
  toast(State.commentsFrozen ? 'دیدگاه‌ها موقتاً بسته شد.' : 'دیدگاه‌ها دوباره باز شد.');
});
document.getElementById('bulkClearAuto').addEventListener('click', ()=>{
  if(!hasPerm('power')){ toast('دسترسی ابزارهای پیشرفته نداری.'); return; }
  if(!confirm('همه اخبار رصدشده‌ی خودکار پاک شود؟')) return;
  const removed = State.news.filter(n=>n.auto).map(n=>n.title);
  State.news = State.news.filter(n=>!n.auto);
  State.deletedTitles = [...State.deletedTitles, ...removed];
  logActivity(`${removed.length} خبر خودکار به‌صورت دسته‌جمعی پاک شد.`);
  renderManageList(); renderNewsFeed(); renderPinList();
  toast('اخبار خودکار پاک شد.');
});
document.getElementById('bulkClearComments').addEventListener('click', ()=>{
  if(!hasPerm('power')){ toast('دسترسی ابزارهای پیشرفته نداری.'); return; }
  if(!confirm('همه دیدگاه‌های کل سایت پاک شود؟ این کار برگشت‌ناپذیر است.')) return;
  State.comments = {};
  logActivity('همه دیدگاه‌های سایت پاک شد.');
  toast('همه دیدگاه‌ها پاک شد.');
});
document.getElementById('bulkClearReports').addEventListener('click', ()=>{
  if(!hasPerm('reports')){ toast('دسترسی گزارش‌ها نداری.'); return; }
  const reports = State.reports.map(r=>({...r, resolved:true}));
  State.reports = reports;
  renderReports(); updateReportBadge();
  logActivity('همه گزارش‌ها به‌عنوان بررسی‌شده علامت خوردند.');
  toast('همه گزارش‌ها بررسی‌شده علامت خوردند.');
});
function renderStorageMeter(){
  let bytes = 0;
  for(let i=0;i<localStorage.length;i++){
    const k = localStorage.key(i);
    bytes += (k.length + (localStorage.getItem(k)||'').length) * 2;
  }
  const limitMB = 5; // محدودیت معمول مرورگرها برای localStorage
  const usedMB = bytes / (1024*1024);
  const pct = Math.min(100, Math.round((usedMB/limitMB)*100));
  const fill = document.getElementById('storageFill');
  if(fill) fill.style.width = pct+'%';
  const text = document.getElementById('storageText');
  if(text) text.textContent = `${usedMB.toFixed(2)} مگابایت از حدود ${limitMB} مگابایت مجاز مرورگر استفاده شده (${pct}%).`;
}

/* =========================================================
   امنیت پیشرفته — تأیید دستی دیدگاه، محدودیت ارسال، تاریخچه ورود
   ========================================================= */
function renderSecurity(){
  const modStat = document.getElementById('statModeration');
  if(modStat) modStat.textContent = State.moderationEnabled ? 'روشن 🟢' : 'خاموش';
  const pending = State.pendingComments;
  const pendCount = document.getElementById('statPendingCount');
  if(pendCount) pendCount.textContent = pending.length;
  const wrap = document.getElementById('pendingCommentsList');
  if(wrap){
    wrap.innerHTML = pending.map(p=>`
      <div class="manage-row">
        <span class="mtitle">${esc(p.name)}: ${esc(p.text.slice(0,60))} <span class="dim tiny">(روی «${esc((State.news.find(n=>n.id===p.newsId)||{}).title||'خبر حذف‌شده')}»)</span></span>
        <div class="mbtns">
          <button class="mbtn success" data-approve="${p.id}">تأیید</button>
          <button class="mbtn danger" data-reject="${p.id}">رد کردن</button>
        </div>
      </div>
    `).join('') || '<p class="dim tiny">دیدگاهی در صف تأیید نیست.</p>';
    wrap.querySelectorAll('[data-approve]').forEach(b=>b.addEventListener('click', ()=>approvePending(b.dataset.approve)));
    wrap.querySelectorAll('[data-reject]').forEach(b=>b.addEventListener('click', ()=>rejectPending(b.dataset.reject)));
  }
  const rl = document.querySelector('#toggleRateLimit');
  if(rl) rl.textContent = `محدودیت ارسال الان ${State.rateLimitEnabled?'روشن':'خاموش'} است — تغییر وضعیت`;
  const lh = document.getElementById('loginHistoryList');
  if(lh){
    lh.innerHTML = State.loginHistory.slice(0,15).map(h=>`
      <div class="log-item"><span>${h.success?'✅':'❌'} ${h.suspicious?'🚨 ':''}${esc(h.who)}</span><span class="ltime">${new Date(h.ts).toLocaleString('fa-IR')}</span></div>
    `).join('') || '<p class="dim tiny">هنوز ورودی ثبت نشده.</p>';
  }
  const si = document.getElementById('sessionInfo');
  if(si){
    si.textContent = `ادمین فعلی: ${currentAdmin ? (currentAdmin.display||currentAdmin.username) : '—'}
مرورگر: ${navigator.userAgent}
زبان مرورگر: ${navigator.language}
ابعاد صفحه: ${screen.width}x${screen.height}
زمان محلی: ${new Date().toLocaleString('fa-IR')}`;
  }
  const sl = document.getElementById('toggleSignupLock');
  if(sl) sl.textContent = `ثبت‌نام الان ${State.signupLocked?'قفل است 🔒':'باز است'} — تغییر وضعیت`;
  renderCustomBadWords();
}
function renderCustomBadWords(){
  const wrap = document.getElementById('customBadWordsList');
  if(!wrap) return;
  wrap.innerHTML = State.customBadWords.map(w=>`
    <div class="manage-row"><span class="mtitle">${esc(w)}</span><button class="mbtn danger" data-word="${esc(w)}">حذف</button></div>
  `).join('') || '<p class="dim tiny">کلمه سفارشی‌ای اضافه نشده.</p>';
  wrap.querySelectorAll('[data-word]').forEach(b=>b.addEventListener('click', ()=>{
    State.customBadWords = State.customBadWords.filter(w=>w!==b.dataset.word);
    renderCustomBadWords();
    logActivity(`کلمه «${b.dataset.word}» از لیست سیاه حذف شد.`);
  }));
}
document.getElementById('addBadWordForm').addEventListener('submit', e=>{
  e.preventDefault();
  if(!hasPerm('security')){ toast('دسترسی امنیت نداری.'); return; }
  const input = document.getElementById('newBadWord');
  const word = input.value.trim();
  if(!word) return;
  const list = State.customBadWords;
  if(!list.includes(word)){ list.push(word); State.customBadWords = list; }
  input.value='';
  renderCustomBadWords();
  logActivity(`کلمه «${word}» به لیست سیاه اضافه شد.`);
  toast('کلمه اضافه شد.');
});
document.getElementById('toggleSignupLock').addEventListener('click', ()=>{
  if(!hasPerm('security')){ toast('دسترسی امنیت نداری.'); return; }
  State.signupLocked = !State.signupLocked;
  renderSecurity();
  logActivity(`ثبت‌نام اعضای جدید ${State.signupLocked?'قفل':'باز'} شد.`);
  toast(State.signupLocked ? 'ثبت‌نام تازه قفل شد.' : 'ثبت‌نام دوباره باز شد.');
});
document.getElementById('forceLogoutAll').addEventListener('click', ()=>{
  if(currentAdmin.role!=='owner'){ toast('فقط مالک می‌تواند این کار را بکند.'); return; }
  if(!confirm('همه نشست‌های ادمین (به‌جز نشست فعلی تو) باطل شود؟')) return;
  const newToken = uid();
  State.securityToken = newToken;
  currentAdmin.sessionToken = newToken;
  save('gh_admin_session', currentAdmin);
  logActivity('مالک همه نشست‌های ادمین را باطل کرد.');
  toast('همه نشست‌های دیگر باطل شدند.');
});
function approvePending(id){
  const pending = State.pendingComments;
  const p = pending.find(x=>x.id===id);
  if(!p) return;
  const cs = State.comments;
  cs[p.newsId] = cs[p.newsId] || [];
  cs[p.newsId].push({id:uid(), name:p.name, contact:p.contact, verified:isVerified(p.contact,p.name), text:p.text, ts:p.ts});
  State.comments = cs;
  State.pendingComments = pending.filter(x=>x.id!==id);
  logActivity(`دیدگاه «${p.name}» تأیید و منتشر شد.`);
  renderSecurity();
  if(currentArticleId===p.newsId) renderComments(p.newsId);
  toast('دیدگاه تأیید و منتشر شد.');
}
function rejectPending(id){
  const pending = State.pendingComments;
  const p = pending.find(x=>x.id===id);
  State.pendingComments = pending.filter(x=>x.id!==id);
  logActivity(`دیدگاه «${p?.name||'?'}» رد شد.`);
  renderSecurity();
  toast('دیدگاه رد شد.');
}
document.getElementById('toggleModeration').addEventListener('click', ()=>{
  if(!hasPerm('security')){ toast('دسترسی امنیت نداری.'); return; }
  State.moderationEnabled = !State.moderationEnabled;
  logActivity(`تأیید دستی دیدگاه‌ها ${State.moderationEnabled?'روشن':'خاموش'} شد.`);
  renderSecurity();
  toast(State.moderationEnabled ? 'از الان دیدگاه‌های تازه نیاز به تأیید دارند.' : 'دیدگاه‌ها دوباره مستقیم منتشر می‌شوند.');
});
document.getElementById('toggleRateLimit').addEventListener('click', ()=>{
  if(!hasPerm('security')){ toast('دسترسی امنیت نداری.'); return; }
  State.rateLimitEnabled = !State.rateLimitEnabled;
  logActivity(`محدودیت ارسال ${State.rateLimitEnabled?'روشن':'خاموش'} شد.`);
  renderSecurity();
  toast('وضعیت محدودیت ارسال تغییر کرد.');
});
/* ضدِ اسپم ساده: حداکثر یک ارسال هر ۱۰ ثانیه برای هر کاربر */
let lastSendTs = {};
function rateLimited(contact){
  if(!State.rateLimitEnabled) return false;
  const last = lastSendTs[contact] || 0;
  if(Date.now() - last < 10000) return true;
  lastSendTs[contact] = Date.now();
  return false;
}

function renderActivityLog(){
  const wrap = document.getElementById('activityLog');
  if(!wrap) return;
  const log = State.activityLog;
  wrap.innerHTML = log.map(l=>`<div class="log-item"><span>${esc(l.who)}: ${esc(l.text)}</span><span class="ltime">${new Date(l.ts).toLocaleString('fa-IR')}</span></div>`).join('') || '<p class="dim tiny">هنوز فعالیتی ثبت نشده.</p>';
  const mbtn = document.getElementById('statMaintenance');
  if(mbtn) mbtn.textContent = State.maintenance ? 'روشن 🔧' : 'خاموش';
}
document.getElementById('toggleMaintenance').addEventListener('click', ()=>{
  if(currentAdmin.role!=='owner'){ toast('فقط مالک می‌تواند حالت تعمیر را تغییر دهد.'); return; }
  State.maintenance = !State.maintenance;
  renderActivityLog();
  applyMaintenanceGate();
  logActivity(`حالت تعمیر سایت ${State.maintenance ? 'روشن' : 'خاموش'} شد.`);
  toast(State.maintenance ? 'سایت برای کاربران عادی در حالت تعمیر است.' : 'سایت دوباره برای همه فعال شد.');
});
function applyMaintenanceGate(){
  const overlay = document.getElementById('maintenanceOverlay');
  if(State.maintenance && !currentAdmin){ overlay.classList.remove('hidden'); }
  else { overlay.classList.add('hidden'); }
}

/* --- مشخصات سایت --- */
/* =========================================================
   برندینگ — اسم/شعار/آیکون سایت، رنگ ثانویه، تنظیمات نمایش خبر
   ========================================================= */
function applyBranding(){
  const b = State.branding;
  document.title = b.siteName ? `${b.siteName} — اخبار گیم` : 'GameHub — اخبار گیم';
  const nameEl = document.querySelector('.brand-name');
  if(nameEl) nameEl.textContent = b.siteName || 'GameHub';
  const crownEl = document.querySelector('.crown');
  if(crownEl){
    if(b.icon){ crownEl.innerHTML = `<img src="${b.icon}" alt="" style="width:22px;height:22px;border-radius:6px;object-fit:cover;vertical-align:-6px;">`; }
    else { crownEl.textContent = '♛'; }
  }
  const brandNameInput = document.getElementById('brandSiteName');
  if(brandNameInput && document.activeElement!==brandNameInput) brandNameInput.value = b.siteName || '';
  const taglineInput = document.getElementById('brandTagline');
  if(taglineInput && document.activeElement!==taglineInput) taglineInput.value = b.tagline || '';
}
document.getElementById('brandingForm').addEventListener('submit', e=>{
  e.preventDefault();
  if(!hasPerm('branding')){ toast('دسترسی برندینگ نداری.'); return; }
  const b = State.branding;
  b.siteName = document.getElementById('brandSiteName').value.trim() || 'GameHub';
  b.tagline = document.getElementById('brandTagline').value.trim();
  State.branding = b;
  applyBranding();
  logActivity(`اسم/شعار سایت به «${b.siteName}» تغییر کرد.`);
  toast('برندینگ ذخیره شد.');
});
document.getElementById('brandIconUpload').addEventListener('change', e=>{
  if(!hasPerm('branding')){ toast('دسترسی برندینگ نداری.'); return; }
  const file = e.target.files[0];
  if(!file) return;
  if(file.size > 500*1024){ toast('آیکون باید کمتر از ۵۰۰ کیلوبایت باشد.'); return; }
  const reader = new FileReader();
  reader.onload = ()=>{
    const b = State.branding; b.icon = reader.result; State.branding = b;
    applyBranding();
    logActivity('آیکون سایت تغییر کرد.');
    toast('آیکون سایت بروزرسانی شد.');
  };
  reader.readAsDataURL(file);
});
document.getElementById('resetBrandIcon').addEventListener('click', ()=>{
  if(!hasPerm('branding')){ toast('دسترسی برندینگ نداری.'); return; }
  const b = State.branding; b.icon = null; State.branding = b;
  applyBranding();
  toast('آیکون به حالت پیش‌فرض برگشت.');
});
document.getElementById('accent2Picker').addEventListener('click', e=>{
  const btn = e.target.closest('[data-accent2]'); if(!btn) return;
  if(!hasPerm('branding')){ toast('دسترسی برندینگ نداری.'); return; }
  const map = {violet:'#7c5cff', blue:'#2f8fd4', green:'#4cc38a', red:'#e0546a'};
  const color = map[btn.dataset.accent2];
  const s = State.settings; s.accent2 = color; State.settings = s;
  document.documentElement.style.setProperty('--accent2', color);
  document.querySelectorAll('#accent2Picker [data-accent2]').forEach(b=>b.classList.toggle('active', b===btn));
  logActivity(`رنگ ثانویه سایت تغییر کرد.`);
  toast('رنگ ثانویه ذخیره شد.');
});
document.getElementById('toggleHideSource').addEventListener('click', ()=>{
  if(!hasPerm('branding')){ toast('دسترسی برندینگ نداری.'); return; }
  State.hideSourceLinks = !State.hideSourceLinks;
  toast(State.hideSourceLinks ? 'لینک منبع دیگر نشان داده نمی‌شود.' : 'لینک منبع دوباره نشان داده می‌شود.');
  logActivity(`نمایش لینک منبع ${State.hideSourceLinks?'خاموش':'روشن'} شد.`);
});
document.getElementById('saveFeedLimit').addEventListener('click', ()=>{
  if(!hasPerm('branding')){ toast('دسترسی برندینگ نداری.'); return; }
  const val = Number(document.getElementById('homeFeedLimitInput').value);
  State.homeFeedLimit = val > 0 ? val : null;
  renderNewsFeed();
  logActivity(`محدودیت خبر صفحه اصلی روی ${State.homeFeedLimit || 'نامحدود'} تنظیم شد.`);
  toast('ذخیره شد.');
});

/* =========================================================
   اتوماسیون — پیام خوش‌آمد، قالب‌های آماده، زمان‌بندی پیام همگانی
   ========================================================= */
document.getElementById('toggleWelcomeDm').addEventListener('click', ()=>{
  if(!hasPerm('schedule') && !hasPerm('message')){ toast('دسترسی نداری.'); return; }
  State.welcomeDmEnabled = !State.welcomeDmEnabled;
  toast(State.welcomeDmEnabled ? 'خوش‌آمد خودکار روشن شد.' : 'خوش‌آمد خودکار خاموش شد.');
  logActivity(`پیام خوش‌آمد خودکار ${State.welcomeDmEnabled?'روشن':'خاموش'} شد.`);
});
document.getElementById('saveWelcomeDmText').addEventListener('click', ()=>{
  const text = document.getElementById('welcomeDmText').value.trim();
  if(!text) return;
  State.welcomeDmText = text;
  toast('متن خوش‌آمد ذخیره شد.');
});
document.getElementById('broadcastTemplates').addEventListener('click', e=>{
  const btn = e.target.closest('[data-tpl]'); if(!btn) return;
  document.getElementById('broadcastInput').value = btn.dataset.tpl;
  document.querySelector('[data-atab="messages"]').click();
});
document.getElementById('scheduleBroadcastForm').addEventListener('submit', e=>{
  e.preventDefault();
  if(!hasPerm('schedule')){ toast('دسترسی زمان‌بندی نداری.'); return; }
  const text = document.getElementById('scheduleBroadcastText').value.trim();
  const timeStr = document.getElementById('scheduleBroadcastTime').value;
  if(!text || !timeStr) return;
  const publishAt = new Date(timeStr).getTime();
  const list = State.scheduledBroadcasts;
  list.push({id:uid(), text, publishAt});
  State.scheduledBroadcasts = list;
  e.target.reset();
  renderScheduledBroadcasts();
  toast('پیام زمان‌بندی شد.');
  logActivity(`پیام همگانی برای ${new Date(publishAt).toLocaleString('fa-IR')} زمان‌بندی شد.`);
});
function renderScheduledBroadcasts(){
  const wrap = document.getElementById('scheduledBroadcastList');
  if(!wrap) return;
  wrap.innerHTML = State.scheduledBroadcasts.map(s=>`
    <div class="manage-row"><span class="mtitle">${esc(s.text.slice(0,50))} <span class="dim tiny">— ${new Date(s.publishAt).toLocaleString('fa-IR')}</span></span>
    <button class="mbtn danger" data-cancel="${s.id}">لغو</button></div>
  `).join('') || '<p class="dim tiny">پیام زمان‌بندی‌شده‌ای نیست.</p>';
  wrap.querySelectorAll('[data-cancel]').forEach(b=>b.addEventListener('click', ()=>{
    State.scheduledBroadcasts = State.scheduledBroadcasts.filter(s=>s.id!==b.dataset.cancel);
    renderScheduledBroadcasts();
    toast('لغو شد.');
  }));
}
function publishDueScheduledBroadcasts(){
  const list = State.scheduledBroadcasts;
  const due = list.filter(s=>s.publishAt<=Date.now());
  if(!due.length) return;
  const log = State.broadcastLog;
  due.forEach(d=>{ log.push({id:uid(), text:d.text, ts:Date.now()}); });
  State.broadcastLog = log;
  State.scheduledBroadcasts = list.filter(s=>s.publishAt>Date.now());
  showBroadcast(due[due.length-1]);
  logActivity(`${due.length} پیام زمان‌بندی‌شده منتشر شد.`);
  renderScheduledBroadcasts();
}

/* =========================================================
   مدیریت بازی‌ها — لیدربورد هر بازی/سطح
   ========================================================= */
const ADMIN_GAME_LIST = [
  {id:'snake', label:'مار طلایی پرو'}, {id:'memory', label:'حافظه تاج'}, {id:'tictactoe', label:'دوز'},
  {id:'rps', label:'سنگ‌کاغذقیچی'}, {id:'reaction', label:'سرعت واکنش'}, {id:'guess', label:'حدس عدد'},
  {id:'g2048', label:'۲۰۴۸'}, {id:'pong', label:'پونگ'}, {id:'quiz', label:'کوییز گیم'},
  {id:'mines', label:'مین‌روب'}, {id:'breakout', label:'آجرشکن'}, {id:'clicker', label:'کلیکر طلایی'},
  {id:'simon', label:'سایمون سیز'}, {id:'whack', label:'موش‌کوب'}, {id:'flappy', label:'پرنده پرنده'},
  {id:'scramble', label:'کلمه قاطی‌پاطی'}, {id:'hangman', label:'دار و مار کلمه'}, {id:'mathblitz', label:'ریاضی رعدآسا'},
  {id:'colormatch', label:'رنگ‌شناس'}, {id:'slide15', label:'پازل کشویی'}, {id:'connect4', label:'چهار‌تایی'},
  {id:'typing', label:'سرعت تایپ'}, {id:'stacker', label:'برج‌ساز'}, {id:'dodger', label:'فرار از شهاب'},
  {id:'maze', label:'هزارتو'}, {id:'schulte', label:'جدول شولته'}, {id:'balloon', label:'بادکنک‌ترکون'},
  {id:'aim', label:'نشانه‌گیر'}, {id:'flood', label:'سیل رنگی'}, {id:'catch', label:'سبد میوه‌چین'}
];
function renderGamesLeaderboardMgmt(filter){
  const wrap = document.getElementById('gamesLeaderboardMgmt');
  if(!wrap) return;
  const board = State.leaderboard;
  const term = (filter||'').trim();
  let rows = '';
  ADMIN_GAME_LIST.filter(g=>!term || g.label.includes(term)).forEach(g=>{
    ['easy','medium','hard'].forEach(diff=>{
      const key = g.id+':'+diff;
      const list = board[key] || [];
      rows += `<div class="manage-row">
        <span class="mtitle">${esc(g.label)} — ${diffLabel(diff)} <span class="dim tiny">(${list.length} رکورد، بهترین: ${list[0]?list[0].score:'—'})</span></span>
        <button class="mbtn danger" data-clearlb="${key}">پاک‌کردن این لیدربورد</button>
      </div>`;
    });
  });
  wrap.innerHTML = rows || '<p class="dim tiny">بازی‌ای با این نام نیست.</p>';
  wrap.querySelectorAll('[data-clearlb]').forEach(b=>b.addEventListener('click', ()=>{
    if(!hasPerm('power')){ toast('دسترسی نداری.'); return; }
    const board = State.leaderboard;
    delete board[b.dataset.clearlb];
    State.leaderboard = board;
    renderGamesLeaderboardMgmt(document.getElementById('gamesMgmtSearch')?.value);
    logActivity(`لیدربورد «${b.dataset.clearlb}» پاک شد.`);
    toast('پاک شد.');
  }));
}
document.getElementById('gamesMgmtSearch')?.addEventListener('input', e=>renderGamesLeaderboardMgmt(e.target.value));

/* =========================================================
   مدیریت روبلاکس — بخش‌های صفحه + اخبار رصدشده
   ========================================================= */
document.getElementById('addRobloxSectionForm').addEventListener('submit', e=>{
  e.preventDefault();
  if(!hasPerm('publish')){ toast('دسترسی نداری.'); return; }
  const h = document.getElementById('robloxSecTitle').value.trim();
  const p = document.getElementById('robloxSecText').value.trim();
  if(!h || !p) return;
  const sections = State.robloxSections;
  sections.push({id:uid(), h, p});
  State.robloxSections = sections;
  e.target.reset();
  renderRobloxSectionsList();
  renderRoblox();
  logActivity(`بخش روبلاکس «${h}» اضافه شد.`);
  toast('بخش اضافه شد.');
});
function renderRobloxSectionsList(){
  const wrap = document.getElementById('robloxSectionsList');
  if(!wrap) return;
  wrap.innerHTML = State.robloxSections.map(s=>`
    <div class="manage-row"><span class="mtitle">${esc(s.h)}</span><button class="mbtn danger" data-delsec="${s.id}">حذف</button></div>
  `).join('') || '<p class="dim tiny">بخشی نیست.</p>';
  wrap.querySelectorAll('[data-delsec]').forEach(b=>b.addEventListener('click', ()=>{
    if(!hasPerm('delete')){ toast('دسترسی نداری.'); return; }
    State.robloxSections = State.robloxSections.filter(s=>s.id!==b.dataset.delsec);
    renderRobloxSectionsList();
    renderRoblox();
    toast('بخش حذف شد.');
  }));
}
function renderRobloxNewsMgmt(){
  const wrap = document.getElementById('robloxNewsMgmt');
  if(!wrap) return;
  const items = load('gh_roblox_news', []);
  wrap.innerHTML = items.map(n=>`
    <div class="manage-row"><span class="mtitle">${esc(n.title)}</span><button class="mbtn danger" data-delrn="${n.id}">حذف</button></div>
  `).join('') || '<p class="dim tiny">خبری نیست.</p>';
  wrap.querySelectorAll('[data-delrn]').forEach(b=>b.addEventListener('click', ()=>{
    if(!hasPerm('delete')){ toast('دسترسی نداری.'); return; }
    const items2 = load('gh_roblox_news', []).filter(n=>n.id!==b.dataset.delrn);
    save('gh_roblox_news', items2);
    renderRobloxNewsMgmt();
    renderRobloxNews();
    toast('خبر حذف شد.');
  }));
}

/* =========================================================
   مدیریت شورتس و اکسپلور
   ========================================================= */
function renderShortsMgmt(){
  const wrap = document.getElementById('shortsMgmtList');
  if(!wrap) return;
  wrap.innerHTML = State.shorts.map(s=>`
    <div class="manage-row"><span class="mtitle">${esc(s.title)} <span class="dim tiny">(❤ ${s.likes||0})</span></span><button class="mbtn danger" data-delshort="${s.id}">حذف</button></div>
  `).join('') || '<p class="dim tiny">ویدیویی نیست.</p>';
  wrap.querySelectorAll('[data-delshort]').forEach(b=>b.addEventListener('click', ()=>{
    if(!hasPerm('delete')){ toast('دسترسی نداری.'); return; }
    State.shorts = State.shorts.filter(s=>s.id!==b.dataset.delshort);
    renderShortsMgmt();
    if(currentView==='shorts') renderShorts();
    toast('ویدیو حذف شد.');
    logActivity('یک ویدیوی شورتس حذف شد.');
  }));
}
function renderExploreMgmt(){
  const wrap = document.getElementById('exploreMgmtList');
  if(!wrap) return;
  wrap.innerHTML = State.explore.map(it=>`
    <div class="manage-row"><span class="mtitle">${esc(it.title.slice(0,50))} <span class="dim tiny">(${it.type})</span></span><button class="mbtn danger" data-delexp="${it.id}">حذف</button></div>
  `).join('') || '<p class="dim tiny">پستی نیست.</p>';
  wrap.querySelectorAll('[data-delexp]').forEach(b=>b.addEventListener('click', ()=>{
    if(!hasPerm('delete')){ toast('دسترسی نداری.'); return; }
    State.explore = State.explore.filter(it=>it.id!==b.dataset.delexp);
    renderExploreMgmt();
    if(currentView==='explore') renderExplore();
    toast('پست حذف شد.');
    logActivity('یک پست اکسپلور حذف شد.');
  }));
}

/* =========================================================
   کدهای دعوت
   ========================================================= */
function genInviteCode(){
  return Array.from({length:8}, ()=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*32)]).join('');
}
document.getElementById('createInviteForm').addEventListener('submit', e=>{
  e.preventDefault();
  if(!hasPerm('security')){ toast('دسترسی نداری.'); return; }
  const maxUses = Number(document.getElementById('inviteMaxUses').value) || 1;
  const codes = State.inviteCodes;
  codes.push({code:genInviteCode(), maxUses, used:0, createdAt:Date.now()});
  State.inviteCodes = codes;
  e.target.reset();
  renderInviteList();
  logActivity('کد دعوت جدید ساخته شد.');
  toast('کد دعوت ساخته شد.');
});
function renderInviteList(){
  const wrap = document.getElementById('inviteList');
  if(!wrap) return;
  wrap.innerHTML = State.inviteCodes.map(c=>`
    <div class="manage-row"><span class="mtitle" style="direction:ltr;">${c.code} <span class="dim tiny">(${c.used}/${c.maxUses} استفاده‌شده)</span></span><button class="mbtn danger" data-delinv="${c.code}">حذف</button></div>
  `).join('') || '<p class="dim tiny">کد دعوتی نیست.</p>';
  wrap.querySelectorAll('[data-delinv]').forEach(b=>b.addEventListener('click', ()=>{
    State.inviteCodes = State.inviteCodes.filter(c=>c.code!==b.dataset.delinv);
    renderInviteList();
    toast('کد حذف شد.');
  }));
}

/* =========================================================
   نظرسنجی
   ========================================================= */
document.getElementById('createPollForm').addEventListener('submit', e=>{
  e.preventDefault();
  if(!hasPerm('publish')){ toast('دسترسی نداری.'); return; }
  const q = document.getElementById('pollQuestion').value.trim();
  const optsRaw = document.getElementById('pollOptions').value.trim();
  const opts = optsRaw.split('،').join(',').split(',').map(s=>s.trim()).filter(Boolean);
  if(!q || opts.length<2){ toast('حداقل ۲ گزینه لازم است.'); return; }
  const polls = State.polls.map(p=>({...p, active:false}));
  polls.push({id:uid(), question:q, options:opts.map(t=>({text:t, votes:0})), votedBy:[], active:true, createdAt:Date.now()});
  State.polls = polls;
  e.target.reset();
  renderActivePollAdmin();
  logActivity(`نظرسنجی «${q}» منتشر شد.`);
  toast('نظرسنجی منتشر شد.');
});
function getActivePoll(){ return State.polls.find(p=>p.active); }
function renderActivePollAdmin(){
  const wrap = document.getElementById('activePollAdmin');
  if(!wrap) return;
  const poll = getActivePoll();
  if(!poll){ wrap.innerHTML = '<p class="dim tiny">نظرسنجی فعالی نیست.</p>'; return; }
  const total = poll.options.reduce((a,o)=>a+o.votes,0) || 1;
  wrap.innerHTML = `<div class="manage-row" style="flex-direction:column;align-items:stretch;">
    <b>${esc(poll.question)}</b>
    ${poll.options.map(o=>`<div class="dim tiny">${esc(o.text)}: ${o.votes} رای (${Math.round(o.votes/total*100)}%)</div>`).join('')}
    <button class="mbtn danger" id="endPollBtn" style="margin-top:8px;width:fit-content;">پایان نظرسنجی</button>
  </div>`;
  document.getElementById('endPollBtn').addEventListener('click', ()=>{
    const polls = State.polls.map(p=>p.id===poll.id?{...p,active:false}:p);
    State.polls = polls;
    renderActivePollAdmin();
    renderPollWidget();
    logActivity('نظرسنجی پایان یافت.');
    toast('نظرسنجی بسته شد.');
  });
}
function renderPollWidget(){
  const wrap = document.getElementById('pollWidget');
  if(!wrap) return;
  const poll = getActivePoll();
  if(!poll){ wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');
  const voted = currentUser && poll.votedBy.includes(currentUser.contact);
  const total = poll.options.reduce((a,o)=>a+o.votes,0) || 1;
  wrap.innerHTML = `<h3>📊 نظرسنجی: ${esc(poll.question)}</h3>` + poll.options.map((o,i)=>{
    if(voted || !currentUser){
      return `<div class="dim tiny" style="margin:4px 0;">${esc(o.text)} — ${o.votes} رای (${Math.round(o.votes/total*100)}%)</div>`;
    }
    return `<button class="btn-ghost full" style="margin-bottom:6px;" data-vote="${i}">${esc(o.text)}</button>`;
  }).join('') + (!currentUser ? '<p class="dim tiny">برای رای‌دادن ثبت‌نام کن.</p>' : '');
  if(!voted && currentUser){
    wrap.querySelectorAll('[data-vote]').forEach(b=>b.addEventListener('click', ()=>{
      const polls = State.polls;
      const p = polls.find(x=>x.id===poll.id);
      if(!p || p.votedBy.includes(currentUser.contact)) return;
      p.options[Number(b.dataset.vote)].votes++;
      p.votedBy.push(currentUser.contact);
      State.polls = polls;
      renderPollWidget();
      toast('رای تو ثبت شد!');
    }));
  }
}

/* =========================================================
   مرکز پشتیبانی — تیکت‌های کامل (دسته‌بندی، اولویت، وضعیت)
   ========================================================= */
const TICKET_CATS = {bug:'🐞 باگ فنی', account:'👤 حساب کاربری', payment:'💳 مالی / اشتراک', suggestion:'💡 پیشنهاد', other:'❓ سایر موارد'};
const TICKET_PRIOS = {low:'کم', medium:'متوسط', high:'فوری'};
const TICKET_STATUS = {open:'باز', progress:'در حال بررسی', resolved:'حل‌شده'};
document.getElementById('bugReportForm').addEventListener('submit', e=>{
  e.preventDefault();
  const text = document.getElementById('bugReportText').value.trim();
  if(!text) return;
  const subject = document.getElementById('ticketSubject').value.trim() || text.slice(0,40);
  const category = document.getElementById('ticketCategory').value || 'other';
  const priority = document.getElementById('ticketPriority').value || 'medium';
  const reports = State.bugReports;
  reports.unshift({
    id:uid(), name: currentUser?currentUser.name:'مهمان', contact: currentUser?currentUser.contact:'',
    subject, text, category, priority, status:'open', resolved:false, ts:Date.now(), reply:null
  });
  State.bugReports = reports;
  document.getElementById('bugReportText').value = '';
  document.getElementById('ticketSubject').value = '';
  toast('تیکت تو با موفقیت ثبت شد — به‌زودی پاسخ داده می‌شود ✅');
  renderMyTickets();
  logPlayerActivity(`یک تیکت پشتیبانی جدید ثبت کرد (${TICKET_CATS[category]||category}).`);
});
function updateBugBadge(){
  const badge = document.getElementById('bugBadge');
  if(!badge) return;
  const open = State.bugReports.filter(r=>r.status!=='resolved' && !r.resolved).length;
  badge.textContent = open;
  badge.classList.toggle('hidden', open===0);
}
let ticketStatusFilter='all', ticketCatFilter='';
function renderBugReports(){
  const wrap = document.getElementById('bugReportsList');
  if(!wrap) return;
  const all = State.bugReports.map(r=>({...r, status: r.status || (r.resolved?'resolved':'open')}));
  const statsEl = document.getElementById('ticketStats');
  if(statsEl){
    const open=all.filter(r=>r.status==='open').length, prog=all.filter(r=>r.status==='progress').length, res=all.filter(r=>r.status==='resolved').length, high=all.filter(r=>r.priority==='high'&&r.status!=='resolved').length;
    statsEl.innerHTML = `<div class="stat-box"><b>${open}</b><span>باز</span></div><div class="stat-box"><b>${prog}</b><span>در حال بررسی</span></div><div class="stat-box"><b>${res}</b><span>حل‌شده</span></div><div class="stat-box"><b>${high}</b><span>فوری باز</span></div>`;
  }
  let rows = all;
  if(ticketStatusFilter!=='all') rows = rows.filter(r=>r.status===ticketStatusFilter);
  if(ticketCatFilter) rows = rows.filter(r=>r.category===ticketCatFilter);
  wrap.innerHTML = rows.map(r=>`
    <div class="manage-row">
      <span class="mtitle">
        <span class="status-pill ${r.status}">${TICKET_STATUS[r.status]}</span>
        <span class="prio-pill ${r.priority||'medium'}">${TICKET_PRIOS[r.priority]||'متوسط'}</span>
        ${TICKET_CATS[r.category]||'❓'} — <b>${esc(r.subject||r.text.slice(0,40))}</b><br>
        <span class="dim tiny">${esc(r.name)}: ${esc(r.text.slice(0,90))}</span>
        <span class="dim tiny">${new Date(r.ts).toLocaleString('fa-IR')}</span>
        ${r.reply?`<br><span class="dim tiny">↩️ پاسخ ادمین: ${esc(r.reply.slice(0,80))}</span>`:''}
      </span>
      <span class="mbtns">
        ${r.status!=='progress'&&r.status!=='resolved'?`<button class="mbtn" data-tprogress="${r.id}">در حال بررسی</button>`:''}
        ${r.status!=='resolved'?`<button class="mbtn" data-treply="${r.id}">پاسخ + بستن</button>`:''}
        ${r.status==='resolved'?'✅':''}
      </span>
    </div>
  `).join('') || '<p class="dim tiny">تیکتی با این فیلتر نیست.</p>';
  wrap.querySelectorAll('[data-tprogress]').forEach(b=>b.addEventListener('click', ()=>{
    const reports = State.bugReports;
    const r = reports.find(x=>x.id===b.dataset.tprogress);
    if(r){ r.status='progress'; }
    State.bugReports = reports; renderBugReports(); toast('وضعیت به «در حال بررسی» تغییر کرد.');
  }));
  wrap.querySelectorAll('[data-treply]').forEach(b=>b.addEventListener('click', ()=>{
    const reports = State.bugReports;
    const r = reports.find(x=>x.id===b.dataset.treply);
    if(!r) return;
    const msg = prompt('پاسخ پشتیبانی برای «'+(r.subject||r.text.slice(0,30))+'»:', 'سلام! تیکت شما بررسی و رفع شد. ممنون از گزارشت 🙏');
    if(msg===null) return;
    r.status='resolved'; r.resolved=true; r.reply = msg.trim() || 'رسیدگی شد.';
    State.bugReports = reports;
    if(r.contact){
      const dms = State.dms; const key = dmKey(r.contact, ADMIN_CONTACT);
      dms[key] = dms[key] || [];
      dms[key].push({id:uid(), from:ADMIN_CONTACT, text:`پاسخ به تیکت «${r.subject||r.text.slice(0,30)}»: ${r.reply}`, ts:Date.now()});
      State.dms = dms;
    }
    renderBugReports(); updateBugBadge();
    logActivity('یک تیکت پشتیبانی پاسخ داده و بسته شد.');
    toast('پاسخ ارسال و تیکت بسته شد.');
  }));
  updateBugBadge();
}
document.getElementById('ticketFilters')?.addEventListener('click', e=>{
  const sb = e.target.closest('[data-tfilter-status]');
  const cb = e.target.closest('[data-tfilter-cat]');
  if(sb){
    ticketStatusFilter = sb.dataset.tfilterStatus;
    document.querySelectorAll('[data-tfilter-status]').forEach(x=>x.classList.toggle('active', x===sb));
    renderBugReports();
  } else if(cb){
    ticketCatFilter = cb.dataset.tfilterCat;
    document.querySelectorAll('[data-tfilter-cat]').forEach(x=>x.classList.toggle('active', x===cb));
    renderBugReports();
  }
});
/* --- تیکت‌های خودِ کاربر --- */
function renderMyTickets(){
  const wrap = document.getElementById('myTicketsList');
  if(!wrap) return;
  if(!currentUser){ wrap.innerHTML = '<p class="dim tiny">برای دیدن تیکت‌هات باید وارد شوی.</p>'; return; }
  const mine = State.bugReports.filter(r=>r.contact && r.contact===currentUser.contact);
  wrap.innerHTML = mine.map(r=>{
    const status = r.status || (r.resolved?'resolved':'open');
    return `<div class="manage-row ticket-mine status-${status}">
      <span class="mtitle"><span class="status-pill ${status}">${TICKET_STATUS[status]}</span> ${esc(r.subject||r.text.slice(0,40))}
      <span class="dim tiny">${new Date(r.ts).toLocaleString('fa-IR')}</span>
      ${r.reply?`<br><span class="dim tiny">↩️ ${esc(r.reply.slice(0,90))}</span>`:''}</span>
    </div>`;
  }).join('') || '<p class="dim tiny">هنوز تیکتی نفرستادی.</p>';
}
/* --- وضعیت آنلاین پشتیبانی — بر اساس آخرین فعالیت ادمین/مالک --- */
function renderSupportOnlineStatus(){
  const el = document.getElementById('supportOnlineStatus');
  if(!el) return;
  const log = State.activityLog||[];
  const lastAdmin = log[0];
  const online = lastAdmin && (Date.now()-lastAdmin.ts) < 20*60*1000;
  el.innerHTML = online
    ? `<span class="dot"></span><span>پشتیبانی هم‌اکنون آنلاین است — معمولاً ظرف چند دقیقه پاسخ می‌دهیم ⚡</span>`
    : `<span class="dot offline"></span><span>پشتیبانی این لحظه آفلاین است — معمولاً ظرف چند ساعت پاسخ می‌دهیم 🕒</span>`;
}
/* --- سوالات متداول --- */
const FAQ_ITEMS = [
  {q:'چطور ثبت‌نام کنم یا وارد حسابم شوم؟', a:'از دکمهٔ «ثبت‌نام / ورود» بالای سایت استفاده کن. فقط اسم و یک راه ارتباطی (ایمیل یا شماره) لازم است؛ نیازی به رمز پیچیده نیست.'},
  {q:'امتیازها و لیدربورد بازی‌ها چطور ذخیره می‌شود؟', a:'همهٔ امتیازها به‌صورت زنده روی سرور سایت ذخیره و بین همهٔ بازیکن‌ها همگام می‌شود. کافیست وارد حساب شده باشی تا نامت در لیدربورد ثبت شود.'},
  {q:'چطور مشکل فنی یا باگ را گزارش دهم؟', a:'همین‌جا از فرم «مرکز پشتیبانی» یک تیکت با دسته «باگ فنی» بفرست؛ وضعیت آن را هم در بخش «تیکت‌های من» می‌بینی.'},
  {q:'پشتیبانی چقدر طول می‌کشد پاسخ دهد؟', a:'در ساعاتی که پشتیبانی آنلاین است معمولاً ظرف چند دقیقه تا چند ساعت پاسخ داده می‌شود؛ برای موارد فوری، اولویت «فوری» را انتخاب کن.'},
  {q:'چطور می‌توانم پاسخ تیکتم را ببینم؟', a:'پاسخ‌ها هم در بخش «تیکت‌های من» و هم به‌صورت پیام مستقیم زیر «پشتیبانی سایت» در تب چت نمایش داده می‌شوند؛ زنگ اعلان بالای سایت هم به تو خبر می‌دهد.'},
  {q:'آیا حساب من و اطلاعاتم امن است؟', a:'اطلاعات فقط برای شناسایی حساب استفاده می‌شود و به کسی فروخته یا به اشتراک گذاشته نمی‌شود. برای امنیت بیشتر، الفاظ رکیک یا رفتار مشکوک منجر به بن‌شدن خودکار می‌شود.'},
  {q:'چرا حساب من بن شده است؟', a:'معمولاً به‌خاطر استفاده از الفاظ نامناسب در چت یا نقض قوانین سایت است. برای بررسی، از همین‌جا یک تیکت با دسته «حساب کاربری» بفرست.'},
  {q:'چطور در بازی‌ها سطح سختی را عوض کنم؟', a:'داخل هر بازی، بالای صفحه دکمه‌های «آسان / متوسط / سخت» هست؛ با انتخاب هرکدام، لیدربورد مخصوص همان سطح را می‌بینی.'},
  {q:'آیا امکان بازی گروهی یا با دوستان هست؟', a:'برخی بازی‌ها مثل دوز حالت «بازی با دوست» روی همین دستگاه دارند؛ همچنین می‌توانی از تب چت با اعضای دیگر گفتگو کنی.'},
  {q:'چطور یک خبر پیشنهاد بدهم؟', a:'از فرم «پیشنهاد خبر» در همین صفحهٔ تنظیمات استفاده کن؛ بعد از تأیید مدیر سایت منتشر می‌شود.'},
  {q:'اشتراک یا پرداختی در سایت هست؟', a:'در حال حاضر استفاده از تمام بخش‌های سایت رایگان است. اگر سوالی دربارهٔ مسائل مالی داری، تیکت با دستهٔ «مالی / اشتراک» بفرست.'},
  {q:'چطور می‌توانم داده‌های خودم را پاک کنم؟', a:'در همین صفحهٔ تنظیمات، دکمهٔ «پاک‌کردن داده‌های من از این مرورگر» این کار را انجام می‌دهد.'}
];
function renderFAQ(filter){
  const wrap = document.getElementById('faqAccordion');
  if(!wrap) return;
  const notice = (State.adminExtras||{}).faq;
  const term = (filter||'').trim().toLowerCase();
  const items = FAQ_ITEMS.filter(f=> !term || f.q.toLowerCase().includes(term) || f.a.toLowerCase().includes(term));
  wrap.innerHTML = (notice ? `<div class="faq-item open" style="border-color:var(--accent)"><div class="faq-q" style="cursor:default;">📢 اطلاعیه پشتیبانی</div><div class="faq-a" style="max-height:400px;padding:0 12px 12px;">${esc(notice)}</div></div>` : '')
    + items.map((f,i)=>`<div class="faq-item" data-faqi="${i}"><button type="button" class="faq-q"><span>${esc(f.q)}</span><span class="chev">▾</span></button><div class="faq-a">${esc(f.a)}</div></div>`).join('')
    || '<p class="dim tiny">چیزی پیدا نشد.</p>';
  wrap.querySelectorAll('.faq-q').forEach(btn=>{
    if(btn.parentElement.dataset.faqi===undefined) return;
    btn.addEventListener('click', ()=>btn.parentElement.classList.toggle('open'));
  });
}
document.getElementById('faqSearchInput')?.addEventListener('input', e=>renderFAQ(e.target.value));

/* =========================================================
   یادداشت‌های مالک
   ========================================================= */
document.getElementById('ownerNotesText').addEventListener('input', e=>{
  State.ownerNotes = e.target.value;
});

/* =========================================================
   اتاق گفتگوی ادمین‌ها — فقط مالک و ادمین‌ها می‌بینن
   ========================================================= */
function renderAdminRoom(){
  const win = document.getElementById('adminRoomWindow');
  if(!win) return;
  const msgs = State.adminRoomMsgs;
  win.innerHTML = '';
  msgs.forEach(m=>{
    const mine = currentAdmin && m.who===currentAdmin.username;
    pushChat(win, mine?'user':'bot', `${m.who}: ${m.text}`);
  });
}
document.getElementById('adminRoomForm').addEventListener('submit', e=>{
  e.preventDefault();
  const input = document.getElementById('adminRoomInput');
  const text = input.value.trim();
  if(!text) return;
  const msgs = State.adminRoomMsgs;
  msgs.push({who: currentAdmin.display||currentAdmin.username, text, ts:Date.now()});
  State.adminRoomMsgs = msgs.slice(-200);
  input.value = '';
  renderAdminRoom();
  try{ renderNewAdminPanes(); }catch(e){}
  try{ renderExtraAdminPanes(); }catch(e){}
});

/* =========================================================
   درباره ما — متن ثابت + پیام‌های مالک/ادمین
   ========================================================= */
function renderAboutUsPublic(){
  const contentEl = document.getElementById('aboutUsContent');
  if(contentEl) contentEl.textContent = State.aboutUsText;
  const wrap = document.getElementById('aboutUsMsgsPublic');
  if(!wrap) return;
  const msgs = [...State.aboutUsMsgs].sort((a,b)=>b.ts-a.ts);
  wrap.innerHTML = msgs.map(m=>`
    <div class="manage-row"><span class="mtitle">👑 ${esc(m.author)}: ${esc(m.text)}</span><span class="dim tiny">${new Date(m.ts).toLocaleDateString('fa-IR')}</span></div>
  `).join('') || '<p class="dim tiny">هنوز پیامی از مالک/ادمین نیست.</p>';
}
document.getElementById('aboutUsForm').addEventListener('submit', e=>{
  e.preventDefault();
  if(!hasPerm('branding')){ toast('دسترسی نداری.'); return; }
  State.aboutUsText = document.getElementById('aboutUsText').value.trim();
  toast('متن درباره ما ذخیره شد.');
  logActivity('متن صفحه درباره ما بروزرسانی شد.');
});
document.getElementById('aboutUsMsgForm').addEventListener('submit', e=>{
  e.preventDefault();
  if(!hasPerm('message')){ toast('دسترسی نداری.'); return; }
  const text = document.getElementById('aboutUsMsgText').value.trim();
  if(!text) return;
  const msgs = State.aboutUsMsgs;
  msgs.push({id:uid(), author: currentAdmin.display||currentAdmin.username, text, ts:Date.now()});
  State.aboutUsMsgs = msgs;
  e.target.reset();
  renderAboutUsMsgsAdmin();
  logActivity('پیام تازه در صفحه درباره ما اضافه شد.');
  toast('پیام اضافه شد.');
});
function renderAboutUsMsgsAdmin(){
  const wrap = document.getElementById('aboutUsMsgList');
  if(!wrap) return;
  wrap.innerHTML = State.aboutUsMsgs.map(m=>`
    <div class="manage-row"><span class="mtitle">${esc(m.author)}: ${esc(m.text)}</span><button class="mbtn danger" data-delmsg="${m.id}">حذف</button></div>
  `).join('') || '<p class="dim tiny">پیامی نیست.</p>';
  wrap.querySelectorAll('[data-delmsg]').forEach(b=>b.addEventListener('click', ()=>{
    State.aboutUsMsgs = State.aboutUsMsgs.filter(m=>m.id!==b.dataset.delmsg);
    renderAboutUsMsgsAdmin();
    toast('پیام حذف شد.');
  }));
}

/* =========================================================
   پیشنهاد خبر توسط کاربران — با تأیید مالک/ادمین منتشر می‌شود
   ========================================================= */
document.getElementById('suggestNewsForm').addEventListener('submit', e=>{
  e.preventDefault();
  if(!currentUser){ openAuthModal(); return; }
  if(isBanned(currentUser.contact)){ toast('حساب تو بن شده است.'); return; }
  const title = document.getElementById('suggestNewsTitle').value.trim();
  const body = document.getElementById('suggestNewsBody').value.trim();
  if(!title || !body) return;
  if(containsProfanity(title+' '+body)){ banUser(currentUser.contact); toast('الفاظ نامناسب — حساب تو بن شد.'); return; }
  const list = State.newsSuggestions;
  list.unshift({id:uid(), title, body, name:currentUser.name, contact:currentUser.contact, ts:Date.now(), status:'pending'});
  State.newsSuggestions = list;
  document.getElementById('suggestNewsForm').reset();
  toast('پیشنهادت ثبت شد، بعد از تأیید مدیر منتشر می‌شود.');
});
function updateSuggestBadge(){
  const badge = document.getElementById('suggestBadge');
  if(!badge) return;
  const pending = State.newsSuggestions.filter(s=>s.status==='pending').length;
  badge.textContent = pending;
  badge.classList.toggle('hidden', pending===0);
}
function renderNewsSuggestList(){
  const wrap = document.getElementById('newsSuggestList');
  if(!wrap) return;
  const list = State.newsSuggestions;
  wrap.innerHTML = list.map(s=>`
    <div class="manage-row" style="flex-direction:column;align-items:stretch;">
      <span class="mtitle">${s.status==='pending'?'🟡':s.status==='approved'?'✅':'❌'} <b>${esc(s.title)}</b> — ${esc(s.name)}</span>
      <span class="dim tiny">${esc(s.body.slice(0,120))}</span>
      ${s.status==='pending' ? `<div class="mbtns" style="margin-top:6px;">
        <button class="mbtn success" data-approve-sug="${s.id}">تأیید و انتشار</button>
        <button class="mbtn danger" data-reject-sug="${s.id}">رد کردن</button>
      </div>` : ''}
    </div>
  `).join('') || '<p class="dim tiny">پیشنهادی ثبت نشده.</p>';
  wrap.querySelectorAll('[data-approve-sug]').forEach(b=>b.addEventListener('click', ()=>{
    if(!hasPerm('publish')){ toast('دسترسی نداری.'); return; }
    const list = State.newsSuggestions;
    const s = list.find(x=>x.id===b.dataset.approveSug);
    if(!s) return;
    s.status = 'approved';
    State.newsSuggestions = list;
    const news = State.news;
    news.unshift({id:uid(), title:s.title, tag:'تحریریه', body:s.body, source:'تحریریه', sourceUrl:'#', ts:Date.now(), likes:0, likedBy:[], imageRemoved:false, textRemoved:false, auto:false, suggestedBy:s.name});
    State.news = news;
    renderNewsSuggestList(); updateSuggestBadge(); renderManageList(); renderNewsFeed();
    logActivity(`پیشنهاد خبر «${s.title}» از طرف ${s.name} تأیید و منتشر شد.`);
    toast('خبر منتشر شد.');
  }));
  wrap.querySelectorAll('[data-reject-sug]').forEach(b=>b.addEventListener('click', ()=>{
    if(!hasPerm('publish')){ toast('دسترسی نداری.'); return; }
    const list = State.newsSuggestions;
    const s = list.find(x=>x.id===b.dataset.rejectSug);
    if(s) s.status = 'rejected';
    State.newsSuggestions = list;
    renderNewsSuggestList(); updateSuggestBadge();
    logActivity(`پیشنهاد خبر «${s?.title}» رد شد.`);
    toast('پیشنهاد رد شد.');
  }));
  updateSuggestBadge();
}

function applyEventMode(){
  const banner = document.getElementById('eventBanner');
  const text = State.eventMode;
  if(text){ banner.textContent = '🎉 ' + text; banner.classList.remove('hidden'); }
  else { banner.classList.add('hidden'); }
}
document.getElementById('saveEventMode').addEventListener('click', ()=>{
  if(!hasPerm('branding')){ toast('دسترسی نداری.'); return; }
  State.eventMode = document.getElementById('eventModeText').value.trim();
  applyEventMode();
  logActivity(State.eventMode ? `حالت رویداد روشن شد: «${State.eventMode}»` : 'حالت رویداد خاموش شد.');
  toast('ذخیره شد.');
});
document.getElementById('saveUpdateCountdown').addEventListener('click', ()=>{
  if(!hasPerm('branding')){ toast('دسترسی نداری.'); return; }
  const hours = Number(document.getElementById('updateHoursInput').value);
  const msg = document.getElementById('updateMsgInput').value.trim() || 'آپدیت بعدی سایت';
  if(!hours || hours<=0){ State.updateCountdown = null; toast('شمارش‌معکوس خاموش شد.'); }
  else { State.updateCountdown = {at: Date.now()+hours*3600000, msg}; toast('شمارش‌معکوس ذخیره شد.'); }
  logActivity(hours>0 ? `شمارش‌معکوس آپدیت برای ${hours} ساعت دیگر تنظیم شد.` : 'شمارش‌معکوس آپدیت خاموش شد.');
  tickUpdateCountdown();
});
function tickUpdateCountdown(){
  const el = document.getElementById('updateCountdownDisplay');
  if(!el) return;
  const cd = State.updateCountdown;
  if(!cd || !cd.at){ el.classList.add('hidden'); return; }
  const remain = cd.at - Date.now();
  if(remain<=0){ el.classList.add('hidden'); return; }
  const h = Math.floor(remain/3600000);
  const m = Math.floor((remain%3600000)/60000);
  el.textContent = `⏳ ${cd.msg}: ${h} ساعت و ${m} دقیقه دیگر`;
  el.classList.remove('hidden');
}

/* =========================================================
   داشبورد مالک — خلاصه سریع + اقدام سریع
   ========================================================= */
function renderDashboard(){
  const box = document.getElementById('dashboardStats');
  if(!box) return;
  const weekAgo = Date.now() - 7*24*60*60*1000;
  const twoWeeksAgo = Date.now() - 14*24*60*60*1000;
  const newMembersThisWeek = State.users.filter(u=>u.joinedAt>=weekAgo).length;
  const newMembersLastWeek = State.users.filter(u=>u.joinedAt>=twoWeeksAgo && u.joinedAt<weekAgo).length;
  const growthPct = newMembersLastWeek ? Math.round(((newMembersThisWeek-newMembersLastWeek)/newMembersLastWeek)*100) : (newMembersThisWeek>0?100:0);
  const pendingSuggestions = State.newsSuggestions.filter(s=>s.status==='pending').length;
  const openBugs = State.bugReports.filter(r=>!r.resolved).length;
  const openReports = State.reports.filter(r=>!r.resolved).length;
  box.innerHTML = `
    <div class="stat-box"><b>${State.news.length}</b><span>کل اخبار</span></div>
    <div class="stat-box"><b>${State.users.length}</b><span>کل اعضا</span></div>
    <div class="stat-box"><b>${newMembersThisWeek}</b><span>عضو تازه (۷ روز)</span></div>
    <div class="stat-box"><b>${growthPct>=0?'+':''}${growthPct}%</b><span>رشد نسبت به هفته قبل</span></div>
    <div class="stat-box"><b>${pendingSuggestions}</b><span>پیشنهاد خبر در صف</span></div>
    <div class="stat-box"><b>${openBugs}</b><span>گزارش باگ باز</span></div>
    <div class="stat-box"><b>${openReports}</b><span>گزارش محتوا باز</span></div>
    <div class="stat-box"><b>${State.banned.length}</b><span>کاربر بن‌شده</span></div>
  `;
  const actWrap = document.getElementById('dashboardActivity');
  if(actWrap){
    actWrap.innerHTML = State.activityLog.slice(0,5).map(l=>`<div class="log-item"><span>${esc(l.who)}: ${esc(l.text)}</span><span class="ltime">${new Date(l.ts).toLocaleString('fa-IR')}</span></div>`).join('') || '<p class="dim tiny">فعالیتی ثبت نشده.</p>';
  }
  const playerActWrap = document.getElementById('dashboardPlayerActivity');
  if(playerActWrap){
    playerActWrap.innerHTML = State.playerActivityLog.slice(0,10).map(l=>`<div class="log-item"><span>${esc(l.who)}: ${esc(l.text)}</span><span class="ltime">${new Date(l.ts).toLocaleString('fa-IR')}</span></div>`).join('') || '<p class="dim tiny">فعالیتی ثبت نشده.</p>';
  }
  const evInput = document.getElementById('eventModeText');
  if(evInput && document.activeElement!==evInput) evInput.value = State.eventMode;
  const updMsgInput = document.getElementById('updateMsgInput');
  if(updMsgInput && document.activeElement!==updMsgInput && State.updateCountdown) updMsgInput.value = State.updateCountdown.msg;
}
document.querySelectorAll('[data-goto-atab]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const target = document.querySelector(`.atab[data-atab="${btn.dataset.gotoAtab}"]`);
    if(target) target.click();
  });
});

function renderSiteInfo(){
  const info = `GameHub — مشخصات کامل سایت
مالک: ${OWNER_DISPLAY}
ورود پنل: ${OWNER_USERNAME} / (رمزی که خودت تعیین کردی)
صفحات: خانه، روبلاکس، بازی‌ها، هوش مصنوعی، پنل ادمین، تنظیمات، چت، اکسپلور، پروفایل
بازی‌ها: مار طلایی پرو، حافظه تاج، دوز (مقابل هوش مصنوعی)
ذخیره‌سازی: دادهٔ مشترک روی سرور (SQLite) + کش محلی در localStorage
تعداد اخبار فعلی: ${State.news.length}
تعداد اعضا: ${State.users.length}
تعداد ادمین‌ها: ${State.admins.length}
نکته امنیتی: این نسخه فرانت‌اند است؛ برای امنیت واقعی سمت سرور به بک‌اند و دیتابیس نیاز است.
نکته رصد: رصد خودکار از یک استخر تیتر نمایشی شبیه‌سازی می‌شود، نه کراول زنده کل اینترنت.`;
  document.getElementById('siteInfoCode').textContent = info;
}
document.getElementById('copySiteInfo').addEventListener('click', ()=>{
  navigator.clipboard?.writeText(document.getElementById('siteInfoCode').textContent);
  toast('مشخصات کپی شد.');
});

/* =========================================================
   گزارش‌ها — کاربران خبر/دیدگاه نامناسب را گزارش می‌دهند
   ========================================================= */
function reportItem(type, id, title){
  if(!currentUser){ openAuthModal(); return; }
  const reports = State.reports;
  reports.unshift({id:uid(), type, targetId:id, title, by:currentUser.contact, ts:Date.now(), resolved:false});
  State.reports = reports;
  toast('گزارش تو برای بررسی به پنل ادمین ارسال شد.');
  updateReportBadge();
}
function updateReportBadge(){
  const badge = document.getElementById('reportBadge');
  const open = State.reports.filter(r=>!r.resolved).length;
  if(badge){
    badge.textContent = open;
    badge.classList.toggle('hidden', open===0);
  }
}
function renderReports(){
  const wrap = document.getElementById('reportList');
  if(!wrap) return;
  const reports = State.reports;
  wrap.innerHTML = reports.map(r=>`
    <div class="manage-row">
      <span class="mtitle">${r.resolved?'✅ ':'⏳ '}[${esc(r.type==='news'?'خبر':'دیدگاه')}] ${esc(r.title)} <span class="dim tiny">— گزارش‌دهنده: ${esc(r.by)}</span></span>
      ${!r.resolved ? `<button class="mbtn success" data-r="${r.id}">بررسی شد</button>` : ''}
    </div>
  `).join('') || '<p class="dim tiny">هیچ گزارشی ثبت نشده.</p>';
  wrap.querySelectorAll('.mbtn').forEach(btn=>btn.addEventListener('click', ()=>{
    const reports = State.reports;
    const r = reports.find(x=>x.id===btn.dataset.r);
    if(r) r.resolved = true;
    State.reports = reports;
    renderReports();
    updateReportBadge();
  }));
}

/* =========================================================
   زمان‌بندی انتشار خبر
   ========================================================= */
document.getElementById('scheduleForm').addEventListener('submit', e=>{
  e.preventDefault();
  const title = document.getElementById('schTitle').value.trim();
  const tag = document.getElementById('schTag').value.trim() || 'تحریریه';
  const body = document.getElementById('schBody').value.trim();
  const time = document.getElementById('schTime').value;
  if(!title || !body || !time) return;
  const publishAt = new Date(time).getTime();
  const sch = State.scheduled;
  sch.push({id:uid(), title, tag, body, publishAt});
  State.scheduled = sch;
  e.target.reset();
  document.getElementById('schTag').value = 'تحریریه';
  toast('خبر زمان‌بندی شد.');
  logActivity(`خبر «${title}» برای ${new Date(publishAt).toLocaleString('fa-IR')} زمان‌بندی شد.`);
  renderScheduleList();
});
function renderScheduleList(){
  const wrap = document.getElementById('scheduleList');
  if(!wrap) return;
  const sch = State.scheduled;
  wrap.innerHTML = sch.map(s=>`
    <div class="manage-row">
      <span class="mtitle">${esc(s.title)} <span class="dim tiny">— ${new Date(s.publishAt).toLocaleString('fa-IR')}</span></span>
      <button class="mbtn danger" data-id="${s.id}">لغو</button>
    </div>
  `).join('') || '<p class="dim tiny">خبر زمان‌بندی‌شده‌ای نیست.</p>';
  wrap.querySelectorAll('.mbtn').forEach(btn=>btn.addEventListener('click', ()=>{
    State.scheduled = State.scheduled.filter(s=>s.id!==btn.dataset.id);
    renderScheduleList();
    toast('زمان‌بندی لغو شد.');
  }));
}
function publishDueScheduled(){
  const sch = State.scheduled;
  const due = sch.filter(s=>s.publishAt<=Date.now());
  if(!due.length) return;
  const news = State.news;
  due.forEach(s=>{
    news.unshift({id:uid(), title:s.title, tag:s.tag, body:s.body, source:'تحریریه', sourceUrl:'#', ts:Date.now(), likes:0, likedBy:[], imageRemoved:false, textRemoved:false, auto:false});
    logActivity(`خبر زمان‌بندی‌شده «${s.title}» منتشر شد.`);
  });
  State.news = news;
  State.scheduled = sch.filter(s=>s.publishAt>Date.now());
  renderNewsFeed(); renderScheduleList(); renderManageList();
}

/* =========================================================
   آمار پیشرفته + نمودار
   ========================================================= */
function renderAnalytics(){
  const box = document.getElementById('analyticsStats');
  if(!box) return;
  const news = State.news;
  const totalLikes = news.reduce((a,n)=>a+(n.likes||0),0);
  const avgLikes = news.length ? +(totalLikes/news.length).toFixed(1) : 0;
  const allComments = Object.values(State.comments).flat();
  const totalComments = allComments.length;
  const avgCommentsPerNews = news.length ? +(totalComments/news.length).toFixed(2) : 0;
  const tagCounts = {};
  news.forEach(n=>{ tagCounts[n.tag||'سایر'] = (tagCounts[n.tag||'سایر']||0)+1; });
  const topTagEntry = Object.entries(tagCounts).sort((a,b)=>b[1]-a[1])[0];
  const topTagPct = topTagEntry && news.length ? Math.round((topTagEntry[1]/news.length)*100) : 0;
  const engagementRate = news.length ? +(((totalLikes+totalComments)/news.length)).toFixed(1) : 0;
  const avgWords = news.length ? Math.round(news.reduce((a,n)=>a+(n.body||'').split(/\s+/).length,0)/news.length) : 0;
  const autoCount = news.filter(n=>n.auto).length;
  const editorialCount = news.length - autoCount;

  box.innerHTML = `
    <div class="stat-box"><b>${news.length}</b><span>کل اخبار</span></div>
    <div class="stat-box"><b>${editorialCount} / ${autoCount}</b><span>تحریریه / رصدشده خودکار</span></div>
    <div class="stat-box"><b>${avgWords}</b><span>میانگین کلمات هر خبر</span></div>
    <div class="stat-box"><b>${totalLikes}</b><span>کل لایک‌ها</span></div>
    <div class="stat-box"><b>${avgLikes}</b><span>میانگین لایک هر خبر</span></div>
    <div class="stat-box"><b>${totalComments}</b><span>کل دیدگاه‌ها</span></div>
    <div class="stat-box"><b>${avgCommentsPerNews}</b><span>میانگین دیدگاه هر خبر</span></div>
    <div class="stat-box"><b>${topTagEntry?esc(topTagEntry[0]):'—'} (${topTagPct}%)</b><span>پرتکرارترین برچسب</span></div>
    <div class="stat-box"><b>${engagementRate}</b><span>نرخ تعامل هر خبر (لایک+کامنت)</span></div>
    <div class="stat-box"><b>${State.users.length}</b><span>کل اعضا</span></div>
  `;
  drawBarChart('tagChart', tagCounts);

  // رشد اعضای تازه در ۷ روز اخیر — بر اساس تاریخ عضویت واقعی کاربرها
  const days = [];
  for(let i=6;i>=0;i--){
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-i);
    days.push(d);
  }
  const growthData = {};
  days.forEach(d=>{
    const label = d.toLocaleDateString('fa-IR', {day:'numeric', month:'numeric'});
    const nextDay = new Date(d); nextDay.setDate(d.getDate()+1);
    growthData[label] = State.users.filter(u=>u.joinedAt>=d.getTime() && u.joinedAt<nextDay.getTime()).length;
  });
  drawBarChart('growthChart', growthData);

  const top = document.getElementById('topLikedList');
  const topN = [...news].sort((a,b)=>(b.likes||0)-(a.likes||0)).slice(0,5);
  top.innerHTML = topN.map(n=>`<div class="manage-row"><span class="mtitle">${esc(n.title)}</span><span class="dim tiny">❤ ${n.likes||0}</span></div>`).join('') || '<p class="dim tiny">داده‌ای نیست.</p>';

  // فعال‌ترین کاربران بر اساس تعداد دیدگاه واقعی
  const commentCounts = {};
  allComments.forEach(c=>{ if(c.name) commentCounts[c.name] = (commentCounts[c.name]||0)+1; });
  const topCommenters = Object.entries(commentCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const tcWrap = document.getElementById('topCommentersList');
  if(tcWrap) tcWrap.innerHTML = topCommenters.map(([name,count])=>`<div class="manage-row"><span class="mtitle">${esc(name)}</span><span class="dim tiny">${count} دیدگاه</span></div>`).join('') || '<p class="dim tiny">هنوز دیدگاهی ثبت نشده.</p>';
}
function drawBarChart(canvasId, dataObj){
  const canvas = document.getElementById(canvasId);
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const entries = Object.entries(dataObj);
  if(!entries.length) return;
  const max = Math.max(...entries.map(e=>e[1]), 1);
  const barW = canvas.width / entries.length;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d4a72c';
  entries.forEach(([label,val],i)=>{
    const h = (val/max) * (canvas.height-40);
    const x = i*barW + barW*0.15;
    const y = canvas.height - h - 24;
    ctx.fillStyle = accent;
    ctx.fillRect(x, y, barW*0.7, h);
    ctx.fillStyle = '#9a9fc2';
    ctx.font = '11px Vazirmatn';
    ctx.textAlign = 'center';
    ctx.fillText(label, x+barW*0.35, canvas.height-8);
    ctx.fillStyle = '#e9e7f2';
    ctx.fillText(val, x+barW*0.35, y-6);
  });
}

/* =========================================================
   پشتیبان‌گیری — خروجی و ورودی کامل داده‌های سایت
   ========================================================= */
document.getElementById('exportBtn').addEventListener('click', ()=>{
  const data = {};
  for(let i=0;i<localStorage.length;i++){
    const key = localStorage.key(i);
    if(key.startsWith('gh_')) data[key] = localStorage.getItem(key);
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `gamehub-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  logActivity('یک نسخه پشتیبان از داده‌های سایت دانلود شد.');
  toast('فایل پشتیبان دانلود شد.');
});
document.getElementById('importFile').addEventListener('change', e=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const data = JSON.parse(reader.result);
      if(!confirm('این کار داده‌های فعلی سایت را با فایل پشتیبان جایگزین می‌کند. مطمئنی؟')) return;
      Object.entries(data).forEach(([k,v])=>{ if(k.startsWith('gh_')) localStorage.setItem(k, v); });
      toast('بازگردانی انجام شد. صفحه رفرش می‌شود...');
      setTimeout(()=>location.reload(), 1200);
    }catch(err){ toast('فایل پشتیبان معتبر نیست.'); }
  };
  reader.readAsText(file);
});

/* =========================================================
   سفارشی‌سازی ظاهر — رنگ اصلی سایت
   ========================================================= */
document.getElementById('accentPicker').addEventListener('click', e=>{
  const btn = e.target.closest('[data-accent]'); if(!btn) return;
  const color = btn.dataset.accent;
  const s = State.settings; s.accent = color; State.settings = s;
  document.documentElement.style.setProperty('--accent', color);
  toast('رنگ سایت تغییر کرد.');
  logActivity(`رنگ اصلی سایت به ${color} تغییر کرد.`);
});

/* =========================================================
   اتاق فرمان مالک — هوش مصنوعی مخفی ادمین
   این فقط داخل پنل ادمین دیده می‌شود، کاربر عادی هرگز نمی‌بیند.
   ========================================================= */
function ownerAiRespond(cmd){
  const c = cmd.trim();
  if(/^آمار/.test(c)){
    return `📊 آمار سایت: ${State.news.length} خبر، ${State.users.length} عضو، ${Object.values(State.comments).reduce((a,x)=>a+x.length,0)} دیدگاه، ${State.banned.length} بن‌شده.`;
  }
  if(/^تیترها/.test(c)){
    return State.news.slice(0,8).map((n,i)=>`${i+1}. ${n.title}`).join('\n') || 'خبری نیست.';
  }
  if(/^اعضا/.test(c)){
    return State.users.map(u=>u.name).join('، ') || 'عضوی نیست.';
  }
  if(/^رصد/.test(c)){
    runAutoScan();
    return '✅ رصد انجام شد و اگر تیتر تازه‌ای بود اضافه شد.';
  }
  if(/^منتشر کن:/.test(c)){
    const rest = c.replace(/^منتشر کن:/,'').trim();
    const [title, body] = rest.split('|').map(s=>s?.trim());
    if(!title || !body) return 'فرمت درست: منتشر کن: عنوان | متن کامل';
    const news = State.news;
    news.unshift({id:uid(), title, tag:'تحریریه', body, source:'تحریریه', sourceUrl:'#', ts:Date.now(), likes:0, likedBy:[], imageRemoved:false, textRemoved:false, auto:false});
    State.news = news;
    renderManageList(); renderNewsFeed();
    return `✅ خبر «${title}» منتشر شد.`;
  }
  if(/^حذف خبر:/.test(c)){
    const word = c.replace(/^حذف خبر:/,'').trim();
    const news = State.news;
    const match = news.find(n=>n.title.includes(word));
    if(!match) return 'خبری با آن کلمه پیدا نشد.';
    State.news = news.filter(n=>n.id!==match.id);
    renderManageList(); renderNewsFeed();
    return `🗑️ خبر «${match.title}» حذف شد.`;
  }
  if(/^حذف عکس:/.test(c)){
    const word = c.replace(/^حذف عکس:/,'').trim();
    const news = State.news;
    const match = news.find(n=>n.title.includes(word));
    if(!match) return 'خبری با آن کلمه پیدا نشد.';
    match.imageRemoved = true; State.news = news; renderNewsFeed();
    return `🖼️ عکس خبر «${match.title}» حذف شد.`;
  }
  if(/^حذف متن:/.test(c)){
    const word = c.replace(/^حذف متن:/,'').trim();
    const news = State.news;
    const match = news.find(n=>n.title.includes(word));
    if(!match) return 'خبری با آن کلمه پیدا نشد.';
    match.textRemoved = true; State.news = news; renderNewsFeed();
    return `✂️ متن خبر «${match.title}» حذف شد.`;
  }
  if(/^پاکسازی دیدگاه:/.test(c)){
    const word = c.replace(/^پاکسازی دیدگاه:/,'').trim();
    const news = State.news.find(n=>n.title.includes(word));
    if(!news) return 'خبری با آن کلمه پیدا نشد.';
    const cs = State.comments; cs[news.id] = []; State.comments = cs;
    return `🧹 دیدگاه‌های خبر «${news.title}» پاک شد.`;
  }
  if(/^برچسب:/.test(c)){
    const rest = c.replace(/^برچسب:/,'').trim();
    const [word, tag] = rest.split('|').map(s=>s?.trim());
    const news = State.news;
    const match = news.find(n=>n.title.includes(word));
    if(!match) return 'خبری با آن کلمه پیدا نشد.';
    match.tag = tag; State.news = news; renderNewsFeed();
    return `🏷️ برچسب خبر «${match.title}» به «${tag}» تغییر کرد.`;
  }
  if(/^ادمین بساز:/.test(c)){
    if(currentAdmin.role!=='owner') return 'فقط مالک می‌تواند ادمین بسازد.';
    const rest = c.replace(/^ادمین بساز:/,'').trim();
    const [name, pass] = rest.split('|').map(s=>s?.trim());
    if(!name || !pass || pass.length<8) return 'فرمت: ادمین بساز: نام | رمز۸حرفی';
    const admins = State.admins;
    admins.push({username:name, hash:simpleHash(pass), role:'admin', display:name});
    State.admins = admins;
    renderAdminList();
    return `✅ ادمین «${name}» ساخته شد.`;
  }
  if(/^پیام همه:/.test(c)){
    const text = c.replace(/^پیام همه:/,'').trim();
    const log = State.broadcastLog; log.push({id:uid(), text, ts:Date.now()}); State.broadcastLog = log;
    showBroadcast({text});
    logActivity(`(از اتاق فرمان) پیام همگانی ارسال شد: «${text.slice(0,40)}»`);
    return '📢 پیام برای همه ارسال شد.';
  }
  if(/^بن کن:/.test(c)){
    const contact = c.replace(/^بن کن:/,'').trim();
    if(!contact) return 'فرمت: بن کن: ایمیل یا شماره کاربر';
    banUser(contact);
    renderBanList();
    logActivity(`(از اتاق فرمان) کاربر «${contact}» بن شد.`);
    return `🚫 کاربر «${contact}» بن شد.`;
  }
  if(/^رفع بن:/.test(c)){
    const contact = c.replace(/^رفع بن:/,'').trim();
    State.banned = State.banned.filter(x=>x!==contact);
    renderBanList();
    logActivity(`(از اتاق فرمان) بن کاربر «${contact}» برداشته شد.`);
    return `✅ بن «${contact}» برداشته شد.`;
  }
  if(/^تعمیر روشن/.test(c)){
    if(currentAdmin.role!=='owner') return 'فقط مالک می‌تواند حالت تعمیر را تغییر دهد.';
    State.maintenance = true; renderActivityLog(); applyMaintenanceGate();
    logActivity('(از اتاق فرمان) حالت تعمیر روشن شد.');
    return '🔧 حالت تعمیر برای کاربران عادی روشن شد.';
  }
  if(/^تعمیر خاموش/.test(c)){
    if(currentAdmin.role!=='owner') return 'فقط مالک می‌تواند حالت تعمیر را تغییر دهد.';
    State.maintenance = false; renderActivityLog(); applyMaintenanceGate();
    logActivity('(از اتاق فرمان) حالت تعمیر خاموش شد.');
    return '✅ سایت دوباره برای همه فعال شد.';
  }
  if(/^تیک بده:/.test(c)){
    const contact = c.replace(/^تیک بده:/,'').trim();
    const v = State.verifiedUsers;
    if(!v.includes(contact)){ v.push(contact); State.verifiedUsers = v; }
    renderVerifyList();
    logActivity(`(از اتاق فرمان) تیک آبی به «${contact}» اعطا شد.`);
    return `✅ تیک آبی به «${contact}» داده شد.`;
  }
  if(/^تیک بگیر:/.test(c)){
    const contact = c.replace(/^تیک بگیر:/,'').trim();
    State.verifiedUsers = State.verifiedUsers.filter(x=>x!==contact);
    renderVerifyList();
    logActivity(`(از اتاق فرمان) تیک آبی «${contact}» گرفته شد.`);
    return `❌ تیک آبی «${contact}» گرفته شد.`;
  }
  if(/^سنجاق:/.test(c)){
    const word = c.replace(/^سنجاق:/,'').trim();
    const match = State.news.find(n=>n.title.includes(word));
    if(!match) return 'خبری با آن کلمه پیدا نشد.';
    State.pinnedId = match.id;
    renderPinList(); renderNewsFeed();
    logActivity(`(از اتاق فرمان) خبر «${match.title}» سنجاق شد.`);
    return `📌 خبر «${match.title}» سنجاق شد.`;
  }
  if(/^قفل دیدگاه روشن/.test(c)){
    State.commentsFrozen = true; renderPowerTools();
    logActivity('(از اتاق فرمان) دیدگاه‌های سایت قفل شد.');
    return '🔒 دیدگاه‌های کل سایت بسته شد.';
  }
  if(/^قفل دیدگاه خاموش/.test(c)){
    State.commentsFrozen = false; renderPowerTools();
    logActivity('(از اتاق فرمان) دیدگاه‌های سایت باز شد.');
    return '✅ دیدگاه‌های کل سایت دوباره باز شد.';
  }
  if(/^رنگ:/.test(c)){
    const color = c.replace(/^رنگ:/,'').trim();
    if(!/^#[0-9a-fA-F]{6}$/.test(color)) return 'فرمت: رنگ: #d4a72c (کد رنگ هگز)';
    const s = State.settings; s.accent = color; State.settings = s;
    document.documentElement.style.setProperty('--accent', color);
    logActivity(`(از اتاق فرمان) رنگ اصلی سایت به ${color} تغییر کرد.`);
    return `🎨 رنگ اصلی سایت به ${color} تغییر کرد.`;
  }
  if(/^پشتیبان/.test(c)){
    document.getElementById('exportBtn').click();
    return '💾 دانلود فایل پشتیبان شروع شد.';
  }
  if(/^گزارش/.test(c)){
    const open = State.reports.filter(r=>!r.resolved);
    if(!open.length) return 'هیچ گزارش بازی وجود ندارد.';
    return open.slice(0,8).map((r,i)=>`${i+1}. [${r.type==='news'?'خبر':'دیدگاه'}] ${r.title}`).join('\n');
  }
  if(/^زمان‌بندی|^زمانبندی/.test(c)){
    const sch = State.scheduled;
    if(!sch.length) return 'خبر زمان‌بندی‌شده‌ای وجود ندارد.';
    return sch.map((s,i)=>`${i+1}. ${s.title} — ${new Date(s.publishAt).toLocaleString('fa-IR')}`).join('\n');
  }
  if(/^لاگ/.test(c)){
    const log = State.activityLog.slice(0,6);
    return log.length ? log.map(l=>`${l.who}: ${l.text}`).join('\n') : 'فعالیتی ثبت نشده.';
  }
  if(/^پیشنهادها/.test(c)){
    const pending = State.newsSuggestions.filter(s=>s.status==='pending');
    return pending.length ? pending.map((s,i)=>`${i+1}. ${s.title} — از ${s.name}`).join('\n') : 'پیشنهاد خبر تازه‌ای نیست.';
  }
  if(/^کد دعوت بساز/.test(c)){
    const codes = State.inviteCodes;
    const code = genInviteCode();
    codes.push({code, maxUses:1, used:0, createdAt:Date.now()});
    State.inviteCodes = codes;
    return `🎟️ کد دعوت ساخته شد: ${code} (یک‌بار مصرف)`;
  }
  if(/^نظرسنجی:/.test(c)){
    const rest = c.replace(/^نظرسنجی:/,'').trim();
    const [q, optsRaw] = rest.split('|').map(s=>s?.trim());
    if(!q || !optsRaw) return 'فرمت: نظرسنجی: سوال | گزینه۱،گزینه۲،گزینه۳';
    const opts = optsRaw.split('،').join(',').split(',').map(s=>s.trim()).filter(Boolean);
    if(opts.length<2) return 'حداقل ۲ گزینه لازم است.';
    const polls = State.polls.map(p=>({...p, active:false}));
    polls.push({id:uid(), question:q, options:opts.map(t=>({text:t, votes:0})), votedBy:[], active:true, createdAt:Date.now()});
    State.polls = polls;
    return `📊 نظرسنجی «${q}» منتشر شد.`;
  }
  if(/^راهنما|^کمک/.test(c)){
    return `فرمان‌های موجود:
آمار | تیترها | اعضا | رصد | لاگ | گزارش | زمان‌بندی | پیشنهادها
منتشر کن: عنوان | متن
حذف خبر: کلمه | حذف عکس: کلمه | حذف متن: کلمه
پاکسازی دیدگاه: کلمه | برچسب: عنوان | برچسب‌جدید
بن کن: کانتکت | رفع بن: کانتکت
تیک بده: کانتکت | تیک بگیر: کانتکت
سنجاق: کلمه‌ای از عنوان
قفل دیدگاه روشن | قفل دیدگاه خاموش
تعمیر روشن | تعمیر خاموش
رنگ: #hex | پشتیبان
کد دعوت بساز
نظرسنجی: سوال | گزینه۱،گزینه۲
ادمین بساز: نام | رمز۸حرفی | پیام همه: متن`;
  }
  return `فرمان شناخته نشد. برای دیدن همه فرمان‌ها بنویس «راهنما».`;
}
function pushChat(container, role, text){
  const el = document.createElement('div');
  el.className = 'chat-msg ' + role;
  el.textContent = text;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}
function pushChatImage(container, role, dataUrl, filename){
  const el = document.createElement('div');
  el.className = 'chat-msg ' + role;
  el.innerHTML = `<img src="${dataUrl}" alt="${esc(filename||'')}" style="max-width:180px;border-radius:10px;display:block;">`;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}
function wireChatAttach(attachBtnId, inputId, windowId, historyArr, respondLabel){
  document.getElementById(attachBtnId).addEventListener('click', ()=>document.getElementById(inputId).click());
  document.getElementById(inputId).addEventListener('change', e=>{
    const file = e.target.files[0];
    if(!file) return;
    const win = document.getElementById(windowId);
    const isImage = file.type.startsWith('image/');
    if(isImage){
      const reader = new FileReader();
      reader.onload = ()=>{
        pushChatImage(win, 'user', reader.result, file.name);
        const reply = `عکس «${file.name}» رو گرفتم 📎 — ولی صادقانه بگم: من یه هوش مصنوعی ساده‌ی مبتنی‌بر قانون‌های از‌پیش‌نوشته‌شده‌ام، نه یه مدل واقعی مثل کلود که بتونه واقعاً محتوای عکس رو ببینه و تحلیل کنه. اگه چیزی درباره‌ی محتوای عکس بخوای بدونی، بهتره خودت با چند کلمه توضیحش بدی تا کمکت کنم.`;
        pushChat(win, 'bot', reply);
      };
      reader.readAsDataURL(file);
    } else {
      pushChat(win, 'user', `📎 فایل پیوست شد: ${file.name}`);
      pushChat(win, 'bot', `فایل «${file.name}» رو گرفتم، ولی چون یه هوش مصنوعی ساده‌ی قانون‌محورم (نه یه مدل واقعی زبانی)، نمی‌تونم محتوای فایل رو واقعاً بخونم یا تحلیل کنم.`);
    }
    e.target.value = '';
  });
}
wireChatAttach('aiAttachBtn', 'aiAttachInput', 'chatWindow');
wireChatAttach('ownerAiAttachBtn', 'ownerAiAttachInput', 'ownerChatWindow');
document.getElementById('ownerAiForm').addEventListener('submit', e=>{
  e.preventDefault();
  const input = document.getElementById('ownerAiInput');
  const text = input.value.trim();
  if(!text) return;
  const win = document.getElementById('ownerChatWindow');
  pushChat(win, 'user', text);
  ownerChatHistory.push({role:'user', text});
  const reply = ownerAiRespond(text);
  pushChat(win, 'bot', reply);
  ownerChatHistory.push({role:'bot', text:reply});
  input.value='';
});

/* =========================================================
   هوش مصنوعی عمومی (برای همه کاربران)
   ========================================================= */
function renderPublicChat(){
  const win = document.getElementById('chatWindow');
  if(win.childElementCount===0){
    pushChat(win,'bot','سلام! من هوش مصنوعی گیم‌هاب هستم 🎮 می‌تونی بپرسی: «آخرین خبرها»، اسم یک بازی، یا راهنمای کامنت و بازی‌ها بخوای.');
  }
}
/* publicAiRespond redefined below for stronger AI */
function publicAiRespond_LEGACY_REMOVED(){return '';}

document.getElementById('aiForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const input=document.getElementById('aiInput'); const text=input.value.trim(); if(!text) return;
  const win=document.getElementById('chatWindow'); pushChat(win,'user',text); publicChatHistory.push({role:'user',text});
  const provider=document.getElementById('aiProvider')?.value||'openai';
  const file=document.getElementById('aiAttachInput')?.files?.[0];
  const localFirst = publicAiRespond(text);
  // اگر پاسخ محلی قوی بود و سرور لازم نبود سریع برگردان — اما برای سوالات باز برو سرور
  const needsServer = backendAvailable() && (currentUser || true) && (
    text.length > 40 || /تحلیل|مقایسه|توضیح|چرا|چگونه|review|explain/i.test(text)
  );
  if(backendAvailable() && currentUser && needsServer){
    pushChat(win,'bot','در حال فکر کردن…');
    try{
      let attachment=null;
      if(file){ const fd=new FormData(); fd.append('file',file); const ur=await fetch('/api/upload',{method:'POST',credentials:'include',body:fd}); if(ur.ok){ const uj=await ur.json(); attachment=location.origin+uj.file.url; } }
      const headlines = (State.news||[]).slice(0,6).map(n=>n.title).join(' | ');
      const sys = 'تو دستیار گیم‌هاب هستی. فارسی، مفید، مختصر و دوستانه جواب بده. اخبار فعلی سایت: '+headlines;
      const prompt = sys + '\n\nسوال کاربر: ' + text;
      const rr=await fetch('/api/ai/chat',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider,prompt,attachment})});
      const jj=await rr.json();
      const bubbles=win.querySelectorAll('.chat-bubble'); if(bubbles.length) bubbles[bubbles.length-1].remove();
      const ans = (jj.answer && !/کلید API|تنظیم نشده/.test(jj.answer)) ? jj.answer : localFirst;
      pushChat(win,'bot', ans);
      input.value=''; if(document.getElementById('aiAttachInput')) document.getElementById('aiAttachInput').value=''; return;
    }catch(err){}
  }
  if(publicChatHistory.length>12) publicChatHistory.shift();
  pushChat(win,'bot', localFirst);
  input.value='';
});

/* =========================================================
   روبلاکس
   ========================================================= */
function renderRoblox(){
  const grid = document.getElementById('robloxGrid');
  grid.innerHTML = State.robloxSections.map(s=>`<div class="roblox-item"><h4>${esc(s.h)}</h4><p>${esc(s.p)}</p></div>`).join('');
  renderRobloxNews();
}
function renderRobloxNews(){
  const wrap = document.getElementById('robloxNews');
  const items = load('gh_roblox_news', null) ?? (()=>{
    const seed = ROBLOX_SCAN_POOL.slice(0,2).map(s=>({id:uid(), title:s.title, src:s.src, ts:Date.now()}));
    save('gh_roblox_news', seed); return seed;
  })();
  wrap.innerHTML = items.map(n=>`<div class="news-card" style="cursor:default"><div class="news-title">${esc(n.title)}</div><div class="dim tiny">${esc(n.src)} · ${new Date(n.ts).toLocaleTimeString('fa-IR')}</div></div>`).join('');
}
function scanRobloxOnce(){
  const items = load('gh_roblox_news', []);
  const pool = ROBLOX_SCAN_POOL.filter(p=>!items.some(i=>i.title===p.title));
  if(!pool.length) return false;
  const pick = pool[Math.floor(Math.random()*pool.length)];
  items.unshift({id:uid(), title:pick.title, src:pick.src, ts:Date.now()});
  save('gh_roblox_news', items.slice(0,12));
  if(currentView==='roblox') renderRobloxNews();
  return true;
}
document.getElementById('robloxScanBtn').addEventListener('click', ()=>{
  const added = scanRobloxOnce();
  renderRobloxNews();
  toast(added ? 'یک خبر تازه روبلاکس رصد شد.' : 'خبر تازه‌ای برای رصد نبود.');
});

/* =========================================================
   انیمه
   ========================================================= */
function renderAnime(){
  const grid = document.getElementById('animeGrid');
  grid.innerHTML = State.animeSections.map(s=>`<div class="roblox-item"><h4>${esc(s.h)}</h4><p>${esc(s.p)}</p></div>`).join('');
  renderAnimeNews();
}
function renderAnimeNews(){
  const wrap = document.getElementById('animeNews');
  const items = load('gh_anime_news', null) ?? (()=>{
    const seed = ANIME_SCAN_POOL.slice(0,2).map(s=>({id:uid(), title:s.title, src:s.src, ts:Date.now()}));
    save('gh_anime_news', seed); return seed;
  })();
  wrap.innerHTML = items.map(n=>`<div class="news-card" style="cursor:default"><div class="news-title">${esc(n.title)}</div><div class="dim tiny">${esc(n.src)} · ${new Date(n.ts).toLocaleTimeString('fa-IR')}</div></div>`).join('');
}
function scanAnimeOnce(){
  const items = load('gh_anime_news', []);
  const pool = ANIME_SCAN_POOL.filter(p=>!items.some(i=>i.title===p.title));
  if(!pool.length) return false;
  const pick = pool[Math.floor(Math.random()*pool.length)];
  items.unshift({id:uid(), title:pick.title, src:pick.src, ts:Date.now()});
  save('gh_anime_news', items.slice(0,12));
  if(currentView==='anime') renderAnimeNews();
  return true;
}
document.getElementById('animeScanBtn').addEventListener('click', ()=>{
  const added = scanAnimeOnce();
  renderAnimeNews();
  toast(added ? 'یک خبر تازه انیمه رصد شد.' : 'خبر تازه‌ای برای رصد نبود.');
});

/* =========================================================
   تنظیمات
   ========================================================= */
function applySettings(){
  const s = State.settings;
  document.documentElement.setAttribute('data-theme', s.theme);
  document.documentElement.setAttribute('data-density', s.density);
  document.querySelectorAll('[data-theme]').forEach(b=>b.classList.toggle('active', b.dataset.theme===s.theme));
  document.querySelectorAll('[data-density]').forEach(b=>b.classList.toggle('active', b.dataset.density===s.density));
  document.querySelector('main').setAttribute('data-density', s.density);
  if(s.accent) document.documentElement.style.setProperty('--accent', s.accent);
  if(s.accent2) document.documentElement.style.setProperty('--accent2', s.accent2);
  const myAccentMap = {gold:'#d4a72c', violet:'#7c5cff', green:'#4cc38a', pink:'#e0546a'};
  if(s.myAccent && myAccentMap[s.myAccent]) document.documentElement.style.setProperty('--accent', myAccentMap[s.myAccent]);
  document.querySelectorAll('[data-myaccent]').forEach(b=>b.classList.toggle('active', b.dataset.myaccent===(s.myAccent||'default')));
  document.querySelectorAll('[data-autoplay]').forEach(b=>b.classList.toggle('active', b.dataset.autoplay===(s.autoplay!==false?'on':'off')));
  document.querySelectorAll('[data-broadcastpref]').forEach(b=>b.classList.toggle('active', b.dataset.broadcastpref===(s.broadcastPref!==false?'on':'off')));
  document.querySelectorAll('[data-soundpref]').forEach(b=>b.classList.toggle('active', b.dataset.soundpref===(s.soundPref!==false?'on':'off')));
}
function renderSettings(){ applySettings(); renderMyTickets(); renderFAQ(); renderSupportOnlineStatus(); }
document.querySelectorAll('[data-theme]').forEach(b=>b.addEventListener('click', ()=>{
  const s = State.settings; s.theme = b.dataset.theme; State.settings = s; applySettings();
}));
document.querySelectorAll('[data-density]').forEach(b=>b.addEventListener('click', ()=>{
  const s = State.settings; s.density = b.dataset.density; State.settings = s; applySettings();
}));
document.querySelectorAll('[data-autoplay]').forEach(b=>b.addEventListener('click', ()=>{
  const s = State.settings; s.autoplay = b.dataset.autoplay==='on'; State.settings = s; applySettings();
}));
document.querySelectorAll('[data-broadcastpref]').forEach(b=>b.addEventListener('click', ()=>{
  const s = State.settings; s.broadcastPref = b.dataset.broadcastpref==='on'; State.settings = s; applySettings();
  toast(s.broadcastPref ? 'پیام‌های همگانی دوباره نشان داده می‌شوند.' : 'پیام‌های همگانی از این پس نشان داده نمی‌شوند.');
}));
document.querySelectorAll('[data-soundpref]').forEach(b=>b.addEventListener('click', ()=>{
  const s = State.settings; s.soundPref = b.dataset.soundpref==='on'; State.settings = s; applySettings();
}));
document.getElementById('myAccentPicker').addEventListener('click', e=>{
  const btn = e.target.closest('[data-myaccent]'); if(!btn) return;
  const s = State.settings; s.myAccent = btn.dataset.myaccent; State.settings = s;
  applySettings();
  toast('رنگ شخصی تو ذخیره شد.');
});
document.getElementById('translatePageBtn').addEventListener('click', ()=>{
  const lang = State.settings.lang || 'fa';
  const url = `https://translate.google.com/translate?sl=fa&tl=${lang}&u=${encodeURIComponent(location.href)}`;
  window.open(url, '_blank');
});

/* =========================================================
   زبان رابط کاربری (ترجمه بخشی — صادقانه محدود)
   ========================================================= */
const LANGS = [
  ['fa','فارسی'],['en','English'],['ar','العربية'],['tr','Türkçe'],['zh','中文'],
  ['ja','日本語'],['es','Español'],['fr','Français'],['ru','Русский'],['hi','हिन्दी'],
  ['ur','اردو'],['de','Deutsch'],['it','Italiano'],['pt','Português'],['ko','한국어'],
  ['id','Bahasa Indonesia'],['vi','Tiếng Việt'],['th','ไทย'],['pl','Polski'],['nl','Nederlands'],
  ['sv','Svenska'],['el','Ελληνικά'],['he','עברית'],['ku','کوردی'],['az','Azərbaycan']
];
const UI_DICT = {
  en:{
    home:'Home',roblox:'Roblox',anime:'Anime',games:'Games',ai:'AI',admin:'Admin',settings:'Settings',chat:'Chat',explore:'Explore',shorts:'Shorts',profile:'Profile',aboutus:'About us',
    back:'Back',signupLogin:'Sign up / Login',logout:'Log out',
    welcomeTitle:'Welcome to GameHub',welcomeSub:'News, shorts, explore & games — all in one place',welcomeEnter:'Enter the hub 🚀',
    searchNews:'Search news...',searchSite:'Search the site',all:'All',auto:'Auto',editorial:'Editorial',
    liveScan:'Live scan',scanNow:'Scan now',popular:'Popular',membersTitle:'Registered members',membersHint:'Grant VIP, Creator, blue tick or admin with custom permissions.',
    notifications:'Notifications',theme:'Theme',language:'Language',density:'Density',
    save:'Save',delete:'Delete',publish:'Publish',cancel:'Cancel',send:'Send',refresh:'Refresh',
    dailyChallenge:'Daily challenge',streak:'Streak',reward:'Reward',online:'Online',
    like:'Like',comment:'Comment',share:'Share',follow:'Follow',
    noItems:'Nothing here yet.',loading:'Loading…',success:'Done!',error:'Something went wrong',
    gamesHall:'Game hall',aiChat:'AI assistant',userChat:'User chat',
    tick:'Blue tick',vip:'VIP',creator:'Creator',mod:'Moderator',staffAdmin:'Staff admin'
  },
  fa:{
    home:'خانه',roblox:'روبلاکس',anime:'انیمه',games:'بازی‌ها',ai:'هوش مصنوعی',admin:'پنل ادمین',settings:'تنظیمات',chat:'چت',explore:'اکسپلور',shorts:'شورتس',profile:'پروفایل',aboutus:'درباره ما',
    back:'بازگشت',signupLogin:'ثبت‌نام / ورود',logout:'خروج',
    welcomeTitle:'به گیم‌هاب خوش اومدی',welcomeSub:'اخبار گیم، شورتس، اکسپلور و بازی — همه‌ش اینجاست',welcomeEnter:'ورود به سایت 🚀',
    searchNews:'جستجوی خبر...',searchSite:'جستجوی سایت',all:'همه',auto:'خودکار',editorial:'تحریریه',
    liveScan:'رصد زنده',scanNow:'رصد همین حالا',popular:'محبوب‌ترین',membersTitle:'اعضای ثبت‌نام‌شده',membersHint:'به هر عضو تگ VIP، کریتور، تیک آبی یا نقش ادمین با دسترسی دلخواه بده.',
    notifications:'اعلان‌ها',theme:'تم',language:'زبان',density:'تراکم',
    save:'ذخیره',delete:'حذف',publish:'انتشار',cancel:'لغو',send:'ارسال',refresh:'تازه‌سازی',
    dailyChallenge:'چالش روزانه',streak:'استریک',reward:'پاداش',online:'آنلاین',
    like:'لایک',comment:'دیدگاه',share:'اشتراک',follow:'دنبال',
    noItems:'هنوز چیزی نیست.',loading:'در حال بارگذاری…',success:'انجام شد!',error:'خطایی رخ داد',
    gamesHall:'سالن بازی',aiChat:'دستیار هوش مصنوعی',userChat:'چت کاربران',
    tick:'تیک آبی',vip:'VIP',creator:'کریتور',mod:'ناظر',staffAdmin:'ادمین'
  },
  ar:{home:'الرئيسية',roblox:'روبلوكس',anime:'أنمي',games:'ألعاب',ai:'الذكاء الاصطناعي',admin:'لوحة الإدارة',settings:'الإعدادات',chat:'الدردشة',explore:'استكشاف',shorts:'مقاطع قصيرة',profile:'الملف الشخصي',back:'رجوع',signupLogin:'تسجيل / دخول',logout:'تسجيل الخروج',aboutus:'من نحن',welcomeTitle:'مرحباً بك في GameHub',welcomeEnter:'ادخل 🚀'},
  tr:{home:'Anasayfa',roblox:'Roblox',anime:'Anime',games:'Oyunlar',ai:'Yapay Zeka',admin:'Yönetim',settings:'Ayarlar',chat:'Sohbet',explore:'Keşfet',shorts:'Shorts',profile:'Profil',back:'Geri',signupLogin:'Kayıt / Giriş',logout:'Çıkış',aboutus:'Hakkımızda',welcomeTitle:'GameHub\'a hoş geldin',welcomeEnter:'Gir 🚀'}
};

function t(key, fallback){
  const lang = (State.settings && State.settings.lang) || document.documentElement.lang || 'fa';
  const dict = UI_DICT[lang] || UI_DICT.fa || {};
  return dict[key] || (UI_DICT.en && UI_DICT.en[key]) || fallback || key;
}
function applyI18n(lang){
  lang = lang || (State.settings && State.settings.lang) || 'fa';
  const rtl = ['fa','ar','ur','he','ku'].includes(lang);
  document.documentElement.dir = rtl ? 'rtl' : 'ltr';
  document.documentElement.lang = lang;
  const dict = UI_DICT[lang] || (lang==='en'?UI_DICT.en:UI_DICT.fa) || UI_DICT.en;
  document.querySelectorAll('.navlink[data-view], .bnav[data-view]').forEach(b=>{
    const k = b.dataset.view;
    if(!dict[k]) return;
    if(b.classList.contains('bnav')){
      const spans = b.querySelectorAll('span');
      if(spans.length>=2) spans[1].textContent = dict[k];
      else b.childNodes.forEach(n=>{ if(n.nodeType===3 && n.textContent.trim()) n.textContent = ' '+dict[k]; });
    } else b.textContent = dict[k];
  });
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const k = el.dataset.i18n;
    if(dict[k]) el.textContent = dict[k];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{
    const k = el.dataset.i18nPlaceholder;
    if(dict[k]) el.setAttribute('placeholder', dict[k]);
  });
  // common inputs without data attrs
  const search = document.getElementById('searchInput');
  if(search) search.placeholder = dict.searchNews || search.placeholder;
  document.title = lang==='en' ? 'GameHub — Gaming News' : (lang==='fa' ? 'GameHub — اخبار گیم' : document.title);
  // re-render active view so dynamic strings pick language
  try{
    if(typeof currentView!=='undefined'){
      if(currentView==='home' && typeof renderNewsFeed==='function') renderNewsFeed();
      if(currentView==='explore' && typeof renderExplore==='function') renderExplore();
      if(currentView==='profile' && typeof renderProfile==='function') renderProfile();
    }
  }catch(e){}
}
function populateLangSelect(){
  const sel = document.getElementById('langSelect');
  sel.innerHTML = LANGS.map(([code,label])=>`<option value="${code}">${label}</option>`).join('');
  sel.value = State.settings.lang || 'fa';
  if(!State.settings.lang){ const s=State.settings; s.lang='fa'; State.settings=s; }
  applyI18n(sel.value);
}
document.getElementById('langSelect').addEventListener('change', e=>{
  const lang = e.target.value;
  const s = State.settings; s.lang = lang; State.settings = s;
  applyI18n(lang);
});

/* =========================================================
   چت کاربران (پیام مستقیم)
   ========================================================= */
function renderChatTab(){
  const gate = document.getElementById('chatAuthGate');
  const area = document.getElementById('chatUserArea');
  if(currentUser){ gate.classList.add('hidden'); area.classList.remove('hidden'); renderSupportEntry(); }
  else { gate.classList.remove('hidden'); area.classList.add('hidden'); }
}
/* =========================================================
   زنگ اعلان — نشون‌دادن پیام‌های خونده‌نشده پشتیبانی + نظرسنجی باز
   ========================================================= */
function updateNotifBadge(){
  const badge = document.getElementById('notifBadge');
  if(!badge) return;
  let count = 0;
  if(currentUser){
    const key = dmKey(currentUser.contact, ADMIN_CONTACT);
    count += (State.dms[key]||[]).filter(m=>m.from===ADMIN_CONTACT).length;
    const poll = getActivePoll();
    if(poll && !poll.votedBy.includes(currentUser.contact)) count += 1;
  }
  badge.textContent = count;
  badge.classList.toggle('hidden', count===0);
}
document.getElementById('notifBell').addEventListener('click', ()=>{
  if(!currentUser){ openAuthModal(); return; }
  const key = dmKey(currentUser.contact, ADMIN_CONTACT);
  const hasSupportMsg = (State.dms[key]||[]).some(m=>m.from===ADMIN_CONTACT);
  if(hasSupportMsg){ showView('chat'); openDmThread(ADMIN_CONTACT); }
  else { showView('home'); }
});

function renderSupportEntry(){
  const wrap = document.getElementById('supportEntry');
  if(!wrap) return;
  const key = dmKey(currentUser.contact, ADMIN_CONTACT);
  const unread = (State.dms[key]||[]).filter(m=>m.from===ADMIN_CONTACT).length;
  wrap.innerHTML = `<div class="manage-row" id="openSupportRow" style="cursor:pointer;border-color:var(--accent);">
    <span class="mtitle">👑 پشتیبانی سایت (پیام‌های مالک/ادمین)</span>
    ${unread ? `<span class="badge">${unread} پیام</span>` : ''}
  </div>`;
  document.getElementById('openSupportRow').addEventListener('click', ()=>openDmThread(ADMIN_CONTACT));
}
let dmTargetContact = null;
document.getElementById('userSearchInput').addEventListener('input', e=>{
  const term = e.target.value.trim();
  const wrap = document.getElementById('userSearchResults');
  if(!term){ wrap.innerHTML=''; return; }
  const results = State.users.filter(u=>u.contact!==currentUser?.contact && u.name.includes(term));
  wrap.innerHTML = results.map(u=>`<div class="manage-row" data-c="${esc(u.contact)}" style="cursor:pointer"><span class="mtitle">${esc(u.name)} ${u.name===OWNER_DISPLAY?tickSvg():''}</span></div>`).join('') || '<p class="dim tiny">کسی پیدا نشد.</p>';
  wrap.querySelectorAll('.manage-row').forEach(r=>r.addEventListener('click', ()=>openDmThread(r.dataset.c)));
});
function dmKey(a,b){ return [a,b].sort().join('::'); }
function openDmThread(contact){
  dmTargetContact = contact;
  document.getElementById('dmThread').classList.remove('hidden');
  document.getElementById('dmSendForm').classList.remove('hidden');
  renderDmThread();
}
let dmSeenCount = {};
function renderDmThread(){
  if(!dmTargetContact) return;
  const key = dmKey(currentUser.contact, dmTargetContact);
  const dms = State.dms;
  const thread = dms[key] || [];
  const win = document.getElementById('dmThread');
  win.innerHTML = '';
  thread.forEach(m=>pushChat(win, m.from===currentUser.contact?'user':'bot', m.text));
  const prevSeen = dmSeenCount[key] || 0;
  const lastMsg = thread[thread.length-1];
  if(thread.length > prevSeen && lastMsg && lastMsg.from !== currentUser.contact) playNotifySound();
  dmSeenCount[key] = thread.length;
}
document.getElementById('dmSendForm').addEventListener('submit', e=>{
  e.preventDefault();
  if(!dmTargetContact) return;
  if(isBanned(currentUser.contact)){ toast('حساب تو بن شده است.'); return; }
  const input = document.getElementById('dmSendInput');
  const text = input.value.trim();
  if(!text) return;
  if(containsProfanity(text)){ banUser(currentUser.contact); toast('الفاظ نامناسب — بن شدی.'); input.value=''; return; }
  const key = dmKey(currentUser.contact, dmTargetContact);
  const dms = State.dms;
  dms[key] = dms[key] || [];
  dms[key].push({id:uid(), from:currentUser.contact, text, ts:Date.now()});
  State.dms = dms;
  input.value='';
  renderDmThread();
});

/* =========================================================
   اکسپلور
   ========================================================= */
let activeExploreType = 'all';
function renderExplore(){
  const gate = document.getElementById('explorePostGate');
  const form = document.getElementById('createExplorePostForm');
  if(currentUser){ gate.classList.add('hidden'); form.classList.remove('hidden'); }
  else { gate.classList.remove('hidden'); form.classList.add('hidden'); }
  const wrap = document.getElementById('exploreGrid');
  let items = State.explore.filter(it=> activeExploreType==='all' || it.type===activeExploreType);
  // پست‌های مالک/ادمین‌های تأییدشده همیشه بالای فید اکسپلور می‌آیند تا همه ببینندشون
  items = items.sort((a,b)=>{
    const aOwner = a.type==='user' && isVerified(a.authorContact, a.author);
    const bOwner = b.type==='user' && isVerified(b.authorContact, b.author);
    if(aOwner && !bOwner) return -1;
    if(bOwner && !aOwner) return 1;
    return 0;
  });
  const ec = State.exploreComments;
  wrap.innerHTML = items.map(it=>{
    const comments = ec[it.id] || [];
    const thumb = it.type==='video' && it.vid
      ? `<img class="ethumb" src="https://img.youtube.com/vi/${it.vid}/hqdefault.jpg" alt="" loading="lazy" style="aspect-ratio:1/1.15;object-fit:cover;" onerror="imgFallback(this)" data-fallback-title="${esc(it.title.slice(0,36))}" data-fallback-style="${esc(coverStyle(it.title))}">`
      : `<div class="ethumb thumb-fallback" style="${coverStyle(it.title)};aspect-ratio:1/1.15;border-radius:0;"><div class="cover-icon" style="width:34px;height:34px;">${svgIcon(it.type==='meme'?'sparkle':it.type==='user'?'controller':coverIcon(it.title))}</div><div class="cover-title" style="font-size:12px;">${esc(it.title.slice(0,36))}</div></div>`;
    return `<div class="explore-card etype" data-id="${it.id}">
      <div class="etag">${it.type==='meme'?'میم':it.type==='video'?'▶ ویدیو':it.type==='user'?'👤 کاربر':'پست'}</div>
      ${thumb}
      <div class="ebody">
        <p class="etitle">${it.type==='user' && it.author ? `<b>${esc(it.author)}${roleBadgesHtml(it.authorContact,it.author)}:</b> `:''}${esc(it.title)}</p>
        <div class="eacts">
          <span class="elike" data-id="${it.id}">❤ ${it.likes}</span>
          <span>💬 ${comments.length}</span>
          ${it.authorContact===currentUser?.contact ? `<button class="del-my-post" data-id="${it.id}" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:12px;">حذف</button>` : ''}
        </div>
      </div>
      <div class="explore-comment-box">
        <div class="explore-comment-list">${comments.slice(-3).map(c=>`<div class="explore-comment-item"><b>${esc(c.name)}:</b> ${esc(c.text)}</div>`).join('')}</div>
        <input type="text" placeholder="نظر بده و اینتر بزن..." data-ecomment="${it.id}">
      </div>
    </div>`;
  }).join('') || '<p class="dim tiny">چیزی پیدا نشد.</p>';
  wrap.querySelectorAll('.elike').forEach(el=>el.addEventListener('click', ()=>{
    if(!currentUser) return openAuthModal();
    const all = State.explore;
    const it = all.find(x=>x.id===el.dataset.id);
    if(it){ it.likes++; State.explore = all; renderExplore(); }
  }));
  wrap.querySelectorAll('[data-ecomment]').forEach(inp=>inp.addEventListener('keydown', e=>{
    if(e.key!=='Enter') return;
    if(!currentUser){ openAuthModal(); return; }
    if(isBanned(currentUser.contact)){ toast('حساب تو بن شده است.'); return; }
    const text = inp.value.trim();
    if(!text) return;
    if(containsProfanity(text)){ banUser(currentUser.contact); toast('الفاظ نامناسب — بن شدی.'); inp.value=''; return; }
    const id = inp.dataset.ecomment;
    const all = State.exploreComments;
    all[id] = all[id] || [];
    all[id].push({name:currentUser.name, text, ts:Date.now()});
    State.exploreComments = all;
    inp.value='';
    renderExplore();
  }));
  wrap.querySelectorAll('.del-my-post').forEach(b=>b.addEventListener('click', ()=>{
    State.explore = State.explore.filter(it=>it.id!==b.dataset.id);
    renderExplore();
    toast('پست حذف شد.');
  }));
}
document.getElementById('createExplorePostForm').addEventListener('submit', e=>{
  e.preventDefault();
  if(!currentUser) return openAuthModal();
  if(isBanned(currentUser.contact)){ toast('حساب تو بن شده است.'); return; }
  if(rateLimited(currentUser.contact)){ toast('کمی صبر کن — حداکثر هر ۱۰ ثانیه یک ارسال.'); return; }
  const input = document.getElementById('explorePostText');
  const text = input.value.trim();
  if(!text) return;
  if(containsProfanity(text)){ banUser(currentUser.contact); toast('الفاظ نامناسب — حساب تو بن شد.'); input.value=''; return; }
  const items = State.explore;
  items.unshift({id:uid(), type:'user', title:text, author:currentUser.name, authorContact:currentUser.contact, likes:0, comments:0, ts:Date.now()});
  State.explore = items.slice(0,60);
  input.value='';
  renderExplore();
  toast('پست تو منتشر شد!'); try{ rewardAction('post'); }catch(e){}
  logPlayerActivity(`تو اکسپلور پست گذاشت: «${text.slice(0,40)}»`);
});
document.getElementById('exploreFilter').addEventListener('click', e=>{
  const btn = e.target.closest('.tag'); if(!btn) return;
  document.querySelectorAll('#exploreFilter .tag').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  activeExploreType = btn.dataset.etype;
  renderExplore();
});
function addExploreItems(count){
  count = count || 1;
  const items = State.explore;
  const pool = [
    ...SCAN_POOL.map(s=>({type:'news',title:s.title})),
    ...MEME_TEMPLATES.map(m=>({type:'meme',title:m})),
    ...SHORTS_POOL.map(s=>({type:'video',title:s.title, vid:s.id}))
  ];
  for(let i=0;i<count;i++){
    const pick = pool[Math.floor(Math.random()*pool.length)];
    items.unshift({id:uid(), type:pick.type, title:pick.title, vid:pick.vid||null, likes:Math.floor(Math.random()*30), comments:0, ts:Date.now()});
  }
  State.explore = items.slice(0,30);
}
function autoRefreshExplore(){
  addExploreItems(1);
  if(currentView==='explore') renderExplore();
}
document.getElementById('exploreRefresh').addEventListener('click', ()=>{
  addExploreItems(2);
  renderExplore();
  toast('اکسپلور تازه شد.');
});
setInterval(autoRefreshExplore, 300000); // اکسپلور هم هر ۵ دقیقه خودکار تازه می‌شود

/* =========================================================
   شورتس — ویدیوهای کوتاه گیم
   ========================================================= */
function renderShorts(){
  const wrap = document.getElementById('shortsFeed');
  const items = [...State.shorts].sort((a,b)=>b.ts-a.ts);
  const autoplay = State.settings.autoplay!==false;
  wrap.innerHTML = items.map((s,i)=>{
    const liked = currentUser && s.likedBy && s.likedBy.includes(currentUser.contact);
    return `<div class="short-card" data-id="${s.id}">
      <div class="short-video">
        <iframe src="https://www.youtube.com/embed/${s.vid}?rel=0${autoplay && i===0 ? '&autoplay=1&mute=1' : ''}" title="${esc(s.title)}" allow="accelerometer; autoplay; encrypted-media; gyroscope" allowfullscreen loading="lazy"></iframe>
      </div>
      <div class="short-meta">
        <span class="short-badge">گیم‌بات 🤖</span>
        <p class="short-title">${esc(s.title)}</p>
        <div class="short-actions">
          <button class="short-like ${liked?'liked':''}" data-id="${s.id}">❤ ${s.likes||0}</button>
          <span>🕒 ${new Date(s.ts).toLocaleTimeString('fa-IR')}</span>
        </div>
      </div>
    </div>`;
  }).join('') || '<p class="dim tiny">هنوز ویدیویی نیست.</p>';
  wrap.querySelectorAll('.short-like').forEach(b=>b.addEventListener('click', ()=>{
    if(!currentUser) return openAuthModal();
    const items = State.shorts;
    const s = items.find(x=>x.id===b.dataset.id);
    if(!s) return;
    s.likedBy = s.likedBy||[];
    const idx = s.likedBy.indexOf(currentUser.contact);
    if(idx>=0){ s.likedBy.splice(idx,1); s.likes=Math.max(0,(s.likes||1)-1); }
    else { s.likedBy.push(currentUser.contact); s.likes=(s.likes||0)+1; }
    State.shorts = items;
    renderShorts();
  }));
}
function addRandomShort(){
  const items = State.shorts;
  const existingIds = items.map(s=>s.vid);
  const pool = SHORTS_POOL.filter(s=>!existingIds.includes(s.id));
  const pick = (pool.length ? pool : SHORTS_POOL)[Math.floor(Math.random()*(pool.length?pool.length:SHORTS_POOL.length))];
  items.unshift({id:uid(), vid:pick.id, title:pick.title, likes:Math.floor(Math.random()*15), likedBy:[], ts:Date.now()});
  State.shorts = items.slice(0,20);
  if(currentView==='shorts') renderShorts();
  return true;
}
document.getElementById('shortsAddBtn').addEventListener('click', ()=>{ addRandomShort(); renderShorts(); toast('گیم‌بات یک ویدیوی تازه گذاشت.'); });
/* گیم‌بات دیگر با تایمر جدا کار نمی‌کند — به‌جایش هر ۵ دقیقه در چرخه heavyUpdate یک ویدیوی تازه اضافه می‌شود. */

/* =========================================================
   پروفایل
   ========================================================= */
function renderProfile(){
  const out = document.getElementById('profileLoggedOut');
  const inn = document.getElementById('profileLoggedIn');
  if(!currentUser){ out.classList.remove('hidden'); inn.classList.add('hidden'); return; }
  out.classList.add('hidden'); inn.classList.remove('hidden');
  const avatarEl = document.getElementById('profileAvatar');
  if(currentUser.avatar){
    avatarEl.style.backgroundImage = `url(${currentUser.avatar})`;
    avatarEl.textContent = '';
  } else {
    avatarEl.style.backgroundImage = '';
    avatarEl.textContent = currentUser.name.slice(0,1).toUpperCase();
  }
  document.getElementById('profileName').innerHTML = esc(currentUser.name) + ' ' + roleBadgesHtml(currentUser.contact, currentUser.name);
  document.getElementById('profileHandle').textContent = currentUser.contact + (currentUser.bio ? ' — ' + currentUser.bio : '');
  document.getElementById('profileJoined').textContent = 'عضویت از ' + new Date(currentUser.joinedAt).toLocaleDateString('fa-IR');

  const myComments = [];
  Object.entries(State.comments).forEach(([newsId, list])=>{
    list.forEach(c=>{ if(c.contact===currentUser.contact) myComments.push({newsId, ...c}); });
  });
  const likedCount = State.news.filter(n=>n.likedBy && n.likedBy.includes(currentUser.contact)).length;
  document.getElementById('profStatComments').textContent = myComments.length;
  document.getElementById('profStatSaved').textContent = State.savedNews.length;
  document.getElementById('profStatLikes').textContent = likedCount;
  document.getElementById('profStatBadge').textContent = isVerified(currentUser.contact, currentUser.name) ? 'تأیید‌شده ✓' : 'عادی';

  document.getElementById('editProfileName').value = currentUser.name;
  document.getElementById('editProfileBio').value = currentUser.bio || '';

  const savedWrap = document.getElementById('savedList');
  const savedItems = State.news.filter(n=>State.savedNews.includes(n.id));
  savedWrap.innerHTML = savedItems.length ? savedItems.map(newsCardHtml).join('') : '<p class="dim tiny">هنوز خبری ذخیره نکردی.</p>';
  savedWrap.querySelectorAll('.news-card').forEach(card=>card.addEventListener('click', e=>{ if(!e.target.closest('button')) openArticle(card.dataset.id); }));

  const mcWrap = document.getElementById('myCommentsList');
  mcWrap.innerHTML = myComments.length ? myComments.sort((a,b)=>b.ts-a.ts).map(c=>{
    const n = State.news.find(x=>x.id===c.newsId);
    return `<div class="manage-row" data-goto="${c.newsId}" style="cursor:pointer">
      <span class="mtitle">${esc(c.text.slice(0,60))} <span class="dim tiny">روی «${esc(n?n.title:'خبر حذف‌شده')}»</span></span>
      <span class="dim tiny">${new Date(c.ts).toLocaleDateString('fa-IR')}</span>
    </div>`;
  }).join('') : '<p class="dim tiny">هنوز دیدگاهی نگذاشتی.</p>';
  mcWrap.querySelectorAll('[data-goto]').forEach(el=>el.addEventListener('click', ()=>openArticle(el.dataset.goto)));
}
document.getElementById('profileLogoutBtn').addEventListener('click', ()=>{
  currentUser = null;
  localStorage.removeItem('gh_current_user');
  renderProfile();
  renderChatTab();
  toast('از حساب خارج شدی.');
});
document.getElementById('editProfileForm').addEventListener('submit', e=>{
  e.preventDefault();
  const name = document.getElementById('editProfileName').value.trim();
  const bio = document.getElementById('editProfileBio').value.trim();
  if(!name) return;
  if(containsProfanity(bio)){ toast('بیوگرافی حاوی الفاظ نامناسب است.'); return; }
  const users = State.users;
  const u = users.find(x=>x.contact===currentUser.contact);
  if(u){ u.name = name; u.bio = bio; State.users = users; }
  currentUser = {...currentUser, name, bio};
  save('gh_current_user', currentUser);
  renderProfile();
  toast('پروفایل بروزرسانی شد.');
});
document.getElementById('avatarUpload').addEventListener('change', e=>{
  const file = e.target.files[0];
  if(!file) return;
  if(file.size > 800*1024){ toast('عکس باید کمتر از ۸۰۰ کیلوبایت باشد.'); return; }
  const reader = new FileReader();
  reader.onload = ()=>{
    const users = State.users;
    const u = users.find(x=>x.contact===currentUser.contact);
    if(u){ u.avatar = reader.result; State.users = users; }
    currentUser = {...currentUser, avatar: reader.result};
    save('gh_current_user', currentUser);
    renderProfile();
    toast('عکس پروفایل بروزرسانی شد.');
  };
  reader.readAsDataURL(file);
});
document.getElementById('wipeMyDataBtn').addEventListener('click', ()=>{
  if(!currentUser) return;
  if(!confirm('حساب و ذخیره‌های تو روی این مرورگر پاک شود؟ (فقط همین مرورگر، برگشت‌ناپذیر)')) return;
  const contact = currentUser.contact;
  State.users = State.users.filter(u=>u.contact!==contact);
  State.savedNews = [];
  localStorage.removeItem('gh_current_user');
  currentUser = null;
  renderProfile();
  toast('داده‌های تو از این مرورگر پاک شد.');
  showView('home');
});

/* =========================================================
   رصد خودکار (شبیه‌سازی) — سبک هر ۳۰ ثانیه + کامل هر ۵ دقیقه
   نکته صادقانه: چون این صفحه سرور ندارد، این رصد یک استخر
   تیتر گسترده و متنوع را شبیه‌سازی می‌کند، نه کراول زنده‌ی
   واقعی کل اینترنت.
   ========================================================= */
function runAutoScan(count){
  count = count || 1;
  const news = State.news;
  const deleted = State.deletedTitles;
  let added = [];
  for(let i=0;i<count;i++){
    const existingTitles = news.map(n=>n.title);
    const pool = SCAN_POOL.filter(p=>!existingTitles.includes(p.title) && !deleted.includes(p.title));
    if(!pool.length) break;
    const pick = pool[Math.floor(Math.random()*pool.length)];
    const item = {id:uid(), title:pick.title, tag:pick.tag, body:pick.title+'. این خبر به‌صورت خودکار رصد شده است. برای متن کامل به منبع اصلی مراجعه کن.', source:pick.src, sourceUrl:'#', ts:Date.now(), likes:0, likedBy:[], imageRemoved:false, textRemoved:false, auto:true};
    news.unshift(item);
    added.push(item);
  }
  if(added.length) State.news = news;
  document.getElementById('lastUpdate').textContent = nowStr();
  if(currentView==='home') renderNewsFeed();
  return added;
}
function periodicUpdate(){
  runAutoScan(1);
  publishDueScheduled();
  publishDueScheduledBroadcasts();
  let news = State.news.filter(n=>n && n.title);
  State.news = news;
  if(currentView==='chat' && dmTargetContact) renderDmThread();
  updateNotifBadge();
  if(currentView==='settings'){ renderSupportOnlineStatus(); renderMyTickets(); }
  if(currentView==='games') renderGlobalLeaderboard();
}
function heavyUpdate(){
  const addedNews = runAutoScan(3);
  const addedRoblox = scanRobloxOnce();
  const addedAnime = scanAnimeOnce();
  const addedShort = addRandomShort();
  autoRefreshExplore();
  publishDueScheduled();
  publishDueScheduledBroadcasts();
  document.getElementById('lastUpdate').textContent = nowStr();
  const parts = [];
  if(addedNews.length) parts.push(`${addedNews.length} خبر گیم`);
  if(addedRoblox) parts.push('۱ خبر روبلاکس');
  if(addedAnime) parts.push('۱ خبر انیمه');
  if(addedShort) parts.push('۱ ویدیوی شورتس');
  logActivity(parts.length ? `بروزرسانی ۵ دقیقه‌ای: ${parts.join('، ')} اضافه شد.` : 'بروزرسانی ۵ دقیقه‌ای انجام شد، خبر تازه‌ای نبود.');
  if(currentView==='explore') renderExplore();
  if(currentView==='shorts') renderShorts();
  if(currentView==='roblox') renderRoblox();
  if(currentView==='anime') renderAnimeNews();
  if(document.getElementById('view-admin').classList.contains('active')) renderActivityLog();
}
setInterval(()=>{ if(!document.hidden) periodicUpdate(); }, 30000);
setInterval(()=>{ if(!document.hidden) heavyUpdate(); }, 300000);


/* =========================================================
   بازی‌ها — با سطح‌بندی (آسان/متوسط/سخت)، لیدربورد محلی، و بازی با دوست
   نکته صادقانه: لیدربورد و امتیازها فقط روی همین مرورگر ذخیره می‌شوند
   (چون سرور مرکزی نداریم) — بین گوشی‌های مختلف به هم وصل نمی‌شوند.
   ========================================================= */
document.getElementById('gamePicker').addEventListener('click', e=>{
  const btn = e.target.closest('.game-card'); if(!btn) return;
  loadGame(btn.dataset.game);
});
function loadGame(name){
  const stage = document.getElementById('gameStage');
  if(!stage){ toast('صحنه بازی پیدا نشد'); return; }
  try{
    if(name==='snake') initSnake(stage);
    else if(name==='memory') initMemory(stage);
    else if(name==='tictactoe') initTTT(stage);
    else if(name==='rps') initRPS(stage);
    else if(name==='reaction') initReaction(stage);
    else if(name==='guess') initGuess(stage);
    else if(name==='g2048') init2048(stage);
    else if(name==='pong') initPong(stage);
    else if(name==='quiz') initQuiz(stage);
    else if(name==='mines') initMines(stage);
    else if(name==='breakout') initBreakout(stage);
    else if(name==='clicker') initClicker(stage);
    else if(name==='simon') initSimon(stage);
    else if(name==='whack') initWhack(stage);
    else if(name==='flappy') initFlappy(stage);
    else if(name==='scramble') initScramble(stage);
    else if(name==='hangman') initHangman(stage);
    else if(name==='mathblitz') initMathBlitz(stage);
    else if(name==='colormatch') initColorMatch(stage);
    else if(name==='slide15') initSlide15(stage);
    else if(name==='connect4') initConnect4(stage);
    else if(name==='typing') initTyping(stage);
    else if(name==='stacker') initStacker(stage);
    else if(name==='dodger') initDodger(stage);
    else if(name==='maze') initMaze(stage);
    else if(name==='schulte') initSchulte(stage);
    else if(name==='balloon') initBalloon(stage);
    else if(name==='aim') initAim(stage);
    else if(name==='flood') initFlood(stage);
    else if(name==='catch') initCatch(stage);
    else { stage.innerHTML = '<p class="dim">این بازی هنوز آماده نیست.</p>'; toast('بازی ناشناخته'); }
  }catch(err){
    console.error('loadGame', name, err);
    stage.innerHTML = '<p class="dim">خطا در اجرای بازی. دوباره تلاش کن.</p><button class="btn-accent" id="retryGame">تلاش مجدد</button>';
    stage.querySelector('#retryGame')?.addEventListener('click', ()=>loadGame(name));
    toast('خطای بازی: '+ (err.message||'unknown'));
  }
}
function recordGameScore(gameId, score){
  try{ addScore(gameId, getDifficulty(gameId)||'medium', score); }catch(e){ console.warn(e); }
}
function getDifficulty(gameId){ return load('gh_diff_'+gameId, 'medium'); }
function setDifficulty(gameId, level){ save('gh_diff_'+gameId, level); }
function diffLabel(d){ return d==='easy'?'آسان':d==='hard'?'سخت':'متوسط'; }
function difficultyPickerHtml(gameId){
  const cur = getDifficulty(gameId);
  return `<div class="option-row diff-picker" data-diffgame="${gameId}" style="margin-bottom:12px;">
    <button class="opt-btn ${cur==='easy'?'active':''}" data-diff="easy">آسان</button>
    <button class="opt-btn ${cur==='medium'?'active':''}" data-diff="medium">متوسط</button>
    <button class="opt-btn ${cur==='hard'?'active':''}" data-diff="hard">سخت</button>
  </div>`;
}
function wireDifficultyPicker(stage, gameId, onChange){
  const row = stage.querySelector(`.diff-picker[data-diffgame="${gameId}"]`);
  if(!row) return;
  row.querySelectorAll('[data-diff]').forEach(b=>b.addEventListener('click', ()=>{
    setDifficulty(gameId, b.dataset.diff);
    row.querySelectorAll('[data-diff]').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    onChange(b.dataset.diff);
  }));
}
/* پاکسازی یک‌باره‌ی لیدربوردهای قدیمی که قبل از رفع باگ، اسم تکراری داشتند */
function cleanupLegacyLeaderboards(){
  const board = State.leaderboard;
  let changed = false;
  Object.keys(board).forEach(key=>{
    const list = board[key];
    if(!list || !list.length) return;
    const needsCleanup = list.some(r=>!r.identity);
    if(!needsCleanup) return;
    const byName = {};
    list.forEach(r=>{
      const id = r.identity || ('legacy:'+r.name);
      if(!byName[id] || r.score>byName[id].score){ byName[id] = {...r, identity:id}; }
    });
    board[key] = Object.values(byName).sort((a,b)=>b.score-a.score).slice(0,10);
    changed = true;
  });
  if(changed) State.leaderboard = board;
}
function addScore(gameId, difficulty, score){
  const board = State.leaderboard;
  const key = gameId+':'+difficulty;
  board[key] = board[key] || [];
  const name = currentUser ? currentUser.name : 'مهمان';
  const contact = currentUser ? currentUser.contact : null;
  const identity = contact || ('guest:'+name); // مهمان‌ها با اسم یکسان جدا حساب می‌شوند، اعضا با کانتکت یکتا هستند
  const existingIdx = board[key].findIndex(r=>r.identity===identity);
  if(existingIdx>=0){
    if(score > board[key][existingIdx].score){ board[key][existingIdx] = {name, score, ts:Date.now(), identity}; }
  } else {
    board[key].push({name, score, ts:Date.now(), identity});
  }
  board[key].sort((a,b)=>b.score-a.score);
  board[key] = board[key].slice(0,10);
  State.leaderboard = board;
}
function leaderboardHtml(gameId, difficulty){
  const board = State.leaderboard[gameId+':'+difficulty] || [];
  const medal = i=> i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1)+'.';
  const rankCls = i=> i===0?'rank1':i===1?'rank2':i===2?'rank3':'';
  return `<div class="leaderboard-box" id="lb-${gameId}"><h4><span class="lb-live-dot" title="زنده"></span>برترین‌های سطح ${diffLabel(difficulty)}</h4>${
    board.length ? board.map((r,i)=>`<div class="leaderboard-row ${currentUser&&r.identity===(currentUser.contact||('guest:'+currentUser.name))?'me':''}"><span class="${rankCls(i)}">${medal(i)} ${esc(r.name)}</span><span>${r.score}</span></div>`).join('') : '<p class="dim tiny">هنوز رکوردی نیست — اولین نفر باش!</p>'
  }</div>`;
}
function refreshLeaderboard(gameId, difficulty){
  const el = document.getElementById('lb-'+gameId);
  if(el) el.outerHTML = leaderboardHtml(gameId, difficulty);
}
function renderGlobalLeaderboard(){
  const wrap = document.getElementById('globalLeaderboard');
  if(!wrap) return;
  const board = State.leaderboard;
  const cards = ADMIN_GAME_LIST.map(g=>{
    let best = null;
    ['easy','medium','hard'].forEach(diff=>{
      (board[g.id+':'+diff]||[]).forEach(r=>{ if(!best || r.score>best.score) best = {...r, diff}; });
    });
    return {g, best};
  }).filter(c=>c.best);
  wrap.innerHTML = cards.length ? cards.map(({g,best})=>`
    <div class="global-lb-card">
      <h5><span>${esc(g.label)}</span><span class="lb-live-dot" title="زنده"></span></h5>
      <div class="leaderboard-row"><span class="rank1">🥇 ${esc(best.name)}</span><span>${best.score} <span class="dim tiny">(${diffLabel(best.diff)})</span></span></div>
    </div>
  `).join('') : '<p class="dim tiny">هنوز کسی امتیازی ثبت نکرده — اولین نفر باش!</p>';
}

/* --- مار طلایی پرو --- */
const SNAKE_PARAMS = { easy:{speed:170, dec:2, min:100}, medium:{speed:130, dec:4, min:55}, hard:{speed:95, dec:6, min:38} };
function initSnake(stage){
  let difficulty = getDifficulty('snake');
  const hs = Number(load('gh_snake_hs_'+difficulty, 0));
  stage.innerHTML = `
    ${difficultyPickerHtml('snake')}
    <div class="game-hud"><span>امتیاز: <b id="snakeScore">0</b></span><span>رکورد (${diffLabel(difficulty)}): <b id="snakeHS">${hs}</b></span><button class="btn-ghost" id="snakeRestart">شروع دوباره</button></div>
    <canvas id="snakeCanvas" width="360" height="360"></canvas>
    <div class="touch-pad">
      <span></span><button data-d="up">↑</button><span></span>
      <button data-d="left">←</button><span></span><button data-d="right">→</button>
      <span></span><button data-d="down">↓</button><span></span>
    </div>
    ${leaderboardHtml('snake', difficulty)}`;
  const canvas = document.getElementById('snakeCanvas');
  const ctx = canvas.getContext('2d');
  const cell = 18, cols = 20;
  let snake, dir, food, score, speed, timer, alive, curHs;

  function reset(){
    const p = SNAKE_PARAMS[difficulty];
    curHs = Number(load('gh_snake_hs_'+difficulty, 0));
    document.getElementById('snakeHS').textContent = curHs;
    snake = [{x:9,y:9},{x:8,y:9},{x:7,y:9}];
    dir = {x:1,y:0};
    score = 0; speed = p.speed; alive = true;
    placeFood();
    document.getElementById('snakeScore').textContent = score;
    clearInterval(timer);
    timer = setInterval(tick, speed);
  }
  function placeFood(){
    food = {x:Math.floor(Math.random()*cols), y:Math.floor(Math.random()*cols)};
    if(snake.some(s=>s.x===food.x&&s.y===food.y)) placeFood();
  }
  function tick(){
    if(!alive) return;
    const head = {x:snake[0].x+dir.x, y:snake[0].y+dir.y};
    if(head.x<0||head.y<0||head.x>=cols||head.y>=cols||snake.some(s=>s.x===head.x&&s.y===head.y)){
      alive=false; clearInterval(timer);
      if(score>curHs){ save('gh_snake_hs_'+difficulty, score); document.getElementById('snakeHS').textContent = score; }
      if(score>0){ addScore('snake', difficulty, score); refreshLeaderboard('snake', difficulty); }
      logPlayerActivity(`مار طلایی پرو بازی کرد (سطح ${diffLabel(difficulty)}) — امتیاز: ${score}`);
      draw(); toast('باختی! امتیاز: '+score); return;
    }
    snake.unshift(head);
    if(head.x===food.x && head.y===food.y){
      const p = SNAKE_PARAMS[difficulty];
      score++; document.getElementById('snakeScore').textContent = score;
      placeFood();
      speed = Math.max(p.min, speed-p.dec);
      clearInterval(timer); timer = setInterval(tick, speed);
    } else snake.pop();
    draw();
  }
  function draw(){
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-alt') || '#161a2e';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    snake.forEach((s,i)=>{ ctx.fillStyle = i===0 ? '#e8c25a' : '#d4a72c'; ctx.fillRect(s.x*cell,s.y*cell,cell-2,cell-2); });
    ctx.fillStyle = '#e0546a';
    ctx.fillRect(food.x*cell,food.y*cell,cell-2,cell-2);
  }
  function setDir(d){
    if(d==='up' && dir.y!==1) dir={x:0,y:-1};
    if(d==='down' && dir.y!==-1) dir={x:0,y:1};
    if(d==='left' && dir.x!==1) dir={x:-1,y:0};
    if(d==='right' && dir.x!==-1) dir={x:1,y:0};
  }
  stage.querySelectorAll('.touch-pad button').forEach(b=>b.addEventListener('click', ()=>setDir(b.dataset.d)));
  document.getElementById('snakeRestart').addEventListener('click', reset);
  function keyHandler(e){
    const map = {ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'};
    if(map[e.key]) setDir(map[e.key]);
  }
  document.removeEventListener('keydown', window._snakeKeyHandler || (()=>{}));
  window._snakeKeyHandler = keyHandler;
  document.addEventListener('keydown', keyHandler);
  wireDifficultyPicker(stage, 'snake', d=>{ difficulty = d; reset(); refreshLeaderboard('snake', difficulty); });
  reset(); draw();
}

/* --- حافظه تاج --- */
const MEMORY_PARAMS = { easy:6, medium:8, hard:10 };
function initMemory(stage){
  let difficulty = getDifficulty('memory');
  const allIcons = ['🎮','👑','🐍','🧩','🏆','⚔️','🛡️','🕹️','💎','🔥'];
  let cards, first, second, moves, lock, seconds, timerId, pairCount, cols;

  function setup(){
    pairCount = MEMORY_PARAMS[difficulty];
    cols = pairCount<=6 ? 4 : 5;
    const icons = allIcons.slice(0, pairCount);
    cards = [...icons, ...icons].sort(()=>Math.random()-0.5).map((ic,i)=>({id:i, icon:ic, flipped:false, matched:false}));
    first=null; second=null; moves=0; lock=false; seconds=0;
    const record = load('gh_memory_record_'+difficulty, null);
    stage.innerHTML = `
      ${difficultyPickerHtml('memory')}
      <div class="game-hud"><span>حرکت: <b id="memMoves">0</b></span><span>زمان: <b id="memTime">0</b>s</span><span>رکورد: <b>${record?record.moves+' حرکت / '+record.seconds+'s':'—'}</b></span><button class="btn-ghost" id="memRestart">شروع دوباره</button></div>
      <div class="memory-grid" id="memGrid" style="grid-template-columns:repeat(${cols},1fr);"></div>
      ${leaderboardHtml('memory', difficulty)}`;
    clearInterval(timerId);
    timerId = setInterval(()=>{ seconds++; const el=document.getElementById('memTime'); if(el) el.textContent = seconds; }, 1000);
    wireDifficultyPicker(stage, 'memory', d=>{ difficulty = d; setup(); });
    document.getElementById('memRestart').addEventListener('click', setup);
    render();
  }
  function render(){
    document.getElementById('memGrid').innerHTML = cards.map(c=>`
      <div class="memory-card ${c.flipped||c.matched?'flipped':''} ${c.matched?'matched':''}" data-id="${c.id}">${c.flipped||c.matched?c.icon:'?'}</div>
    `).join('');
    document.querySelectorAll('.memory-card').forEach(el=>el.addEventListener('click', ()=>flip(Number(el.dataset.id))));
  }
  function flip(id){
    if(lock) return;
    const c = cards.find(x=>x.id===id);
    if(!c || c.flipped || c.matched) return;
    c.flipped = true;
    if(!first){ first = c; render(); return; }
    second = c; moves++; document.getElementById('memMoves').textContent = moves;
    render();
    if(first.icon===second.icon){
      first.matched = true; second.matched = true; first=null; second=null;
      render();
      if(cards.every(x=>x.matched)){
        clearInterval(timerId);
        const rec = load('gh_memory_record_'+difficulty, null);
        if(!rec || moves<rec.moves){ save('gh_memory_record_'+difficulty, {moves, seconds}); }
        const score = Math.max(1, 1000 - moves*10 - seconds*2);
        addScore('memory', difficulty, score);
        refreshLeaderboard('memory', difficulty);
        toast(`تبریک! با ${moves} حرکت و ${seconds} ثانیه تمام کردی.`);
      }
    } else {
      lock = true;
      setTimeout(()=>{ first.flipped=false; second.flipped=false; first=null; second=null; lock=false; render(); }, 700);
    }
  }
  setup();
}

/* --- دوز: مقابل هوش مصنوعی (۳ سطح) یا با دوست روی همین گوشی --- */
function initTTT(stage){
  let difficulty = getDifficulty('tictactoe');
  let mode = load('gh_ttt_mode', 'ai'); // 'ai' یا 'friend'
  let board = Array(9).fill(null);
  let over = false;
  let turn = 'X';

  function render(){
    document.getElementById('tttGrid').innerHTML = board.map((v,i)=>`<div class="ttt-cell" data-i="${i}">${v||''}</div>`).join('');
    document.querySelectorAll('.ttt-cell').forEach(c=>c.addEventListener('click', ()=>cellClick(Number(c.dataset.i))));
  }
  function winner(b){
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for(const [a,b2,c] of lines){ if(b[a] && b[a]===b[b2] && b[a]===b[c]) return b[a]; }
    return b.every(x=>x) ? 'draw' : null;
  }
  function cellClick(i){
    if(over || board[i]) return;
    if(mode==='friend'){
      board[i]=turn; render();
      const w = winner(board);
      if(w){ endGame(w); return; }
      turn = turn==='X' ? 'O' : 'X';
      document.getElementById('tttStatus').textContent = `نوبت ${turn}`;
      return;
    }
    board[i]='X'; render();
    const w = winner(board);
    if(w){ endGame(w); return; }
    document.getElementById('tttStatus').textContent = 'نوبت هوش مصنوعی...';
    setTimeout(aiMove, 300);
  }
  function aiMove(){
    if(over) return;
    const empty = board.map((v,i)=>v?null:i).filter(i=>i!==null);
    let move;
    if(difficulty==='easy'){
      move = empty[Math.floor(Math.random()*empty.length)];
    } else if(difficulty==='medium'){
      move = Math.random()<0.55 ? minimax(board,'O').index : empty[Math.floor(Math.random()*empty.length)];
    } else {
      move = minimax(board,'O').index;
    }
    board[move]='O'; render();
    const w = winner(board);
    if(w) endGame(w);
    else document.getElementById('tttStatus').textContent = 'نوبت توست (X)';
  }
  function endGame(w){
    over = true;
    let msg;
    if(mode==='ai'){
      msg = w==='draw' ? 'مساوی شد!' : (w==='X' ? 'بردی! 🎉' : 'هوش مصنوعی برد.');
      if(w==='X') addScore('tictactoe', difficulty, 1);
    } else {
      msg = w==='draw' ? 'مساوی شد!' : `${w} برد! 🎉`;
    }
    document.getElementById('tttStatus').textContent = msg + ' — دور بعد به‌زودی...';
    refreshLeaderboard('tictactoe', difficulty);
    logPlayerActivity(`دوز بازی کرد (${mode==='ai'?'مقابل هوش مصنوعی، '+diffLabel(difficulty):'با دوست'}) — نتیجه: ${msg}`);
    setTimeout(()=>{
      if(!stage.contains(document.getElementById('tttGrid'))) return; // اگه کاربر رفته بازی دیگه، ری‌استارت نکن
      board=Array(9).fill(null); over=false; turn='X';
      document.getElementById('tttStatus').textContent = mode==='friend' ? 'نوبت X' : 'نوبت توست (X)';
      render();
    }, 1800);
  }
  function minimax(b, player){
    const w = winner(b);
    if(w==='X') return {score:-10};
    if(w==='O') return {score:10};
    if(w==='draw') return {score:0};
    const moves = [];
    b.forEach((v,i)=>{ if(!v){
      const nb = b.slice(); nb[i]=player;
      const result = minimax(nb, player==='O'?'X':'O');
      moves.push({index:i, score:result.score});
    }});
    if(player==='O') return moves.reduce((best,m)=>m.score>best.score?m:best, {score:-Infinity});
    return moves.reduce((best,m)=>m.score<best.score?m:best, {score:Infinity});
  }
  function fullRender(){
    stage.innerHTML = `
      <div class="option-row" style="margin-bottom:10px;">
        <button class="opt-btn ${mode==='ai'?'active':''}" data-mode="ai">مقابل هوش مصنوعی</button>
        <button class="opt-btn ${mode==='friend'?'active':''}" data-mode="friend">با دوست (همین گوشی)</button>
      </div>
      ${mode==='ai' ? difficultyPickerHtml('tictactoe') : ''}
      <div class="game-hud"><span id="tttStatus">نوبت توست (X)</span><button class="btn-ghost" id="tttRestart">شروع دوباره</button></div>
      <div class="ttt-grid" id="tttGrid"></div>
      ${mode==='ai' ? leaderboardHtml('tictactoe', difficulty) : '<p class="dim tiny">حالت با دوست، لیدربورد ندارد — فقط برای سرگرمی دو نفره است.</p>'}
    `;
    stage.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click', ()=>{
      mode = b.dataset.mode; save('gh_ttt_mode', mode);
      board=Array(9).fill(null); over=false; turn='X';
      fullRender();
    }));
    if(mode==='ai') wireDifficultyPicker(stage, 'tictactoe', d=>{ difficulty=d; board=Array(9).fill(null); over=false; fullRender(); });
    document.getElementById('tttRestart').addEventListener('click', ()=>{
      board=Array(9).fill(null); over=false; turn='X';
      document.getElementById('tttStatus').textContent = mode==='friend' ? 'نوبت X' : 'نوبت توست (X)';
      render();
    });
    render();
  }
  fullRender();
}

/* --- سنگ کاغذ قیچی مقابل هوش مصنوعی --- */
function initRPS(stage){
  let difficulty = getDifficulty('rps');
  let score = 0, round = 0;
  let history = []; // برای سطح سخت: تشخیص الگوی بازیکن
  const choices = [{k:'rock',e:'✊',label:'سنگ'},{k:'paper',e:'✋',label:'کاغذ'},{k:'scissors',e:'✌️',label:'قیچی'}];
  function render(){
    stage.innerHTML = `
      ${difficultyPickerHtml('rps')}
      <div class="game-hud"><span>امتیاز: <b id="rpsScore">${score}</b></span><span>دور: <b id="rpsRound">${round}</b></span><button class="btn-ghost" id="rpsRestart">شروع دوباره</button></div>
      <p class="dim" id="rpsResult" style="text-align:center;min-height:24px;">انتخابت رو بزن</p>
      <div class="rps-choices">${choices.map(c=>`<button data-c="${c.k}">${c.e}</button>`).join('')}</div>
      ${leaderboardHtml('rps', difficulty)}
    `;
    stage.querySelectorAll('.rps-choices button').forEach(b=>b.addEventListener('click', ()=>play(b.dataset.c)));
    document.getElementById('rpsRestart').addEventListener('click', ()=>{ score=0; round=0; history=[]; render(); });
    wireDifficultyPicker(stage, 'rps', d=>{ difficulty=d; render(); });
  }
  function aiChoice(playerChoice){
    if(difficulty==='easy') return choices[Math.floor(Math.random()*3)].k;
    if(difficulty==='hard' && history.length>=3){
      // بیشترین انتخاب تکراری بازیکن رو حدس بزن و کانترش کن
      const counts = {rock:0,paper:0,scissors:0};
      history.forEach(h=>counts[h]++);
      const predicted = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];
      const counter = {rock:'paper',paper:'scissors',scissors:'rock'};
      return Math.random()<0.7 ? counter[predicted] : choices[Math.floor(Math.random()*3)].k;
    }
    return choices[Math.floor(Math.random()*3)].k;
  }
  function play(playerChoice){
    history.push(playerChoice);
    const ai = aiChoice(playerChoice);
    round++;
    let resultText, resultDelta=0;
    if(playerChoice===ai){ resultText = 'مساوی شد 🤝'; }
    else if(
      (playerChoice==='rock'&&ai==='scissors') ||
      (playerChoice==='paper'&&ai==='rock') ||
      (playerChoice==='scissors'&&ai==='paper')
    ){ resultText = 'بردی! 🎉'; resultDelta=1; }
    else { resultText = 'باختی 😅'; resultDelta=-1; }
    score += resultDelta;
    const aiLabel = choices.find(c=>c.k===ai).e;
    document.getElementById('rpsResult').textContent = `هوش مصنوعی: ${aiLabel} — ${resultText}`;
    document.getElementById('rpsScore').textContent = score;
    document.getElementById('rpsRound').textContent = round;
    if(round>=10){
      addScore('rps', difficulty, score);
      refreshLeaderboard('rps', difficulty);
      toast(`۱۰ دور تمام شد! امتیاز نهایی: ${score}`);
      round=0; history=[];
      setTimeout(()=>{ if(currentView==='games') render(); }, 1200);
    }
  }
  render();
}

/* --- سرعت واکنش --- */
const REACTION_PARAMS = { easy:{minWait:1500,maxWait:3500}, medium:{minWait:800,maxWait:2500}, hard:{minWait:400,maxWait:1500} };
function initReaction(stage){
  let difficulty = getDifficulty('reaction');
  let state = 'idle'; // idle | waiting | ready | tooSoon
  let startTs = 0, timeoutId, rounds = [];
  function render(){
    stage.innerHTML = `
      ${difficultyPickerHtml('reaction')}
      <div class="game-hud"><span>دور: <b id="reRound">${rounds.length}</b>/5</span><button class="btn-ghost" id="reRestart">شروع دوباره</button></div>
      <div class="reaction-pad" id="rePad">برای شروع کلیک کن</div>
      ${leaderboardHtml('reaction', difficulty)}
    `;
    document.getElementById('rePad').addEventListener('click', onPadClick);
    document.getElementById('reRestart').addEventListener('click', ()=>{ rounds=[]; state='idle'; clearTimeout(timeoutId); render(); });
    wireDifficultyPicker(stage, 'reaction', d=>{ difficulty=d; rounds=[]; state='idle'; clearTimeout(timeoutId); render(); });
  }
  function setPad(text, bg){
    const pad = document.getElementById('rePad');
    pad.textContent = text;
    pad.style.background = bg || '';
  }
  function onPadClick(){
    if(state==='idle' || state==='result'){
      state='waiting';
      setPad('صبر کن... رنگ سبز شد کلیک کن', '');
      const p = REACTION_PARAMS[difficulty];
      const wait = p.minWait + Math.random()*(p.maxWait-p.minWait);
      timeoutId = setTimeout(()=>{
        state='ready';
        startTs = Date.now();
        setPad('حالا! 🟢', 'var(--success)');
      }, wait);
    } else if(state==='waiting'){
      clearTimeout(timeoutId);
      state='result';
      setPad('زودتر از موعد زدی! دوباره امتحان کن 😅','var(--danger)');
    } else if(state==='ready'){
      const ms = Date.now()-startTs;
      rounds.push(ms);
      document.getElementById('reRound').textContent = rounds.length;
      state='result';
      setPad(`${ms} میلی‌ثانیه — کلیک کن برای دور بعد`,'');
      if(rounds.length>=5){
        const avg = Math.round(rounds.reduce((a,b)=>a+b,0)/rounds.length);
        const score = Math.max(1, 2000-avg); // امتیاز بالاتر = واکنش سریع‌تر
        addScore('reaction', difficulty, score);
        refreshLeaderboard('reaction', difficulty);
        toast(`میانگین واکنش: ${avg} میلی‌ثانیه`);
        rounds = [];
        setTimeout(()=>{ document.getElementById('reRound').textContent='0'; }, 60);
      }
    }
  }
  render();
}

/* --- حدس عدد --- */
const GUESS_PARAMS = { easy:{max:50, tries:10}, medium:{max:100, tries:7}, hard:{max:200, tries:6} };
function initGuess(stage){
  let difficulty = getDifficulty('guess');
  let target, triesLeft, maxNum, used;
  function setup(){
    const p = GUESS_PARAMS[difficulty];
    maxNum = p.max; triesLeft = p.tries; used = 0;
    target = Math.floor(Math.random()*maxNum)+1;
    stage.innerHTML = `
      ${difficultyPickerHtml('guess')}
      <div class="game-hud"><span>بازه: ۱ تا ${maxNum}</span><span>تلاش باقی‌مانده: <b id="guessTries">${triesLeft}</b></span><button class="btn-ghost" id="guessRestart">شروع دوباره</button></div>
      <p class="dim" id="guessHint" style="text-align:center;min-height:24px;">یک عدد حدس بزن</p>
      <div class="guess-input-row">
        <input type="number" id="guessInput" min="1" max="${maxNum}" placeholder="عدد رو اینجا بنویس...">
        <button class="btn-accent" id="guessBtn">حدس بزن</button>
      </div>
      ${leaderboardHtml('guess', difficulty)}
    `;
    document.getElementById('guessBtn').addEventListener('click', tryGuess);
    document.getElementById('guessInput').addEventListener('keydown', e=>{ if(e.key==='Enter') tryGuess(); });
    document.getElementById('guessRestart').addEventListener('click', setup);
    wireDifficultyPicker(stage, 'guess', d=>{ difficulty=d; setup(); });
  }
  function tryGuess(){
    const input = document.getElementById('guessInput');
    const val = Number(input.value);
    if(!val || val<1 || val>maxNum) return;
    used++; triesLeft--;
    document.getElementById('guessTries').textContent = triesLeft;
    const hint = document.getElementById('guessHint');
    if(val===target){
      const score = Math.max(10, (GUESS_PARAMS[difficulty].tries-used+1)*100);
      addScore('guess', difficulty, score);
      refreshLeaderboard('guess', difficulty);
      hint.textContent = `🎉 درست حدس زدی! عدد ${target} بود. امتیاز: ${score}`;
      input.disabled = true;
      document.getElementById('guessBtn').disabled = true;
    } else if(triesLeft<=0){
      hint.textContent = `باختی! عدد درست ${target} بود.`;
      input.disabled = true;
      document.getElementById('guessBtn').disabled = true;
    } else {
      hint.textContent = val<target ? '⬆️ عدد بزرگ‌تری بگو' : '⬇️ عدد کوچک‌تری بگو';
    }
    input.value=''; input.focus();
  }
  setup();
}


/* =========================================================
   راه‌اندازی اولیه
   ========================================================= */
/* =========================================================
   پالت فرمان سریع — Ctrl+K برای جستجو و پرش سریع به هر جای سایت
   ========================================================= */
const PALETTE_VIEWS = [
  {label:'خانه', view:'home', icon:'🏠'},
  {label:'روبلاکس', view:'roblox', icon:'🎲'},
  {label:'انیمه', view:'anime', icon:'🎴'},
  {label:'درباره ما', view:'aboutus', icon:'ℹ️'},
  {label:'بازی‌ها', view:'games', icon:'🕹️'},
  {label:'هوش مصنوعی', view:'ai', icon:'🤖'},
  {label:'پنل ادمین', view:'admin', icon:'🔐'},
  {label:'تنظیمات', view:'settings', icon:'⚙️'},
  {label:'چت کاربران', view:'chat', icon:'💬'},
  {label:'اکسپلور', view:'explore', icon:'🧭'},
  {label:'شورتس', view:'shorts', icon:'🎬'},
  {label:'پروفایل', view:'profile', icon:'👤'},
];
function openPalette(){
  document.getElementById('paletteModal').classList.remove('hidden');
  const input = document.getElementById('paletteInput');
  input.value = '';
  renderPaletteResults('');
  setTimeout(()=>input.focus(), 30);
}
function closePalette(){ document.getElementById('paletteModal').classList.add('hidden'); }
function renderPaletteResults(q){
  const wrap = document.getElementById('paletteResults');
  const term = q.trim();
  const viewMatches = PALETTE_VIEWS.filter(v=>!term || v.label.includes(term));
  const newsMatches = term.length>1 ? State.news.filter(n=>n.title.includes(term)).slice(0,6) : [];
  const robloxMatches = term.length>1 ? State.robloxSections.filter(s=>s.h.includes(term)||s.p.includes(term)).slice(0,4) : [];
  const gameMatches = term.length>1 ? ADMIN_GAME_LIST.filter(g=>g.label.includes(term)) : [];
  let rows = '';
  if(viewMatches.length){
    rows += '<p class="dim tiny">رفتن به بخش</p>';
    rows += viewMatches.map(v=>`<div class="manage-row" data-goto-view="${v.view}"><span class="mtitle">${v.icon} ${esc(v.label)}</span><span class="palette-hint">Enter</span></div>`).join('');
  }
  if(newsMatches.length){
    rows += '<p class="dim tiny">اخبار</p>';
    rows += newsMatches.map(n=>`<div class="manage-row" data-goto-news="${n.id}"><span class="mtitle">📰 ${esc(n.title)}</span></div>`).join('');
  }
  if(robloxMatches.length){
    rows += '<p class="dim tiny">روبلاکس</p>';
    rows += robloxMatches.map(s=>`<div class="manage-row" data-goto-view="roblox"><span class="mtitle">🎲 ${esc(s.h)}</span></div>`).join('');
  }
  if(gameMatches.length){
    rows += '<p class="dim tiny">بازی‌ها</p>';
    rows += gameMatches.map(g=>`<div class="manage-row" data-goto-view="games"><span class="mtitle">🕹️ ${esc(g.label)}</span></div>`).join('');
  }
  if(!rows) rows = '<p class="dim tiny">چیزی پیدا نشد.</p>';
  wrap.innerHTML = rows;
  wrap.querySelectorAll('[data-goto-view]').forEach(el=>el.addEventListener('click', ()=>{ showView(el.dataset.gotoView); closePalette(); }));
  wrap.querySelectorAll('[data-goto-news]').forEach(el=>el.addEventListener('click', ()=>{ openArticle(el.dataset.gotoNews); closePalette(); }));
}
document.getElementById('paletteBtn').addEventListener('click', openPalette);
document.getElementById('siteSearchBtn').addEventListener('click', openPalette);
document.getElementById('paletteInput').addEventListener('input', e=>renderPaletteResults(e.target.value));
document.getElementById('paletteModal').addEventListener('click', e=>{ if(e.target.id==='paletteModal') closePalette(); });
document.addEventListener('keydown', e=>{
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='k'){ e.preventDefault(); openPalette(); }
  if(e.key==='Escape' && !document.getElementById('paletteModal').classList.contains('hidden')) closePalette();
});

/* =========================================================
   بارگذاری روان — اسکلت لودینگ کوتاه برای فید خبر در اولین نمایش
   ========================================================= */
function showFeedSkeleton(){
  const wrap = document.getElementById('newsFeed');
  wrap.innerHTML = Array(3).fill('<div class="skel skel-card"></div>').join('');
}

/* =========================================================
   Service Worker — نصب‌پذیری (PWA) و کارکرد آفلاین فایل‌های سایت
   ========================================================= */
function registerServiceWorker(){
  if(!('serviceWorker' in navigator)) return;
  if(!location.protocol.startsWith('http')) return; // روی file:// کار نمی‌کند، طبیعی است
  navigator.serviceWorker.register('./service-worker.js').catch(()=>{ /* بی‌خطر نادیده گرفته می‌شود */ });
}

/* افکت نرم دنبال‌کردن ماوس — فقط دسکتاپ (pointer: fine)، با احترام به prefers-reduced-motion */
function initCursorGlow(){
  if(!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const glow = document.getElementById('cursorGlow');
  if(!glow) return;
  glow.classList.remove('hidden');
  let mx=0, my=0, gx=0, gy=0;
  document.addEventListener('mousemove', e=>{ mx=e.clientX; my=e.clientY; });
  function raf(){
    gx += (mx-gx)*0.18; gy += (my-gy)*0.18;
    glow.style.transform = `translate(${gx}px, ${gy}px) translate(-50%,-50%)`;
    requestAnimationFrame(raf);
  }
  raf();
  document.querySelectorAll('a, button, .news-card, .game-card, .explore-card').forEach(()=>{});
  document.addEventListener('mouseover', e=>{
    if(e.target.closest('button, a, .news-card, .game-card, .explore-card, input, textarea')){
      glow.style.width='40px'; glow.style.height='40px';
    }
  });
  document.addEventListener('mouseout', e=>{
    if(e.target.closest('button, a, .news-card, .game-card, .explore-card, input, textarea')){
      glow.style.width='26px'; glow.style.height='26px';
    }
  });
}
function init(){
  try{ initWelcomeGate();
  try{ renderDailyChallengeBar(); }catch(e){} }catch(e){}
  applySettings();
  applyBranding();
  applyEventMode();
  cleanupLegacyLeaderboards();
  startSiteClock();
  fetchNetInfo();
  populateLangSelect();
  showFeedSkeleton();
  runAutoScan();
  publishDueScheduled();
  publishDueScheduledBroadcasts();
  setTimeout(()=>{ renderNewsFeed(); renderPollWidget(); }, 90);
  renderAdmin();
  applyMaintenanceGate();
  registerServiceWorker();
  updateNotifBadge();
  initCursorGlow();
  initCloudSync();
  try{ applyAnnounceBanner(); ensureStateExtras(); }catch(e){}
  backendSyncPull();
  setInterval(()=>{ if(document.visibilityState==='visible') backendSyncPull().then(ok=>{ if(ok){ try{ if(currentView==='explore') renderExplore(); if(currentView==='shorts') renderShorts(); if(currentView==='home') renderNewsFeed(); }catch(e){} } }); }, 8000);
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') backendSyncPull(); });

  const lastShown = load('gh_broadcast_last_shown', null);
  const last = State.broadcastLog.slice(-1)[0];
  if(last && last.id !== lastShown){ showBroadcast(last); }

  const menuToggle=document.getElementById('menuToggle');
  const mainNav=document.getElementById('mainNav');
  menuToggle?.addEventListener('click', ()=>{
    const open=mainNav.classList.toggle('force-open');
    menuToggle.setAttribute('aria-expanded',String(open));
  });
  mainNav?.addEventListener('click', e=>{
    if(e.target.closest('.navlink')){
      mainNav.classList.remove('force-open');
      menuToggle?.setAttribute('aria-expanded','false');
    }
  });
  document.addEventListener('click', e=>{
    if(window.matchMedia('(max-width:859px)').matches && mainNav?.classList.contains('force-open') && !e.target.closest('#mainNav,#menuToggle')){
      mainNav.classList.remove('force-open');
      menuToggle?.setAttribute('aria-expanded','false');
    }
  });
}

/* =========================================================
   بازی‌های جدید
   ========================================================= */
function init2048(stage){
  const size=4; let grid=Array.from({length:size},()=>Array(size).fill(0));
  let score=0, alive=true;
  function spawn(){ const empty=[]; for(let r=0;r<size;r++) for(let c=0;c<size;c++) if(!grid[r][c]) empty.push([r,c]); if(!empty.length) return; const [r,c]=empty[Math.floor(Math.random()*empty.length)]; grid[r][c]=Math.random()<0.9?2:4; }
  function slide(row){ let arr=row.filter(x=>x); for(let i=0;i<arr.length-1;i++){ if(arr[i]===arr[i+1]){ arr[i]*=2; score+=arr[i]; arr[i+1]=0; } } arr=arr.filter(x=>x); while(arr.length<size) arr.push(0); return arr; }
  function move(dir){
    if(!alive) return;
    const prev=JSON.stringify(grid);
    if(dir==='left'){ grid=grid.map(r=>slide(r)); }
    else if(dir==='right'){ grid=grid.map(r=>slide([...r].reverse()).reverse()); }
    else if(dir==='up'||dir==='down'){
      for(let c=0;c<size;c++){
        let col=[]; for(let r=0;r<size;r++) col.push(grid[r][c]);
        if(dir==='down') col.reverse();
        col=slide(col);
        if(dir==='down') col.reverse();
        for(let r=0;r<size;r++) grid[r][c]=col[r];
      }
    }
    if(JSON.stringify(grid)===prev) return;
    spawn(); draw();
    if(!canMove()){ alive=false; recordGameScore('g2048', score); toast('بازی تمام! امتیاز: '+score); }
  }
  function canMove(){ for(let r=0;r<size;r++) for(let c=0;c<size;c++){ if(!grid[r][c]) return true; if(c+1<size&&grid[r][c]===grid[r][c+1]) return true; if(r+1<size&&grid[r][c]===grid[r+1][c]) return true; } return false; }
  const colors={0:'#1a1d2e',2:'#3d3a5c',4:'#4a4570',8:'#7c5cff',16:'#9b7bff',32:'#d4a72c',64:'#e0b84a',128:'#ff6b6b',256:'#ff8e53',512:'#5ce1a8',1024:'#4ecdc4',2048:'#ffe66d'};
  function draw(){
    stage.innerHTML=`<div class="game-hud"><b>۲۰۴۸</b> امتیاز: ${score}</div>
      <div id="g2048board" style="display:grid;grid-template-columns:repeat(4,minmax(56px,72px));gap:8px;justify-content:center;margin:12px auto;"></div>
      <p class="dim tiny" style="text-align:center">کیبورد: ←↑↓→ یا دکمه‌ها</p>
      <div class="option-row" style="justify-content:center;gap:6px;flex-wrap:wrap;">
        <button class="btn-ghost" data-d="up">↑</button><button class="btn-ghost" data-d="left">←</button>
        <button class="btn-ghost" data-d="down">↓</button><button class="btn-ghost" data-d="right">→</button>
        <button class="btn-accent" id="g2048restart">شروع دوباره</button>
      </div>`;
    const board=stage.querySelector('#g2048board');
    grid.flat().forEach(v=>{
      const d=document.createElement('div');
      d.textContent=v||'';
      d.style.cssText=`height:64px;display:flex;align-items:center;justify-content:center;border-radius:10px;font-weight:800;font-size:${v>512?16:20}px;background:${colors[v]||'#222'};color:#fff;`;
      board.appendChild(d);
    });
    stage.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>move(b.dataset.d));
    stage.querySelector('#g2048restart').onclick=()=>init2048(stage);
  }
  spawn(); spawn(); draw();
  const kd=e=>{ const m={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'}; if(m[e.key]){ e.preventDefault(); move(m[e.key]); } };
  if(stage._kd) window.removeEventListener('keydown', stage._kd);
  stage._kd=kd; window.addEventListener('keydown', kd);
}

function initPong(stage){
  stage.innerHTML=`<div class="game-hud"><b>پونگ</b> <span id="pongScore">0 - 0</span></div>
    <canvas id="pongC" width="360" height="240" style="width:100%;max-width:360px;display:block;margin:0 auto;background:#0d1020;border-radius:12px;border:1px solid var(--border);"></canvas>
    <p class="dim tiny" style="text-align:center">ماوس/لمس برای حرکت پدال</p>`;
  const c=stage.querySelector('#pongC'), ctx=c.getContext('2d');
  let py=100, by=120, bx=180, bvx=3, bvy=2, ps=0, cs=0, running=true;
  function loop(){
    if(!running) return;
    ctx.fillStyle='#0d1020'; ctx.fillRect(0,0,360,240);
    ctx.fillStyle='#7c5cff'; ctx.fillRect(10,py,8,50);
    const cy=Math.max(0,Math.min(190,by-25));
    ctx.fillStyle='#d4a72c'; ctx.fillRect(342,cy,8,50);
    ctx.beginPath(); ctx.arc(bx,by,6,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill();
    bx+=bvx; by+=bvy;
    if(by<6||by>234) bvy*=-1;
    if(bx<20&&by>py&&by<py+50){ bvx=Math.abs(bvx)+0.2; bvy+=(Math.random()-0.5)*2; }
    if(bx>340&&by>cy&&by<cy+50){ bvx=-Math.abs(bvx)-0.2; }
    if(bx<0){ cs++; reset(); }
    if(bx>360){ ps++; reset(); }
    stage.querySelector('#pongScore').textContent=ps+' - '+cs;
    if(ps>=5||cs>=5){ running=false; recordGameScore('pong', ps*100); toast(ps>=5?'بردید!':'باختید'); return; }
    requestAnimationFrame(loop);
  }
  function reset(){ bx=180; by=120; bvx=(Math.random()>.5?1:-1)*3; bvy=(Math.random()-.5)*4; }
  c.addEventListener('mousemove', e=>{ const r=c.getBoundingClientRect(); py=Math.max(0,Math.min(190,((e.clientY-r.top)/r.height)*240-25)); });
  c.addEventListener('touchmove', e=>{ e.preventDefault(); const t=e.touches[0], r=c.getBoundingClientRect(); py=Math.max(0,Math.min(190,((t.clientY-r.top)/r.height)*240-25)); }, {passive:false});
  loop();
}

function initQuiz(stage){
  const Q=[
    {q:'کدام بازی از استودیو FromSoftware است؟', a:['الدن رینگ','فیفا','ماینکرفت','فورتنایت'], c:0},
    {q:'GTA توسط کدام شرکت ساخته می‌شود؟', a:['راک‌استار','نینتندو','سونی','یوبی‌سافت'], c:0},
    {q:'کنسول سوییچ مال کدام شرکت است؟', a:['سونی','مایکروسافت','نینتندو','سگا'], c:2},
    {q:'شخصیت کریتوس در کدام بازی است؟', a:['گاد آو وار','آنچارتد','لست آو آس','اسپایدرمن'], c:0},
    {q:'سبک Souls-like به چه معروف است؟', a:['سختی بالا','پازل کودکانه','فقط موبایل','مسابقه ماشین'], c:0},
  ];
  let i=0, score=0;
  function show(){
    if(i>=Q.length){ stage.innerHTML=`<div class="game-hud"><b>کوییز تمام</b> امتیاز: ${score}/${Q.length}</div><button class="btn-accent" id="quizAgain">دوباره</button>`; stage.querySelector('#quizAgain').onclick=()=>initQuiz(stage); recordGameScore('quiz', score*50); return; }
    const cur=Q[i];
    stage.innerHTML=`<div class="game-hud"><b>کوییز گیم</b> سوال ${i+1}/${Q.length} — امتیاز ${score}</div>
      <p style="font-size:1.1rem;margin:12px 0;">${cur.q}</p>
      <div style="display:grid;gap:8px;">${cur.a.map((ans,idx)=>`<button class="btn-ghost full" data-a="${idx}">${ans}</button>`).join('')}</div>`;
    stage.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>{
      if(+b.dataset.a===cur.c){ score++; toast('درست!'); } else toast('غلط!');
      i++; show();
    });
  }
  show();
}

function initMines(stage){
  const W=8,H=8,MINES=10;
  let cells=[], revealed=0, alive=true;
  function build(){
    cells=Array.from({length:H},()=>Array.from({length:W},()=>({m:false,n:0,open:false,flag:false})));
    let placed=0; while(placed<MINES){ const r=Math.floor(Math.random()*H),c=Math.floor(Math.random()*W); if(!cells[r][c].m){ cells[r][c].m=true; placed++; } }
    for(let r=0;r<H;r++) for(let c=0;c<W;c++){ if(cells[r][c].m) continue; let n=0; for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){ const rr=r+dr,cc=c+dc; if(rr>=0&&rr<H&&cc>=0&&cc<W&&cells[rr][cc].m) n++; } cells[r][c].n=n; }
  }
  function open(r,c){
    if(!alive||cells[r][c].open||cells[r][c].flag) return;
    cells[r][c].open=true; revealed++;
    if(cells[r][c].m){ alive=false; draw(); toast('بووم! باختی'); recordGameScore('mines', revealed*5); return; }
    if(cells[r][c].n===0){ for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){ const rr=r+dr,cc=c+dc; if(rr>=0&&rr<H&&cc>=0&&cc<W) open(rr,cc); } }
    if(revealed>=W*H-MINES){ alive=false; toast('بردی!'); recordGameScore('mines', 500); }
    draw();
  }
  function draw(){
    stage.innerHTML=`<div class="game-hud"><b>مین‌روب</b> باز: ${revealed} | مین: ${MINES}</div>
      <div id="mineG" style="display:grid;grid-template-columns:repeat(${W},32px);gap:3px;justify-content:center;"></div>
      <button class="btn-accent" id="mineR" style="margin-top:10px;">شروع دوباره</button>`;
    const g=stage.querySelector('#mineG');
    for(let r=0;r<H;r++) for(let c=0;c<W;c++){
      const cell=cells[r][c], d=document.createElement('button');
      d.style.cssText='width:32px;height:32px;border-radius:6px;border:1px solid var(--border);font-size:12px;cursor:pointer;';
      if(cell.open){ d.style.background=cell.m?'#c0392b':'#1a1d2e'; d.textContent=cell.m?'💣':(cell.n||''); d.style.color='#fff'; }
      else { d.style.background='#2a2f45'; d.textContent=cell.flag?'🚩':''; }
      d.oncontextmenu=e=>{ e.preventDefault(); if(!cell.open){ cell.flag=!cell.flag; draw(); } };
      d.onclick=()=>open(r,c);
      g.appendChild(d);
    }
    stage.querySelector('#mineR').onclick=()=>initMines(stage);
  }
  build(); draw();
}

function initBreakout(stage){
  stage.innerHTML=`<div class="game-hud"><b>آجرشکن</b> <span id="brScore">0</span></div>
    <canvas id="brC" width="360" height="280" style="width:100%;max-width:360px;display:block;margin:0 auto;background:#0d1020;border-radius:12px;border:1px solid var(--border);"></canvas>`;
  const c=stage.querySelector('#brC'), ctx=c.getContext('2d');
  let px=150, bx=180, by=200, bvx=2.5, bvy=-2.5, score=0, running=true;
  const bricks=[];
  for(let r=0;r<4;r++) for(let col=0;col<8;col++) bricks.push({x:col*44+8,y:r*22+20,w:40,h:16,alive:true});
  function loop(){
    if(!running) return;
    ctx.fillStyle='#0d1020'; ctx.fillRect(0,0,360,280);
    ctx.fillStyle='#7c5cff'; ctx.fillRect(px,260,60,8);
    bricks.forEach(b=>{ if(!b.alive) return; ctx.fillStyle='#d4a72c'; ctx.fillRect(b.x,b.y,b.w,b.h); });
    ctx.beginPath(); ctx.arc(bx,by,5,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill();
    bx+=bvx; by+=bvy;
    if(bx<5||bx>355) bvx*=-1;
    if(by<5) bvy*=-1;
    if(by>255&&bx>px&&bx<px+60){ bvy=-Math.abs(bvy); bvx+=(bx-(px+30))/20; }
    if(by>280){ running=false; toast('باختی! امتیاز: '+score); recordGameScore('breakout', score); return; }
    bricks.forEach(b=>{ if(!b.alive) return; if(bx>b.x&&bx<b.x+b.w&&by>b.y&&by<b.y+b.h){ b.alive=false; bvy*=-1; score+=10; stage.querySelector('#brScore').textContent=score; } });
    if(bricks.every(b=>!b.alive)){ running=false; toast('بردی!'); recordGameScore('breakout', score+200); return; }
    requestAnimationFrame(loop);
  }
  c.addEventListener('mousemove', e=>{ const r=c.getBoundingClientRect(); px=Math.max(0,Math.min(300,((e.clientX-r.left)/r.width)*360-30)); });
  c.addEventListener('touchmove', e=>{ e.preventDefault(); const t=e.touches[0], r=c.getBoundingClientRect(); px=Math.max(0,Math.min(300,((t.clientX-r.left)/r.width)*360-30)); }, {passive:false});
  loop();
}

function initClicker(stage){
  let gold=load('gh_clicker_gold',0), power=load('gh_clicker_power',1);
  function draw(){
    stage.innerHTML=`<div class="game-hud"><b>کلیکر طلایی</b></div>
      <div style="text-align:center;padding:20px;">
        <div style="font-size:2rem;margin-bottom:8px;">🪙 ${gold}</div>
        <button id="clickGold" class="btn-accent" style="font-size:1.3rem;padding:16px 28px;">کلیک! (+${power})</button>
        <p class="dim tiny" style="margin-top:12px;">قدرت کلیک: ${power}</p>
        <button id="upgradeClick" class="btn-ghost" style="margin-top:8px;">ارتقاء قدرت (هزینه: ${power*15})</button>
      </div>`;
    stage.querySelector('#clickGold').onclick=()=>{ gold+=power; save('gh_clicker_gold',gold); draw(); };
    stage.querySelector('#upgradeClick').onclick=()=>{ const cost=power*15; if(gold<cost){ toast('طلا کافی نیست'); return; } gold-=cost; power++; save('gh_clicker_gold',gold); save('gh_clicker_power',power); draw(); toast('قدرت بیشتر شد!'); };
  }
  draw();
}

/* =========================================================
   ۱۸ بازی جدید — همه با سطح‌بندی و لیدربورد زندهٔ ابری
   ========================================================= */

/* --- سایمون سیز --- */
const SIMON_PARAMS = {easy:{speed:750}, medium:{speed:520}, hard:{speed:340}};
function initSimon(stage){
  let difficulty = getDifficulty('simon');
  const pads = [{c:'#e0546a',n:0},{c:'#4cc38a',n:1},{c:'#d4a72c',n:2},{c:'#7c5cff',n:3}];
  let seq=[], userStep=0, playing=false, score=0;
  function render(){
    stage.innerHTML = `${difficultyPickerHtml('simon')}
      <div class="game-hud"><span>امتیاز: <b id="simonScore">${score}</b></span><button class="btn-ghost" id="simonStart">شروع</button></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;max-width:260px;margin:12px auto;">
        ${pads.map(p=>`<button data-pad="${p.n}" style="height:90px;border-radius:14px;border:2px solid var(--border);background:${p.c};opacity:.55;"></button>`).join('')}
      </div>
      <p class="dim tiny" style="text-align:center">دنبالهٔ رنگ‌ها را با همان ترتیب تکرار کن.</p>
      ${leaderboardHtml('simon', difficulty)}`;
    stage.querySelector('#simonStart').onclick=start;
    stage.querySelectorAll('[data-pad]').forEach(b=>b.addEventListener('click', ()=>onPad(+b.dataset.pad)));
    wireDifficultyPicker(stage, 'simon', d=>{ difficulty=d; refreshLeaderboard('simon', difficulty); });
  }
  function flash(n){
    const btn = stage.querySelector(`[data-pad="${n}"]`);
    if(!btn) return;
    btn.style.opacity=1;
    setTimeout(()=>{ btn.style.opacity=.55; }, SIMON_PARAMS[difficulty].speed*0.6);
  }
  function playSeq(){
    playing=true; userStep=0;
    let i=0;
    const iv = setInterval(()=>{
      flash(seq[i]); i++;
      if(i>=seq.length){ clearInterval(iv); playing=false; }
    }, SIMON_PARAMS[difficulty].speed);
  }
  function start(){ seq=[]; score=0; next(); }
  function next(){ seq.push(Math.floor(Math.random()*4)); stage.querySelector('#simonScore').textContent=score; setTimeout(playSeq, 500); }
  function onPad(n){
    if(playing) return;
    flash(n);
    if(seq[userStep]!==n){
      addScore('simon', difficulty, score); refreshLeaderboard('simon', difficulty);
      logPlayerActivity(`سایمون سیز بازی کرد (سطح ${diffLabel(difficulty)}) — امتیاز: ${score}`);
      toast('باختی! امتیاز: '+score); return;
    }
    userStep++;
    if(userStep>=seq.length){ score++; next(); }
  }
  render();
}

/* --- موش‌کوب --- */
const WHACK_PARAMS = {easy:{time:30, up:900}, medium:{time:25, up:650}, hard:{time:20, up:420}};
function initWhack(stage){
  let difficulty = getDifficulty('whack');
  let score=0, timeLeft, timer, moleAt=-1, moleTimer;
  function render(){
    stage.innerHTML = `${difficultyPickerHtml('whack')}
      <div class="game-hud"><span>امتیاز: <b id="whackScore">0</b></span><span>زمان: <b id="whackTime">${WHACK_PARAMS[difficulty].time}</b></span><button class="btn-ghost" id="whackStart">شروع</button></div>
      <div id="whackGrid" style="display:grid;grid-template-columns:repeat(3,80px);gap:10px;justify-content:center;margin:12px auto;"></div>
      ${leaderboardHtml('whack', difficulty)}`;
    for(let i=0;i<9;i++){
      const d=document.createElement('button');
      d.dataset.hole=i; d.style.cssText='height:70px;border-radius:12px;border:2px solid var(--border);background:var(--bg-alt);font-size:28px;';
      d.onclick=()=>hit(i);
      stage.querySelector('#whackGrid').appendChild(d);
    }
    stage.querySelector('#whackStart').onclick=start;
    wireDifficultyPicker(stage, 'whack', d=>{ difficulty=d; refreshLeaderboard('whack', difficulty); stop(); render(); });
  }
  function popMole(){
    const holes = stage.querySelectorAll('[data-hole]');
    if(moleAt>=0) holes[moleAt].textContent='';
    moleAt = Math.floor(Math.random()*9);
    holes[moleAt].textContent='🐹';
    clearTimeout(moleTimer);
    moleTimer = setTimeout(popMole, WHACK_PARAMS[difficulty].up);
  }
  function hit(i){
    if(i===moleAt){ score++; stage.querySelector('#whackScore').textContent=score; moleAt=-1; stage.querySelectorAll('[data-hole]')[i].textContent=''; }
  }
  function start(){
    score=0; timeLeft=WHACK_PARAMS[difficulty].time;
    stage.querySelector('#whackScore').textContent=0;
    stage.querySelector('#whackTime').textContent=timeLeft;
    clearInterval(timer); clearTimeout(moleTimer);
    popMole();
    timer = setInterval(()=>{
      timeLeft--; stage.querySelector('#whackTime').textContent=timeLeft;
      if(timeLeft<=0) stop();
    }, 1000);
  }
  function stop(){
    clearInterval(timer); clearTimeout(moleTimer);
    if(score>0){ addScore('whack', difficulty, score); refreshLeaderboard('whack', difficulty); logPlayerActivity(`موش‌کوب بازی کرد (سطح ${diffLabel(difficulty)}) — امتیاز: ${score}`); toast('تمام شد! امتیاز: '+score); }
  }
  render();
}

/* --- پرنده پرنده (فلپی) --- */
const FLAPPY_PARAMS = {easy:{gap:150, speed:2.2}, medium:{gap:120, speed:2.8}, hard:{gap:95, speed:3.5}};
function initFlappy(stage){
  let difficulty = getDifficulty('flappy');
  stage.innerHTML = `${difficultyPickerHtml('flappy')}
    <div class="game-hud"><b>پرنده پرنده</b> امتیاز: <b id="flapScore">0</b></div>
    <canvas id="flapC" width="320" height="360" style="width:100%;max-width:320px;display:block;margin:0 auto;background:#0d1020;border-radius:12px;border:1px solid var(--border);"></canvas>
    <p class="dim tiny" style="text-align:center">کلیک یا اسپیس برای پرش</p>
    ${leaderboardHtml('flappy', difficulty)}`;
  const c = stage.querySelector('#flapC'), ctx = c.getContext('2d');
  let birdY=180, vel=0, pipes=[], score=0, alive=true, frame=0;
  function reset(){ birdY=180; vel=0; pipes=[{x:320,gapY:120}]; score=0; alive=true; frame=0; stage.querySelector('#flapScore').textContent=0; }
  function loop(){
    if(!alive) return;
    frame++;
    const p = FLAPPY_PARAMS[difficulty];
    vel += 0.35; birdY += vel;
    pipes.forEach(pp=>pp.x -= p.speed);
    if(pipes[pipes.length-1].x < 170) pipes.push({x:320, gapY: 40+Math.random()*240});
    if(pipes[0].x < -40) { pipes.shift(); score++; stage.querySelector('#flapScore').textContent=score; }
    ctx.fillStyle='#0d1020'; ctx.fillRect(0,0,320,360);
    ctx.fillStyle='#4cc38a';
    pipes.forEach(pp=>{
      ctx.fillRect(pp.x, 0, 34, pp.gapY - p.gap/2);
      ctx.fillRect(pp.x, pp.gapY + p.gap/2, 34, 360 - (pp.gapY + p.gap/2));
      if(pp.x < 44 && pp.x > -34 && (birdY < pp.gapY - p.gap/2 + 6 || birdY > pp.gapY + p.gap/2 - 6)) alive=false;
    });
    ctx.beginPath(); ctx.arc(40, birdY, 10, 0, Math.PI*2); ctx.fillStyle='#e8c25a'; ctx.fill();
    if(birdY>350 || birdY<0) alive=false;
    if(!alive){
      addScore('flappy', difficulty, score); refreshLeaderboard('flappy', difficulty);
      logPlayerActivity(`پرنده پرنده بازی کرد (سطح ${diffLabel(difficulty)}) — امتیاز: ${score}`);
      toast('باختی! امتیاز: '+score); return;
    }
    requestAnimationFrame(loop);
  }
  function flap(){ if(alive) vel=-6; }
  c.addEventListener('click', flap);
  const kd = e=>{ if(e.code==='Space'){ e.preventDefault(); flap(); } };
  if(stage._kd) window.removeEventListener('keydown', stage._kd);
  stage._kd=kd; window.addEventListener('keydown', kd);
  wireDifficultyPicker(stage, 'flappy', d=>{ difficulty=d; reset(); refreshLeaderboard('flappy', difficulty); loop(); });
  reset(); loop();
}

/* --- کلمه قاطی‌پاطی --- */
const SCRAMBLE_WORDS = {
  easy:['گربه','خانه','کتاب','باران','دریا','آتش','ستاره','گل','کوه','ماه'],
  medium:['کامپیوتر','دانشگاه','بازیکن','رستوران','هواپیما','کتابخانه','فرودگاه','روزنامه'],
  hard:['استراتژی','دموکراسی','فناوری','بین‌المللی','خلاقیت','مسئولیت','هوش‌مصنوعی']
};
function shuffleWord(w){
  const arr=[...w]; for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; }
  const joined=arr.join(''); return joined===w? shuffleWord(w): joined;
}
function initScramble(stage){
  let difficulty = getDifficulty('scramble');
  let score=0, timeLeft=60, timer, current, scrambled;
  function newWord(){
    const list = SCRAMBLE_WORDS[difficulty];
    current = list[Math.floor(Math.random()*list.length)];
    scrambled = shuffleWord(current);
    stage.querySelector('#scrWord').textContent = scrambled;
    stage.querySelector('#scrInput').value='';
  }
  function render(){
    stage.innerHTML = `${difficultyPickerHtml('scramble')}
      <div class="game-hud"><span>امتیاز: <b id="scrScore">0</b></span><span>زمان: <b id="scrTime">60</b></span><button class="btn-ghost" id="scrStart">شروع</button></div>
      <p style="text-align:center;font-size:1.6rem;letter-spacing:4px;margin:16px 0;" id="scrWord">—</p>
      <form id="scrForm" style="display:flex;gap:8px;max-width:320px;margin:0 auto;">
        <input id="scrInput" class="ticket-field" style="margin:0;" placeholder="حدس بزن..." autocomplete="off">
        <button class="btn-accent" type="submit">ثبت</button>
      </form>
      ${leaderboardHtml('scramble', difficulty)}`;
    stage.querySelector('#scrStart').onclick=start;
    stage.querySelector('#scrForm').addEventListener('submit', e=>{
      e.preventDefault();
      const val = stage.querySelector('#scrInput').value.trim();
      if(val===current){ score++; stage.querySelector('#scrScore').textContent=score; newWord(); toast('درست! 🎉'); }
      else toast('اشتباه بود، دوباره امتحان کن');
    });
    wireDifficultyPicker(stage, 'scramble', d=>{ difficulty=d; clearInterval(timer); refreshLeaderboard('scramble', difficulty); render(); });
  }
  function start(){
    score=0; timeLeft=60;
    stage.querySelector('#scrScore').textContent=0; stage.querySelector('#scrTime').textContent=60;
    newWord(); clearInterval(timer);
    timer=setInterval(()=>{ timeLeft--; stage.querySelector('#scrTime').textContent=timeLeft; if(timeLeft<=0) stop(); }, 1000);
  }
  function stop(){
    clearInterval(timer);
    if(score>0){ addScore('scramble', difficulty, score); refreshLeaderboard('scramble', difficulty); logPlayerActivity(`کلمه قاطی‌پاطی بازی کرد (سطح ${diffLabel(difficulty)}) — امتیاز: ${score}`); }
    toast('تمام شد! امتیاز: '+score);
  }
  render();
}

/* --- دار و مار کلمه --- */
const HANGMAN_WORDS = {easy:['سیب','توپ','خانه','قلم'], medium:['کامپیوتر','دانشجو','فوتبال','موسیقی'], hard:['هوش‌مصنوعی','دموکراسی','بین‌المللی']};
const HANGMAN_MAX_WRONG = {easy:8, medium:6, hard:5};
function initHangman(stage){
  let difficulty = getDifficulty('hangman');
  let word, guessed, wrong, score=0;
  function newRound(){
    const list = HANGMAN_WORDS[difficulty];
    word = list[Math.floor(Math.random()*list.length)];
    guessed = new Set(); wrong = 0;
    draw();
  }
  function draw(){
    const display = [...word].map(ch=>guessed.has(ch)?ch:'_').join(' ');
    const alphabet = 'ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی'.split('');
    stage.innerHTML = `${difficultyPickerHtml('hangman')}
      <div class="game-hud"><span>امتیاز: <b>${score}</b></span><span>اشتباه: <b>${wrong}/${HANGMAN_MAX_WRONG[difficulty]}</b></span></div>
      <p style="text-align:center;font-size:1.8rem;letter-spacing:6px;margin:16px 0;">${display}</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;max-width:420px;margin:0 auto;">
        ${alphabet.map(ch=>`<button class="opt-btn" style="flex:0 0 auto;width:34px;padding:8px 0;" data-letter="${ch}" ${guessed.has(ch)?'disabled':''}>${ch}</button>`).join('')}
      </div>
      ${leaderboardHtml('hangman', difficulty)}`;
    stage.querySelectorAll('[data-letter]').forEach(b=>b.addEventListener('click', ()=>guess(b.dataset.letter)));
    wireDifficultyPicker(stage, 'hangman', d=>{ difficulty=d; refreshLeaderboard('hangman', difficulty); newRound(); });
  }
  function guess(ch){
    guessed.add(ch);
    if(!word.includes(ch)){
      wrong++;
      if(wrong>=HANGMAN_MAX_WRONG[difficulty]){
        addScore('hangman', difficulty, score); refreshLeaderboard('hangman', difficulty);
        logPlayerActivity(`دار و مار کلمه بازی کرد (سطح ${diffLabel(difficulty)}) — امتیاز: ${score}`);
        toast('باختی! کلمه: '+word); score=0; newRound(); return;
      }
    } else if([...word].every(c=>guessed.has(c))){
      score += Math.max(10, 30-wrong*3); toast('درست حدس زدی! 🎉'); newRound(); return;
    }
    draw();
  }
  newRound();
}

/* --- ریاضی رعدآسا --- */
const MATH_PARAMS = {easy:{max:10, ops:['+','-']}, medium:{max:25, ops:['+','-','×']}, hard:{max:60, ops:['+','-','×','÷']}};
function initMathBlitz(stage){
  let difficulty = getDifficulty('mathblitz');
  let score=0, timeLeft=45, timer, answer;
  function newQ(){
    const p = MATH_PARAMS[difficulty];
    const op = p.ops[Math.floor(Math.random()*p.ops.length)];
    let a=Math.floor(Math.random()*p.max)+1, b=Math.floor(Math.random()*p.max)+1;
    if(op==='÷'){ b=Math.floor(Math.random()*9)+1; a=b*(Math.floor(Math.random()*9)+1); answer=a/b; }
    else if(op==='×'){ a=Math.floor(Math.random()*12)+1; b=Math.floor(Math.random()*12)+1; answer=a*b; }
    else if(op==='-'){ if(b>a) [a,b]=[b,a]; answer=a-b; }
    else answer=a+b;
    stage.querySelector('#mbQ').textContent = `${a} ${op} ${b} = ؟`;
    stage.querySelector('#mbInput').value='';
  }
  function render(){
    stage.innerHTML = `${difficultyPickerHtml('mathblitz')}
      <div class="game-hud"><span>امتیاز: <b id="mbScore">0</b></span><span>زمان: <b id="mbTime">45</b></span><button class="btn-ghost" id="mbStart">شروع</button></div>
      <p style="text-align:center;font-size:1.8rem;margin:16px 0;" id="mbQ">—</p>
      <form id="mbForm" style="display:flex;gap:8px;max-width:280px;margin:0 auto;">
        <input id="mbInput" class="ticket-field" type="number" style="margin:0;" placeholder="جواب" autocomplete="off">
        <button class="btn-accent" type="submit">ثبت</button>
      </form>
      ${leaderboardHtml('mathblitz', difficulty)}`;
    stage.querySelector('#mbStart').onclick=start;
    stage.querySelector('#mbForm').addEventListener('submit', e=>{
      e.preventDefault();
      if(Number(stage.querySelector('#mbInput').value)===answer){ score++; stage.querySelector('#mbScore').textContent=score; newQ(); }
      else toast('اشتباه بود!');
    });
    wireDifficultyPicker(stage, 'mathblitz', d=>{ difficulty=d; clearInterval(timer); refreshLeaderboard('mathblitz', difficulty); render(); });
  }
  function start(){
    score=0; timeLeft=45;
    stage.querySelector('#mbScore').textContent=0; stage.querySelector('#mbTime').textContent=45;
    newQ(); clearInterval(timer);
    timer=setInterval(()=>{ timeLeft--; stage.querySelector('#mbTime').textContent=timeLeft; if(timeLeft<=0) stop(); }, 1000);
  }
  function stop(){
    clearInterval(timer);
    if(score>0){ addScore('mathblitz', difficulty, score); refreshLeaderboard('mathblitz', difficulty); logPlayerActivity(`ریاضی رعدآسا بازی کرد (سطح ${diffLabel(difficulty)}) — امتیاز: ${score}`); }
    toast('تمام شد! امتیاز: '+score);
  }
  render();
}

/* --- رنگ‌شناس (استروپ) --- */
const COLOR_PARAMS = {easy:{time:1900}, medium:{time:1300}, hard:{time:850}};
const COLOR_LIST = [{n:'قرمز',c:'#e0546a'},{n:'سبز',c:'#4cc38a'},{n:'آبی',c:'#4a9fe0'},{n:'زرد',c:'#d4a72c'},{n:'بنفش',c:'#7c5cff'}];
function initColorMatch(stage){
  let difficulty = getDifficulty('colormatch');
  let score=0, round=0, totalRounds=15, target, timeout;
  function newRound(){
    round++;
    if(round>totalRounds){ finish(); return; }
    const word = COLOR_LIST[Math.floor(Math.random()*COLOR_LIST.length)];
    let colorShown = COLOR_LIST[Math.floor(Math.random()*COLOR_LIST.length)];
    target = colorShown.n===word.n;
    stage.querySelector('#cmWord').textContent = word.n;
    stage.querySelector('#cmWord').style.color = colorShown.c;
    stage.querySelector('#cmRound').textContent = round+'/'+totalRounds;
    clearTimeout(timeout);
    timeout = setTimeout(()=>answer(false, true), COLOR_PARAMS[difficulty].time);
  }
  function answer(said, timedOut){
    clearTimeout(timeout);
    if(!timedOut && said===target) score++;
    stage.querySelector('#cmScore').textContent=score;
    newRound();
  }
  function finish(){
    addScore('colormatch', difficulty, score); refreshLeaderboard('colormatch', difficulty);
    logPlayerActivity(`رنگ‌شناس بازی کرد (سطح ${diffLabel(difficulty)}) — امتیاز: ${score}`);
    toast('تمام شد! امتیاز: '+score+'/'+totalRounds);
  }
  stage.innerHTML = `${difficultyPickerHtml('colormatch')}
    <div class="game-hud"><span>امتیاز: <b id="cmScore">0</b></span><span>دور: <b id="cmRound">0/${totalRounds}</b></span></div>
    <p class="dim tiny" style="text-align:center">آیا نوشته با رنگ خودش یکی است؟</p>
    <p id="cmWord" style="text-align:center;font-size:2.2rem;font-weight:800;margin:16px 0;">—</p>
    <div class="option-row" style="max-width:280px;margin:0 auto;">
      <button class="btn-accent" id="cmYes">بله ✅</button>
      <button class="btn-ghost" id="cmNo">خیر ❌</button>
    </div>
    ${leaderboardHtml('colormatch', difficulty)}`;
  stage.querySelector('#cmYes').onclick=()=>answer(true,false);
  stage.querySelector('#cmNo').onclick=()=>answer(false,false);
  wireDifficultyPicker(stage, 'colormatch', d=>{ difficulty=d; refreshLeaderboard('colormatch', difficulty); score=0; round=0; initColorMatch(stage); });
  round=0; score=0; newRound();
}

/* --- پازل کشویی (۱۵ پازل) --- */
const SLIDE_PARAMS = {easy:3, medium:4, hard:5};
function initSlide15(stage){
  let difficulty = getDifficulty('slide15');
  let n, tiles, blank, startTs, timerId, seconds=0;
  function setup(){
    n = SLIDE_PARAMS[difficulty];
    tiles = Array.from({length:n*n-1}, (_,i)=>i+1); tiles.push(0);
    do{ shuffleTiles(); } while(!solvable() || isSolved());
    blank = tiles.indexOf(0);
    seconds=0; startTs=Date.now();
    clearInterval(timerId);
    timerId = setInterval(()=>{ seconds=Math.floor((Date.now()-startTs)/1000); stage.querySelector('#slTime').textContent=seconds; }, 1000);
    draw();
  }
  function shuffleTiles(){ for(let i=tiles.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [tiles[i],tiles[j]]=[tiles[j],tiles[i]]; } }
  function solvable(){
    let inv=0; const arr=tiles.filter(x=>x!==0);
    for(let i=0;i<arr.length;i++) for(let j=i+1;j<arr.length;j++) if(arr[i]>arr[j]) inv++;
    if(n%2===1) return inv%2===0;
    const blankRow = Math.floor(tiles.indexOf(0)/n);
    return (inv + (n - blankRow)) % 2 === 0;
  }
  function isSolved(){ return tiles.every((v,i)=> i===tiles.length-1 ? v===0 : v===i+1); }
  function draw(){
    stage.innerHTML = `${difficultyPickerHtml('slide15')}
      <div class="game-hud"><span>زمان: <b id="slTime">${seconds}</b>s</span><button class="btn-ghost" id="slRestart">شروع دوباره</button></div>
      <div id="slGrid" style="display:grid;grid-template-columns:repeat(${n},60px);gap:4px;justify-content:center;margin:12px auto;"></div>
      ${leaderboardHtml('slide15', difficulty)}`;
    const g = stage.querySelector('#slGrid');
    tiles.forEach((v,i)=>{
      const d=document.createElement('button');
      d.style.cssText=`height:58px;border-radius:8px;border:1px solid var(--border);font-weight:700;font-size:16px;background:${v?'var(--card-hi)':'transparent'};color:${v?'var(--text)':'transparent'};border-color:${v?'var(--border)':'transparent'};`;
      d.textContent=v||'';
      d.onclick=()=>move(i);
      g.appendChild(d);
    });
    stage.querySelector('#slRestart').onclick=setup;
    wireDifficultyPicker(stage, 'slide15', d=>{ difficulty=d; refreshLeaderboard('slide15', difficulty); setup(); });
  }
  function move(i){
    const r1=Math.floor(i/n), c1=i%n, r2=Math.floor(blank/n), c2=blank%n;
    if(Math.abs(r1-r2)+Math.abs(c1-c2)!==1) return;
    [tiles[i],tiles[blank]]=[tiles[blank],tiles[i]]; blank=i;
    draw();
    if(isSolved()){
      clearInterval(timerId);
      const score = Math.max(10, 6000 - seconds*10 - (n-3)*0);
      addScore('slide15', difficulty, score); refreshLeaderboard('slide15', difficulty);
      logPlayerActivity(`پازل کشویی بازی کرد (سطح ${diffLabel(difficulty)}) — زمان: ${seconds} ثانیه`);
      toast('حل کردی! زمان: '+seconds+' ثانیه 🎉');
    }
  }
  setup();
}

/* --- چهار‌تایی (کانکت فور) --- */
const CONNECT4_DEPTH = {easy:0, medium:1, hard:2};
function initConnect4(stage){
  let difficulty = getDifficulty('connect4');
  const ROWS=6, COLS=7;
  let grid, turn, over;
  function setup(){ grid = Array.from({length:ROWS},()=>Array(COLS).fill(0)); turn=1; over=false; draw(); }
  function drop(col){
    if(over || turn!==1) return;
    const row = lowestEmpty(grid, col); if(row<0) return;
    grid[row][col]=1;
    if(checkWin(grid,row,col,1)){ over=true; addScore('connect4', difficulty, 1); refreshLeaderboard('connect4', difficulty); logPlayerActivity(`چهار‌تایی بازی کرد (سطح ${diffLabel(difficulty)}) — بردی!`); draw(); toast('بردی! 🎉'); return; }
    if(isFull(grid)){ over=true; draw(); toast('مساوی شد!'); return; }
    turn=2; draw();
    setTimeout(aiMove, 400);
  }
  function aiMove(){
    if(over) return;
    const depth = CONNECT4_DEPTH[difficulty];
    let col;
    if(depth===0) col = randomMove();
    else col = smartMove(depth);
    const row = lowestEmpty(grid,col); if(row<0){ col=randomMove(); }
    const r2 = lowestEmpty(grid,col);
    grid[r2][col]=2;
    if(checkWin(grid,r2,col,2)){ over=true; draw(); toast('باختی! ماشین برد 🤖'); return; }
    if(isFull(grid)){ over=true; draw(); toast('مساوی شد!'); return; }
    turn=1; draw();
  }
  function randomMove(){ const valid=[]; for(let c=0;c<COLS;c++) if(lowestEmpty(grid,c)>=0) valid.push(c); return valid[Math.floor(Math.random()*valid.length)]; }
  function smartMove(depth){
    // اول ببین می‌تواند ببرد، بعد جلوی باخت را بگیرد، وگرنه تصادفی هوشمند از وسط
    for(let c=0;c<COLS;c++){ const r=lowestEmpty(grid,c); if(r<0) continue; grid[r][c]=2; const win=checkWin(grid,r,c,2); grid[r][c]=0; if(win) return c; }
    if(depth>0) for(let c=0;c<COLS;c++){ const r=lowestEmpty(grid,c); if(r<0) continue; grid[r][c]=1; const win=checkWin(grid,r,c,1); grid[r][c]=0; if(win) return c; }
    const center=Math.floor(COLS/2);
    const order=[center,center-1,center+1,center-2,center+2,center-3,center+3].filter(c=>c>=0&&c<COLS&&lowestEmpty(grid,c)>=0);
    return order[0] ?? randomMove();
  }
  function lowestEmpty(g,c){ for(let r=ROWS-1;r>=0;r--) if(g[r][c]===0) return r; return -1; }
  function isFull(g){ return g[0].every(v=>v!==0); }
  function checkWin(g,row,col,p){
    const dirs=[[0,1],[1,0],[1,1],[1,-1]];
    return dirs.some(([dr,dc])=>{
      let count=1;
      for(let s=1;s<4;s++){ const r=row+dr*s,c=col+dc*s; if(r<0||r>=ROWS||c<0||c>=COLS||g[r][c]!==p) break; count++; }
      for(let s=1;s<4;s++){ const r=row-dr*s,c=col-dc*s; if(r<0||r>=ROWS||c<0||c>=COLS||g[r][c]!==p) break; count++; }
      return count>=4;
    });
  }
  function draw(){
    stage.innerHTML = `${difficultyPickerHtml('connect4')}
      <div class="game-hud"><b>چهار‌تایی</b> ${over?'پایان بازی':(turn===1?'نوبت تو 🔴':'نوبت ماشین 🟡')}</div>
      <div id="c4Grid" style="display:grid;grid-template-columns:repeat(${COLS},38px);gap:4px;justify-content:center;background:#123;padding:8px;border-radius:10px;margin:12px auto;width:fit-content;"></div>
      <button class="btn-ghost full" id="c4Restart" style="margin-top:8px;">بازی جدید</button>
      ${leaderboardHtml('connect4', difficulty)}`;
    const g = stage.querySelector('#c4Grid');
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
      const d=document.createElement('button');
      const v=grid[r][c];
      d.style.cssText=`width:36px;height:36px;border-radius:50%;border:none;background:${v===1?'#e0546a':v===2?'#d4a72c':'#1a1d2e'};cursor:pointer;`;
      d.onclick=()=>drop(c);
      g.appendChild(d);
    }
    stage.querySelector('#c4Restart').onclick=setup;
    wireDifficultyPicker(stage, 'connect4', d=>{ difficulty=d; refreshLeaderboard('connect4', difficulty); setup(); });
  }
  setup();
}

/* --- سرعت تایپ --- */
const TYPING_TEXTS = {
  easy:['گربه روی دیوار نشسته بود.', 'باران آرام می‌بارید.', 'او به مدرسه رفت.'],
  medium:['بازی‌های ویدیویی امروز بخش مهمی از سرگرمی جوانان هستند.', 'هوش مصنوعی به‌سرعت در حال تغییر دنیای فناوری است.'],
  hard:['توسعهٔ فناوری‌های نوین نیازمند سرمایه‌گذاری بلندمدت و همکاری بین‌المللی گسترده است.', 'دموکراسی واقعی بر پایهٔ مشارکت آگاهانهٔ همهٔ شهروندان بنا می‌شود.']
};
function initTyping(stage){
  let difficulty = getDifficulty('typing');
  let text, startTs, started=false;
  function newText(){ const list=TYPING_TEXTS[difficulty]; text=list[Math.floor(Math.random()*list.length)]; started=false; }
  function render(){
    stage.innerHTML = `${difficultyPickerHtml('typing')}
      <div class="game-hud"><b>سرعت تایپ</b></div>
      <p style="background:var(--bg-alt);border:1px solid var(--border);border-radius:10px;padding:12px;font-size:14px;line-height:2;" id="typeText">${esc(text)}</p>
      <textarea id="typeInput" rows="3" class="ticket-field" placeholder="همین متن رو اینجا تایپ کن..."></textarea>
      <div id="typeResult" class="dim tiny" style="text-align:center;margin-top:6px;"></div>
      ${leaderboardHtml('typing', difficulty)}`;
    const input = stage.querySelector('#typeInput');
    input.addEventListener('input', ()=>{
      if(!started){ started=true; startTs=Date.now(); }
      const val = input.value;
      if(val===text){
        const secs = (Date.now()-startTs)/1000;
        const wpm = Math.round((text.length/5) / (secs/60));
        const score = wpm;
        addScore('typing', difficulty, score); refreshLeaderboard('typing', difficulty);
        logPlayerActivity(`سرعت تایپ بازی کرد (سطح ${diffLabel(difficulty)}) — ${wpm} کلمه در دقیقه`);
        stage.querySelector('#typeResult').textContent = `آفرین! سرعت: ${wpm} کلمه در دقیقه در ${secs.toFixed(1)} ثانیه`;
        toast('عالی بود! '+wpm+' WPM');
        setTimeout(()=>{ newText(); render(); }, 1600);
      }
    });
    wireDifficultyPicker(stage, 'typing', d=>{ difficulty=d; refreshLeaderboard('typing', difficulty); newText(); render(); });
  }
  newText(); render();
}

/* --- برج‌ساز --- */
const STACKER_PARAMS = {easy:{speed:2.2, tol:22}, medium:{speed:3.2, tol:15}, hard:{speed:4.4, tol:9}};
function initStacker(stage){
  let difficulty = getDifficulty('stacker');
  stage.innerHTML = `${difficultyPickerHtml('stacker')}
    <div class="game-hud"><b>برج‌ساز</b> ارتفاع: <b id="stScore">0</b></div>
    <canvas id="stC" width="280" height="360" style="width:100%;max-width:280px;display:block;margin:0 auto;background:#0d1020;border-radius:12px;border:1px solid var(--border);"></canvas>
    <p class="dim tiny" style="text-align:center">کلیک برای رها کردن بلوک روی برج</p>
    ${leaderboardHtml('stacker', difficulty)}`;
  const c = stage.querySelector('#stC'), ctx = c.getContext('2d');
  let blocks, curX, curW, dir, score, alive, camY;
  function reset(){
    blocks = [{x:90, w:100, y:340}]; curW=100; curX=0; dir=1; score=0; alive=true; camY=0;
    stage.querySelector('#stScore').textContent=0;
  }
  function loop(){
    if(!alive) return;
    const p = STACKER_PARAMS[difficulty];
    curX += dir*p.speed;
    if(curX+curW>280||curX<0) dir*=-1;
    ctx.fillStyle='#0d1020'; ctx.fillRect(0,0,280,360);
    ctx.save(); ctx.translate(0,camY);
    blocks.forEach((b,i)=>{ ctx.fillStyle = i%2? '#7c5cff':'#d4a72c'; ctx.fillRect(b.x,b.y,b.w,26); });
    ctx.fillStyle='#4cc38a'; ctx.fillRect(curX, blocks[blocks.length-1].y-26, curW, 26);
    ctx.restore();
    requestAnimationFrame(loop);
  }
  function drop(){
    if(!alive) return;
    const last = blocks[blocks.length-1];
    const p = STACKER_PARAMS[difficulty];
    const overlapStart = Math.max(curX, last.x), overlapEnd = Math.min(curX+curW, last.x+last.w);
    const overlap = overlapEnd - overlapStart;
    if(overlap <= p.tol){ finish(); return; }
    curW = overlap;
    blocks.push({x:overlapStart, w:overlap, y:last.y-26});
    score++;
    stage.querySelector('#stScore').textContent=score;
    curX=0; dir=1;
    if(blocks[blocks.length-1].y < 60) camY += 26;
  }
  function finish(){
    alive=false;
    addScore('stacker', difficulty, score); refreshLeaderboard('stacker', difficulty);
    logPlayerActivity(`برج‌ساز بازی کرد (سطح ${diffLabel(difficulty)}) — ارتفاع: ${score}`);
    toast('برج فروریخت! ارتفاع: '+score);
  }
  c.addEventListener('click', drop);
  wireDifficultyPicker(stage, 'stacker', d=>{ difficulty=d; refreshLeaderboard('stacker', difficulty); reset(); loop(); });
  reset(); loop();
}

/* --- فرار از شهاب --- */
const DODGER_PARAMS = {easy:{spawn:900, speed:2.2}, medium:{spawn:650, speed:3}, hard:{spawn:420, speed:4}};
function initDodger(stage){
  let difficulty = getDifficulty('dodger');
  stage.innerHTML = `${difficultyPickerHtml('dodger')}
    <div class="game-hud"><b>فرار از شهاب</b> امتیاز: <b id="dgScore">0</b></div>
    <canvas id="dgC" width="300" height="380" style="width:100%;max-width:300px;display:block;margin:0 auto;background:#0d1020;border-radius:12px;border:1px solid var(--border);touch-action:none;"></canvas>
    <p class="dim tiny" style="text-align:center">با ماوس/لمس چپ‌راست حرکت کن</p>
    ${leaderboardHtml('dodger', difficulty)}`;
  const c = stage.querySelector('#dgC'), ctx = c.getContext('2d');
  let px=140, rocks=[], score=0, alive=true, lastSpawn=0;
  function reset(){ px=140; rocks=[]; score=0; alive=true; lastSpawn=0; stage.querySelector('#dgScore').textContent=0; }
  function loop(ts){
    if(!alive) return;
    const p = DODGER_PARAMS[difficulty];
    if(!lastSpawn || ts-lastSpawn>p.spawn){ lastSpawn=ts; rocks.push({x:Math.random()*280, y:-20, s:14+Math.random()*10}); }
    ctx.fillStyle='#0d1020'; ctx.fillRect(0,0,300,380);
    ctx.fillStyle='#7c5cff'; ctx.fillRect(px,350,40,16);
    rocks.forEach(r=>{ r.y += p.speed+score*0.01; ctx.fillStyle='#e0546a'; ctx.beginPath(); ctx.arc(r.x,r.y,r.s/2,0,Math.PI*2); ctx.fill(); });
    rocks = rocks.filter(r=>{
      if(r.y>380){ score++; stage.querySelector('#dgScore').textContent=score; return false; }
      if(r.y+r.s/2>350 && r.x+r.s/2>px && r.x-r.s/2<px+40){ alive=false; }
      return true;
    });
    if(!alive){
      addScore('dodger', difficulty, score); refreshLeaderboard('dodger', difficulty);
      logPlayerActivity(`فرار از شهاب بازی کرد (سطح ${diffLabel(difficulty)}) — امتیاز: ${score}`);
      toast('خوردی به شهاب! امتیاز: '+score); return;
    }
    requestAnimationFrame(loop);
  }
  function movePointer(clientX){
    const r=c.getBoundingClientRect();
    px = Math.max(0, Math.min(260, ((clientX-r.left)/r.width)*300-20));
  }
  c.addEventListener('mousemove', e=>movePointer(e.clientX));
  c.addEventListener('touchmove', e=>{ e.preventDefault(); movePointer(e.touches[0].clientX); }, {passive:false});
  wireDifficultyPicker(stage, 'dodger', d=>{ difficulty=d; refreshLeaderboard('dodger', difficulty); reset(); requestAnimationFrame(loop); });
  reset(); requestAnimationFrame(loop);
}

/* --- هزارتو --- */
const MAZE_PARAMS = {easy:9, medium:13, hard:17};
function initMaze(stage){
  let difficulty = getDifficulty('maze');
  let size, grid, px, py, ex, ey, startTs, timerId, seconds=0;
  function genMaze(n){
    const g = Array.from({length:n},()=>Array(n).fill(1));
    function carve(x,y){
      g[y][x]=0;
      const dirs=[[2,0],[-2,0],[0,2],[0,-2]].sort(()=>Math.random()-0.5);
      dirs.forEach(([dx,dy])=>{
        const nx=x+dx, ny=y+dy;
        if(nx>0&&ny>0&&nx<n-1&&ny<n-1&&g[ny][nx]===1){ g[y+dy/2][x+dx/2]=0; carve(nx,ny); }
      });
    }
    carve(1,1);
    return g;
  }
  function setup(){
    size = MAZE_PARAMS[difficulty];
    grid = genMaze(size);
    px=1; py=1; ex=size-2; ey=size-2; grid[ey][ex]=0;
    seconds=0; startTs=Date.now();
    clearInterval(timerId);
    timerId=setInterval(()=>{ seconds=Math.floor((Date.now()-startTs)/1000); const t=stage.querySelector('#mzTime'); if(t) t.textContent=seconds; }, 1000);
    draw();
  }
  function draw(){
    const cell = Math.floor(280/size);
    stage.innerHTML = `${difficultyPickerHtml('maze')}
      <div class="game-hud"><span>زمان: <b id="mzTime">${seconds}</b>s</span></div>
      <div id="mzGrid" style="display:grid;grid-template-columns:repeat(${size},${cell}px);width:fit-content;margin:12px auto;border:2px solid var(--accent);"></div>
      <div class="touch-pad">
        <span></span><button data-d="up">↑</button><span></span>
        <button data-d="left">←</button><span></span><button data-d="right">→</button>
        <span></span><button data-d="down">↓</button><span></span>
      </div>
      ${leaderboardHtml('maze', difficulty)}`;
    const g = stage.querySelector('#mzGrid');
    for(let y=0;y<size;y++) for(let x=0;x<size;x++){
      const d=document.createElement('div');
      const isPlayer = x===px&&y===py, isExit = x===ex&&y===ey;
      d.style.cssText=`width:${cell}px;height:${cell}px;background:${grid[y][x]?'#1a1d2e':(isExit?'#4cc38a':'#eee')};`;
      if(isPlayer) d.textContent='🧑';
      d.style.display='flex'; d.style.alignItems='center'; d.style.justifyContent='center'; d.style.fontSize=(cell-4)+'px';
      g.appendChild(d);
    }
    stage.querySelectorAll('.touch-pad button').forEach(b=>b.addEventListener('click', ()=>move(b.dataset.d)));
    wireDifficultyPicker(stage, 'maze', d=>{ difficulty=d; refreshLeaderboard('maze', difficulty); setup(); });
  }
  function move(d){
    let nx=px, ny=py;
    if(d==='up') ny--; if(d==='down') ny++; if(d==='left') nx--; if(d==='right') nx++;
    if(nx<0||ny<0||nx>=size||ny>=size||grid[ny][nx]===1) return;
    px=nx; py=ny;
    if(px===ex&&py===ey){
      clearInterval(timerId);
      const score = Math.max(20, 3000 - seconds*8);
      addScore('maze', difficulty, score); refreshLeaderboard('maze', difficulty);
      logPlayerActivity(`هزارتو بازی کرد (سطح ${diffLabel(difficulty)}) — زمان: ${seconds} ثانیه`);
      toast('رسیدی به خروجی! زمان: '+seconds+' ثانیه 🎉');
      setup(); return;
    }
    draw();
  }
  const kd = e=>{ const m={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'}; if(m[e.key]){ e.preventDefault(); move(m[e.key]); } };
  if(stage._kd) window.removeEventListener('keydown', stage._kd);
  stage._kd=kd; window.addEventListener('keydown', kd);
  setup();
}

/* --- جدول شولته --- */
const SCHULTE_PARAMS = {easy:4, medium:5, hard:6};
function initSchulte(stage){
  let difficulty = getDifficulty('schulte');
  let n, nums, next, startTs, timerId, seconds=0;
  function setup(){
    n = SCHULTE_PARAMS[difficulty];
    nums = Array.from({length:n*n}, (_,i)=>i+1);
    for(let i=nums.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [nums[i],nums[j]]=[nums[j],nums[i]]; }
    next=1; seconds=0; startTs=Date.now();
    clearInterval(timerId);
    timerId=setInterval(()=>{ seconds=Math.floor((Date.now()-startTs)/1000); const t=stage.querySelector('#scTime'); if(t) t.textContent=seconds; }, 1000);
    draw();
  }
  function draw(){
    stage.innerHTML = `${difficultyPickerHtml('schulte')}
      <div class="game-hud"><span>زمان: <b id="scTime">${seconds}</b>s</span><span>بعدی: <b>${next}</b></span></div>
      <div id="scGrid" style="display:grid;grid-template-columns:repeat(${n},56px);gap:5px;justify-content:center;margin:12px auto;"></div>
      ${leaderboardHtml('schulte', difficulty)}`;
    const g = stage.querySelector('#scGrid');
    nums.forEach(v=>{
      const d=document.createElement('button');
      d.textContent=v;
      d.style.cssText='height:52px;border-radius:8px;border:1px solid var(--border);background:var(--card-hi);font-weight:700;';
      d.onclick=()=>tap(v,d);
      g.appendChild(d);
    });
    wireDifficultyPicker(stage, 'schulte', d=>{ difficulty=d; refreshLeaderboard('schulte', difficulty); setup(); });
  }
  function tap(v,el){
    if(v!==next) return;
    el.style.opacity='.25'; el.disabled=true;
    next++;
    if(next>n*n){
      clearInterval(timerId);
      const score = Math.max(20, 4000 - seconds*15);
      addScore('schulte', difficulty, score); refreshLeaderboard('schulte', difficulty);
      logPlayerActivity(`جدول شولته بازی کرد (سطح ${diffLabel(difficulty)}) — زمان: ${seconds} ثانیه`);
      toast('تمام کردی! زمان: '+seconds+' ثانیه 🎉');
      setTimeout(setup, 1200);
    }
  }
  setup();
}

/* --- بادکنک‌ترکون --- */
const BALLOON_PARAMS = {easy:{life:1400, spawn:750}, medium:{life:1000, spawn:550}, hard:{life:700, spawn:380}};
function initBalloon(stage){
  let difficulty = getDifficulty('balloon');
  let score=0, timeLeft=30, timer, spawnTimer;
  function render(){
    stage.innerHTML = `${difficultyPickerHtml('balloon')}
      <div class="game-hud"><span>امتیاز: <b id="blScore">0</b></span><span>زمان: <b id="blTime">30</b></span><button class="btn-ghost" id="blStart">شروع</button></div>
      <div id="blArea" style="position:relative;height:280px;background:var(--bg-alt);border:1px solid var(--border);border-radius:12px;overflow:hidden;"></div>
      ${leaderboardHtml('balloon', difficulty)}`;
    stage.querySelector('#blStart').onclick=start;
    wireDifficultyPicker(stage, 'balloon', d=>{ difficulty=d; refreshLeaderboard('balloon', difficulty); stop(); render(); });
  }
  function spawnBalloon(){
    const area = stage.querySelector('#blArea'); if(!area) return;
    const b = document.createElement('button');
    b.textContent='🎈';
    const x = Math.random()*(area.clientWidth-36), y = Math.random()*(area.clientHeight-36);
    b.style.cssText=`position:absolute;left:${x}px;top:${y}px;font-size:30px;background:none;border:none;cursor:pointer;`;
    b.onclick=()=>{ score++; stage.querySelector('#blScore').textContent=score; b.remove(); };
    area.appendChild(b);
    setTimeout(()=>b.remove(), BALLOON_PARAMS[difficulty].life);
  }
  function start(){
    score=0; timeLeft=30;
    stage.querySelector('#blScore').textContent=0; stage.querySelector('#blTime').textContent=30;
    stage.querySelector('#blArea').innerHTML='';
    clearInterval(timer); clearInterval(spawnTimer);
    spawnTimer = setInterval(spawnBalloon, BALLOON_PARAMS[difficulty].spawn);
    timer = setInterval(()=>{ timeLeft--; stage.querySelector('#blTime').textContent=timeLeft; if(timeLeft<=0) stop(); }, 1000);
  }
  function stop(){
    clearInterval(timer); clearInterval(spawnTimer);
    if(score>0){ addScore('balloon', difficulty, score); refreshLeaderboard('balloon', difficulty); logPlayerActivity(`بادکنک‌ترکون بازی کرد (سطح ${diffLabel(difficulty)}) — امتیاز: ${score}`); toast('تمام شد! امتیاز: '+score); }
  }
  render();
}

/* --- نشانه‌گیر --- */
const AIM_PARAMS = {easy:{size:46, life:1400}, medium:{size:34, life:1000}, hard:{size:24, life:700}};
function initAim(stage){
  let difficulty = getDifficulty('aim');
  let score=0, timeLeft=30, timer, spawnTimer;
  function render(){
    stage.innerHTML = `${difficultyPickerHtml('aim')}
      <div class="game-hud"><span>امتیاز: <b id="amScore">0</b></span><span>زمان: <b id="amTime">30</b></span><button class="btn-ghost" id="amStart">شروع</button></div>
      <div id="amArea" style="position:relative;height:280px;background:#0d1020;border:1px solid var(--border);border-radius:12px;overflow:hidden;"></div>
      ${leaderboardHtml('aim', difficulty)}`;
    stage.querySelector('#amStart').onclick=start;
    wireDifficultyPicker(stage, 'aim', d=>{ difficulty=d; refreshLeaderboard('aim', difficulty); stop(); render(); });
  }
  function spawnTarget(){
    const area = stage.querySelector('#amArea'); if(!area) return;
    area.innerHTML='';
    const p = AIM_PARAMS[difficulty];
    const b = document.createElement('button');
    const x = Math.random()*(area.clientWidth-p.size), y = Math.random()*(area.clientHeight-p.size);
    b.style.cssText=`position:absolute;left:${x}px;top:${y}px;width:${p.size}px;height:${p.size}px;border-radius:50%;background:radial-gradient(circle,#e0546a,#7c1f30);border:2px solid #fff;cursor:pointer;`;
    b.onclick=()=>{ score++; stage.querySelector('#amScore').textContent=score; spawnTarget(); };
    area.appendChild(b);
  }
  function start(){
    score=0; timeLeft=30;
    stage.querySelector('#amScore').textContent=0; stage.querySelector('#amTime').textContent=30;
    clearInterval(timer);
    spawnTarget();
    timer = setInterval(()=>{ timeLeft--; stage.querySelector('#amTime').textContent=timeLeft; if(timeLeft<=0) stop(); }, 1000);
  }
  function stop(){
    clearInterval(timer);
    const area = stage.querySelector('#amArea'); if(area) area.innerHTML='';
    if(score>0){ addScore('aim', difficulty, score); refreshLeaderboard('aim', difficulty); logPlayerActivity(`نشانه‌گیر بازی کرد (سطح ${diffLabel(difficulty)}) — امتیاز: ${score}`); toast('تمام شد! امتیاز: '+score); }
  }
  render();
}

/* --- سیل رنگی (فلود ایت) --- */
const FLOOD_PARAMS = {easy:{n:10, colors:4, moves:20}, medium:{n:13, colors:5, moves:22}, hard:{n:16, colors:6, moves:24}};
const FLOOD_COLORS = ['#e0546a','#4cc38a','#4a9fe0','#d4a72c','#7c5cff','#e8955a'];
function initFlood(stage){
  let difficulty = getDifficulty('flood');
  let n, grid, movesLeft, colorsN;
  function setup(){
    const p = FLOOD_PARAMS[difficulty];
    n=p.n; colorsN=p.colors; movesLeft=p.moves;
    grid = Array.from({length:n},()=>Array.from({length:n},()=>Math.floor(Math.random()*colorsN)));
    draw();
  }
  function flood(newColor){
    const old = grid[0][0];
    if(old===newColor || movesLeft<=0) return;
    movesLeft--;
    const seen = new Set();
    const stack=[[0,0]];
    while(stack.length){
      const [x,y]=stack.pop(); const key=x+','+y;
      if(x<0||y<0||x>=n||y>=n||seen.has(key)||grid[y][x]!==old) continue;
      seen.add(key); grid[y][x]=newColor;
      stack.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
    }
    draw();
    if(grid.every(row=>row.every(v=>v===newColor))){
      const score = Math.max(20, movesLeft*40 + 100);
      addScore('flood', difficulty, score); refreshLeaderboard('flood', difficulty);
      logPlayerActivity(`سیل رنگی بازی کرد (سطح ${diffLabel(difficulty)}) — با ${FLOOD_PARAMS[difficulty].moves-movesLeft} حرکت`);
      toast('کل جدول یک‌رنگ شد! 🎉');
    } else if(movesLeft<=0){
      toast('حرکت‌ها تمام شد!');
    }
  }
  function draw(){
    const cell = Math.floor(280/n);
    stage.innerHTML = `${difficultyPickerHtml('flood')}
      <div class="game-hud"><span>حرکت باقی‌مانده: <b id="flMoves">${movesLeft}</b></span></div>
      <div id="flGrid" style="display:grid;grid-template-columns:repeat(${n},${cell}px);width:fit-content;margin:12px auto;border-radius:8px;overflow:hidden;"></div>
      <div class="option-row" style="max-width:320px;margin:10px auto 0;flex-wrap:wrap;">
        ${FLOOD_COLORS.slice(0,colorsN).map((c,i)=>`<button data-flcolor="${i}" style="flex:1 0 40px;height:36px;border-radius:8px;border:2px solid var(--border);background:${c};"></button>`).join('')}
      </div>
      ${leaderboardHtml('flood', difficulty)}`;
    const g = stage.querySelector('#flGrid');
    grid.forEach(row=>row.forEach(v=>{ const d=document.createElement('div'); d.style.cssText=`width:${cell}px;height:${cell}px;background:${FLOOD_COLORS[v]};`; g.appendChild(d); }));
    stage.querySelectorAll('[data-flcolor]').forEach(b=>b.addEventListener('click', ()=>flood(+b.dataset.flcolor)));
    wireDifficultyPicker(stage, 'flood', d=>{ difficulty=d; refreshLeaderboard('flood', difficulty); setup(); });
  }
  setup();
}

/* --- سبد میوه‌چین --- */
const CATCH_PARAMS = {easy:{speed:2.2, spawn:850, bomb:0.15}, medium:{speed:3, spawn:650, bomb:0.25}, hard:{speed:4, spawn:480, bomb:0.35}};
function initCatch(stage){
  let difficulty = getDifficulty('catch');
  stage.innerHTML = `${difficultyPickerHtml('catch')}
    <div class="game-hud"><b>سبد میوه‌چین</b> امتیاز: <b id="ctScore">0</b> جان: <b id="ctLife">3</b></div>
    <canvas id="ctC" width="300" height="380" style="width:100%;max-width:300px;display:block;margin:0 auto;background:#0d1020;border-radius:12px;border:1px solid var(--border);touch-action:none;"></canvas>
    <p class="dim tiny" style="text-align:center">میوه بگیر 🍎 از بمب دوری کن 💣</p>
    ${leaderboardHtml('catch', difficulty)}`;
  const c = stage.querySelector('#ctC'), ctx = c.getContext('2d');
  let px=130, items=[], score=0, life=3, alive=true, lastSpawn=0;
  function reset(){ px=130; items=[]; score=0; life=3; alive=true; lastSpawn=0; stage.querySelector('#ctScore').textContent=0; stage.querySelector('#ctLife').textContent=3; }
  function loop(ts){
    if(!alive) return;
    const p = CATCH_PARAMS[difficulty];
    if(!lastSpawn || ts-lastSpawn>p.spawn){ lastSpawn=ts; items.push({x:Math.random()*270, y:-20, bomb:Math.random()<p.bomb}); }
    ctx.fillStyle='#0d1020'; ctx.fillRect(0,0,300,380);
    ctx.fillStyle='#7c5cff'; ctx.fillRect(px,355,50,14);
    items.forEach(it=>{ it.y+=p.speed; ctx.font='22px sans-serif'; ctx.fillText(it.bomb?'💣':'🍎', it.x, it.y); });
    items = items.filter(it=>{
      if(it.y>380) return false;
      if(it.y>345 && it.y<375 && it.x+20>px && it.x<px+50){
        if(it.bomb){ life--; stage.querySelector('#ctLife').textContent=life; if(life<=0) alive=false; }
        else { score++; stage.querySelector('#ctScore').textContent=score; }
        return false;
      }
      return true;
    });
    if(!alive){
      addScore('catch', difficulty, score); refreshLeaderboard('catch', difficulty);
      logPlayerActivity(`سبد میوه‌چین بازی کرد (سطح ${diffLabel(difficulty)}) — امتیاز: ${score}`);
      toast('باختی! امتیاز: '+score); return;
    }
    requestAnimationFrame(loop);
  }
  function movePointer(clientX){ const r=c.getBoundingClientRect(); px=Math.max(0,Math.min(250,((clientX-r.left)/r.width)*300-25)); }
  c.addEventListener('mousemove', e=>movePointer(e.clientX));
  c.addEventListener('touchmove', e=>{ e.preventDefault(); movePointer(e.touches[0].clientX); }, {passive:false});
  wireDifficultyPicker(stage, 'catch', d=>{ difficulty=d; refreshLeaderboard('catch', difficulty); reset(); requestAnimationFrame(loop); });
  reset(); requestAnimationFrame(loop);
}


/* =========================================================
   پنل ادمین — ۱۰ آپشن جدید
   ========================================================= */
function ensureStateExtras(){
  if(!load('gh_tags', null)) save('gh_tags', CLOUD_DEFAULTS.tags);
  if(!load('gh_xp_config', null)) save('gh_xp_config', CLOUD_DEFAULTS.xpConfig);
  if(!load('gh_badges', null)) save('gh_badges', []);
  if(!load('gh_seo', null)) save('gh_seo', CLOUD_DEFAULTS.seo);
  if(!load('gh_custom_pages', null)) save('gh_custom_pages', []);
  if(!load('gh_reactions', null)) save('gh_reactions', CLOUD_DEFAULTS.reactions);
  if(!load('gh_featured', null)) save('gh_featured', []);
  if(!load('gh_user_xp', null)) save('gh_user_xp', {});
  if(!load('gh_announce', null) && load('gh_announce', undefined)===null) { /* keep null */ }
}

function renderNewAdminPanes(){
  ensureStateExtras();
  // announce
  const ann = load('gh_announce', null);
  const prev = document.getElementById('announcePreview');
  if(prev) prev.innerHTML = ann ? `<b>اعلان فعال:</b> ${esc(ann.text||'')} <span class="dim tiny">(${new Date(ann.ts||Date.now()).toLocaleString('fa-IR')})</span>` : '<span class="dim">اعلانی فعال نیست.</span>';
  const annInput = document.getElementById('announceText');
  if(annInput && ann && document.activeElement!==annInput) annInput.value = ann.text||'';

  // tags
  const tags = load('gh_tags', CLOUD_DEFAULTS.tags);
  const tl = document.getElementById('tagsList');
  if(tl) tl.innerHTML = tags.map((t,i)=>`<div class="manage-row"><span class="mtitle">${esc(t)}</span>${i>0?`<button class="mbtn danger" data-deltag="${i}">حذف</button>`:''}</div>`).join('') || '<p class="dim tiny">تگی نیست.</p>';
  tl?.querySelectorAll('[data-deltag]').forEach(b=>b.onclick=()=>{ const arr=load('gh_tags',[]); arr.splice(+b.dataset.deltag,1); save('gh_tags',arr); scheduleCloudPush(); renderNewAdminPanes(); toast('تگ حذف شد'); });

  // xp
  const xp = load('gh_xp_config', CLOUD_DEFAULTS.xpConfig);
  const el=id=>document.getElementById(id);
  if(el('xpLike') && document.activeElement!==el('xpLike')) el('xpLike').value = xp.like??2;
  if(el('xpComment') && document.activeElement!==el('xpComment')) el('xpComment').value = xp.comment??5;
  if(el('xpGameWin') && document.activeElement!==el('xpGameWin')) el('xpGameWin').value = xp.gameWin??15;
  const uxp = load('gh_user_xp', {});
  const top = Object.entries(uxp).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const xt = document.getElementById('xpTopList');
  if(xt) xt.innerHTML = '<h4>برترین‌های XP</h4>' + (top.map(([k,v],i)=>`<div class="manage-row"><span class="mtitle">${i+1}. ${esc(k)}</span><span>${v} XP</span></div>`).join('') || '<p class="dim tiny">هنوز امتیازی ثبت نشده.</p>');

  // badges
  const badges = load('gh_badges', []);
  const bl = document.getElementById('badgesList');
  if(bl) bl.innerHTML = badges.map((b,i)=>`<div class="manage-row"><span class="mtitle">${esc(b.emoji||'🏅')} ${esc(b.name)}</span><button class="mbtn danger" data-delbadge="${i}">حذف</button></div>`).join('') || '<p class="dim tiny">نشانی نیست.</p>';
  bl?.querySelectorAll('[data-delbadge]').forEach(b=>b.onclick=()=>{ const arr=load('gh_badges',[]); arr.splice(+b.dataset.delbadge,1); save('gh_badges',arr); scheduleCloudPush(); renderNewAdminPanes(); });

  // livefeed
  const lf = document.getElementById('livefeedList');
  if(lf){
    const log = load('gh_player_activity', []);
    lf.innerHTML = (Array.isArray(log)?log:[]).slice(0,40).map(x=>`<div class="manage-row"><span class="mtitle">${esc(x.who||'?')}: ${esc(x.text||'')}</span><span class="dim tiny">${new Date(x.ts||0).toLocaleTimeString('fa-IR')}</span></div>`).join('') || '<p class="dim tiny">فعالیتی نیست.</p>';
  }

  // seo
  const seo = load('gh_seo', CLOUD_DEFAULTS.seo);
  if(el('seoTitle') && document.activeElement!==el('seoTitle')) el('seoTitle').value = seo.title||'';
  if(el('seoDesc') && document.activeElement!==el('seoDesc')) el('seoDesc').value = seo.desc||'';
  if(el('seoKeywords') && document.activeElement!==el('seoKeywords')) el('seoKeywords').value = seo.keywords||'';

  // custom pages
  const pages = load('gh_custom_pages', []);
  const cpl = document.getElementById('customPagesList');
  if(cpl) cpl.innerHTML = pages.map((p,i)=>`<div class="manage-row"><span class="mtitle">/${esc(p.slug)} — ${esc(p.title)}</span><button class="mbtn danger" data-delcp="${i}">حذف</button></div>`).join('') || '<p class="dim tiny">صفحه‌ای نیست.</p>';
  cpl?.querySelectorAll('[data-delcp]').forEach(b=>b.onclick=()=>{ const arr=load('gh_custom_pages',[]); arr.splice(+b.dataset.delcp,1); save('gh_custom_pages',arr); scheduleCloudPush(); renderNewAdminPanes(); });

  // reactions
  const reacts = load('gh_reactions', CLOUD_DEFAULTS.reactions);
  if(el('reactionsInput') && document.activeElement!==el('reactionsInput')) el('reactionsInput').value = (Array.isArray(reacts)?reacts:[]).join(',');
  const rp = document.getElementById('reactionsPreview');
  if(rp) rp.textContent = (Array.isArray(reacts)?reacts:[]).join('  ');

  // featured
  const feat = load('gh_featured', []);
  const news = State.news || [];
  const fl = document.getElementById('featuredList');
  if(fl) fl.innerHTML = news.slice(0,20).map(n=>{
    const pinned = feat.includes(n.id);
    return `<div class="manage-row"><span class="mtitle">${esc((n.title||'').slice(0,50))}</span><button class="mbtn ${pinned?'danger':''}" data-pin="${n.id}">${pinned?'برداشتن پین':'پین'}</button></div>`;
  }).join('') || '<p class="dim tiny">خبری نیست.</p>';
  fl?.querySelectorAll('[data-pin]').forEach(b=>b.onclick=()=>{
    let f=load('gh_featured',[]);
    if(f.includes(b.dataset.pin)) f=f.filter(x=>x!==b.dataset.pin); else f.unshift(b.dataset.pin);
    save('gh_featured', f.slice(0,10)); scheduleCloudPush(); renderNewAdminPanes(); toast('به‌روز شد');
  });
}

function wireNewAdminPanes(){
  document.getElementById('announcePublishBtn')?.addEventListener('click', ()=>{
    const text=(document.getElementById('announceText')?.value||'').trim();
    if(!text){ toast('متن خالی است'); return; }
    save('gh_announce', {text, ts:Date.now()}); scheduleCloudPush();
    applyAnnounceBanner(); renderNewAdminPanes(); toast('اعلان منتشر شد');
    logActivity('اعلان سراسری منتشر شد');
  });
  document.getElementById('announceClearBtn')?.addEventListener('click', ()=>{
    save('gh_announce', null); scheduleCloudPush(); applyAnnounceBanner(); renderNewAdminPanes(); toast('اعلان پاک شد');
  });
  document.getElementById('addTagForm')?.addEventListener('submit', e=>{
    e.preventDefault();
    const name=(document.getElementById('newTagName')?.value||'').trim();
    if(!name) return;
    const tags=load('gh_tags', CLOUD_DEFAULTS.tags);
    if(tags.includes(name)){ toast('تگ تکراری است'); return; }
    tags.push(name); save('gh_tags', tags); scheduleCloudPush();
    document.getElementById('newTagName').value=''; renderNewAdminPanes(); toast('تگ اضافه شد');
  });
  document.getElementById('xpSaveBtn')?.addEventListener('click', ()=>{
    const cfg={
      like: Number(document.getElementById('xpLike')?.value||2),
      comment: Number(document.getElementById('xpComment')?.value||5),
      gameWin: Number(document.getElementById('xpGameWin')?.value||15)
    };
    save('gh_xp_config', cfg); scheduleCloudPush(); toast('تنظیمات XP ذخیره شد');
  });
  document.getElementById('addBadgeForm')?.addEventListener('submit', e=>{
    e.preventDefault();
    const emoji=(document.getElementById('badgeEmoji')?.value||'🏅').trim();
    const name=(document.getElementById('badgeName')?.value||'').trim();
    if(!name) return;
    const badges=load('gh_badges',[]);
    badges.push({id:uid(), emoji, name}); save('gh_badges', badges); scheduleCloudPush();
    document.getElementById('badgeName').value=''; renderNewAdminPanes(); toast('نشان اضافه شد');
  });
  document.getElementById('livefeedRefreshBtn')?.addEventListener('click', ()=>{ cloudPull().then(()=>renderNewAdminPanes()); toast('فید تازه شد'); });
  document.getElementById('seoSaveBtn')?.addEventListener('click', ()=>{
    const seo={
      title: document.getElementById('seoTitle')?.value||'',
      desc: document.getElementById('seoDesc')?.value||'',
      keywords: document.getElementById('seoKeywords')?.value||''
    };
    save('gh_seo', seo); scheduleCloudPush();
    if(seo.title) document.title = seo.title;
    toast('SEO ذخیره شد');
  });
  document.getElementById('customPageForm')?.addEventListener('submit', e=>{
    e.preventDefault();
    const slug=(document.getElementById('cpSlug')?.value||'').trim().replace(/[^a-z0-9_-]/gi,'');
    const title=(document.getElementById('cpTitle')?.value||'').trim();
    const body=(document.getElementById('cpBody')?.value||'').trim();
    if(!slug||!title){ toast('slug و عنوان لازم است'); return; }
    const pages=load('gh_custom_pages',[]);
    const i=pages.findIndex(p=>p.slug===slug);
    const row={slug, title, body, ts:Date.now()};
    if(i>=0) pages[i]=row; else pages.push(row);
    save('gh_custom_pages', pages); scheduleCloudPush();
    document.getElementById('cpSlug').value=''; document.getElementById('cpTitle').value=''; document.getElementById('cpBody').value='';
    renderNewAdminPanes(); toast('صفحه ذخیره شد');
  });
  document.getElementById('healthCheckBtn')?.addEventListener('click', async ()=>{
    const box=document.getElementById('healthResult');
    if(!box) return;
    box.innerHTML='در حال بررسی…';
    const lines=[];
    try{
      const t0=performance.now();
      const r=await fetch('/api/health', {cache:'no-store'});
      const ms=Math.round(performance.now()-t0);
      const j=await r.json();
      lines.push(`✅ API سلامت: ${r.ok?'OK':'FAIL'} (${ms}ms)`);
      lines.push(`نسخه: ${j.version||'—'} | DB: ${j.db||'—'}`);
    }catch(e){ lines.push('❌ API در دسترس نیست (ممکن است فقط فرانت باشد)'); }
    lines.push(`localStorage کلیدها: ${Object.keys(localStorage).filter(k=>k.startsWith('gh_')).length}`);
    lines.push(`کاربر جاری: ${currentUser?currentUser.name:'مهمان'}`);
    lines.push(`ادمین: ${currentAdmin?currentAdmin.username:'—'}`);
    lines.push(`backendAvailable: ${backendAvailable()}`);
    box.innerHTML = lines.map(l=>`<p>${esc(l)}</p>`).join('');
  });
  document.getElementById('reactionsSaveBtn')?.addEventListener('click', ()=>{
    const raw=(document.getElementById('reactionsInput')?.value||'').split(/[,،\s]+/).map(s=>s.trim()).filter(Boolean);
    save('gh_reactions', raw.slice(0,12)); scheduleCloudPush(); renderNewAdminPanes(); toast('واکنش‌ها ذخیره شد');
  });
}

function applyAnnounceBanner(){
  let banner=document.getElementById('globalAnnounceBanner');
  const ann=load('gh_announce', null);
  if(!ann || !ann.text){ banner?.remove(); return; }
  if(!banner){
    banner=document.createElement('div');
    banner.id='globalAnnounceBanner';
    banner.style.cssText='background:linear-gradient(90deg,#7c5cff,#d4a72c);color:#111;padding:10px 16px;text-align:center;font-weight:700;font-size:14px;position:sticky;top:0;z-index:999;';
    document.body.prepend(banner);
  }
  banner.textContent = '📢 ' + ann.text;
}

// hook into renderAdmin

// wire new admin once
try{ wireNewAdminPanes(); }catch(e){ console.warn(e); }

/* =========================================================
   Live SSE — هم‌زمانی واقعی بین همه مرورگرها
   ========================================================= */
let liveES = null;
function startLiveSync(){
  if(!backendAvailable() || liveES) return;
  try{
    liveES = new EventSource('/api/live');
    liveES.addEventListener('state', (ev)=>{
      try{
        const data = JSON.parse(ev.data);
        const rev = Object.fromEntries(Object.entries(CLOUD_KEY_MAP).map(([ls,k])=>[k,ls]));
        const lsKey = rev[data.key];
        if(!lsKey || data.value===undefined) return;
        localStorage.setItem(lsKey, JSON.stringify(data.value));
        if(data.key==='news' && currentView==='home') try{ renderNewsFeed(); renderTrending(); }catch(e){}
        if(data.key==='explore' && currentView==='explore') try{ renderExplore(); }catch(e){}
        if(data.key==='shorts' && currentView==='shorts') try{ renderShorts(); }catch(e){}
        if(data.key==='announce') try{ applyAnnounceBanner(); }catch(e){}
        if(data.key==='leaderboard'){
          try{
            if(currentView==='games'){
              renderGlobalLeaderboard();
              const openBoxes = document.querySelectorAll('.leaderboard-box[id^="lb-"]');
              openBoxes.forEach(box=>{
                const gid = box.id.replace('lb-','');
                const diff = getDifficulty(gid);
                refreshLeaderboard(gid, diff);
              });
            }
          }catch(e){}
        }
        if(data.key==='bugReports'){
          try{
            updateBugBadge();
            if(currentView==='admin') renderBugReports();
            if(currentView==='settings') renderMyTickets();
          }catch(e){}
        }
        if(data.key==='dms'){
          try{ if(currentView==='chat' && dmTargetContact) renderDmThread(); updateNotifBadge(); }catch(e){}
        }
      }catch(e){}
    });
    liveES.onerror = ()=>{ try{ liveES.close(); }catch(e){} liveES=null; setTimeout(startLiveSync, 5000); };
  }catch(e){ liveES=null; }
}

function renderTrending(){
  const el = document.getElementById('trendingStrip');
  if(!el) return;
  const news = (State.news||[]).slice().sort((a,b)=>(b.likes||0)-(a.likes||0)).slice(0,8);
  if(!news.length){ el.innerHTML=''; return; }
  el.innerHTML = news.map(n=>`<button type="button" class="trend-chip" data-nid="${n.id}"><span class="hot-badge">داغ</span>${esc((n.title||'').slice(0,42))}</button>`).join('');
  el.querySelectorAll('[data-nid]').forEach(b=>b.onclick=()=>{
    try{ openArticle(b.dataset.nid); }catch(e){ showView('home'); }
  });
}

/* AI محلی قوی‌تر — دانش گیم + اخبار سایت + fallback سرور */
const GH_AI_KB = [
  {k:/الدن|elden|nightreign|ساولز|souls/i, a:'الدن رینگ از FromSoftware است؛ سبک Souls-like با سختی بالا، بوس‌های حماسی و جهان باز. نسخهٔ Shadow of the Erdtree و اخبار Nightreign را در فید دنبال کن.'},
  {k:/گتا|gta|گرند/i, a:'GTA توسط Rockstar ساخته می‌شود. GTA VI با تمرکز روی Vice City در راه است؛ تریلرها را در بخش شورتس ببین.'},
  {k:/روبلاکس|roblox/i, a:'روبلاکس پلتفرم ساخت و بازی آنلاین است. در تب روبلاکس می‌تونی اخبار و بخش‌های مرتبط را ببینی. برای رشد در روبلاکس: ساخت تجربه، تبلیغ در گروه‌ها و آپدیت منظم مهم است.'},
  {k:/انیمه|anime|مانگا/i, a:'تب انیمه برای خبر و بحث انیمه‌های مرتبط با گیم و فرهنگ پاپ است. پیشنهاد می‌کنم فیلترها را چک کنی.'},
  {k:/ماینکرفت|minecraft/i, a:'ماینکرفت sandbox است: بقا، خلاقیت، ردستون و سرورهای چندنفره. نسخه‌های Java و Bedrock تفاوت‌هایی در ماد و کراس‌پلی دارند.'},
  {k:/فورتنایت|fortnite/i, a:'فورتنایت battle royale از Epic است؛ هر فصل اسکین و مپ جدید می‌آورد. رویدادهای زنده را از اخبار دنبال کن.'},
  {k:/پلی\s*استیشن|playstation|ps5|سونی/i, a:'PlayStation از سونی است؛ PS5 روی انحصاری‌هایی مثل God of War، Spider-Man و The Last of Us تمرکز دارد.'},
  {k:/ایکس\s*باکس|xbox|گیم\s*پس/i, a:'Xbox و Game Pass از مایکروسافت امکان بازی‌های زیاد با اشتراک ماهانه می‌دهند؛ برای امتحان عنوان‌های جدید عالی است.'},
  {k:/نینتندو|سوییچ|switch/i, a:'نینتندو سوییچ ترکیبی از خانگی و دستی است؛ عناوینی مثل Zelda و Mario انحصاری محبوبش هستند.'},
  {k:/چطور|راهنما|کمک|چه\s*کار/i, a:'می‌تونم دربارهٔ اخبار گیم، روبلاکس، انیمه، بازی‌های داخل سایت، اکسپلور و شورتس راهنمایی کنم. سوالت را دقیق‌تر بپرس!'},
];

function publicAiRespond(text){
  if(isBanned(currentUser?.contact)) return 'حساب تو به‌دلیل نقض قوانین بن شده و نمی‌توانی از هوش مصنوعی استفاده کنی.';
  if(containsProfanity(text)){
    if(currentUser){ banUser(currentUser.contact); }
    return 'استفاده از الفاظ نامناسب مجاز نیست. حساب بن شد.';
  }
  const t = text.trim();
  if(!t) return 'یه چیزی بپرس تا کمکت کنم 🎮';
  if(/سلام|درود|هلو|hi\b|hello|صبح|عصر/i.test(t)) return `سلام${currentUser? ' '+currentUser.name:''} 👋 من دستیار گیم‌هابم. دربارهٔ اخبار، بازی‌ها، روبلاکس، انیمه، شورتس یا کوییز بپرس!`;
  if(/خداحافظ|بای|فعلا|bye/i.test(t)) return 'خداحافظ! هر وقت خواستی برگرد 🎮';
  if(/ممنون|مرسی|متشکرم|thanks/i.test(t)) return 'خواهش می‌کنم! اگر سوال گیمی دیگه‌ای داشتی هستم.';
  if(/کی\s*هستی|اسمت|چه\s*کاره/i.test(t)) return 'من هوش مصنوعی گیم‌هاب هستم؛ به اخبار و بخش‌های همین سایت وصلم و سعی می‌کنم جواب‌های مفید گیمی بدم.';
  if(/آخرین خبر|تیتر|چه خبر|اخبار/i.test(t)){
    const top = (State.news||[]).slice(0,5).map((n,i)=>`${i+1}. ${n.title}`).join('\n');
    return top ? `آخرین خبرهای گیم‌هاب:\n${top}\n\nبرای جزئیات برو خانه و روی خبر بزن.` : 'هنوز خبری در فید نیست — کمی بعد سر بزن.';
  }
  if(/پیشنهاد.*بازی|چی\s*بازی\s*کنم|game\s*recommend/i.test(t)){
    return 'بسته به سلیقه‌ات:\n• اکشن/ماجراجویی: God of War، Spider-Man\n• سخت و عمیق: Elden Ring، Sekiro\n• آنلاین با دوست: Roblox، Fortnite، Minecraft\n• داستان‌محور: The Last of Us، Red Dead 2\nتو سالن بازی هم چند مینی‌گیم رایگان داریم!';
  }
  if(/اکسپلور|شورتس|چت|پروفایل/i.test(t)){
    return 'از منوی پایین موبایل یا منوی بالا می‌تونی بروی:\n🧭 اکسپلور · 🎬 شورتس · 💬 چت · 👤 پروفایل · 🎮 بازی‌ها · ⚙️ تنظیمات';
  }
  for(const row of GH_AI_KB){
    if(row.k.test(t)) return row.a;
  }
  // پاسخ ترکیبی با زمینهٔ سایت
  const n = (State.news||[])[0];
  const tip = n ? `\n\nخبر داغ الان: «${n.title}»` : '';
  return `دربارهٔ «${t.slice(0,80)}» در گیم‌هاب می‌تونم کمکت کنم. اگر منظورت خبر، روبلاکس، انیمه یا مینی‌گیم‌هاست دقیق‌تر بگو تا جواب بهتری بدم.${tip}`;
}


try{ startLiveSync(); }catch(e){}
try{ renderDailyChallengeBar(); }catch(e){}

/* ذخیرهٔ ۲۰ آپشن جدید ادمین */
document.addEventListener('click', e=>{
  const btn = e.target.closest('[data-save-extra]');
  if(!btn) return;
  const id = btn.dataset.saveExtra;
  const ta = document.getElementById(id+'Text');
  if(!ta) return;
  const key = 'gh_extra_'+id;
  save(key, ta.value);
  // map important ones to cloud if needed
  try{
    const map = load('gh_admin_extras', {});
    map[id] = ta.value;
    save('gh_admin_extras', map);
    scheduleCloudPush();
  }catch(err){}
  const st = document.getElementById(id+'Status');
  if(st) st.textContent = 'ذخیره شد — ' + new Date().toLocaleTimeString('fa-IR');
  toast('ذخیره شد: '+id);
  logActivity('تنظیمات '+id+' ذخیره شد');
});

function renderExtraAdminPanes(){
  const ids = ['newsletter','pushnotif','ads','partners','contests','faq','roadmap','changelog','roles','filters','media','embed','hourly','regions','themeshop','apiinfo','cache','feedback','spotlight','maintenance2'];
  const map = load('gh_admin_extras', {});
  ids.forEach(id=>{
    const ta = document.getElementById(id+'Text');
    if(ta && document.activeElement!==ta){
      ta.value = map[id] || load('gh_extra_'+id, '') || '';
    }
  });
}

try{ document.addEventListener('DOMContentLoaded',()=>{}); }catch(e){}

/* =========================================================
   Welcome gate + engagement (اعتیادآور ملایم)
   ========================================================= */
function getStreak(){
  const data = load('gh_streak', { days:0, last:null });
  const today = new Date().toISOString().slice(0,10);
  if(data.last === today) return data.days;
  const y = new Date(Date.now()-864e5).toISOString().slice(0,10);
  if(data.last === y) data.days = (data.days||0)+1;
  else data.days = 1;
  data.last = today;
  save('gh_streak', data);
  return data.days;
}
function showEngagementToast(msg){
  const el = document.createElement('div');
  el.className = 'xp-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 2800);
}

/* --- اعتیادآوری: چالش روزانه، پاداش، کانفتی --- */
function confettiBurst(){
  const colors=['#7c5cff','#d4a72c','#5ce1a8','#ff6b6b','#4ecdc4','#fff'];
  for(let i=0;i<28;i++){
    const p=document.createElement('div');
    p.className='confetti-piece';
    p.style.left=(Math.random()*100)+'vw';
    p.style.background=colors[i%colors.length];
    p.style.animationDelay=(Math.random()*0.4)+'s';
    p.style.transform='rotate('+Math.random()*360+'deg)';
    document.body.appendChild(p);
    setTimeout(()=>p.remove(),2200);
  }
}
function getDailyChallenge(){
  const day=new Date().toISOString().slice(0,10);
  let ch=load('gh_daily_ch',null);
  if(ch&&ch.day===day) return ch;
  const pool=[
    {id:'like3',text_fa:'۳ خبر را لایک کن',text_en:'Like 3 news posts',target:3,xp:20},
    {id:'comment1',text_fa:'۱ دیدگاه بنویس',text_en:'Write 1 comment',target:1,xp:25},
    {id:'play1',text_fa:'۱ بازی انجام بده',text_en:'Play 1 mini-game',target:1,xp:30},
    {id:'explore1',text_fa:'۱ پست در اکسپلور بگذار',text_en:'Post once on Explore',target:1,xp:35},
    {id:'ai1',text_fa:'از هوش مصنوعی ۱ سوال بپرس',text_en:'Ask AI one question',target:1,xp:15},
  ];
  ch={day, ...pool[Math.floor(Math.random()*pool.length)], progress:0, done:false};
  save('gh_daily_ch',ch);
  return ch;
}
function bumpChallenge(id, by=1){
  const ch=getDailyChallenge();
  if(ch.done||ch.id!==id) return;
  ch.progress=Math.min(ch.target,(ch.progress||0)+by);
  if(ch.progress>=ch.target){
    ch.done=true;
    confettiBurst();
    const lang=(State.settings&&State.settings.lang)||'fa';
    showXpToast(lang==='en'?`Challenge done! +${ch.xp} XP`:`چالش تموم شد! +${ch.xp} XP`);
    try{
      if(currentUser){
        const uxp=load('gh_user_xp',{});
        const k=currentUser.contact||currentUser.name;
        uxp[k]=(uxp[k]||0)+ch.xp;
        save('gh_user_xp',uxp); scheduleCloudPush();
      }
    }catch(e){}
  }
  save('gh_daily_ch',ch);
  renderDailyChallengeBar();
}
function renderDailyChallengeBar(){
  let bar=document.getElementById('dailyChallengeBar');
  if(!bar){
    bar=document.createElement('div');
    bar.id='dailyChallengeBar';
    bar.className='daily-challenge-bar';
    const main=document.getElementById('app');
    if(main) main.prepend(bar);
    else document.body.appendChild(bar);
  }
  const ch=getDailyChallenge();
  const lang=(State.settings&&State.settings.lang)||'fa';
  const label=lang==='en'?(ch.text_en||ch.text_fa):(ch.text_fa||ch.text_en);
  const pct=Math.round(100*(ch.progress||0)/Math.max(1,ch.target));
  bar.innerHTML=`<div class="dc-inner"><span class="dc-label">🎯 ${label}</span>
    <span class="dc-prog">${ch.done?(lang==='en'?'Done ✓':'انجام شد ✓'):`${ch.progress||0}/${ch.target}`}</span>
    <div class="dc-track"><i style="width:${ch.done?100:pct}%"></i></div></div>`;
}

// hooks for challenge progress
const _origToast = typeof toast==='function' ? toast : null;
function initWelcomeGate(){
  const gate = document.getElementById('welcomeGate');
  if(!gate) return;
  const streak = getStreak();
  const streakEl = document.getElementById('welcomeStreak');
  if(streakEl){
    const lang = (State.settings&&State.settings.lang)||'fa';
    streakEl.textContent = lang==='en'
      ? (streak>1 ? `🔥 ${streak}-day streak — you are on fire!` : '✨ First visit of the day — nice!')
      : (streak>1 ? `🔥 استریک ${streak} روزه — داری عالی پیش میری!` : '✨ اولین بازدید امروز — خوش اومدی!');
  }
  const seen = sessionStorage.getItem('gh_welcome_seen');
  if(seen){ gate.classList.add('hide'); setTimeout(()=>gate.remove(), 400); return; }
  const btn = document.getElementById('welcomeEnterBtn');
  const enter = ()=>{
    sessionStorage.setItem('gh_welcome_seen','1');
    gate.classList.add('hide');
    setTimeout(()=>gate.remove(), 550);
    const lang = (State.settings&&State.settings.lang)||'fa';
    const streak = getStreak();
    if(streak>=3) showEngagementToast(lang==='en' ? `🔥 ${streak}-day streak!` : `🔥 استریک ${streak} روزه!`);
    else showEngagementToast(lang==='en' ? 'Welcome back to GameHub' : 'خوش اومدی به گیم‌هاب 👑');
  };
  btn?.addEventListener('click', enter);
  // auto-enter after 8s if idle
  setTimeout(()=>{ if(document.getElementById('welcomeGate')) enter(); }, 12000);
}
// reward on like / comment hooks via global helper
function rewardAction(kind){
  try{
    const lang = (State.settings&&State.settings.lang)||'fa';
    const msgs = {
      like: lang==='en' ? '+2 XP for liking' : '+۲ امتیاز بابت لایک',
      comment: lang==='en' ? '+5 XP for commenting' : '+۵ امتیاز بابت کامنت',
      post: lang==='en' ? '+10 XP for posting' : '+۱۰ امتیاز بابت پست',
      game: lang==='en' ? 'Nice score! Leaderboard updated' : 'آفرین! امتیازت تو لیدربورد ثبت شد'
    };
    if(msgs[kind]) showEngagementToast(msgs[kind]);
    // user xp
    if(currentUser){
      const xp = load('gh_user_xp', {});
      const key = currentUser.contact || currentUser.name;
      const add = kind==='like'?2:kind==='comment'?5:kind==='post'?10:kind==='game'?15:1;
      xp[key] = (xp[key]||0)+add;
      save('gh_user_xp', xp);
      scheduleCloudPush();
    }
  }catch(e){}
}


document.addEventListener('click', e=>{
  if(e.target.closest('.elike, .short-like, [data-like]')) try{ bumpChallenge('like3'); }catch(err){}
  if(e.target.closest('.game-card')) try{ bumpChallenge('play1'); }catch(err){}
}, true);
init();
