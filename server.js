/* GameHub production-minded backend (Node 20+)
   - SQLite persistence shared by every browser
   - Secure cookie sessions for users/admins
   - Uploads, live leaderboard/state sync, admin room, activity log
   - Optional AI gateway (OpenAI, Anthropic, Gemini, xAI, DeepSeek)
   Run: npm install && npm start
*/
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');
const multer = require('multer');
require('dotenv').config();

const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, {recursive:true});
const db = new Database(path.join(DATA_DIR, 'gamehub.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS state (k TEXT PRIMARY KEY, v TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, contact TEXT UNIQUE NOT NULL, joined_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, role TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS activities (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, who TEXT NOT NULL, role TEXT, action TEXT NOT NULL, meta TEXT, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS admin_room (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, who TEXT NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen);
CREATE INDEX IF NOT EXISTS idx_activities_created ON activities(created_at);
CREATE INDEX IF NOT EXISTS idx_room_created ON admin_room(created_at);
`);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({contentSecurityPolicy:false, crossOriginEmbedderPolicy:false}));
app.use(compression());
app.use(express.json({limit:'2mb'}));
app.use(cookieParser());
app.use(rateLimit({windowMs:60_000, limit:240, standardHeaders:'draft-7', legacyHeaders:false}));
app.use(express.static(ROOT, {
  etag:true,
  setHeaders(res, filePath){
    if(/\.(html|js|css|json)$/i.test(filePath)){
      res.setHeader('Cache-Control','no-cache');
    } else {
      res.setHeader('Cache-Control','public, max-age=604800');
    }
  }
}));

const OWNER_USERNAME = process.env.OWNER_USERNAME || 'parham-savar';
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || 'CHANGE_ME_NOW';
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 14);
const sessionCookie = 'gh_session';
const sessions = new Map();

function uid(){ return crypto.randomBytes(18).toString('base64url'); }
function hash(v){ return crypto.createHash('sha256').update(String(v)).digest('hex'); }
function setSession(res, userId, role){
  const id=uid(), exp=Date.now()+SESSION_DAYS*864e5;
  db.prepare('INSERT INTO sessions(id,user_id,role,expires_at) VALUES(?,?,?,?)').run(id,userId,role,exp);
  res.cookie(sessionCookie,id,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:SESSION_DAYS*864e5,path:'/'});
}
function auth(req,res,next){
  const sid=req.cookies[sessionCookie];
  if(!sid) return res.status(401).json({error:'unauthorized'});
  const s=db.prepare('SELECT * FROM sessions WHERE id=? AND expires_at>?').get(sid,Date.now());
  if(!s) return res.status(401).json({error:'unauthorized'});
  req.auth=s; next();
}
function admin(req,res,next){ if(req.auth?.role==='admin'||req.auth?.role==='owner') return next(); res.status(403).json({error:'admin_only'}); }
function log(req, action, meta={}){
  let who='guest';
  if(req.auth?.user_id){ const u=db.prepare('SELECT name FROM users WHERE id=?').get(req.auth.user_id); who=u?.name||req.auth.user_id; }
  db.prepare('INSERT INTO activities(user_id,who,role,action,meta,created_at) VALUES(?,?,?,?,?,?)').run(req.auth?.user_id||null,who,req.auth?.role||'guest',action,JSON.stringify(meta),Date.now());
}
const sseClients = new Set();
function broadcastState(key, value){
  const payload = `event: state\ndata: ${JSON.stringify({key, value, ts: Date.now()})}\n\n`;
  for(const res of sseClients){
    try{ res.write(payload); }catch(e){ sseClients.delete(res); }
  }
}
function stateGet(k, fallback=null){ const r=db.prepare('SELECT v FROM state WHERE k=?').get(k); if(!r) return fallback; try{return JSON.parse(r.v)}catch{return fallback;} }
function stateSet(k,v){ db.prepare(`INSERT INTO state(k,v,updated_at) VALUES(?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v,updated_at=excluded.updated_at`).run(k,JSON.stringify(v),Date.now()); try{ if(typeof broadcastState==='function') broadcastState(k,v); }catch(e){} }

app.get('/api/health',(req,res)=>res.json({ok:true,ts:Date.now(),db:'sqlite',version:'2.0'}));
app.get('/api/net/ping',(req,res)=>res.json({ok:true,ts:Date.now()}));

app.post('/api/auth/register', (req,res)=>{
  const {name,contact}=req.body||{};
  if(!name||!contact) return res.status(400).json({error:'name_and_contact_required'});
  const now=Date.now(), id=uid();
  try{
    db.prepare('INSERT INTO users(id,name,contact,joined_at,last_seen,data) VALUES(?,?,?,?,?,?)').run(id,String(name).slice(0,80),String(contact).slice(0,160),now,now,JSON.stringify({}));
    setSession(res,id,'user'); log({...req,auth:{user_id:id,role:'user'}},'register');
    res.json({ok:true,user:{id,name,contact}});
  }catch(e){ res.status(409).json({error:'contact_exists'}); }
});
app.post('/api/auth/admin-login',(req,res)=>{
  const {username,password}=req.body||{};
  if(username!==OWNER_USERNAME || password!==OWNER_PASSWORD) return res.status(401).json({error:'invalid_credentials'});
  const id='owner';
  db.prepare(`INSERT INTO users(id,name,contact,joined_at,last_seen,data) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen`).run(id,'Owner',OWNER_USERNAME,Date.now(),Date.now(),'{}');
  setSession(res,id,'owner'); log({...req,auth:{user_id:id,role:'owner'}},'admin_login');
  res.json({ok:true,role:'owner'});
});
app.post('/api/auth/logout',(req,res)=>{ const sid=req.cookies[sessionCookie]; if(sid) db.prepare('DELETE FROM sessions WHERE id=?').run(sid); res.clearCookie(sessionCookie); res.json({ok:true}); });
app.get('/api/auth/me',auth,(req,res)=>{
  if(req.auth.user_id==='owner') return res.json({id:'owner',name:'Owner',role:'owner'});
  const u=db.prepare('SELECT id,name,contact,joined_at,last_seen,data FROM users WHERE id=?').get(req.auth.user_id); if(!u) return res.status(404).json({error:'not_found'});
  db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(Date.now(),u.id);
  res.json({...u, data:JSON.parse(u.data||'{}'),role:req.auth.role});
});

// Shared state. Public reads are fast; writes require a logged-in user.
app.get('/api/state/:key',(req,res)=>{
  const v=stateGet(req.params.key,null);
  res.set('Cache-Control','no-store');
  res.json({ok:true,value:v,updatedAt:db.prepare('SELECT updated_at FROM state WHERE k=?').get(req.params.key)?.updated_at||0});
});
const PUBLIC_WRITE_KEYS = new Set(['explore','shorts','comments','exploreComments','polls','newsSuggestions','bugReports','playerActivityLog','leaderboard','news']);
app.put('/api/state/:key',(req,res)=>{
  const k=String(req.params.key).replace(/[^a-zA-Z0-9_.-]/g,'').slice(0,80);
  if(!k) return res.status(400).json({error:'bad_key'});
  const body=req.body?.value;
  const size=JSON.stringify(body??'').length;
  if(size>900000) return res.status(413).json({error:'too_large'});
  const sid=req.cookies[sessionCookie];
  const sess=sid?db.prepare('SELECT * FROM sessions WHERE id=? AND expires_at>?').get(sid,Date.now()):null;
  if(sess){
    req.auth=sess;
    stateSet(k,body);
    log(req,'state_update',{key:k});
    return res.json({ok:true,updatedAt:Date.now()});
  }
  if(PUBLIC_WRITE_KEYS.has(k)){
    stateSet(k,body);
    log(req,'state_update_public',{key:k});
    return res.json({ok:true,updatedAt:Date.now(),public:true});
  }
  return res.status(401).json({error:'unauthorized'});
});

app.get('/api/users',auth,admin,(req,res)=>{
  const users=db.prepare('SELECT id,name,contact,joined_at,last_seen,data FROM users WHERE id<>? ORDER BY last_seen DESC').all('owner').map(u=>({...u,data:JSON.parse(u.data||'{}')}));
  res.json({ok:true,users});
});
app.get('/api/activity',auth,admin,(req,res)=>res.json({ok:true,items:db.prepare('SELECT * FROM activities ORDER BY created_at DESC LIMIT 300').all()}));
app.get('/api/admin/room',auth,admin,(req,res)=>res.json({ok:true,messages:db.prepare('SELECT * FROM admin_room ORDER BY id DESC LIMIT 200').all().reverse()}));
app.post('/api/admin/room',auth,admin,(req,res)=>{ const text=String(req.body?.text||'').trim(); if(!text) return res.status(400).json({error:'empty'}); const who=req.auth.user_id==='owner'?'Owner':(db.prepare('SELECT name FROM users WHERE id=?').get(req.auth.user_id)?.name||'Admin'); db.prepare('INSERT INTO admin_room(user_id,who,text,created_at) VALUES(?,?,?,?)').run(req.auth.user_id,who,text,Date.now()); log(req,'admin_room_message'); res.json({ok:true}); });

const upload=multer({dest:UPLOAD_DIR,limits:{fileSize:15*1024*1024},fileFilter:(req,file,cb)=>{ const ok=/^(image\/(png|jpeg|webp|gif)|text\/plain|application\/pdf)$/.test(file.mimetype); cb(ok?null:new Error('unsupported_file'),ok); }});
app.post('/api/upload',auth,upload.single('file'),(req,res)=>{ if(!req.file) return res.status(400).json({error:'file_required'}); log(req,'upload',{name:req.file.originalname,size:req.file.size,type:req.file.mimetype}); res.json({ok:true,file:{id:path.basename(req.file.path),name:req.file.originalname,type:req.file.mimetype,size:req.file.size,url:'/uploads/'+path.basename(req.file.path)}}); });
app.use('/uploads',express.static(UPLOAD_DIR,{maxAge:'30d',immutable:true}));

async function aiCall(provider, prompt, attachment){
  const p=String(provider||'openai').toLowerCase();
  if(p==='openai' && process.env.OPENAI_API_KEY){
    const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Authorization':'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-5',messages:[{role:'user',content:attachment?[{type:'text',text:prompt},{type:'image_url',image_url:{url:attachment}}]:prompt}],temperature:.3})}); const j=await r.json(); return j.choices?.[0]?.message?.content||j.error?.message;
  }
  if(p==='deepseek' && process.env.DEEPSEEK_API_KEY){ const r=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'Authorization':'Bearer '+process.env.DEEPSEEK_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.DEEPSEEK_MODEL||'deepseek-chat',messages:[{role:'user',content:prompt}]})}); const j=await r.json(); return j.choices?.[0]?.message?.content||j.error?.message; }
  if(p==='xai' && process.env.XAI_API_KEY){ const r=await fetch('https://api.x.ai/v1/chat/completions',{method:'POST',headers:{'Authorization':'Bearer '+process.env.XAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.XAI_MODEL||'grok-4',messages:[{role:'user',content:prompt}]})}); const j=await r.json(); return j.choices?.[0]?.message?.content||j.error?.message; }
  if(p==='anthropic' && process.env.ANTHROPIC_API_KEY){ const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01','content-type':'application/json'},body:JSON.stringify({model:process.env.ANTHROPIC_MODEL||'claude-sonnet-4-5',max_tokens:1200,messages:[{role:'user',content:prompt}]})}); const j=await r.json(); return j.content?.map(x=>x.text||'').join('')||j.error?.message; }
  if(p==='gemini' && process.env.GEMINI_API_KEY){ const model=process.env.GEMINI_MODEL||'gemini-2.5-flash'; const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}]})}); const j=await r.json(); return j.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('')||j.error?.message; }
  return 'هیچ کلید API برای این مدل در سرور تنظیم نشده است. کلید را فقط در فایل .env سرور قرار بده؛ هرگز داخل فرانت‌اند نگذار.';
}
app.post('/api/ai/chat',auth,async(req,res)=>{ try{ const answer=await aiCall(req.body?.provider, String(req.body?.prompt||'').slice(0,12000), req.body?.attachment||null); log(req,'ai_chat',{provider:req.body?.provider||'openai'}); res.json({ok:true,answer}); }catch(e){res.status(502).json({error:'ai_provider_failed'});} });

// --- Live updates via Server-Sent Events (هم‌زمانی واقعی) ---
app.get('/api/live', (req,res)=>{
  res.setHeader('Content-Type','text/event-stream');
  res.setHeader('Cache-Control','no-cache');
  res.setHeader('Connection','keep-alive');
  res.flushHeaders?.();
  res.write(`event: hello\ndata: ${JSON.stringify({ok:true,ts:Date.now()})}\n\n`);
  sseClients.add(res);
  const ping = setInterval(()=>{ try{ res.write(`event: ping\ndata: ${Date.now()}\n\n`); }catch(e){ clearInterval(ping); sseClients.delete(res); } }, 25000);
  req.on('close', ()=>{ clearInterval(ping); sseClients.delete(res); });
});
app.get('/*splat',(req,res)=>res.sendFile(path.join(ROOT,'index.html')));
app.get('*',(req,res)=>res.sendFile(path.join(ROOT,'index.html')));
const port=Number(process.env.PORT||3000);
app.listen(port,()=>console.log(`GameHub server listening on http://localhost:${port}`));

