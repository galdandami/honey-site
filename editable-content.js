window.HoneyContent = (function () {
  var KEY = 'honey-site-content-v1';
  var SECTIONS = ['Анонс', 'Навигация', 'Герой', 'Преимущества', 'Продукт', 'Камско-Устье', 'Процесс', 'Отзывы', 'Заказать', 'Подвал'];
  var BASE_PRICE = 550;
  var JARS = { '1': { price: 750, stock: 100 }, '3': { price: 2200, stock: 50 } };
  var config = window.SupabaseConfig || null;
  var client = null;
  var lastRemote = null;
  var pollTimer = null;

  function defaults() {
    return { texts: {}, price: null, jars: null, extras: [] };
  }

  function normJars(j) {
    var out = {};
    if (j && typeof j === 'object') {
      Object.keys(JARS).forEach(function (k) {
        var e = j[k];
        var price = e && e.price != null ? Number(e.price) : null;
        var stock = e && e.stock != null ? Number(e.stock) : null;
        out[k] = { price: price > 0 ? price : null, stock: stock !== null && stock >= 0 ? stock : null };
      });
    }
    return Object.keys(out).length ? out : null;
  }

  function normalize(d) {
    if (!d || typeof d !== 'object') return defaults();
    var jars = normJars(d.jars);
    if (!jars && typeof d.price === 'number' && d.price > 0) {
      jars = {
        '1': { price: Math.round(d.price * 1.4 / 10) * 10, stock: null },
        '3': { price: Math.round(d.price * 4.2 / 10) * 10, stock: null }
      };
    }
    return {
      texts: d.texts && typeof d.texts === 'object' ? d.texts : {},
      price: typeof d.price === 'number' ? d.price : null,
      jars: jars,
      extras: Array.isArray(d.extras) ? d.extras : []
    };
  }

  // --- локальный кэш ---
  function readCache() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      return normalize(JSON.parse(raw));
    } catch (e) {
      return defaults();
    }
  }

  function writeCache(d) {
    try {
      localStorage.setItem(KEY, JSON.stringify(d));
      return true;
    } catch (e) {
      return false;
    }
  }

  function clearCache() {
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  // --- Supabase ---
  function isConfigured() {
    return !!(config && config.url && config.anonKey);
  }

  function isRemote() {
    return isConfigured();
  }

  function getClient() {
    if (!isConfigured()) return null;
    if (!client) {
      try {
        client = supabase.createClient(String(config.url).trim(), String(config.anonKey).trim());
      } catch (e) {
        client = null;
      }
    }
    return client;
  }

  function rowToData(row) {
    if (!row) return null;
    return normalize({
      texts: row.texts || {},
      price: row.price != null ? Number(row.price) : null,
      jars: row.jars || null,
      extras: row.extras || []
    });
  }

  function dataToRow(d) {
    d = normalize(d);
    return { texts: d.texts, price: d.price, jars: d.jars, extras: d.extras };
  }

  function fetchRemote() {
    return new Promise(function (resolve) {
      var c = getClient();
      if (!c) { resolve({ ok: false, error: 'no-config' }); return; }
      c.from('site_content')
        .select('texts,price,jars,extras')
        .eq('id', 1)
        .maybeSingle()
        .then(function (r) {
          if (r.error) resolve({ ok: false, error: r.error.message });
          else resolve({ ok: true, data: rowToData(r.data) });
        })
        .catch(function (e) { resolve({ ok: false, error: String(e) }); });
    });
  }

  function pushRemote(d) {
    return new Promise(function (resolve) {
      var c = getClient();
      if (!c) { resolve({ ok: false, error: 'no-config' }); return; }
      var row = dataToRow(d);
      c.rpc('save_content', {
        p_texts: row.texts,
        p_price: row.price,
        p_jars: row.jars,
        p_extras: row.extras,
        p_secret: String((config && config.editorSecret) || '').trim()
      })
        .then(function (r) { resolve(r.error ? { ok: false, error: r.error.message } : { ok: true }); })
        .catch(function (e) { resolve({ ok: false, error: String(e) }); });
    });
  }

  // Забрать последнюю версию из Supabase в локальный кэш
  function sync(cb) {
    fetchRemote().then(function (res) {
      if (res.ok && res.data) {
        writeCache(res.data);
        lastRemote = JSON.stringify(res.data);
      }
      if (cb) cb(res);
    });
  }

  // Сохранить: локально сразу, в Supabase асинхронно (res.remote — Promise)
  function save(d) {
    d = normalize(d);
    var okLocal = writeCache(d);
    return { local: okLocal, remote: pushRemote(d) };
  }

  // Вернуть сайт к оригиналу: очистить кэш и записать пустые правки в Supabase
  function reset() {
    clearCache();
    return pushRemote(defaults());
  }

  // Периодически проверять изменения с других устройств
  function startPolling(onChange, interval) {
    if (!isConfigured() || pollTimer) return;
    pollTimer = setInterval(function () {
      fetchRemote().then(function (res) {
        if (!res.ok || !res.data) return;
        var s = JSON.stringify(res.data);
        if (lastRemote !== s) {
          lastRemote = s;
          writeCache(res.data);
          if (onChange) onChange();
        }
      });
    }, interval || 12000);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  // --- сбор редактируемых текстов ---
  function sectionOf(el) {
    var n = el;
    while (n && n.nodeType === 1) {
      var nm = n.getAttribute && n.getAttribute('data-pencil-name');
      if (nm && SECTIONS.indexOf(nm) > -1) return nm;
      n = n.parentElement;
    }
    return 'Прочее';
  }

  function skip(el) {
    var n = el;
    while (n && n.nodeType === 1) {
      var nm = n.getAttribute && n.getAttribute('data-pencil-name');
      if (nm === 'кнопка корзины' || nm === 'степпер' || nm === 'сумма' || nm === 'ед' || nm === 'банка 1л' || nm === 'банка 3л') return true;
      n = n.parentElement;
    }
    return false;
  }

  function collect(root) {
    var items = [];
    var i = 0;
    root.querySelectorAll('[data-pencil-name]').forEach(function (el) {
      if (skip(el)) return;
      var hasEl = false;
      for (var c = el.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 1) { hasEl = true; break; }
      }
      var txt = (el.textContent || '').trim();
      if (!hasEl && txt) {
        items.push({ key: 't' + (i++), section: sectionOf(el), name: el.getAttribute('data-pencil-name'), text: txt, el: el });
      }
    });
    return items;
  }

  return {
    KEY: KEY,
    BASE_PRICE: BASE_PRICE,
    JARS: JARS,
    SECTIONS: SECTIONS,
    defaults: defaults,
    load: readCache,
    save: save,
    clear: clearCache,
    reset: reset,
    collect: collect,
    isConfigured: isConfigured,
    isRemote: isRemote,
    sync: sync,
    startPolling: startPolling,
    stopPolling: stopPolling
  };
})();