'use strict';
const path = require('path'), fs = require('fs'), crypto = require('crypto');
const express = require('express'), helmet = require('helmet'), compression = require('compression');
const cookieParser = require('cookie-parser'), rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken'), multer = require('multer');
const Database = require('better-sqlite3');

class UErr extends Error {}                       // user-facing (400) errors
const PORT = +process.env.PORT || 3000, HOST = process.env.HOST || '127.0.0.1';
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data'), UP = path.join(DATA, 'uploads');
fs.mkdirSync(UP, { recursive: true });

// ---------- database ----------
const db = new Database(path.join(DATA, 'shop.db'));
db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY, name TEXT NOT NULL, emoji TEXT NOT NULL DEFAULT '📦', price INTEGER NOT NULL, discount INTEGER NOT NULL DEFAULT 0, gradient TEXT NOT NULL, image TEXT NOT NULL DEFAULT '', stock INTEGER NOT NULL DEFAULT 50, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY, name TEXT, phone TEXT, address TEXT, total INTEGER, pay TEXT, status TEXT, created INTEGER);
CREATE INDEX IF NOT EXISTS ix_orders_created ON orders(created);
CREATE TABLE IF NOT EXISTS order_items(id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), product_id INTEGER, name TEXT, price INTEGER, qty INTEGER);
CREATE TABLE IF NOT EXISTS logs(id INTEGER PRIMARY KEY, ts INTEGER, level TEXT, msg TEXT);
`);
const addCol = (t, c, d) => { if (!db.prepare(`PRAGMA table_info(${t})`).all().some(x => x.name === c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${d}`); };
db.exec(`
CREATE TABLE IF NOT EXISTS customers(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, hash TEXT NOT NULL, phone TEXT, created INTEGER);
CREATE TABLE IF NOT EXISTS reviews(id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL, user_id INTEGER NOT NULL, username TEXT, stars INTEGER, text TEXT, created INTEGER, UNIQUE(product_id,user_id));
CREATE TABLE IF NOT EXISTS codes(code TEXT PRIMARY KEY, pct INTEGER NOT NULL DEFAULT 0, amt INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created INTEGER);
`);
addCol('products', 'category', 'INTEGER NOT NULL DEFAULT 1'); addCol('products', 'icon', 'INTEGER NOT NULL DEFAULT 12');
addCol('orders', 'user_id', 'INTEGER'); addCol('orders', 'code', "TEXT NOT NULL DEFAULT ''"); addCol('orders', 'discount', 'INTEGER NOT NULL DEFAULT 0');
const insLog = db.prepare('INSERT INTO logs(ts,level,msg) VALUES(?,?,?)');
function log(level, msg) { msg = String(msg).slice(0, 300); try { insLog.run(Date.now(), level, msg); } catch {} console.log(`[${level}] ${msg}`); }
setInterval(() => db.prepare('DELETE FROM logs WHERE id < (SELECT COALESCE(MAX(id),0)-3000 FROM logs)').run(), 3600e3);

