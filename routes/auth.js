// routes/auth.js
// Необязательные аккаунты для авторов модов — альтернатива коду управления.
// Никак не пересекается с админкой (admins) — это отдельная, гораздо более
// простая система только для «я не хочу запоминать код».
const express = require('express');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const db = require('../src/db');
const { revealControlCode } = require('../src/helpers');
const { uploadAvatar } = require('../src/upload');

const router = express.Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  message: 'Слишком много попыток. Подождите немного.' });

router.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/account');
  res.render('register', { title: 'Регистрация', error: null });
});

router.post('/register', authLimiter, (req, res) => {
  const username = (req.body.username || '').trim();
  const password = (req.body.password || '').trim();
  const password2 = (req.body.password2 || '').trim();

  if (username.length < 3) {
    return res.status(400).render('register', { title: 'Регистрация', error: 'Логин — минимум 3 символа.' });
  }
  if (password.length < 6) {
    return res.status(400).render('register', { title: 'Регистрация', error: 'Пароль — минимум 6 символов.' });
  }
  if (password !== password2) {
    return res.status(400).render('register', { title: 'Регистрация', error: 'Пароли не совпадают.' });
  }
  const existing = db.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').get(username);
  if (existing) {
    return res.status(400).render('register', { title: 'Регистрация', error: 'Такой логин уже занят.' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
  req.session.user = { id: info.lastInsertRowid, username };
  res.redirect('/account');
});

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/account');
  res.render('login', { title: 'Вход', error: null });
});

router.post('/login', authLimiter, (req, res) => {
  const username = (req.body.username || '').trim();
  const password = (req.body.password || '').trim();
  const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).render('login', { title: 'Вход', error: 'Неверный логин или пароль.' });
  }
  req.session.user = { id: user.id, username: user.username };
  res.redirect('/account');
});

router.post('/logout', (req, res) => {
  delete req.session.user;
  res.redirect('/');
});

router.get('/account', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const mods = db.prepare('SELECT * FROM mods WHERE user_id = ? ORDER BY created_at DESC').all(req.session.user.id)
    .map(m => ({ ...m, controlCode: revealControlCode(m.control_code_hash) }));
  const bundles = db.prepare('SELECT * FROM bundles WHERE user_id = ? ORDER BY created_at DESC').all(req.session.user.id)
    .map(b => ({ ...b, controlCode: revealControlCode(b.control_code_hash) }));
  const me = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  res.render('account', { title: 'Личный кабинет', mods, bundles, me, saved: !!req.query.saved });
});

// Аватарка — необязательна: если не загружать, везде показывается кружок
// с первой буквой логина, так что «пустых» мест в интерфейсе не будет.
router.post('/account/avatar', authLimiter, uploadAvatar.single('avatar'), (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  if (req.file) {
    db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?')
      .run(`/uploads/avatars/${req.file.filename}`, req.session.user.id);
  }
  res.redirect('/account?saved=1');
});

router.post('/account/avatar/delete', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  db.prepare('UPDATE users SET avatar_path = NULL WHERE id = ?').run(req.session.user.id);
  res.redirect('/account?saved=1');
});

module.exports = router;
