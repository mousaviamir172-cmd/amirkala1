// usage: npm run passwd -- USERNAME NEWPASSWORD   (min 10 chars)
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const [, , user, pass] = process.argv;
if (!user || !pass || pass.length < 10) { console.log('usage: npm run passwd -- USER NEWPASSWORD (min 10 chars)'); process.exit(1); }
const db = new Database(path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'shop.db'));
const h = bcrypt.hashSync(pass, 12);
const r = db.prepare('UPDATE users SET hash=? WHERE username=?').run(h, user);
if (!r.changes) db.prepare('INSERT INTO users(username,hash) VALUES(?,?)').run(user, h);
console.log('password updated for', user);