const GR = ['linear-gradient(135deg,#c7d2fe,#a78bfa)', 'linear-gradient(135deg,#fde68a,#f59e0b)', 'linear-gradient(135deg,#a7f3d0,#34d399)', 'linear-gradient(135deg,#fecdd3,#fb7185)'];
if (!db.prepare('SELECT 1 FROM products').get()) {
  const seed = [
    ['گوشی موبایل هوشمند ۲۵۶ گیگ', '📱', 32900000, 15, 'linear-gradient(135deg,#c7d2fe,#a78bfa)'],
    ['هدفون بی‌سیم نویزکنسلینگ', '🎧', 4850000, 30, 'linear-gradient(135deg,#fecdd3,#fb7185)'],
    ['ساعت هوشمند ورزشی', '⌚', 6200000, 20, 'linear-gradient(135deg,#a7f3d0,#34d399)'],
    ['لپ‌تاپ سبک ۱۴ اینچ', '💻', 58000000, 10, 'linear-gradient(135deg,#bae6fd,#38bdf8)'],
    ['کفش ورزشی رانینگ', '👟', 3400000, 40, 'linear-gradient(135deg,#fde68a,#f59e0b)'],
    ['دوربین دیجیتال حرفه‌ای', '📷', 41500000, 12, 'linear-gradient(135deg,#e9d5ff,#c084fc)'],
    ['قهوه‌ساز اتوماتیک', '☕', 9700000, 25, 'linear-gradient(135deg,#fed7aa,#fb923c)'],
    ['کنسول بازی نسل جدید', '🎮', 27800000, 8, 'linear-gradient(135deg,#99f6e4,#2dd4bf)'],
    ['کوله‌پشتی ضدآب', '🎒', 1950000, 35, 'linear-gradient(135deg,#fbcfe8,#f472b6)'],
    ['عطر ادکلن لوکس', '🧴', 5300000, 18, 'linear-gradient(135deg,#ddd6fe,#818cf8)'],
    ['دوچرخه کوهستان', '🚲', 19400000, 22, 'linear-gradient(135deg,#bbf7d0,#4ade80)'],
    ['کتاب‌خوان الکترونیکی', '📚', 7600000, 15, 'linear-gradient(135deg,#fef08a,#facc15)']];
  const ins = db.prepare('INSERT INTO products(name,emoji,price,discount,gradient,stock) VALUES(?,?,?,?,?,50)');
  db.transaction(() => seed.forEach(r => ins.run(...r)))();
}

if (db.pragma('user_version', { simple: true }) < 2) {
  const META = [[1, 0], [1, 1], [1, 2], [1, 3], [2, 4], [1, 5], [3, 6], [1, 7], [2, 8], [4, 9], [2, 10], [5, 11]];
  db.prepare('SELECT id FROM products ORDER BY id LIMIT 12').all().forEach((r, k) => db.prepare('UPDATE products SET category=?,icon=? WHERE id=? AND icon=12').run(META[k][0], META[k][1], r.id));
  db.pragma('user_version = 2');
}

// ---------- secrets / admin bootstrap ----------
let SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  const f = path.join(DATA, '.secret');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
  SECRET = fs.readFileSync(f, 'utf8');
}
if (!db.prepare('SELECT 1 FROM users').get()) {
  const u = process.env.ADMIN_USER || 'admin'; let p = process.env.ADMIN_PASSWORD, gen = false;
  if (!p) { p = crypto.randomBytes(9).toString('base64url'); gen = true; }
  db.prepare('INSERT INTO users(username,hash) VALUES(?,?)').run(u, bcrypt.hashSync(p, 12));
  console.log(gen ? `>>> admin created. user: ${u}  password: ${p}  (shown once)` : `>>> admin "${u}" created`);
}

// ---------- helpers ----------
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').trim().slice(0, n);
const latin = s => String(s || '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[^\d]/g, '');
const ST = ['pending', 'shipped', 'done', 'canceled'];
const seen = new Map();
const online = () => { const t = Date.now() - 3e5; let n = 0; for (const [k, v] of seen) { if (v < t) seen.delete(k); else n++; } return n; };

// ---------- app ----------
const app = express();
app.set('trust proxy', 1); app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'", "'unsafe-inline'"], scriptSrcAttr: ["'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'self'"],
    'upgrade-insecure-requests': null } },
  crossOriginEmbedderPolicy: false }));
