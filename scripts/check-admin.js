const db = require('../src/db');
const bcrypt = require('bcryptjs');
const email = 'roblouie47@gmail.com';

const row = db.prepare('SELECT email, passwordHash FROM users WHERE email = ?').get(email);
if (!row) {
  console.error('No user found');
  process.exit(1);
}
console.log(row);
console.log('match Nicolas12?', bcrypt.compareSync('Nicolas12', row.passwordHash));
console.log('match Nicolas12!?', bcrypt.compareSync('Nicolas12!?', row.passwordHash));
