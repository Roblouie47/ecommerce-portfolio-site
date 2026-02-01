// scripts/delete-user.js
// Deletes a user and their sessions from the database by email

const path = require('path');
const db = require(path.resolve(__dirname, '../src/db'));

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/delete-user.js <email>');
  process.exit(1);
}

let row;
try {
  row = db.prepare('SELECT id FROM users WHERE lower(email)=lower(?)').get(email);
} catch (e) {
  console.error('DB query failed:', e);
  process.exit(1);
}
if (!row) {
  console.log('User not found');
  process.exit(0);
}
try {
  db.prepare('DELETE FROM sessions WHERE userId=?').run(row.id);
  db.prepare('DELETE FROM users WHERE id=?').run(row.id);
  console.log('Deleted user and sessions for', email);
} catch (e) {
  console.error('Delete failed:', e);
  process.exit(1);
}
