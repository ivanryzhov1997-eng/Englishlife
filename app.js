/* english_course_v1 — Этап 1: SPA, SRS (SM-2 light), прогресс, экспорт/импорт */
(function () {
  'use strict';

  const STORE = 'english_course_v1';
  const DATA = window.LESSONS_DATA;
  if (!DATA || !DATA.words) {
    console.error('lessons.ru.js не загружен');
    return;
  }

  const state = {
    streak: { current: 0, lastDate: null },
    today: { date: null, mins: 0, steps: {} },
    srs: {}, // wordId -> { ef, interval, due, reps, lapses }
    lessonDone: {},
    stats: { reviews: 0, points: 0, lessonsDone: 0, cardGrades: 0, listens: 0, speaks: 0 },
    achievements: {}
  };

  function addPoints(n, reason) {
    state.stats.points = (state.stats.points || 0) + n;
    save();
    if (reason) toast('+' + n + ' XP · ' + reason);
    checkAchievements();
  }

  const ACHIEVEMENTS = [
    { id: 'first_review', title: 'Первый повтор', desc: 'Закрой сессию SRS', test: function (s) { return (s.stats.reviews || 0) >= 1; } },
    { id: 'streak3', title: 'Серия 3', desc: '3 дня подряд', test: function (s) { return (s.streak.current || 0) >= 3; } },
    { id: 'streak7', title: 'Серия 7', desc: 'Неделя без пропуска', test: function (s) { return (s.streak.current || 0) >= 7; } },
    { id: 'words50', title: '50 повторов', desc: '50 оценок карточек', test: function (s) { return (s.stats.cardGrades || 0) >= 50; } },
    { id: 'lessons5', title: '5 уроков', desc: 'Пройди 5 уроков', test: function (s) { return (s.stats.lessonsDone || 0) >= 5; } },
    { id: 'lessons12', title: 'Все 12 уроков', desc: 'Закрой все уроки v1', test: function (s) { return (s.stats.lessonsDone || 0) >= 12; } },
    { id: 'points100', title: '100 очков', desc: 'Набери 100 XP', test: function (s) { return (s.stats.points || 0) >= 100; } },
    { id: 'listen10', title: 'Наслух', desc: '10 прослушиваний фраз', test: function (s) { return (s.stats.listens || 0) >= 10; } },
    { id: 'speak5', title: 'Вслух', desc: '5 speaking-заданий', test: function (s) { return (s.stats.speaks || 0) >= 5; } }
  ];

  function checkAchievements() {
    if (!state.achievements) state.achievements = {};
    ACHIEVEMENTS.forEach(function (a) {
      if (state.achievements[a.id]) return;
      try {
        if (a.test(state)) {
          state.achievements[a.id] = Date.now();
          save();
          toast('🏆 ' + a.title);
        }
      } catch (e) {}
    });
  }

  function speakText(text) {
    try {
      if (!window.speechSynthesis) {
        toast('Синтез речи недоступен', true);
        return;
      }
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 0.9;
      window.speechSynthesis.speak(u);
      state.stats.listens = (state.stats.listens || 0) + 1;
      save();
      checkAchievements();
    } catch (e) {
      toast('Не удалось озвучить', true);
    }
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.streak) state.streak = d.streak;
      if (d.today) state.today = d.today;
      if (d.srs) state.srs = d.srs;
      if (d.lessonDone) state.lessonDone = d.lessonDone;
      if (d.stats) state.stats = Object.assign({ reviews: 0, points: 0, lessonsDone: 0, cardGrades: 0, listens: 0, speaks: 0 }, d.stats);
      if (d.achievements) state.achievements = d.achievements;
    } catch (e) {
      console.warn('load', e);
    }
    ensureToday();
    ensureSrsCards();
  }

  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify(state));
    } catch (e) {
      toast('Не удалось сохранить', true);
    }
  }

  function ensureToday() {
    const t = todayStr();
    if (state.today.date !== t) {
      if (state.today.date && state.today.mins > 0) {
        const prev = new Date(state.today.date + 'T12:00:00');
        const now = new Date(t + 'T12:00:00');
        const diff = Math.round((now - prev) / 86400000);
        if (diff === 1) state.streak.current = (state.streak.current || 0) + 1;
        else if (diff > 1) state.streak.current = 0;
      }
      state.today = { date: t, mins: 0, steps: {} };
      save();
    }
  }

  function ensureSrsCards() {
    DATA.words.forEach(function (w) {
      if (!state.srs[w.id]) {
        state.srs[w.id] = {
          ef: 2.5,
          interval: 0,
          due: Date.now(),
          reps: 0,
          lapses: 0
        };
      }
    });
  }

  function dueList() {
    const now = Date.now();
    return DATA.words.filter(function (w) {
      const c = state.srs[w.id];
      return c && (!c.due || c.due <= now);
    });
  }

  /** grade: 0 again, 1 hard, 2 good, 3 easy — SM-2 light */
  function schedule(wordId, grade) {
    const c = state.srs[wordId];
    if (!c) return;
    c.reps = (c.reps || 0) + 1;
    if (grade === 0) {
      c.lapses = (c.lapses || 0) + 1;
      c.ef = Math.max(1.3, (c.ef || 2.5) - 0.2);
      c.interval = 0;
      c.due = Date.now() + 10 * 60 * 1000;
    } else {
      c.ef = Math.min(2.8, (c.ef || 2.5) + (grade === 3 ? 0.15 : grade === 2 ? 0.05 : -0.05));
      if (!c.interval || c.interval < 1) c.interval = grade === 3 ? 3 : 1;
      else c.interval = Math.max(1, Math.round(c.interval * c.ef * (grade === 1 ? 0.8 : 1)));
      c.due = Date.now() + c.interval * 86400000;
    }
  }

  function logMins(n) {
    ensureToday();
    state.today.mins = (state.today.mins || 0) + n;
    save();
    renderToday();
  }

  function markStep(id) {
    state.today.steps[id] = true;
    save();
    renderToday();
  }

  function toast(msg, err) {
    const el = document.createElement('div');
    el.className = 'toast' + (err ? ' err' : '');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 2200);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---------- navigation ---------- */
  function go(tab) {
    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.toggle('active', s.id === 'sc-' + tab);
    });
    document.querySelectorAll('.nav button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === tab);
    });
    if (tab === 'today') renderToday();
    if (tab === 'words') renderWords();
    if (tab === 'practice') renderPractice();
    if (tab === 'tutor') renderTutor();
    if (tab === 'settings') renderSettings();
  }

  window.go = go;

  /* ---------- TODAY ---------- */
  function renderToday() {
    ensureToday();
    document.getElementById('stStreak').textContent = state.streak.current || 0;
    document.getElementById('stMins').textContent = state.today.mins || 0;
    var ptsEl = document.getElementById('stPoints');
    if (ptsEl) ptsEl.textContent = state.stats.points || 0;
    document.getElementById('stWords').textContent = DATA.words.length;
    var lvlEl = document.getElementById('levelLabel');
    if (lvlEl) lvlEl.textContent = 'Уровень ' + (DATA.level || 'A1') + ' · Этап 5 · ' + (state.stats.lessonsDone || 0) + '/' + DATA.lessons.length + ' уроков';

    const steps = [
      { id: 'srs', title: 'Повтор слов (SRS)', mins: 8, desc: 'Карточки к повтору' },
      { id: 'listen', title: 'Аудирование', mins: 8, desc: 'Слушай фразы (синтез)' },
      { id: 'dialogue', title: 'Урок / диалог', mins: 10, desc: 'Один из 12 уроков' },
      { id: 'speak', title: 'Говорение', mins: 6, desc: 'Фразы вслух' },
      { id: 'memory', title: '3 фразы на память', mins: 3, desc: 'Закрепление' }
    ];
    const done = steps.filter(function (s) { return state.today.steps[s.id]; }).length;
    const pct = Math.round((done / steps.length) * 100);
    document.getElementById('pathProgress').style.width = pct + '%';
    document.getElementById('pathCount').textContent = done + '/' + steps.length;

    document.getElementById('pathList').innerHTML = steps.map(function (s, i) {
      const isDone = !!state.today.steps[s.id];
      return (
        '<button type="button" class="step' + (isDone ? ' done' : '') + '" data-step="' + s.id + '">' +
          '<span class="num">' + (isDone ? '✓' : (i + 1)) + '</span>' +
          '<span class="body"><strong>' + esc(s.title) + '</strong>' +
          '<small>~' + s.mins + ' мин · ' + esc(s.desc) + '</small></span>' +
        '</button>'
      );
    }).join('');

    document.getElementById('pathList').onclick = function (e) {
      const btn = e.target.closest('[data-step]');
      if (!btn) return;
      const id = btn.getAttribute('data-step');
      if (id === 'srs') startReview();
      else if (id === 'listen') showListening();
      else if (id === 'dialogue') showLesson();
      else if (id === 'speak') showSpeaking();
      else if (id === 'memory') showMemory();
      else if (id === 'phrases') showPhrases();
    };
  }

  /* ---------- SRS review ---------- */
  function startReview() {
    const list = dueList();
    if (!list.length) {
      toast('Нет карточек к повтору — загляни позже');
      markStep('srs');
      return;
    }
    let i = 0;
    let flipped = false;
    const modal = document.getElementById('modal');
    const bg = document.getElementById('modalBg');

    function show() {
      if (i >= list.length) {
        closeModal();
        logMins(Math.max(3, Math.round(list.length * 0.35)));
        markStep('srs');
        state.stats.reviews = (state.stats.reviews || 0) + 1;
        addPoints(Math.min(30, 5 + list.length), 'повтор SRS');
        save();
        return;
      }
      const w = list[i];
      flipped = false;
      modal.innerHTML =
        '<h2>Повтор ' + (i + 1) + '/' + list.length + '</h2>' +
        '<button type="button" class="flash" id="flashBtn">' +
          '<div class="front">' + esc(w.en) + '</div>' +
          '<div class="back hidden" id="flashBack">' + esc(w.ru) + '</div>' +
          '<div class="ex hidden" id="flashEx">' + esc(w.ex) + (w.ipa ? ' · ' + esc(w.ipa) : '') + '</div>' +
          '<div class="hint" id="flashHint">нажми, чтобы перевернуть</div>' +
        '</button>' +
        '<div class="grades hidden" id="grades">' +
          '<button type="button" class="btn danger" data-g="0">Снова</button>' +
          '<button type="button" class="btn secondary" data-g="1">Трудно</button>' +
          '<button type="button" class="btn success" data-g="2">Хорошо</button>' +
          '<button type="button" class="btn primary" data-g="3">Легко</button>' +
        '</div>' +
        '<button type="button" class="btn secondary block" id="closeRev">Закрыть</button>';
      bg.classList.add('open');

      document.getElementById('flashBtn').onclick = function () {
        flipped = true;
        document.getElementById('flashBack').classList.remove('hidden');
        document.getElementById('flashEx').classList.remove('hidden');
        document.getElementById('flashHint').classList.add('hidden');
        document.getElementById('grades').classList.remove('hidden');
      };
      document.getElementById('grades').onclick = function (e) {
        const b = e.target.closest('[data-g]');
        if (!b) return;
        schedule(w.id, parseInt(b.getAttribute('data-g'), 10));
        state.stats.cardGrades = (state.stats.cardGrades || 0) + 1;
        save();
        i++;
        show();
      };
      document.getElementById('closeRev').onclick = closeModal;
    }
    show();
  }

  window.startReview = startReview;
  window.showLesson = showLesson;

  function closeModal() {
    document.getElementById('modalBg').classList.remove('open');
  }
  window.closeModal = closeModal;

  /* ---------- Phrases / lesson / memory ---------- */
  function showPhrases() {
    const modal = document.getElementById('modal');
    modal.innerHTML =
      '<h2>Фразы</h2>' +
      DATA.phrases.map(function (p) {
        return '<div class="card"><div class="en">' + esc(p.en) + '</div><div class="ru">' + esc(p.ru) + '</div></div>';
      }).join('') +
      '<button type="button" class="btn primary block" id="donePhrases">Готово · ~6 мин</button>';
    document.getElementById('modalBg').classList.add('open');
    document.getElementById('donePhrases').onclick = function () {
      markStep('phrases');
      logMins(6);
      addPoints(10, 'фразы');
      closeModal();
    };
  }

  function showLesson(lessonId) {
    const lesson = lessonId
      ? DATA.lessons.find(function (l) { return l.id === lessonId; })
      : DATA.lessons[0];
    if (!lesson) { toast('Урок не найден', true); return; }
    const words = lesson.wordIds.map(function (id) {
      return DATA.words.find(function (w) { return w.id === id; });
    }).filter(Boolean);

    let html = '<h2>' + esc(lesson.title) + '</h2>';
    html += '<p class="muted">Цель: ' + esc(lesson.goal) + '</p>';
    html += '<h3>Слова</h3>';
    words.forEach(function (w) {
      html += '<div class="card"><strong>' + esc(w.en) + '</strong> ' +
        (w.ipa ? '<span class="ipa">' + esc(w.ipa) + '</span> ' : '') +
        '— ' + esc(w.ru) +
        '<div class="ex">' + esc(w.ex) + '</div></div>';
    });
    html += '<h3>Диалог</h3>';
    lesson.dialogue.forEach(function (line) {
      html += '<div class="card"><strong>' + esc(line.who) + ':</strong> ' +
        esc(line.en) + '<div class="ru">' + esc(line.ru) + '</div></div>';
    });
    html += '<h3>Советы</h3><ul class="tips">';
    lesson.tips.forEach(function (t) {
      html += '<li>' + esc(t) + '</li>';
    });
    html += '</ul>';
    html += '<button type="button" class="btn primary block" id="doneLesson">Выполнено · ~12 мин</button>';

    document.getElementById('modal').innerHTML = html;
    document.getElementById('modalBg').classList.add('open');
    document.getElementById('doneLesson').onclick = function () {
      const first = !state.lessonDone[lesson.id];
      state.lessonDone[lesson.id] = true;
      if (first) {
        state.stats.lessonsDone = (state.stats.lessonsDone || 0) + 1;
        addPoints(25, 'урок');
      }
      markStep('dialogue');
      logMins(12);
      save();
      closeModal();
      if (!first) toast('Урок отмечен');
    };
  }


  function showListening() {
    var pack = DATA.phrases.slice().sort(function () { return Math.random() - 0.5; }).slice(0, 5);
    var idx = 0;
    var modal = document.getElementById('modal');
    function draw() {
      if (idx >= pack.length) {
        markStep('listen');
        logMins(8);
        addPoints(12, 'аудирование');
        closeModal();
        return;
      }
      var p = pack[idx];
      modal.innerHTML =
        '<h2>Аудирование ' + (idx + 1) + '/' + pack.length + '</h2>' +
        '<p class="muted">Слушай фразу, затем открой текст.</p>' +
        '<button type="button" class="btn primary block" id="btnSpeak">▶ Слушать</button>' +
        '<button type="button" class="btn secondary block" id="btnReveal">Показать текст</button>' +
        '<div class="card hidden" id="listenText"><div class="en">' + esc(p.en) + '</div><div class="ru">' + esc(p.ru) + '</div></div>' +
        '<button type="button" class="btn success block hidden" id="btnNext">Понял →</button>' +
        '<button type="button" class="btn secondary block" id="btnCloseL">Закрыть</button>';
      document.getElementById('modalBg').classList.add('open');
      document.getElementById('btnSpeak').onclick = function () { speakText(p.en); };
      document.getElementById('btnReveal').onclick = function () {
        document.getElementById('listenText').classList.remove('hidden');
        document.getElementById('btnNext').classList.remove('hidden');
      };
      document.getElementById('btnNext').onclick = function () { idx++; draw(); };
      document.getElementById('btnCloseL').onclick = closeModal;
    }
    draw();
  }

  function showSpeaking() {
    var pack = DATA.phrases.slice().sort(function () { return Math.random() - 0.5; }).slice(0, 3);
    var modal = document.getElementById('modal');
    modal.innerHTML =
      '<h2>Говорение</h2>' +
      '<p class="muted">Прочитай вслух. Можешь нажать ▶ чтобы сверить произношение (синтез).</p>' +
      pack.map(function (p, i) {
        return '<div class="card"><strong>' + (i + 1) + '.</strong> ' + esc(p.en) +
          '<div class="ru">' + esc(p.ru) + '</div>' +
          '<button type="button" class="btn secondary" style="margin-top:8px;min-height:44px" data-say="' + esc(p.en).replace(/"/g, '&quot;') + '">▶ Слушать образец</button></div>';
      }).join('') +
      '<button type="button" class="btn primary block" id="doneSpeak">Сказал вслух · готово</button>';
    document.getElementById('modalBg').classList.add('open');
    modal.querySelectorAll('[data-say]').forEach(function (b) {
      b.onclick = function () { speakText(b.getAttribute('data-say')); };
    });
    document.getElementById('doneSpeak').onclick = function () {
      state.stats.speaks = (state.stats.speaks || 0) + 1;
      markStep('speak');
      logMins(6);
      addPoints(10, 'говорение');
      save();
      closeModal();
    };
  }

  function showAchievements() {
    if (!state.achievements) state.achievements = {};
    var html = '<h2>Достижения</h2>';
    ACHIEVEMENTS.forEach(function (a) {
      var on = !!state.achievements[a.id];
      html += '<div class="card" style="opacity:' + (on ? '1' : '0.45') + '"><strong>' + (on ? '🏆 ' : '○ ') + esc(a.title) + '</strong>' +
        '<div class="ru">' + esc(a.desc) + '</div></div>';
    });
    html += '<button type="button" class="btn secondary block" onclick="closeModal()">Закрыть</button>';
    document.getElementById('modal').innerHTML = html;
    document.getElementById('modalBg').classList.add('open');
  }

  function showMemory() {
    const pick = DATA.phrases.slice(0, 3);
    document.getElementById('modal').innerHTML =
      '<h2>3 фразы на память</h2>' +
      '<p class="muted">Закрой экран и скажи вслух без подсказки.</p>' +
      pick.map(function (p, i) {
        return '<div class="card"><strong>' + (i + 1) + '.</strong> ' + esc(p.en) +
          '<div class="ru">' + esc(p.ru) + '</div></div>';
      }).join('') +
      '<button type="button" class="btn primary block" id="doneMem">Готово · ~3 мин</button>';
    document.getElementById('modalBg').classList.add('open');
    document.getElementById('doneMem').onclick = function () {
      markStep('memory');
      logMins(3);
      addPoints(8, 'память');
      closeModal();
    };
  }

  /* ---------- Words list ---------- */
  function renderWords() {
    const due = dueList().length;
    document.getElementById('wordsMeta').textContent =
      DATA.words.length + ' слов (~90% бытовой речи) · ' + due + ' к повтору';
    // Show due cards first, then a sample — 2000 DOM nodes lag on iPhone
    const dueIds = {};
    dueList().forEach(function (w) { dueIds[w.id] = true; });
    var list = DATA.words.filter(function (w) { return dueIds[w.id]; });
    if (list.length < 40) {
      DATA.words.slice(0, 60).forEach(function (w) {
        if (!dueIds[w.id]) list.push(w);
      });
    }
    list = list.slice(0, 80);
    document.getElementById('wordList').innerHTML = list.map(function (w) {
      const c = state.srs[w.id] || {};
      const dueLabel = !c.due || c.due <= Date.now()
        ? 'сейчас'
        : new Date(c.due).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
      return '<div class="card row-card"><div><strong>' + esc(w.en) + '</strong>' +
        '<div class="ru">' + esc(w.ru) + '</div></div>' +
        '<span class="badge">' + dueLabel + '</span></div>';
    }).join('') +
      '<p class="muted" style="margin-top:8px">Показаны due и начало колоды. Всего ' + DATA.words.length + ' слов в SRS.</p>';
  }

  /* ---------- Practice ---------- */
  function renderPractice() {
    let html =
      '<button type="button" class="btn primary block" id="btnRev">Повторить слова (SRS)</button>' +
      '<button type="button" class="btn secondary block" id="btnListen">Аудирование</button>' +
      '<button type="button" class="btn secondary block" id="btnSpeak">Говорение</button>' +
      '<button type="button" class="btn secondary block" id="btnPhr">Фразы</button>' +
      '<button type="button" class="btn secondary block" id="btnAch">Достижения</button>' +
      '<h3 style="margin:16px 0 8px;font-size:0.9rem;color:var(--muted)">Уроки (' + DATA.lessons.length + ')</h3>';
    DATA.lessons.forEach(function (les) {
      const done = !!state.lessonDone[les.id];
      html += '<button type="button" class="btn ' + (done ? 'success' : 'secondary') + ' block lesson-btn" data-lid="' + les.id + '">' +
        (done ? '✓ ' : '') + esc(les.title) + '</button>';
    });
    document.getElementById('practiceBox').innerHTML = html;
    document.getElementById('btnRev').onclick = startReview;
    document.getElementById('btnListen').onclick = showListening;
    document.getElementById('btnSpeak').onclick = showSpeaking;
    document.getElementById('btnPhr').onclick = showPhrases;
    document.getElementById('btnAch').onclick = showAchievements;
    document.querySelectorAll('.lesson-btn').forEach(function (b) {
      b.onclick = function () { showLesson(b.getAttribute('data-lid')); };
    });
  }

  /* ---------- Tutor stub ---------- */
  const tutorChat = [];

  function renderTutor() {
    const box = document.getElementById('tutorBox');
    const ok = window.AITutor && window.AITutor.isAvailable && window.AITutor.isAvailable();
    const status = (window.AITutor && window.AITutor.getStatusMessage)
      ? window.AITutor.getStatusMessage()
      : 'Модуль ИИ не загружен';
    let html = '<div class="tip">' + esc(status) + '</div>';
    if (!ok) {
      html += '<p class="muted">Открой «Ещё» → вставь API-ключ. Ключ не уходит никуда, кроме выбранного API.</p>';
      html += '<button type="button" class="btn secondary block" id="goSet">К настройкам</button>';
      box.innerHTML = html;
      document.getElementById('goSet').onclick = function () { go('settings'); };
      return;
    }
    html += '<div class="chat" id="chatLog">';
    if (!tutorChat.length) {
      html += '<div class="bubble sys">Напиши на английском или спроси на русском — разберём ошибку.</div>';
    } else {
      tutorChat.forEach(function (m) {
        html += '<div class="bubble ' + m.role + '">' + esc(m.content) + '</div>';
      });
    }
    html += '</div>';
    html += '<div class="row-input">' +
      '<input type="text" id="tutorInput" placeholder="Type in English…" autocomplete="off">' +
      '<button type="button" class="btn primary" id="tutorSend">→</button></div>';
    html += '<button type="button" class="btn secondary block" id="tutorClear" style="margin-top:8px">Очистить чат</button>';
    box.innerHTML = html;
    const log = document.getElementById('chatLog');
    if (log) log.scrollTop = log.scrollHeight;
    document.getElementById('tutorSend').onclick = sendTutor;
    document.getElementById('tutorInput').onkeydown = function (e) {
      if (e.key === 'Enter') sendTutor();
    };
    document.getElementById('tutorClear').onclick = function () {
      tutorChat.length = 0;
      renderTutor();
    };
  }

  async function sendTutor() {
    const input = document.getElementById('tutorInput');
    const text = (input && input.value || '').trim();
    if (!text) return;
    if (!window.AITutor || !window.AITutor.chat) {
      toast('ИИ недоступен', true);
      return;
    }
    input.value = '';
    tutorChat.push({ role: 'user', content: text });
    tutorChat.push({ role: 'sys', content: '… думает' });
    renderTutor();
    try {
      const hist = tutorChat.filter(function (m) { return m.role === 'user' || m.role === 'assistant'; });
      const reply = await window.AITutor.chat(text, hist.slice(0, -1));
      tutorChat.pop(); // remove thinking
      tutorChat.push({ role: 'assistant', content: reply });
      addPoints(3, null);
      save();
      renderTutor();
    } catch (e) {
      tutorChat.pop();
      tutorChat.push({ role: 'sys', content: 'Ошибка: ' + (e.message || 'AI') });
      renderTutor();
      toast(e.message || 'Ошибка ИИ', true);
    }
  }

  /* ---------- Settings ---------- */
  function renderSettings() {
    renderSettingsAi();
  }

  function renderSettingsAi() {
    if (!window.AITutor) return;
    var keyEl = document.getElementById('aiKey');
    var provEl = document.getElementById('aiProvider');
    var baseEl = document.getElementById('aiBase');
    var st = document.getElementById('aiStatus');
    if (keyEl) keyEl.value = window.AITutor.getKey() || '';
    if (provEl) provEl.value = window.AITutor.getProvider() || 'groq';
    if (baseEl) baseEl.value = window.AITutor.getCustomBase() || '';
    if (st) st.textContent = window.AITutor.getStatusMessage();
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'english_course_v1.json';
    a.click();
    toast('Экспорт скачан');
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const d = JSON.parse(reader.result);
        if (d.srs) state.srs = d.srs;
        if (d.streak) state.streak = d.streak;
        if (d.today) state.today = d.today;
        if (d.lessonDone) state.lessonDone = d.lessonDone;
        if (d.stats) state.stats = Object.assign({ reviews: 0, points: 0, lessonsDone: 0, cardGrades: 0, listens: 0, speaks: 0 }, d.stats);
      if (d.achievements) state.achievements = d.achievements;
        ensureSrsCards();
        save();
        renderToday();
        toast('Импорт выполнен');
      } catch (e) {
        toast('Файл повреждён', true);
      }
    };
    reader.readAsText(file);
  }

  function resetAll() {
    if (!confirm('Сбросить весь прогресс?')) return;
    localStorage.removeItem(STORE);
    state.streak = { current: 0, lastDate: null };
    state.today = { date: todayStr(), mins: 0, steps: {} };
    state.srs = {};
    state.lessonDone = {};
    state.stats = { reviews: 0 };
    ensureSrsCards();
    save();
    renderToday();
    toast('Сброшено');
  }

  /* ---------- boot ---------- */
  document.getElementById('modalBg').addEventListener('click', function (e) {
    if (e.target === this) closeModal();
  });

  document.querySelectorAll('.nav button').forEach(function (b) {
    b.addEventListener('click', function () {
      go(b.getAttribute('data-tab'));
    });
  });

  document.getElementById('btnExport').addEventListener('click', exportJson);
  document.getElementById('btnImport').addEventListener('change', function (e) {
    if (e.target.files && e.target.files[0]) importJson(e.target.files[0]);
  });
  document.getElementById('btnReset').addEventListener('click', resetAll);
  document.getElementById('btnToPractice').addEventListener('click', function () {
    go('practice');
  });
  var btnAi = document.getElementById('btnSaveAi');
  if (btnAi) {
    btnAi.addEventListener('click', function () {
      if (!window.AITutor) return;
      window.AITutor.setKey((document.getElementById('aiKey') || {}).value || '');
      window.AITutor.setProvider((document.getElementById('aiProvider') || {}).value || 'groq');
      window.AITutor.setCustomBase((document.getElementById('aiBase') || {}).value || '');
      toast('ИИ сохранён');
      renderSettingsAi();
    });
  }

  load();
  checkAchievements();
  go('today');
})();
