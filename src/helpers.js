// src/helpers.js
const { nanoid } = require('nanoid');
const bcrypt = require('bcryptjs');

function slugify(str) {
  const translitMap = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
    и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
    с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh',
    щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  const translit = (str || '').toLowerCase().split('').map(c => translitMap[c] ?? c).join('');
  const base = translit.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'mod';
  return `${base}-${nanoid(5).toLowerCase()}`;
}

/** Код управления = <id записи>.<случайная часть>, так что проверка — O(1) по id,
 *  а bcrypt сравнивает только случайную часть (сам код нигде не хранится в открытом виде). */
function issueControlCode(recordId) {
  const secret = nanoid(14);
  const code = `${recordId}.${secret}`;
  const hash = bcrypt.hashSync(secret, 10);
  return { code, hash };
}

function verifyControlCode(code, hash) {
  if (!code || !code.includes('.')) return false;
  const secret = code.slice(code.indexOf('.') + 1);
  return bcrypt.compareSync(secret, hash);
}

function recordIdFromCode(code) {
  if (!code || !code.includes('.')) return null;
  return code.slice(0, code.indexOf('.'));
}

/** Анонимный «голосующий» токен для лайков — живёт в httpOnly cookie, не привязан к личности. */
function getVoterToken(req, res) {
  if (req.cookies && req.cookies.voter) return req.cookies.voter;
  const token = nanoid(24);
  res.cookie('voter', token, { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 365 * 2 });
  return token;
}

function toCsv(rows, columns) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map(c => esc(c.label)).join(',');
  const body = rows.map(r => columns.map(c => esc(r[c.key])).join(',')).join('\n');
  return `${header}\n${body}`;
}

function humanSize(bytes) {
  if (!bytes) return '0 КБ';
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  let i = 0; let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

module.exports = { slugify, issueControlCode, verifyControlCode, recordIdFromCode, getVoterToken, toCsv, humanSize };