app.use(compression()); app.use(express.json({ limit: '50kb' })); app.use(cookieParser());
app.use((req, res, next) => {
  const t = Date.now();
  res.on('finish', () => {
    if (!req.path.startsWith('/api') || /\/(hit|me|admin\/logs)$/.test(req.path)) return;
    if (req.method !== 'GET' || res.statusCode >= 400)
      log(res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO', `${req.method} ${req.path} ${res.statusCode} ${Date.now() - t}ms`);
  });
  next();
});

app.get('/healthz', (q, r) => r.send('ok'));
const base = q => process.env.SITE_URL || `${q.protocol}://${/^[\w.-]+(:\d+)?$/.test(q.get('host') || '') ? q.get('host') : 'localhost'}`;
app.get('/robots.txt', (q, r) => r.type('text/plain').send(`User-agent: *\nDisallow: /api/\nSitemap: ${base(q)}/sitemap.xml\n`));
app.get('/sitemap.xml', (q, r) => r.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${base(q)}/</loc></url></urlset>`));

// ---------- public API ----------
app.get('/api/products', (q, r) => r.json(db.prepare('SELECT p.id,p.name,p.emoji,p.price,p.discount,p.gradient,p.image,p.stock,p.category,p.icon,(SELECT ROUND(AVG(stars),1) FROM reviews WHERE product_id=p.id) AS rating,(SELECT COUNT(*) FROM reviews WHERE product_id=p.id) AS rc FROM products p WHERE p.active=1 ORDER BY p.id').all()));
app.post('/api/hit', rateLimit({ windowMs: 6e4, limit: 30, standardHeaders: true, legacyHeaders: false }), (q, r) => {
  const s = String(q.body?.sid || '').slice(0, 40); if (s) { if (seen.size > 20000) seen.clear(); seen.set(s, Date.now()); } r.json({ ok: 1 });
});
const orderLimiter = rateLimit({ windowMs: 3600e3, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'تعداد سفارش بیش از حد مجاز است؛ بعداً تلاش کنید' } });
const CAUTH = (q, r, n) => { try { const u = jwt.verify(q.cookies.ctok || '', SECRET); if (u.t !== 'c') throw 0; q.cu = u; n(); } catch { r.status(401).json({ error: 'برای ادامه وارد حساب خود شوید' }); } };
function calc(raw, code) {                                    // prices/stock/discount are always computed here, never trusted from the browser
  const agg = new Map();
  for (const it of (Array.isArray(raw) ? raw.slice(0, 50) : [])) { const id = +it.id, qty = Math.min(20, Math.max(1, +it.qty | 0)); if (id > 0) agg.set(id, Math.min(20, (agg.get(id) || 0) + qty)); }
  if (!agg.size) throw new UErr('سبد خرید خالی است');
  let sub = 0; const rows = [];
  for (const [id, qty] of agg) {
    const p = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(id);
    if (!p) throw new UErr('یکی از محصولات دیگر موجود نیست');
    if (p.stock < qty) throw new UErr(`موجودی «${p.name}» کافی نیست`);
    sub += p.price * qty; rows.push([p, qty]);
  }
  let discount = 0, used = ''; const c = String(code || '').trim().toUpperCase();
  if (c) { const k = db.prepare('SELECT * FROM codes WHERE code=? AND active=1').get(c); if (!k) throw new UErr('کد تخفیف نامعتبر است'); discount = Math.min(sub, k.pct ? Math.round(sub * k.pct / 100) : k.amt); used = c; }
  return { rows, sub, discount, total: sub - discount, code: used };
}
app.post('/api/promo', rateLimit({ windowMs: 6e4, limit: 40, standardHeaders: true, legacyHeaders: false }), (q, r, n) => {
  try { const c = calc(q.body?.items, q.body?.code); r.json({ subtotal: c.sub, discount: c.discount, total: c.total }); } catch (e) { n(e); }
});
app.post('/api/orders', orderLimiter, CAUTH, (req, res, next) => {
  try {
    const b = req.body || {}, name = clean(b.name, 80), address = clean(b.address, 400), phone = latin(b.phone), pay = b.pay === 'card' ? 'card' : 'cod';
    if (name.length < 3 || address.length < 8 || !/^09\d{9}$/.test(phone)) throw new UErr('نام، شماره موبایل (۰۹…) یا آدرس معتبر نیست');
    const result = db.transaction(() => {
      const c = calc(b.items, b.code);
      const o = db.prepare('INSERT INTO orders(name,phone,address,total,pay,status,created,user_id,code,discount) VALUES(?,?,?,?,?,?,?,?,?,?)').run(name, phone, address, c.total, pay, 'pending', Date.now(), req.cu.id, c.code, c.discount);
      for (const [p, qty] of c.rows) {
        db.prepare('INSERT INTO order_items(order_id,product_id,name,price,qty) VALUES(?,?,?,?,?)').run(o.lastInsertRowid, p.id, p.name, p.price, qty);
        db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(qty, p.id);
      }
      return { id: o.lastInsertRowid, total: c.total, discount: c.discount };
    })();
    log('OK', `order #${result.id} total ${result.total}`);
    res.json({ ...result, card: pay === 'card' ? (process.env.CARD_NUMBER || '') : '' });
  } catch (e) { next(e); }
});

