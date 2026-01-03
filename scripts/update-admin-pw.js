const bcrypt = require('bcryptjs');
const db = require('../src/db');

const email = 'roblouie47@gmail.com';
const password = 'Nicolas12';

const hash = bcrypt.hashSync(password, 12);
db.prepare('UPDATE users SET passwordHash = ? WHERE email = ?').run(hash, email);
console.log('Password updated for', email);
