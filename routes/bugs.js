// routes/bugs.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../src/db');
const { getVoterToken } = require('../src/helpers');
const { uploadBugScreens } = require('../src/upload');

const router = express.Router();

// Раздел выключен по умолчанию (готов, но ещё не объявлен) — поставьте
// BUGS_ENABLED=true в переменных окружения, когда будете готовы его открыть.
// Пока выключено, все /bugs-адреса отвечают 404, как будто их не существует.
router.use((req, res, next) => {
  if (process.env.BUGS_ENABLED === 'true') return next();
  return res.status(404).render('404', { title: 'Страница не найдена' });
});

const createLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false,
  message: 'Слишком много баг-репортов за час. Попробуйте позже.' });
const writeLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

function screenshotsFor(bugId) {
  return db.prepare('SELECT * FROM bug_screenshots WHERE bug_id = ? ORDER BY position').all(bugId);
}
function commentsCountFor(bugId) {
  return db.prepare('SELECT COUNT(*) c FROM bug_comments WHERE bug_id = ?').get(bugId).c;
}

router.get('/bugs', (req, res) => {
  const status = ['open', 'in_progress', 'resolved', 'wontfix'].includes(req.query.status) ? req.query.status : '';
  const sort = req.query.sort === 'votes' ? 'votes DESC, created_at DESC' : 'created_at DESC';
  let sql = 'SELECT * FROM bug_reports';
  const params = [];
  if (status) { sql += ' WHERE status = ?'; params.push(status); }
  sql += ` ORDER BY ${sort}`;
  const bugs = db.prepare(sql).all(...params).map(b => ({
    ...b, screenshotCount: screenshotsFor(b.id).length, commentCount: commentsCountFor(b.id),
  }));
  const counts = db.prepare('SELECT status, COUNT(*) c FROM bug_reports GROUP BY status').all()
    .reduce((acc, r) => { acc[r.status] = r.c; return acc; }, {});
  res.render('bugs', { title: 'Баг-репорты', bugs, status, sort: req.query.sort || 'new', counts });
});

router.get('/bugs/new', (req, res) => {
  res.render('bug-form', { title: 'Сообщить о баге', error: null });
});

router.post('/bugs', createLimiter, uploadBugScreens.array('screenshots', 5), (req, res) => {
  const title = (req.body.title || '').trim();
  const description = (req.body.description || '').trim();
  const reporterName = (req.body.reporter_name || 'Гость').trim().slice(0, 40);

  if (!title) {
    return res.status(400).render('bug-form', { title: 'Сообщить о баге', error: 'Опишите хотя бы заголовок — что сломалось.' });
  }

  const info = db.prepare(`INSERT INTO bug_reports (title, description, reporter_name, status) VALUES (?, ?, ?, 'open')`)
    .run(title, description, reporterName);
  const insShot = db.prepare('INSERT INTO bug_screenshots (bug_id, path, position) VALUES (?, ?, ?)');
  (req.files || []).forEach((f, i) => insShot.run(info.lastInsertRowid, `/uploads/bugs/${f.filename}`, i));

  res.redirect(`/bugs/${info.lastInsertRowid}`);
});

router.get('/bugs/:id', (req, res) => {
  const bug = db.prepare('SELECT * FROM bug_reports WHERE id = ?').get(req.params.id);
  if (!bug) return res.status(404).render('404', { title: 'Баг-репорт не найден' });
  const screenshots = screenshotsFor(bug.id);
  const comments = db.prepare('SELECT * FROM bug_comments WHERE bug_id = ? ORDER BY created_at').all(bug.id);
  const voter = getVoterToken(req, res);
  const voted = !!db.prepare('SELECT 1 FROM bug_votes WHERE bug_id = ? AND voter_token = ?').get(bug.id, voter);
  res.render('bug-detail', { title: bug.title, bug, screenshots, comments, voted });
});

router.post('/bugs/:id/vote', writeLimiter, (req, res) => {
  const bug = db.prepare('SELECT * FROM bug_reports WHERE id = ?').get(req.params.id);
  if (!bug) return res.status(404).json({ error: 'not found' });
  const voter = getVoterToken(req, res);
  const existing = db.prepare('SELECT 1 FROM bug_votes WHERE bug_id = ? AND voter_token = ?').get(bug.id, voter);
  if (existing) {
    db.prepare('DELETE FROM bug_votes WHERE bug_id = ? AND voter_token = ?').run(bug.id, voter);
    db.prepare('UPDATE bug_reports SET votes = MAX(0, votes - 1) WHERE id = ?').run(bug.id);
  } else {
    db.prepare('INSERT INTO bug_votes (bug_id, voter_token) VALUES (?, ?)').run(bug.id, voter);
    db.prepare('UPDATE bug_reports SET votes = votes + 1 WHERE id = ?').run(bug.id);
  }
  const fresh = db.prepare('SELECT votes FROM bug_reports WHERE id = ?').get(bug.id);
  res.json({ votes: fresh.votes, voted: !existing });
});

router.post('/bugs/:id/comments', writeLimiter, (req, res) => {
  const bug = db.prepare('SELECT * FROM bug_reports WHERE id = ?').get(req.params.id);
  if (!bug) return res.status(404).send('not found');
  const authorName = (req.body.author_name || 'Гость').trim().slice(0, 40);
  const body = (req.body.body || '').trim().slice(0, 2000);
  if (body) {
    db.prepare('INSERT INTO bug_comments (bug_id, author_name, body) VALUES (?, ?, ?)').run(bug.id, authorName, body);
    db.prepare(`UPDATE bug_reports SET updated_at = datetime('now') WHERE id = ?`).run(bug.id);
  }
  res.redirect(`/bugs/${bug.id}`);
});

module.exports = router;