// ---------- customers ----------
const custLimiter = rateLimit({ windowMs: 15 * 60e3, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'تلاش بیش از حد؛ کمی بعد دوباره امتحان کنید' } });
const setC = (req, res, c) => res.cookie('ctok', jwt.sign({ id: c.id, u: c.username, t: 'c' }, SECRET, { expiresIn: '30d' }), { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: 30 * 864e5 });
app.post('/api/c/register', custLimiter, (req, res) => {
  const b = req.body || {}, u = String(b.username || '').trim().toLowerCase(), p = String(b.password || ''), ph = latin(b.phone);
  if (!/^[a-z0-9_]{3,20}$/.test(u) || p.length < 6 || p.length > 100) throw new UErr('نام کاربری ۳ تا ۲۰ حرف انگلیسی و رمز حداقل ۶ حرف باشد');
  if (!/^09\d{9}$/.test(ph)) throw new UErr('شماره موبایل معتبر نیست');
  if (db.prepare('SELECT 1 FROM customers WHERE username=?').get(u)) throw new UErr('این نام کاربری قبلاً گرفته شده');
  const i = db.prepare('INSERT INTO customers(username,hash,phone,created) VALUES(?,?,?,?)').run(u, bcrypt.hashSync(p, 10), ph, Date.now());
  setC(req, res, { id: i.lastInsertRowid, username: u }); log('INFO', 'customer registered ' + u); res.json({ username: u, phone: ph });
});
app.post('/api/c/login', custLimiter, (req, res) => {
  const u = String(req.body?.username || '').trim().toLowerCase(), c = db.prepare('SELECT * FROM customers WHERE username=?').get(u);
  if (!c || !bcrypt.compareSync(String(req.body?.password || ''), c.hash)) return res.status(401).json({ error: 'نام کاربری یا رمز اشتباه است' });
  setC(req, res, c); res.json({ username: c.username, phone: c.phone });
});
app.post('/api/c/logout', (q, r) => { r.clearCookie('ctok'); r.json({ ok: true }); });
app.get('/api/c/me', CAUTH, (q, r) => { const c = db.prepare('SELECT username,phone FROM customers WHERE id=?').get(q.cu.id); c ? r.json(c) : r.status(401).json({ error: 'unauthorized' }); });
app.get('/api/c/orders', CAUTH, (q, r) => r.json(db.prepare("SELECT o.id,o.total,o.status,o.created,o.code,(SELECT group_concat(name||' ×'||qty,'، ') FROM order_items WHERE order_id=o.id) AS items FROM orders o WHERE o.user_id=? ORDER BY o.id DESC LIMIT 50").all(q.cu.id)));

