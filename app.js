(function () {
  'use strict';

  var state = {
    meals: [],
    logs: [],
    goals: { protein: 165, calories: 2200, fats: 70, carbs: 250 }
  };

  var STORAGE_KEY = 'macros_state';
  var modalMode = 'log';
  var editing = null;

  var SB_URL = 'https://dedsggjxrutvklqagkcp.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZHNnZ2p4cnV0dmtscWFna2NwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3NjIxMDUsImV4cCI6MjEwNjMzODEwNX0.91KQOhRnSuxNw3tiTGNpyxGwi4f-QviCxWWs9jQKt94';
  var KEY_STORE = 'macros_sync_key';
  var updatedAt = 0;
  var pushTimer;

  function load() {
    try {
      var s = localStorage.getItem(STORAGE_KEY);
      if (s) {
        var p = JSON.parse(s);
        state.meals = p.meals || [];
        state.logs = p.logs || [];
        state.goals = p.goals || state.goals;
        updatedAt = p.updated_at || 0;
      }
    } catch (e) { /* noop */ }
  }

  function writeLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ meals: state.meals, logs: state.logs, goals: state.goals, updated_at: updatedAt }));
    } catch (e) { /* noop */ }
  }

  function save() {
    updatedAt = Date.now();
    writeLocal();
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 600);
  }

  // ===== Sync =====
  function syncKey(ask) {
    var k = localStorage.getItem(KEY_STORE);
    if (!k && ask) {
      k = (window.prompt('') || '').trim();
      if (k.length >= 6) localStorage.setItem(KEY_STORE, k); else k = null;
    }
    return k;
  }

  function rpc(fn, body) {
    return fetch(SB_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.status === 204 ? null : r.json(); });
  }

  function push() {
    var k = localStorage.getItem(KEY_STORE);
    if (!k) return;
    rpc('put_state', { p_key: k, p_data: { meals: state.meals, logs: state.logs, goals: state.goals }, p_updated: updatedAt }).catch(function () {});
  }

  function pull(ask) {
    var k = syncKey(ask);
    if (!k) return;
    rpc('get_state', { p_key: k }).then(function (remote) {
      if (remote && remote.updated_at > updatedAt) {
        state.meals = remote.data.meals || [];
        state.logs = remote.data.logs || [];
        state.goals = remote.data.goals || state.goals;
        updatedAt = remote.updated_at;
        writeLocal();
        renderAll();
      } else if (!remote || remote.updated_at < updatedAt) {
        push();
      }
    }).catch(function () {});
  }

  // ===== Helpers =====
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function fmtDate(s) {
    var parts = s.split('-');
    var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getMonth()] + ' ' + d.getDate();
  }

  function shortDate(s) {
    var parts = s.split('-');
    return (+parts[1]) + '/' + (+parts[2]);
  }

  function sv(l) { return l.servings || 1; }

  function scaled(l) {
    var s = sv(l);
    return {
      protein: Math.round((l.protein || 0) * s),
      calories: Math.round((l.calories || 0) * s),
      fats: Math.round((l.fats || 0) * s),
      carbs: Math.round((l.carbs || 0) * s)
    };
  }

  function macroLine(m) {
    return m.protein + 'p &middot; ' + m.calories + 'cal &middot; ' + m.fats + 'f &middot; ' + m.carbs + 'c';
  }

  function todaysLogs() {
    var t = today();
    return state.logs.filter(function (l) { return l.date === t; });
  }

  function totals(logs) {
    var r = { protein: 0, calories: 0, fats: 0, carbs: 0 };
    logs.forEach(function (l) {
      var m = scaled(l);
      r.protein += m.protein; r.calories += m.calories; r.fats += m.fats; r.carbs += m.carbs;
    });
    return r;
  }

  function esc(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function renderAll() {
    renderMeals();
    renderHome();
    renderTrends();
  }

  // ===== Home =====
  function renderHome() {
    var panel = document.getElementById('panel-home');
    var logs = todaysLogs();
    var t = totals(logs);

    var html = '<div class="date-header">' + fmtDate(today()) + '</div>';
    html += '<div class="macro-grid">';
    html += macroCard(t.protein, 'g', 'Protein');
    html += macroCard(t.calories, '', 'Calories');
    html += macroCard(t.fats, 'g', 'Fats');
    html += macroCard(t.carbs, 'g', 'Carbs');
    html += '</div>';
    html += '<button class="add-btn" id="home-add">+</button>';
    html += '<div class="logged-meals">';
    logs.forEach(function (l) {
      var s = sv(l);
      html += '<div class="card logged-meal" data-log="' + l.id + '">';
      html += '<div class="meal-info">';
      html += '<div class="meal-name">' + (s !== 1 ? s + '&times; ' : '') + esc(l.name) + '</div>';
      html += '<div class="meal-macros">' + macroLine(scaled(l)) + '</div>';
      html += '</div></div>';
    });
    html += '</div>';

    panel.innerHTML = html;

    panel.querySelector('#home-add').addEventListener('click', function () { openModal('log'); });
    panel.querySelectorAll('.logged-meal').forEach(function (row) {
      row.addEventListener('click', function () {
        var l = state.logs.find(function (x) { return x.id === row.dataset.log; });
        if (l) openModal('editLog', l);
      });
    });
  }

  function macroCard(val, unit, label) {
    return '<div class="card macro-card"><div class="macro-value">' + val + unit + '</div><div class="macro-label">' + label + '</div></div>';
  }

  // ===== Meals =====
  var mealsInitialized = false;

  function renderMeals() {
    var panel = document.getElementById('panel-meals');
    if (!mealsInitialized) {
      panel.innerHTML = '<div class="meals-header"><input type="text" class="search-input" placeholder="Search"><button class="small-add-btn" id="meals-add">+</button></div><div class="meals-list" id="meals-list"></div>';
      panel.querySelector('#meals-add').addEventListener('click', function () { openModal('save'); });
      panel.querySelector('.search-input').addEventListener('input', updateMealsList);
      mealsInitialized = true;
    }
    updateMealsList();
  }

  function updateMealsList() {
    var input = document.querySelector('#panel-meals .search-input');
    var q = (input ? input.value : '').toLowerCase();
    var list = document.getElementById('meals-list');
    var filtered = q ? state.meals.filter(function (m) { return m.name.toLowerCase().indexOf(q) !== -1; }) : state.meals;

    var html = '';
    filtered.forEach(function (m) {
      html += '<div class="card meal-item" data-meal="' + m.id + '">';
      html += '<div class="meal-info">';
      html += '<div class="meal-name">' + esc(m.name) + '</div>';
      html += '<div class="meal-macros">' + macroLine(m) + '</div>';
      html += '</div>';
      html += '<button class="log-btn" data-mid="' + m.id + '">LOG</button>';
      html += '</div>';
    });
    list.innerHTML = html;

    list.querySelectorAll('.meal-item').forEach(function (row) {
      row.addEventListener('click', function () {
        var m = state.meals.find(function (x) { return x.id === row.dataset.meal; });
        if (m) openModal('editMeal', m);
      });
    });

    list.querySelectorAll('.log-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var m = state.meals.find(function (x) { return x.id === btn.dataset.mid; });
        if (m) openModal('log', m);
      });
    });
  }

  // ===== Trends =====
  function renderTrends() {
    var panel = document.getElementById('panel-trends');
    var g = state.goals;

    var html = '<div class="macro-grid">';
    html += goalCard('protein', g.protein, 'g', 'Protein');
    html += goalCard('calories', g.calories, '', 'Calories');
    html += goalCard('fats', g.fats, 'g', 'Fats');
    html += goalCard('carbs', g.carbs, 'g', 'Carbs');
    html += '</div>';
    html += '<div class="charts">';
    ['Calories', 'Protein', 'Fats', 'Carbs'].forEach(function (name) {
      var k = name.toLowerCase();
      html += '<div class="card chart-card"><div class="chart-title">' + name + '</div>';
      html += '<div class="chart-wrapper"><div class="chart-y-axis" id="yaxis-' + k + '"></div>';
      html += '<div class="chart-scroll" id="scroll-' + k + '"><div class="chart-area" id="chart-' + k + '"></div></div>';
      html += '</div></div>';
    });
    html += '</div>';

    panel.innerHTML = html;

    panel.querySelectorAll('.goal-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var macro = card.dataset.macro;
        var valEl = card.querySelector('.goal-value');
        if (!valEl) return;
        var current = state.goals[macro];

        var inp = document.createElement('input');
        inp.type = 'number';
        inp.className = 'goal-input';
        inp.value = current;
        inp.inputMode = 'numeric';
        valEl.replaceWith(inp);
        inp.focus();
        inp.select();

        function commit() {
          var v = parseInt(inp.value);
          if (isNaN(v) || v < 0) v = current;
          state.goals[macro] = v;
          save();
          renderTrends();
        }
        inp.addEventListener('blur', commit);
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
      });
    });

    renderCharts();
  }

  function goalCard(macro, val, unit, label) {
    return '<div class="card goal-card" data-macro="' + macro + '"><div class="goal-value">' + val + unit + '</div><div class="macro-label">' + label + '</div></div>';
  }

  function dailyTotals() {
    var byDate = {};
    state.logs.forEach(function (l) {
      var m = scaled(l);
      if (!byDate[l.date]) byDate[l.date] = { protein: 0, calories: 0, fats: 0, carbs: 0 };
      byDate[l.date].protein += m.protein;
      byDate[l.date].calories += m.calories;
      byDate[l.date].fats += m.fats;
      byDate[l.date].carbs += m.carbs;
    });
    return Object.keys(byDate).sort().map(function (d) {
      var b = byDate[d];
      return { date: d, protein: b.protein, calories: b.calories, fats: b.fats, carbs: b.carbs };
    });
  }

  function renderCharts() {
    var data = dailyTotals();
    ['calories', 'protein', 'fats', 'carbs'].forEach(function (macro) {
      drawDotChart(macro, data.map(function (d) { return { date: d.date, value: d[macro] }; }), state.goals[macro]);
    });
  }

  function drawDotChart(macro, data, goal) {
    var area = document.getElementById('chart-' + macro);
    var yaxis = document.getElementById('yaxis-' + macro);
    var scrollEl = document.getElementById('scroll-' + macro);
    if (!area || !yaxis || !scrollEl) return;

    var DOT = 10, DAY_W = 50, H = 150, PAD_T = 16, PAD_B = 24;
    var PLOT_H = H - PAD_T - PAD_B;

    if (data.length === 0) {
      area.style.width = '100%';
      area.style.height = H + 'px';
      area.innerHTML = '<div class="chart-empty"><div class="chart-empty-line"></div></div>';
      yaxis.innerHTML = '<span class="y-label" style="top:50%">' + goal + '</span>';
      return;
    }

    var maxVal = goal * 1.4;
    data.forEach(function (d) { if (d.value > maxVal) maxVal = d.value * 1.15; });

    var w = Math.max(data.length * DAY_W + 20, scrollEl.clientWidth || 280);
    area.style.width = w + 'px';
    area.style.height = H + 'px';

    var goalY = PAD_T + PLOT_H * (1 - goal / maxVal);
    var html = '<div class="goal-line" style="top:' + goalY + 'px;background:#1a1a1a;opacity:0.18;height:1.5px"></div>';

    data.forEach(function (d, i) {
      var x = 20 + i * DAY_W;
      var y = PAD_T + PLOT_H * (1 - d.value / maxVal);
      var pct = goal ? Math.abs(d.value - goal) / goal : 1;
      var color = pct <= 0.1 ? 'var(--green)' : pct <= 0.25 ? 'var(--yellow)' : 'var(--red)';
      html += '<div class="chart-dot" style="left:' + (x - DOT / 2) + 'px;top:' + (y - DOT / 2) + 'px;width:' + DOT + 'px;height:' + DOT + 'px;background:' + color + '"></div>';
      html += '<div class="chart-date-label" style="left:' + x + 'px">' + shortDate(d.date) + '</div>';
    });
    area.innerHTML = html;

    var yhtml = '';
    [0, Math.round(maxVal / 2), Math.round(maxVal)].forEach(function (v) {
      yhtml += '<span class="y-label" style="top:' + (PAD_T + PLOT_H * (1 - v / maxVal)) + 'px">' + v + '</span>';
    });
    yhtml += '<span class="y-label" style="top:' + goalY + 'px;font-weight:600;color:var(--title)">' + goal + '</span>';
    yaxis.innerHTML = yhtml;

    scrollEl.scrollLeft = scrollEl.scrollWidth;
  }

  // ===== Sheet =====
  // modes: log (new log, optional prefill), save (new library item), editLog, editMeal
  function openModal(mode, item) {
    modalMode = mode;
    editing = (mode === 'editLog' || mode === 'editMeal') ? item : null;
    var prefill = item || null;
    var hasServings = mode === 'log' || mode === 'editLog';
    var modal = document.getElementById('modal');
    var overlay = document.getElementById('modal-overlay');

    var html = '<div class="modal-handle"></div><div class="modal-fields">';
    html += '<input type="text" id="m-name" class="modal-input" placeholder="Name" autocomplete="off">';
    if (mode === 'log') html += '<div class="suggestions" id="m-suggest"></div>';
    html += '<input type="text" id="m-desc" class="modal-input" placeholder="Description" autocomplete="off">';
    html += '<div class="modal-macro-grid">';
    html += macroInput('m-protein', 'Protein');
    html += macroInput('m-calories', 'Calories');
    html += macroInput('m-fats', 'Fats');
    html += macroInput('m-carbs', 'Carbs');
    html += '</div>';
    if (hasServings) {
      html += '<div class="servings-row">';
      html += '<button class="step-btn" id="m-minus">&minus;</button>';
      html += '<div class="modal-macro"><input type="number" id="m-servings" class="modal-input macro-input" value="1" step="0.25" min="0" inputmode="decimal"><span class="input-label">Servings</span></div>';
      html += '<button class="step-btn" id="m-plus">+</button>';
      html += '</div>';
    }
    if (mode === 'log' && !prefill) {
      html += '<label class="save-toggle"><input type="checkbox" id="m-save"><span>Save to library</span></label>';
    }
    html += '</div>';
    html += '<button class="modal-submit" id="m-submit">' + (mode === 'log' ? 'Log' : 'Save') + '</button>';
    if (editing) html += '<button class="modal-delete" id="m-delete">Delete</button>';

    modal.innerHTML = html;

    if (prefill) fill(prefill);
    if (mode === 'editLog') document.getElementById('m-servings').value = sv(editing);

    if (hasServings) {
      var sEl = document.getElementById('m-servings');
      document.getElementById('m-minus').addEventListener('click', function () {
        sEl.value = Math.max(0.25, (parseFloat(sEl.value) || 1) - 0.5);
      });
      document.getElementById('m-plus').addEventListener('click', function () {
        sEl.value = (parseFloat(sEl.value) || 0) + 0.5;
      });
    }

    overlay.classList.add('active');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { modal.classList.add('active'); });
    });
    if (!prefill) setTimeout(function () { var el = document.getElementById('m-name'); if (el) el.focus(); }, 350);

    document.getElementById('m-submit').addEventListener('click', submitModal);
    if (editing) document.getElementById('m-delete').addEventListener('click', deleteEditing);
    if (mode === 'log') initSuggest();
    overlay.onclick = function (e) { if (e.target === overlay) closeModal(); };
  }

  function fill(m) {
    document.getElementById('m-name').value = m.name;
    document.getElementById('m-desc').value = m.desc || '';
    document.getElementById('m-protein').value = m.protein;
    document.getElementById('m-calories').value = m.calories;
    document.getElementById('m-fats').value = m.fats;
    document.getElementById('m-carbs').value = m.carbs;
  }

  function initSuggest() {
    var nameEl = document.getElementById('m-name');
    var box = document.getElementById('m-suggest');
    nameEl.addEventListener('input', function () {
      var q = nameEl.value.trim().toLowerCase();
      if (!q) { box.innerHTML = ''; return; }
      var hits = state.meals.filter(function (m) { return m.name.toLowerCase().indexOf(q) !== -1; }).slice(0, 5);
      var html = '';
      hits.forEach(function (m) {
        html += '<div class="suggestion" data-mid="' + m.id + '"><div class="meal-name">' + esc(m.name) + '</div>';
        html += '<div class="meal-macros">' + macroLine(m) + '</div></div>';
      });
      box.innerHTML = html;
      box.querySelectorAll('.suggestion').forEach(function (el) {
        el.addEventListener('click', function () {
          var m = state.meals.find(function (x) { return x.id === el.dataset.mid; });
          if (!m) return;
          fill(m);
          box.innerHTML = '';
        });
      });
    });
  }

  function upsertMeal(data) {
    var existing = state.meals.find(function (m) { return m.name.toLowerCase() === data.name.toLowerCase(); });
    if (existing) {
      Object.assign(existing, data);
    } else {
      state.meals.push(Object.assign({ id: uid() }, data));
    }
  }

  function macroInput(id, label) {
    return '<div class="modal-macro"><input type="number" id="' + id + '" class="modal-input macro-input" placeholder="0" inputmode="numeric"><span class="input-label">' + label + '</span></div>';
  }

  function num(id, isFloat) {
    var v = document.getElementById(id).value;
    var n = isFloat ? parseFloat(v) : parseInt(v);
    return isNaN(n) ? 0 : n;
  }

  function closeModal() {
    document.getElementById('modal').classList.remove('active');
    var overlay = document.getElementById('modal-overlay');
    setTimeout(function () { overlay.classList.remove('active'); }, 300);
    editing = null;
  }

  function deleteEditing() {
    if (!editing) return;
    if (modalMode === 'editLog') {
      var lid = editing.id;
      state.logs = state.logs.filter(function (l) { return l.id !== lid; });
    } else {
      var mid = editing.id;
      state.meals = state.meals.filter(function (m) { return m.id !== mid; });
    }
    save();
    renderAll();
    toast('Deleted');
    closeModal();
  }

  function submitModal() {
    var name = (document.getElementById('m-name').value || '').trim();
    if (!name) { document.getElementById('m-name').focus(); return; }

    var data = {
      name: name,
      desc: (document.getElementById('m-desc').value || '').trim(),
      protein: num('m-protein'),
      calories: num('m-calories'),
      fats: num('m-fats'),
      carbs: num('m-carbs')
    };
    var servings = document.getElementById('m-servings') ? (num('m-servings', true) || 1) : 1;
    var msg = 'Saved';

    if (modalMode === 'log') {
      state.logs.push(Object.assign({ id: uid(), date: today(), servings: servings }, data));
      var cb = document.getElementById('m-save');
      if (cb && cb.checked) upsertMeal(data);
      msg = 'Logged';
    } else if (modalMode === 'editLog') {
      Object.assign(editing, data, { servings: servings });
    } else if (modalMode === 'editMeal') {
      Object.assign(editing, data);
    } else {
      upsertMeal(data);
    }

    save();
    renderAll();
    toast(msg);
    closeModal();
  }

  // ===== Toast =====
  var toastTimer;
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1400);
  }

  // ===== Navigation =====
  function initNav() {
    var panels = document.getElementById('panels');
    var dots = document.querySelectorAll('.dot');

    requestAnimationFrame(function () {
      panels.scrollTo({ left: panels.clientWidth, behavior: 'instant' });
    });

    var scrollTimer;
    panels.addEventListener('scroll', function () {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function () {
        var idx = Math.round(panels.scrollLeft / panels.clientWidth);
        dots.forEach(function (d, i) { d.classList.toggle('active', i === idx); });
      }, 50);
    }, { passive: true });

    dots.forEach(function (dot) {
      dot.addEventListener('click', function () {
        panels.scrollTo({ left: parseInt(dot.dataset.panel) * panels.clientWidth, behavior: 'smooth' });
      });
    });
  }

  // ===== Init =====
  function init() {
    load();
    renderAll();
    initNav();

    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

    setTimeout(function () { pull(true); }, 400);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') { renderHome(); pull(false); }
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
