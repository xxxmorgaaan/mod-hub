// routes/admin.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const db = require('../src/db');
const { requireAdmin, requireOwner } = require('../src/auth');
const { toCsv, humanSize } = require('../src/helpers');

const router = express.Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false,
  message: 'Слишком много попыток входа. Подождите немного.' });

// ---------------------------------------------------------------- вход/выход
router.get('/admin.html', (req, res) => {
  if (req.session.admin) return res.redirect('/admin/moderation');
  res.render('admin/login', { title: 'Вход в админку', error: null });
});
router.get('/admin', (req, res) => res.redirect('/admin.html'));

router.post('/admin/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get((username || '').trim());
  if (!admin || !bcrypt.compareSync(password || '', admin.password_hash)) {
    return res.status(401).render('admin/login', { title: 'Вход в админку', error: 'Неверный логин или пароль.' });
  }
  req.session.admin = { id: admin.id, username: admin.username, role: admin.role };
  res.redirect('/admin/moderation');
});

router.post('/admin/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin.html'));
});

router.use('/admin', requireAdmin);

// ---------------------------------------------------------------- модерация (главная вкладка)
router.get('/admin/moderation', (req, res) => {
  const pendingMods = db.prepare(`SELECT * FROM mods WHERE status = 'pending' ORDER BY created_at`).all()
    .map(m => {
      const firstVersion = db.prepare('SELECT scan_note FROM mod_versions WHERE mod_id = ? ORDER BY id LIMIT 1').get(m.id);
      return { ...m, scan_note: firstVersion ? firstVersion.scan_note : null };
    });
  const pendingVersions = db.prepare(
    `SELECT v.*, m.name mod_name, m.id mod_id FROM mod_versions v JOIN mods m ON m.id = v.mod_id
     WHERE v.status = 'pending' AND m.status = 'approved' ORDER BY v.created_at`
  ).all();
  const pendingBundles = db.prepare(`SELECT * FROM bundles WHERE status = 'pending' ORDER BY created_at`).all();
  res.render('admin/moderation', { title: 'Модерация', pendingMods, pendingVersions, pendingBundles, humanSize });
});

router.post('/admin/mods/:id/approve', (req, res) => {
  db.prepare(`UPDATE mods SET status = 'approved', moderation_note = NULL WHERE id = ?`).run(req.params.id);
  db.prepare(`UPDATE mod_versions SET status = 'approved' WHERE mod_id = ? AND status = 'pending'`).run(req.params.id);
  res.redirect('back');
});
router.post('/admin/mods/:id/reject', (req, res) => {
  db.prepare(`UPDATE mods SET status = 'rejected', moderation_note = ? WHERE id = ?`).run((req.body.note || '').trim(), req.params.id);
  res.redirect('back');
});
router.post('/admin/mod-versions/:id/approve', (req, res) => {
  db.prepare(`UPDATE mod_versions SET status = 'approved' WHERE id = ?`).run(req.params.id);
  res.redirect('back');
});
router.post('/admin/mod-versions/:id/reject', (req, res) => {
  db.prepare(`UPDATE mod_versions SET status = 'rejected' WHERE id = ?`).run(req.params.id);
  res.redirect('back');
});
router.post('/admin/bundles/:id/approve', (req, res) => {
  db.prepare(`UPDATE bundles SET status = 'approved', moderation_note = NULL WHERE public_id = ?`).run(req.params.id);
  res.redirect('back');
});
router.post('/admin/bundles/:id/reject', (req, res) => {
  db.prepare(`UPDATE bundles SET status = 'rejected', moderation_note = ? WHERE public_id = ?`).run((req.body.note || '').trim(), req.params.id);
  res.redirect('back');
});

// ---------------------------------------------------------------- таблица модов
router.get('/admin/mods', (req, res) => {
  const mods = db.prepare(`SELECT * FROM mods ORDER BY created_at DESC`).all();
  res.render('admin/mods', { title: 'Все моды', mods });
});
router.get('/admin/mods/export.csv', (req, res) => {
  const mods = db.prepare(`SELECT id, name, status, downloads, likes, created_at FROM mods ORDER BY created_at DESC`).all();
  const csv = toCsv(mods, [
    { key: 'id', label: 'id' }, { key: 'name', label: 'Название' }, { key: 'status', label: 'Статус' },
    { key: 'downloads', label: 'Скачиваний' }, { key: 'likes', label: 'Лайков' }, { key: 'created_at', label: 'Создан' },
  ]);
  res.header('Content-Type', 'text/csv; charset=utf-8').attachment('mods.csv').send('\uFEFF' + csv);
});
router.post('/admin/mods/:id/visibility', (req, res) => {
  const mod = db.prepare('SELECT * FROM mods WHERE id = ?').get(req.params.id);
  if (mod) {
    const next = mod.status === 'hidden' ? 'approved' : 'hidden';
    db.prepare('UPDATE mods SET status = ? WHERE id = ?').run(next, mod.id);
  }
  res.redirect('back');
});
router.post('/admin/mods/:id/delete', (req, res) => {
  db.prepare('DELETE FROM mods WHERE id = ?').run(req.params.id);
  res.redirect('back');
});