// ---------- reviews ----------
app.get('/api/products/:id/reviews', (q, r) => r.json(db.prepare('SELECT username,stars,text,created FROM reviews WHERE product_id=? ORDER BY created DESC LIMIT 50').all(+q.params.id)));
app.post('/api/products/:id/reviews', rateLimit({ windowMs: 6e4, limit: 10, standardHeaders: true, legacyHeaders: false }), CAUTH, (q, r) => {
  const st = Math.round(+q.body?.stars), t = clean(q.body?.text, 300), id = +q.params.id;
  if (!(st >= 1 && st <= 5) || t.length < 3) throw new UErr('امتیاز ۱ تا ۵ و متن نظر (حداقل ۳ حرف) لازم است');
  if (!db.prepare('SELECT 1 FROM products WHERE id=? AND active=1').get(id)) throw new UErr('محصول پیدا نشد');
  db.prepare('INSERT INTO reviews(product_id,user_id,username,stars,text,created) VALUES(?,?,?,?,?,?) ON CONFLICT(product_id,user_id) DO UPDATE SET stars=excluded.stars,text=excluded.text,created=excluded.created').run(id, q.cu.id, q.cu.u, st, t, Date.now());
  r.json({ ok: true });
});

// ---------- auth ----------
const auth = (q, r, n) => { try { q.user = jwt.verify(q.cookies.tok || '', SECRET); if (q.user.t !== 'a') throw 0; n(); } catch { r.status(401).json({ error: 'unauthorized' }); } };
const loginLimiter = rateLimit({ windowMs: 15 * 60e3, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'تلاش بیش از حد؛ ۱۵ دقیقه بعد دوباره امتحان کنید' } });
app.post('/api/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(String(username || ''));
  if (!u || !bcrypt.compareSync(String(password || ''), u.hash)) { log('WARN', `failed login "${clean(username, 30)}" ip ${req.ip}`); return res.status(401).json({ error: 'نام کاربری یا رمز اشتباه است' }); }
  res.cookie('tok', jwt.sign({ id: u.id, u: u.username, t: 'a' }, SECRET, { expiresIn: '8h' }), { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: 8 * 3600e3 });
  log('OK', `admin login ${u.username}`); res.json({ ok: true });
});
app.post('/api/logout', (q, r) => { r.clearCookie('tok'); r.json({ ok: true }); });
app.get('/api/me', auth, (q, r) => r.json({ ok: true, user: q.user.u }));

// ---------- admin API ----------
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const upload = multer({
  storage: multer.diskStorage({ destination: UP, filename: (q, f, cb) => cb(null, crypto.randomBytes(12).toString('hex') + EXT[f.mimetype]) }),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (q, f, cb) => cb(EXT[f.mimetype] ? null : new UErr('فقط تصویر JPG/PNG/WebP مجاز است'), !!EXT[f.mimetype]) });
app.post('/api/admin/upload', auth, upload.single('image'), (q, r) => { if (!q.file) throw new UErr('فایلی ارسال نشد'); r.json({ url: '/uploads/' + q.file.filename }); });

