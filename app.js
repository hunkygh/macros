(function () {
  'use strict';

  // ===== State =====
  var state = {
    meals: [],
    logs: [],
    goals: { protein: 165, calories: 2200, fats: 70, carbs: 250 }
  };

  var STORAGE_KEY = 'macros_state';
  var modalMode = 'log';

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
  function syncKey() {
    var k = localStorage.getItem(KEY_STORE);
    if (!k) {
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

  function pull() {
    var k = syncKey();
    if (!k) return;
    rpc('get_state', { p_key: k }).then(function (remote) {
      if (remote && remote.updated_at > updatedAt) {
        state.meals = remote.data.meals || [];
        state.logs = remote.data.logs || [];
        state.goals = remote.data.goals || state.goals;
        updatedAt = remote.updated_at;
        writeLocal();
        renderMeals();
        renderHome();
        renderTrends();
      } else if (!remote || remote.updated_at < updatedAt) {
        push();
      }
    }).catch(function () {});
  }

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
    var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    return (d.getMonth() + 1) + '/' + d.getDate();
  }

  function todaysLogs() {
    var t = today();
    return state.logs.filter(function (l) { return l.date === t; });
  }

  function totals(logs) {
    var r = { protein: 0, calories: 0, fats: 0, carbs: 0 };
    logs.forEach(function (l) {
      r.protein += l.protein || 0;
      r.calories += l.calories || 0;
      r.fats += l.fats || 0;
      r.carbs += l.carbs || 0;
    });
    return r;
  }

  function esc(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  // ===== Rendering =====

  function renderHome() {
    var panel = document.getElementById('panel-home');
    var t = totals(todaysLogs());
    var logs = todaysLogs();

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
      html += '<div class="card logged-meal">';
      html += '<div class="meal-info">';
      html += '<div class="meal-name">' + esc(l.name) + '</div>';
      html += '<div class="meal-macros">' + l.protein + 'p &middot; ' + l.calories + 'cal &middot; ' + l.fats + 'f &middot; ' + l.carbs + 'c</div>';
      html += '</div>';
      html += '<button class="delete-btn" data-log="' + l.id + '">&times;</button>';
      html += '</div>';
    });
    html += '</div>';

    panel.innerHTML = html;

    panel.querySelector('#home-add').addEventListener('click', function () { openModal('log'); });
    panel.querySelectorAll('.delete-btn[data-log]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.logs = state.logs.filter(function (l) { return l.id !== btn.dataset.log; });
        save();
        renderHome();
        renderTrends();
      });
    });
  }

  function macroCard(val, unit, label) {
    return '<div class="card macro-card"><div class="macro-value">' + val + unit + '</div><div class="macro-label">' + label + '</div></div>';
  }

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
      html += '<div class="card meal-item">';
      html += '<div class="meal-info">';
      html += '<div class="meal-name">' + esc(m.name) + '</div>';
      html += '<div class="meal-macros">' + m.protein + 'p &middot; ' + m.calories + 'cal &middot; ' + m.fats + 'f &middot; ' + m.carbs + 'c</div>';
      html += '</div>';
      html += '<div class="meal-actions">';
      html += '<button class="log-btn" data-mid="' + m.id + '">LOG</button>';
      html += '<button class="delete-btn" data-meal="' + m.id + '">&times;</button>';
      html += '</div></div>';
    });
    list.innerHTML = html;

    list.querySelectorAll('.log-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var meal = state.meals.find(function (m) { return m.id === btn.dataset.mid; });
        if (!meal) return;
        state.logs.push({ id: uid(), date: today(), name: meal.name, desc: meal.desc || '', protein: meal.protein, calories: meal.calories, fats: meal.fats, carbs: meal.carbs });
        save();
        renderHome();
        renderTrends();
        toast('Logged');
      });
    });

    list.querySelectorAll('.delete-btn[data-meal]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.meals = state.meals.filter(function (m) { return m.id !== btn.dataset.meal; });
        save();
        updateMealsList();
      });
    });
  }

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
      html += '<div class="card chart-card"><div class="chart-title">' + name + '</div>';
      html += '<div class="chart-wrapper"><div class="chart-y-axis" id="yaxis-' + name.toLowerCase() + '"></div>';
      html += '<div class="chart-scroll" id="scroll-' + name.toLowerCase() + '"><div class="chart-area" id="chart-' + name.toLowerCase() + '"></div></div>';
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

  // ===== Charts =====

  function dailyTotals() {
    var byDate = {};
    state.logs.forEach(function (l) {
      if (!byDate[l.date]) byDate[l.date] = { protein: 0, calories: 0, fats: 0, carbs: 0 };
      byDate[l.date].protein += l.protein || 0;
      byDate[l.date].calories += l.calories || 0;
      byDate[l.date].fats += l.fats || 0;
      byDate[l.date].carbs += l.carbs || 0;
    });
    return Object.keys(byDate).sort().map(function (d) {
      return { date: d, protein: byDate[d].protein, calories: byDate[d].calories, fats: byDate[d].fats, carbs: byDate[d].carbs };
    });
  }

  function renderCharts() {
    var data = dailyTotals();
    ['calories', 'protein', 'fats', 'carbs'].forEach(function (macro) {
      var pts = data.map(function (d) { return { date: d.date, value: d[macro] }; });
      drawDotChart(macro, pts, state.goals[macro]);
    });
  }

  function drawDotChart(macro, data, goal) {
    var area = document.getElementById('chart-' + macro);
    var yaxis = document.getElementById('yaxis-' + macro);
    var scrollEl = document.getElementById('scroll-' + macro);
    if (!area || !yaxis || !scrollEl) return;

    var DOT = 10;
    var DAY_W = 50;
    var H = 150;
    var PAD_T = 16;
    var PAD_B = 24;
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

    var html = '<div class="goal-line" style="top:' + goalY + 'px;left:0;right:0;background:#1a1a1a;opacity:0.18;position:absolute;height:1.5px"></div>';

    data.forEach(function (d, i) {
      var x = 20 + i * DAY_W;
      var y = PAD_T + PLOT_H * (1 - d.value / maxVal);
      var pct = Math.abs(d.value - goal) / goal;
      var color = pct <= 0.1 ? 'var(--green)' : pct <= 0.25 ? 'var(--yellow)' : 'var(--red)';
      html += '<div class="chart-dot" style="left:' + (x - DOT / 2) + 'px;top:' + (y - DOT / 2) + 'px;width:' + DOT + 'px;height:' + DOT + 'px;background:' + color + ';position:absolute;border-radius:50%" title="' + fmtDate(d.date) + ': ' + d.value + '"></div>';
      html += '<div class="chart-date-label" style="left:' + x + 'px;bottom:4px;position:absolute;font-size:9px;color:var(--light);transform:translateX(-50%)">' + shortDate(d.date) + '</div>';
    });

    area.innerHTML = html;

    var ticks = [0, Math.round(maxVal / 2), Math.round(maxVal)];
    var yhtml = '';
    ticks.forEach(function (v) {
      var top = PAD_T + PLOT_H * (1 - v / maxVal);
      yhtml += '<span class="y-label" style="top:' + top + 'px">' + v + '</span>';
    });
    yhtml += '<span class="y-label" style="top:' + goalY + 'px;font-weight:600;color:var(--title)">' + goal + '</span>';
    yaxis.innerHTML = yhtml;

    scrollEl.scrollLeft = scrollEl.scrollWidth;
  }

  // ===== Modal =====

  function openModal(mode) {
    modalMode = mode;
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
    if (mode === 'log') {
      html += '<label class="save-toggle"><input type="checkbox" id="m-save"><span>Save to library</span></label>';
    }
    html += '</div>';
    html += '<button class="modal-submit" id="m-submit">' + (mode === 'log' ? 'Log' : 'Save') + '</button>';

    modal.innerHTML = html;
    overlay.classList.add('active');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        modal.classList.add('active');
      });
    });
    setTimeout(function () { var el = document.getElementById('m-name'); if (el) el.focus(); }, 350);

    document.getElementById('m-submit').addEventListener('click', submitModal);
    if (mode === 'log') initSuggest();
    overlay.addEventListener('click', function handler(e) {
      if (e.target === overlay) { closeModal(); overlay.removeEventListener('click', handler); }
    });
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
        html += '<div class="meal-macros">' + m.protein + 'p &middot; ' + m.calories + 'cal &middot; ' + m.fats + 'f &middot; ' + m.carbs + 'c</div></div>';
      });
      box.innerHTML = html;
      box.querySelectorAll('.suggestion').forEach(function (el) {
        el.addEventListener('click', function () {
          var m = state.meals.find(function (x) { return x.id === el.dataset.mid; });
          if (!m) return;
          nameEl.value = m.name;
          document.getElementById('m-desc').value = m.desc || '';
          document.getElementById('m-protein').value = m.protein;
          document.getElementById('m-calories').value = m.calories;
          document.getElementById('m-fats').value = m.fats;
          document.getElementById('m-carbs').value = m.carbs;
          box.innerHTML = '';
        });
      });
    });
  }

  function upsertMeal(data) {
    var existing = state.meals.find(function (m) { return m.name.toLowerCase() === data.name.toLowerCase(); });
    if (existing) {
      existing.desc = data.desc; existing.protein = data.protein; existing.calories = data.calories; existing.fats = data.fats; existing.carbs = data.carbs;
    } else {
      state.meals.push({ id: uid(), name: data.name, desc: data.desc, protein: data.protein, calories: data.calories, fats: data.fats, carbs: data.carbs });
    }
  }

  function macroInput(id, label) {
    return '<div class="modal-macro"><input type="number" id="' + id + '" class="modal-input macro-input" placeholder="0" inputmode="numeric"><span class="input-label">' + label + '</span></div>';
  }

  function closeModal() {
    document.getElementById('modal').classList.remove('active');
    var overlay = document.getElementById('modal-overlay');
    setTimeout(function () { overlay.classList.remove('active'); }, 300);
  }

  function submitModal() {
    var name = (document.getElementById('m-name').value || '').trim();
    if (!name) { document.getElementById('m-name').focus(); return; }

    var data = {
      name: name,
      desc: (document.getElementById('m-desc').value || '').trim(),
      protein: parseInt(document.getElementById('m-protein').value) || 0,
      calories: parseInt(document.getElementById('m-calories').value) || 0,
      fats: parseInt(document.getElementById('m-fats').value) || 0,
      carbs: parseInt(document.getElementById('m-carbs').value) || 0
    };

    if (modalMode === 'log') {
      state.logs.push({ id: uid(), date: today(), name: data.name, desc: data.desc, protein: data.protein, calories: data.calories, fats: data.fats, carbs: data.carbs });
      var cb = document.getElementById('m-save');
      if (cb && cb.checked) {
        upsertMeal(data);
        renderMeals();
      }
      save();
      renderHome();
      renderTrends();
      toast('Logged');
    } else {
      upsertMeal(data);
      save();
      renderMeals();
      toast('Saved');
    }
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
        dots.forEach(function (d, i) {
          d.classList.toggle('active', i === idx);
        });
      }, 50);
    }, { passive: true });

    dots.forEach(function (dot) {
      dot.addEventListener('click', function () {
        var idx = parseInt(dot.dataset.panel);
        panels.scrollTo({ left: idx * panels.clientWidth, behavior: 'smooth' });
      });
    });
  }

  // ===== Init =====
  function init() {
    load();
    renderMeals();
    renderHome();
    renderTrends();
    initNav();

    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

    setTimeout(pull, 400);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') pull(); });

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