// ---------------------------------------------------------------- таблица сборок
router.get('/admin/bundles', (req, res) => {
  const bundles = db.prepare(`SELECT * FROM bundles ORDER BY created_at DESC`).all();
  res.render('admin/bundles', { title: 'Все сборки', bundles });
});
router.get('/admin/bundles/export.csv', (req, res) => {
  const bundles = db.prepare(`SELECT public_id, name, status, likes, created_at FROM bundles ORDER BY created_at DESC`).all();
  const csv = toCsv(bundles, [
    { key: 'public_id', label: 'id' }, { key: 'name', label: 'Название' }, { key: 'status', label: 'Статус' },
    { key: 'likes', label: 'Лайков' }, { key: 'created_at', label: 'Создана' },
  ]);
  res.header('Content-Type', 'text/csv; charset=utf-8').attachment('bundles.csv').send('\uFEFF' + csv);
});
router.post('/admin/bundles/:id/visibility', (req, res) => {
  const bundle = db.prepare('SELECT * FROM bundles WHERE public_id = ?').get(req.params.id);
  if (bundle) {
    const next = bundle.status === 'hidden' ? 'approved' : 'hidden';
    db.prepare('UPDATE bundles SET status = ? WHERE public_id = ?').run(next, bundle.public_id);
  }
  res.redirect('back');
});
router.post('/admin/bundles/:id/delete', (req, res) => {
  db.prepare('DELETE FROM bundles WHERE public_id = ?').run(req.params.id);
  res.redirect('back');
});

// ---------------------------------------------------------------- жалобы
router.get('/admin/complaints', (req, res) => {
  const complaints = db.prepare(`SELECT * FROM complaints ORDER BY (status = 'open') DESC, updated_at DESC`).all().map(c => {
    const last = db.prepare('SELECT body, sender FROM complaint_messages WHERE complaint_id = ? ORDER BY id DESC LIMIT 1').get(c.id);
    const target = c.target_type === 'mod'
      ? db.prepare('SELECT id, name FROM mods WHERE id = ?').get(c.target_id)
      : db.prepare('SELECT public_id id, name FROM bundles WHERE public_id = ?').get(c.target_id);
    return { ...c, lastMessage: last, target };
  });
  const openId = req.query.open ? Number(req.query.open) : (complaints[0] ? complaints[0].id : null);
  const openMessages = openId ? db.prepare('SELECT sender, body, created_at FROM complaint_messages WHERE complaint_id = ? ORDER BY id').all(openId) : [];
  res.render('admin/complaints', { title: 'Жалобы', complaints, openId, openMessages });
});
router.get('/admin/complaints/:id/messages', (req, res) => {
  const messages = db.prepare('SELECT sender, body, created_at FROM complaint_messages WHERE complaint_id = ? ORDER BY id').all(req.params.id);
  res.json({ messages });
});
router.post('/admin/complaints/:id/reply', (req, res) => {
  const body = (req.body.body || '').trim();
  if (body) {
    db.prepare('INSERT INTO complaint_messages (complaint_id, sender, body) VALUES (?, \'admin\', ?)').run(req.params.id, body);
    db.prepare('UPDATE complaints SET updated_at = datetime(\'now\') WHERE id = ?').run(req.params.id);
  }
  res.redirect(`/admin/complaints?open=${req.params.id}`);
});
router.post('/admin/complaints/:id/resolve', (req, res) => {
  db.prepare(`UPDATE complaints SET status = 'resolved' WHERE id = ?`).run(req.params.id);
  res.redirect('/admin/complaints');
});
router.post('/admin/complaints/:id/delete-target', (req, res) => {
  const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(req.params.id);
  if (complaint) {
    if (complaint.target_type === 'mod') db.prepare('DELETE FROM mods WHERE id = ?').run(complaint.target_id);
    else db.prepare('DELETE FROM bundles WHERE public_id = ?').run(complaint.target_id);
    db.prepare(`UPDATE complaints SET status = 'resolved' WHERE id = ?`).run(complaint.id);
  }
  res.redirect('/admin/complaints');
});

// ---------------------------------------------------------------- админы (только владелец)
router.get('/admin/admins', requireOwner, (req, res) => {
  const admins = db.prepare('SELECT id, username, role, created_at FROM admins ORDER BY created_at').all();
  res.render('admin/admins', { title: 'Админы', admins });
});
router.post('/admin/admins', requireOwner, (req, res) => {
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';
  if (username && password.length >= 6) {
    db.prepare('INSERT INTO admins (username, password_hash, role) VALUES (?, ?, \'moderator\')')
      .run(username, bcrypt.hashSync(password, 10));
  }
  res.redirect('/admin/admins');
});
router.post('/admin/admins/:id/reset-password', requireOwner, (req, res) => {
  const password = req.body.password || '';
  if (password.length >= 6) {
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), req.params.id);
  }
  res.redirect('/admin/admins');
});
router.post('/admin/admins/:id/delete', requireOwner, (req, res) => {
  const target = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.params.id);
  if (target && target.role !== 'owner') db.prepare('DELETE FROM admins WHERE id = ?').run(req.params.id);
  res.redirect('/admin/admins');
});

// ---------------------------------------------------------------- настройки (свой пароль)
router.get('/admin/settings', (req, res) => {
  res.render('admin/settings', { title: 'Настройки', saved: !!req.query.saved, error: null });
});
router.post('/admin/settings/password', (req, res) => {
  const { current_password, new_password } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.session.admin.id);
  if (!bcrypt.compareSync(current_password || '', admin.password_hash)) {
    return res.render('admin/settings', { title: 'Настройки', saved: false, error: 'Текущий пароль неверный.' });
  }
  if (!new_password || new_password.length < 6) {
    return res.render('admin/settings', { title: 'Настройки', saved: false, error: 'Новый пароль — минимум 6 символов.' });
  }
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(new_password, 10), admin.id);
  res.redirect('/admin/settings?saved=1');
});

module.exports = router;