function prodVal(b) {
  const name = clean(b.name, 100), price = Math.round(+b.price), discount = Math.round(+b.discount || 0), category = Math.round(+b.category || 1);
  const stock = b.stock === '' || b.stock == null ? 50 : Math.round(+b.stock), emoji = clean(b.emoji, 8) || '📦', image = String(b.image || '');
  if (name.length < 2) throw new UErr('نام محصول کوتاه است');
  if (!(price >= 1000 && price <= 1e10)) throw new UErr('قیمت نامعتبر است');
  if (!(discount >= 0 && discount <= 90)) throw new UErr('تخفیف باید بین ۰ تا ۹۰ باشد');
  if (!(stock >= 0 && stock <= 1e5)) throw new UErr('موجودی نامعتبر است');
  if (!(category >= 1 && category <= 5)) throw new UErr('دسته‌بندی نامعتبر است');
  if (image && !/^\/uploads\/[a-f0-9]{24}\.(jpg|png|webp)$/.test(image)) throw new UErr('تصویر نامعتبر است');
  return { name, price, discount, stock, emoji, image, category };
}
app.get('/api/admin/products', auth, (q, r) => r.json(db.prepare('SELECT id,name,emoji,price,discount,image,stock,category,icon FROM products WHERE active=1 ORDER BY id DESC').all()));
app.post('/api/admin/products', auth, (q, r) => {
  const v = prodVal(q.body || {});
  const i = db.prepare('INSERT INTO products(name,emoji,price,discount,gradient,image,stock,category,icon) VALUES(?,?,?,?,?,?,?,?,12)').run(v.name, v.emoji, v.price, v.discount, GR[Math.floor(Math.random() * GR.length)], v.image, v.stock, v.category);
  log('INFO', `product added #${i.lastInsertRowid}`); r.json({ id: i.lastInsertRowid });
});
app.put('/api/admin/products/:id', auth, (q, r) => {
  const v = prodVal(q.body || {});
  db.prepare("UPDATE products SET name=?,emoji=?,price=?,discount=?,image=COALESCE(NULLIF(?,''),image),stock=?,category=? WHERE id=? AND active=1").run(v.name, v.emoji, v.price, v.discount, v.image, v.stock, v.category, +q.params.id);
  log('INFO', `product edited #${+q.params.id}`); r.json({ ok: true });
});
app.delete('/api/admin/products/:id', auth, (q, r) => { db.prepare('UPDATE products SET active=0 WHERE id=?').run(+q.params.id); log('INFO', `product removed #${+q.params.id}`); r.json({ ok: true }); });

