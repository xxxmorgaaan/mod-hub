// server.js
require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const compression = require('compression');
const { startAutoApproveSweep } = require('./src/auto-approve');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------- view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ---------------------------------------------------------------- security & parsing
app.use(helmet({
  contentSecurityPolicy: false, // включите и настройте под свой домен перед продакшеном
}));
app.use(compression()); // gzip на HTML/CSS/JS/JSON-ответы — заметно ускоряет каталог на телефоне
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-me-to-a-long-random-string',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 12 },
}));

app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads'), {
  maxAge: '30d', // обложки/скриншоты/архивы не перезаписываются на месте — новый файл всегда новое имя
}));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h', // css/js/картинки конструктора правятся редко, но имя файла не версионируется — час за глаза
}));

// ---------------------------------------------------------------- locals для всех шаблонов
app.use((req, res, next) => {
  res.locals.siteAuthorName = process.env.SITE_AUTHOR_NAME || 'МОРГАН';
  res.locals.siteAuthorTelegram = process.env.SITE_AUTHOR_TELEGRAM || '@Xxmorgaan';
  res.locals.gameDevTelegram = process.env.GAME_DEV_TELEGRAM || '@alemcolony';
  res.locals.modBuilderUrl = process.env.MOD_BUILDER_URL || '/builder/';
  res.locals.admin = (req.session && req.session.admin) || null;
  res.locals.user = (req.session && req.session.user) || null;
  res.locals.bugsEnabled = process.env.BUGS_ENABLED === 'true';
  next();
});

// ---------------------------------------------------------------- роуты
app.use('/', require('./routes/pages'));
app.use('/', require('./routes/bundles'));
app.use('/', require('./routes/complaints'));
app.use('/bugs', require('./routes/bugs'));
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/admin'));

// ---------------------------------------------------------------- 404
app.use((req, res) => {
  res.status(404).render('404', { title: 'Страница не найдена' });
});

// ---------------------------------------------------------------- healthcheck / keep-alive
// Лёгкий эндпоинт для внешнего пинга (UptimeRobot, cron-job.org — надёжнее)
// и для встроенного самопинга ниже (подстраховка, чтобы Railway не считал
// сервис неактивным на бесплатных/спящих планах).
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ---------------------------------------------------------------- обработка ошибок
// Общий перехватчик: что бы ни упало (даже неожиданно) — обычный игрок
// видит спокойную страницу, а не стек вызовов с путями к файлам и кодом.
// Технические подробности уходят только в серверный лог (Railway → Logs),
// туда игрок не заглядывает. Должен идти последним — после всех роутов.
app.use((err, req, res, next) => {
  console.error('[error]', req.method, req.originalUrl, '—', err.message);
  if (res.headersSent) return next(err);
  res.status(err.status || 500);
  res.render('500', { title: 'Что-то пошло не так' });
});

app.listen(PORT, () => {
  console.log(`Alem Mod запущен: http://localhost:${PORT}`);

  startAutoApproveSweep();

  const publicUrl = process.env.PUBLIC_URL;
  if (publicUrl) {
    const pingUrl = `${publicUrl.replace(/\/+$/, '')}/healthz`;
    const intervalMs = 4 * 60 * 1000; // раз в 4 минуты — с запасом от типичных 5-минутных таймаутов сна
    setInterval(() => {
      fetch(pingUrl).catch(() => { /* сеть могла моргнуть — просто попробуем в следующий раз */ });
    }, intervalMs);
    console.log(`[keep-alive] Самопинг включён: ${pingUrl} каждые ${intervalMs / 60000} мин.`);
  } else {
    console.log('[keep-alive] PUBLIC_URL не задан — самопинг выключен. '
      + 'Надёжнее всего добавить внешний пинг на /healthz (UptimeRobot, cron-job.org) независимо от этого.');
  }
});
