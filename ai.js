/* ai.js — Этап 3: ИИ-тьютор. Ключ только в localStorage, без хардкода. */
(function (global) {
  'use strict';

  const LS_KEY = 'english_course_v1_ai_key';
  const LS_PROVIDER = 'english_course_v1_ai_provider';
  const LS_BASE = 'english_course_v1_ai_base';

  const PROVIDERS = {
    groq: {
      label: 'Groq',
      base: 'https://api.groq.com/openai/v1',
      model: 'openai/gpt-oss-20b'
    },
    openai: {
      label: 'OpenAI',
      base: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini'
    },
    custom: {
      label: 'Другой (OpenAI-compatible)',
      base: '',
      model: 'gpt-4o-mini'
    }
  };

  function getKey() {
    try { return localStorage.getItem(LS_KEY) || ''; } catch (e) { return ''; }
  }
  function setKey(k) {
    try {
      if (k) localStorage.setItem(LS_KEY, k);
      else localStorage.removeItem(LS_KEY);
    } catch (e) {}
  }
  function getProvider() {
    try { return localStorage.getItem(LS_PROVIDER) || 'groq'; } catch (e) { return 'groq'; }
  }
  function setProvider(p) {
    try { localStorage.setItem(LS_PROVIDER, p); } catch (e) {}
  }
  function getCustomBase() {
    try { return (localStorage.getItem(LS_BASE) || '').replace(/\/$/, ''); } catch (e) { return ''; }
  }
  function setCustomBase(b) {
    try {
      if (b) localStorage.setItem(LS_BASE, b.replace(/\/$/, ''));
      else localStorage.removeItem(LS_BASE);
    } catch (e) {}
  }

  function isAvailable() {
    return !!getKey();
  }

  function getStatusMessage() {
    if (!getKey()) {
      return 'Введите API-ключ в Настройках. Ключ хранится только на этом устройстве. Не используйте рабочий ключ.';
    }
    return 'ИИ готов · ' + (PROVIDERS[getProvider()] || PROVIDERS.groq).label;
  }

  const SYSTEM = 'Ты — учитель английского для уровня A1–A2. Отвечай коротко. Объяснения — на русском, примеры фраз — на английском. Исправляй ошибки мягко: покажи правильный вариант и одну причину. Фокус на понимание и бытовые фразы. Не пиши длинные лекции.';

  async function chat(userText, history) {
    const key = getKey();
    if (!key) throw new Error('Нет API-ключа');
    if (!navigator.onLine) throw new Error('Нет подключения, ИИ недоступен');

    const provId = getProvider();
    const prov = PROVIDERS[provId] || PROVIDERS.groq;
    let base = prov.base;
    if (provId === 'custom') {
      base = getCustomBase();
      if (!base) throw new Error('Укажите Base URL провайдера');
    }
    const url = base + '/chat/completions';
    const messages = [{ role: 'system', content: SYSTEM }];
    (history || []).slice(-8).forEach(function (m) {
      if (m.role === 'user' || m.role === 'assistant') {
        messages.push({ role: m.role, content: m.content });
      }
    });
    messages.push({ role: 'user', content: userText });

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + key
        },
        body: JSON.stringify({
          model: prov.model,
          messages: messages,
          temperature: 0.6,
          max_tokens: 600
        })
      });
    } catch (e) {
      throw new Error('Сеть: ' + (e.message || 'Load failed') + '. С браузера API часто блокирует CORS — нужен proxy или другой провайдер.');
    }
    if (!res.ok) {
      const t = await res.text().catch(function () { return ''; });
      let msg = 'HTTP ' + res.status;
      try {
        const j = JSON.parse(t);
        msg = (j.error && (j.error.message || j.error)) || j.message || msg;
      } catch (e) {
        if (t) msg = t.slice(0, 120);
      }
      throw new Error(String(msg));
    }
    const data = await res.json();
    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('Пустой ответ ИИ');
    return String(text).trim();
  }

  global.AITutor = {
    isAvailable: isAvailable,
    getStatusMessage: getStatusMessage,
    getKey: getKey,
    setKey: setKey,
    getProvider: getProvider,
    setProvider: setProvider,
    getCustomBase: getCustomBase,
    setCustomBase: setCustomBase,
    providers: PROVIDERS,
    chat: chat
  };
})(typeof window !== 'undefined' ? window : globalThis);