app.get('/api/admin/stats', auth, (q, r) => {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0); const day = 864e5, start = d0.getTime();
  const sum = db.prepare("SELECT COALESCE(SUM(total),0) s, COUNT(*) c FROM orders WHERE created>=? AND created<? AND status!='canceled'");
  const today = sum.get(start, start + day), series = [];
  for (let i = 13; i >= 0; i--) series.push(sum.get(start - i * day, start - i * day + day).s);
  r.json({ sales: today.s, orders: today.c, pending: db.prepare("SELECT COUNT(*) c FROM orders WHERE status='pending'").get().c, online: online(), customers: db.prepare('SELECT COUNT(*) c FROM customers').get().c, series });
});
app.get('/api/admin/orders', auth, (q, r) => r.json(db.prepare("SELECT o.id,o.name,o.phone,o.address,o.total,o.pay,o.status,o.created,o.code,o.discount,(SELECT group_concat(name||' ×'||qty,'، ') FROM order_items WHERE order_id=o.id) AS items FROM orders o ORDER BY o.id DESC LIMIT 100").all()));
app.get('/api/admin/orders.csv', auth, (q, r) => {                // opens directly in Excel (UTF-8 BOM); formula-injection guarded
  const rows = db.prepare("SELECT o.id,o.created,o.name,o.phone,o.address,(SELECT group_concat(name||' ×'||qty,' | ') FROM order_items WHERE order_id=o.id) AS items,o.total,o.discount,o.code,o.pay,o.status FROM orders o ORDER BY o.id DESC").all();
  const SL = { pending: 'در انتظار', shipped: 'ارسال شد', done: 'تحویل شد', canceled: 'لغو شد' };
  const cell = v => { let s = String(v ?? '').replace(/"/g, '""'); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s}"`; };
  const head = ['شماره', 'تاریخ', 'مشتری', 'موبایل', 'آدرس', 'محصولات', 'مبلغ (تومان)', 'تخفیف', 'کد تخفیف', 'پرداخت', 'وضعیت'];
  const body = rows.map(o => [o.id, new Date(o.created).toLocaleString('fa-IR'), o.name, o.phone, o.address, o.items, o.total, o.discount, o.code, o.pay === 'card' ? 'کارت‌به‌کارت' : 'پرداخت در محل', SL[o.status] || o.status]);
  r.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="amirkala-orders.csv"' });
  r.send('\ufeff' + [head, ...body].map(a => a.map(cell).join(',')).join('\r\n'));
});
app.get('/api/admin/codes', auth, (q, r) => r.json(db.prepare('SELECT code,pct,amt FROM codes WHERE active=1 ORDER BY created DESC').all()));
app.post('/api/admin/codes', auth, (q, r) => {
  const c = String(q.body?.code || '').trim().toUpperCase(), p = Math.round(+q.body?.pct);
  if (!/^[A-Z0-9]{3,12}$/.test(c) || !(p >= 1 && p <= 90)) throw new UErr('کد ۳ تا ۱۲ حرف/عدد انگلیسی و درصد بین ۱ تا ۹۰ باشد');
  db.prepare('INSERT INTO codes(code,pct,amt,active,created) VALUES(?,?,0,1,?) ON CONFLICT(code) DO UPDATE SET pct=excluded.pct,amt=0,active=1').run(c, p, Date.now()); r.json({ ok: true });
});
app.delete('/api/admin/codes/:code', auth, (q, r) => { db.prepare('UPDATE codes SET active=0 WHERE code=?').run(String(q.params.code).toUpperCase()); r.json({ ok: true }); });
app.patch('/api/admin/orders/:id', auth, (q, r) => {
  const st = String(q.body?.status), o = db.prepare('SELECT * FROM orders WHERE id=?').get(+q.params.id);
  if (!ST.includes(st)) throw new UErr('وضعیت نامعتبر است'); if (!o) throw new UErr('سفارش پیدا نشد');
  if (o.status === 'canceled') throw new UErr('سفارش لغو شده قابل تغییر نیست');
  db.transaction(() => {
    if (st === 'canceled') for (const i of db.prepare('SELECT * FROM order_items WHERE order_id=?').all(o.id)) db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(i.qty, i.product_id);
    db.prepare('UPDATE orders SET status=? WHERE id=?').run(st, o.id);
  })();
  log('INFO', `order #${o.id} -> ${st}`); r.json({ ok: true });
});
app.get('/api/admin/logs', auth, (q, r) => {
  const after = +q.query.after || 0;
  r.json(after ? db.prepare('SELECT * FROM logs WHERE id>? ORDER BY id LIMIT 100').all(after) : db.prepare('SELECT * FROM (SELECT * FROM logs ORDER BY id DESC LIMIT 40) ORDER BY id').all());
});

// ---------- static + errors ----------
app.use('/uploads', express.static(UP, { maxAge: '7d', index: false, setHeaders: r => r.setHeader('X-Content-Type-Options', 'nosniff') }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
app.use('/api', (q, r) => r.status(404).json({ error: 'not found' }));
app.use((e, q, r, n) => {
  if (e instanceof UErr) return r.status(400).json({ error: e.message });
  if (e.code === 'LIMIT_FILE_SIZE') return r.status(400).json({ error: 'حجم فایل بیش از ۳ مگابایت است' });
  if (e.status && e.status < 500) return r.status(e.status).json({ error: 'درخواست نامعتبر' });
  log('ERROR', e.message); r.status(500).json({ error: 'خطای داخلی سرور' });
});

// ---------- daily backup (keeps 7) ----------
function backup() {
  const dir = path.join(DATA, 'backups'); fs.mkdirSync(dir, { recursive: true });
  db.backup(path.join(dir, `shop-${new Date().toISOString().slice(0, 10)}.db`))
    .then(() => { fs.readdirSync(dir).sort().slice(0, -7).forEach(f => fs.unlinkSync(path.join(dir, f))); log('OK', 'backup completed'); })
    .catch(e => log('ERROR', 'backup failed: ' + e.message));
}
setTimeout(backup, 5000); setInterval(backup, 864e5);

app.listen(PORT, HOST, () => log('OK', `AmirKala listening on ${HOST}:${PORT}`));
