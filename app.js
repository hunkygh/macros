(function () {
  'use strict';

  var state = {
    meals: [],
    logs: [],
    plans: [],
    sprints: [],
    goals: { protein: 165, calories: 2200, fats: 70, carbs: 250 }
  };

  var STORAGE_KEY = 'macros_state';
  var SKIN_KEY = 'macros_skin';
  var MACROS = ['protein', 'calories', 'fats', 'carbs'];
  var LABELS = { protein: 'Protein', calories: 'Calories', fats: 'Fats', carbs: 'Carbs' };
  var SHORT = { protein: 'P', calories: 'Cal', fats: 'F', carbs: 'C' };
  var UNITS = { protein: 'g', calories: '', fats: 'g', carbs: 'g' };
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var CAL_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';

  var skin = localStorage.getItem(SKIN_KEY) === 'plan' ? 'plan' : 'lite';
  var modalMode = 'log';
  var editing = null;
  var modalCtx = null;
  var closeTimer;

  var SB_URL = 'https://eobhzoavxexmcoabwikq.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvYmh6b2F2eGV4bWNvYWJ3aWtxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5OTA5MjEsImV4cCI6MjEwNjU2NjkyMX0.Yam7tsY_7kPK3Ayl2hPa9rYoGZy11evKflYVz2BLIBk';
  var KEY_STORE = 'macros_sync_key';
  var updatedAt = 0;
  var pushTimer;

  function snapshot() {
    return { meals: state.meals, logs: state.logs, plans: state.plans, sprints: state.sprints, goals: state.goals };
  }

  function apply(p) {
    state.meals = p.meals || [];
    state.logs = p.logs || [];
    state.plans = p.plans || state.plans || [];
    state.sprints = p.sprints || state.sprints || [];
    state.goals = p.goals || state.goals;
  }

  function load() {
    try {
      var s = localStorage.getItem(STORAGE_KEY);
      if (s) {
        var p = JSON.parse(s);
        apply(p);
        updatedAt = p.updated_at || 0;
      }
    } catch (e) { /* noop */ }
  }

  function writeLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.assign(snapshot(), { updated_at: updatedAt })));
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
    rpc('put_state', { p_key: k, p_data: snapshot(), p_updated: updatedAt }).catch(function () {});
  }

  function pull(ask) {
    var k = syncKey(ask);
    if (!k) return;
    rpc('get_state', { p_key: k }).then(function (remote) {
      if (remote && remote.updated_at > updatedAt) {
        apply(remote.data || {});
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

  function pad(n) { return String(n).padStart(2, '0'); }
  function dkey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return dkey(d); }
  function diffDays(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }
  function today() { return dkey(new Date()); }

  function fmtDate(s) {
    var d = parse(s);
    return MONTHS[d.getMonth()] + ' ' + d.getDate();
  }

  function longDate(s) {
    var d = parse(s);
    return DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate();
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

  function logsOn(date) {
    return state.logs.filter(function (l) { return l.date === date; });
  }

  function totals(items) {
    var r = { protein: 0, calories: 0, fats: 0, carbs: 0 };
    items.forEach(function (l) {
      var m = scaled(l);
      r.protein += m.protein; r.calories += m.calories; r.fats += m.fats; r.carbs += m.carbs;
    });
    return r;
  }

  function esc(s) {
    var div = document.createElement('div');
    div.textContent = s == null ? '' : s;
    return div.innerHTML;
  }

  function pick(o) {
    return { name: o.name, desc: o.desc || '', protein: o.protein || 0, calories: o.calories || 0, fats: o.fats || 0, carbs: o.carbs || 0, servings: sv(o) };
  }

  // ===== Plans & Sprints =====
  function findSprint(id) { return state.sprints.find(function (s) { return s.id === id; }); }
  function activeSprint() { return state.sprints.find(function (s) { return !!s.active; }); }

  function sprintFor(date) {
    var s = activeSprint();
    if (!s || !s.days || !s.days.length) return null;
    var off = diffDays(s.active, date);
    if (off < 0 || off >= s.length) return null;
    return { sprint: s, day: off % s.days.length, offset: off };
  }

  function planFor(date) {
    var sf = sprintFor(date);
    if (sf) {
      return (sf.sprint.days[sf.day] || []).map(function (e) {
        return Object.assign({}, e, { pid: sf.sprint.id + ':' + date + ':' + e.id });
      });
    }
    return state.plans.filter(function (p) { return p.date === date; }).map(function (p) {
      return Object.assign({}, p, { pid: p.id });
    });
  }

  function goalsFor(date) {
    var sf = sprintFor(date);
    return sf && sf.sprint.goals ? sf.sprint.goals : state.goals;
  }

  // ctx: { date } | { dates } | { sprintId, day }
  function targetList(ctx) {
    if (ctx.sprintId) {
      var s = findSprint(ctx.sprintId);
      if (!s) return null;
      if (!s.days[ctx.day]) s.days[ctx.day] = [];
      return s.days[ctx.day];
    }
    var sf = sprintFor(ctx.date);
    if (sf) {
      if (!sf.sprint.days[sf.day]) sf.sprint.days[sf.day] = [];
      return sf.sprint.days[sf.day];
    }
    return null;
  }

  function addPlan(ctx, data) {
    if (ctx.dates) { ctx.dates.forEach(function (d) { addPlan({ date: d }, data); }); return; }
    var list = targetList(ctx);
    var e = Object.assign({ id: uid() }, data);
    if (list) list.push(e); else state.plans.push(Object.assign(e, { date: ctx.date }));
  }

  function updatePlan(ctx, id, data) {
    var arr = targetList(ctx) || state.plans;
    var e = arr.find(function (x) { return x.id === id; });
    if (e) Object.assign(e, data);
  }

  function removePlan(ctx, id) {
    var list = targetList(ctx);
    if (list) {
      var i = list.findIndex(function (x) { return x.id === id; });
      if (i !== -1) list.splice(i, 1);
    } else {
      state.plans = state.plans.filter(function (p) { return p.id !== id; });
    }
  }

  function linkedLog(pid, date) {
    return state.logs.find(function (l) { return l.planId === pid && l.date === date; });
  }

  function startSprint(sp) {
    var start = cal.sel.length === 1 ? cal.sel[0] : today();
    state.sprints.forEach(function (s) { s.active = null; });
    sp.active = start;
    save();
    renderAll();
    toast(sp.name + ' starts ' + fmtDate(start));
  }

  function stopSprint(sp) {
    sp.active = null;
    save();
    renderAll();
    toast('Stopped');
  }

  function renderAll() {
    renderMeals();
    renderHome();
    renderPlan();
    renderTrends();
  }

  // ===== Skin =====
  function applySkin() {
    var p = document.getElementById('panel-plan');
    p.style.display = skin === 'plan' ? '' : 'none';
    renderDots(1);
    var panels = document.getElementById('panels');
    requestAnimationFrame(function () { panels.scrollTo({ left: panels.clientWidth, behavior: 'instant' }); });
  }

  function toggleSkin() {
    skin = skin === 'plan' ? 'lite' : 'plan';
    localStorage.setItem(SKIN_KEY, skin);
    applySkin();
    renderAll();
  }

  // ===== Home =====
  function renderHome() {
    var panel = document.getElementById('panel-home');
    var t = today();
    var logs = logsOn(t);
    var lt = totals(logs);
    var planOn = skin === 'plan';

    var html = '<div class="home-head"><div class="date-header">' + fmtDate(t) + '</div>';
    html += '<button class="skin-btn' + (planOn ? ' on' : '') + '" id="skin-btn" aria-label="Plan">' + CAL_ICON + '</button></div>';

    var plan = [], offPlan = logs;
    if (!planOn) {
      html += '<div class="macro-grid">';
      MACROS.forEach(function (m) { html += macroCard(lt[m], UNITS[m], LABELS[m]); });
      html += '</div>';
    } else {
      plan = planFor(t);
      var pt = totals(plan), g = goalsFor(t), sf = sprintFor(t);
      if (sf) html += '<div class="sprint-tag">' + esc(sf.sprint.name) + ' &middot; Day ' + (sf.offset + 1) + ' of ' + sf.sprint.length + '</div>';
      html += '<div class="macro-grid">';
      MACROS.forEach(function (m) {
        html += '<div class="card macro-card"><div class="macro-value">' + lt[m] + UNITS[m] + '</div><div class="macro-label">' + LABELS[m] + '</div>';
        html += '<div class="macro-sub">' + pt[m] + ' plan &middot; ' + g[m] + ' goal</div></div>';
      });
      html += '</div>';
      html += diffCard(lt, pt, g);
      var pids = plan.map(function (p) { return p.pid; });
      offPlan = logs.filter(function (l) { return !l.planId || pids.indexOf(l.planId) === -1; });
    }

    html += '<button class="add-btn" id="home-add">+</button>';

    if (planOn && plan.length) {
      html += '<div class="section-label">Planned</div><div class="logged-meals">';
      plan.forEach(function (p) {
        var link = linkedLog(p.pid, t);
        var st = !link ? '' : (link.name.toLowerCase() === p.name.toLowerCase() ? 'ate' : 'swap');
        var s = sv(p);
        html += '<div class="card logged-meal plan-row ' + st + '" data-pid="' + p.pid + '">';
        html += '<div class="meal-info"><div class="meal-name">' + (s !== 1 ? s + '&times; ' : '') + esc(p.name) + '</div>';
        html += '<div class="meal-macros">' + macroLine(scaled(p)) + '</div>';
        if (st === 'swap') html += '<div class="swap-note">Ate ' + esc(link.name) + ' &middot; ' + scaled(link).calories + 'cal</div>';
        html += '</div><button class="check-btn" data-pid="' + p.pid + '">' + (st ? '&#10003;' : '') + '</button></div>';
      });
      html += '</div>';
    }

    if (planOn && offPlan.length) html += '<div class="section-label">' + (plan.length ? 'Off plan' : 'Logged') + '</div>';
    html += '<div class="logged-meals">';
    offPlan.forEach(function (l) {
      var s = sv(l);
      html += '<div class="card logged-meal" data-log="' + l.id + '">';
      html += '<div class="meal-info">';
      html += '<div class="meal-name">' + (s !== 1 ? s + '&times; ' : '') + esc(l.name) + '</div>';
      html += '<div class="meal-macros">' + macroLine(scaled(l)) + '</div>';
      html += '</div></div>';
    });
    html += '</div>';

    panel.innerHTML = html;

    panel.querySelector('#skin-btn').addEventListener('click', toggleSkin);
    panel.querySelector('#home-add').addEventListener('click', function () { openModal('log'); });
    panel.querySelectorAll('.logged-meal[data-log]').forEach(function (row) {
      row.addEventListener('click', function () {
        var l = state.logs.find(function (x) { return x.id === row.dataset.log; });
        if (l) openModal('editLog', l);
      });
    });
    panel.querySelectorAll('.plan-row').forEach(function (row) {
      var p = plan.find(function (x) { return x.pid === row.dataset.pid; });
      row.addEventListener('click', function () {
        var link = linkedLog(p.pid, t);
        if (link) openModal('editLog', link); else openModal('logPlan', p);
      });
      row.querySelector('.check-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        var link = linkedLog(p.pid, t);
        if (link) {
          state.logs = state.logs.filter(function (l) { return l.id !== link.id; });
          toast('Unlogged');
        } else {
          state.logs.push(Object.assign({ id: uid(), date: t, planId: p.pid }, pick(p)));
          toast('Logged');
        }
        save();
        renderAll();
      });
    });
  }

  function macroCard(val, unit, label) {
    return '<div class="card macro-card"><div class="macro-value">' + val + unit + '</div><div class="macro-label">' + label + '</div></div>';
  }

  function diffCard(lt, pt, g) {
    var h = '<div class="card diff-card"><div class="diff-row diff-head"><span></span>';
    MACROS.forEach(function (m) { h += '<span>' + SHORT[m] + '</span>'; });
    h += '</div>';
    h += diffRow('Plan vs goal', pt, g);
    h += diffRow('Ate vs plan', lt, pt);
    h += diffRow('Ate vs goal', lt, g);
    return h + '</div>';
  }

  function diffRow(label, a, ref) {
    var h = '<div class="diff-row"><span class="diff-label">' + label + '</span>';
    MACROS.forEach(function (m) {
      if (!ref[m]) { h += '<span class="diff-val">&middot;</span>'; return; }
      var d = a[m] - ref[m];
      var cls = Math.abs(d) / ref[m] <= 0.1 ? 'ok' : 'off';
      h += '<span class="diff-val ' + cls + '">' + (d > 0 ? '+' + d : d < 0 ? '&minus;' + Math.abs(d) : '0') + '</span>';
    });
    return h + '</div>';
  }

  // ===== Plan (calendar) =====
  var cal = { month: today().slice(0, 8) + '01', sel: [today()], multi: false };

  function renderPlan() {
    var panel = document.getElementById('panel-plan');
    if (skin !== 'plan') { panel.innerHTML = ''; return; }

    var m = parse(cal.month);
    var y = m.getFullYear(), mo = m.getMonth();
    var first = m.getDay();
    var dim = new Date(y, mo + 1, 0).getDate();
    var t = today();

    var html = '<div class="cal-head"><button class="cal-nav" data-nav="-1">&lsaquo;</button>';
    html += '<div class="cal-title">' + MONTHS_FULL[mo] + ' ' + y + '</div>';
    html += '<button class="cal-nav" data-nav="1">&rsaquo;</button>';
    html += '<button class="pill' + (cal.multi ? ' on' : '') + '" id="cal-multi">Select</button></div>';

    html += '<div class="cal-grid cal-week">';
    DAYS.forEach(function (d) { html += '<span>' + d.charAt(0) + '</span>'; });
    html += '</div><div class="cal-grid">';
    for (var i = 0; i < first; i++) html += '<span></span>';
    for (var d = 1; d <= dim; d++) {
      var k = dkey(new Date(y, mo, d));
      var kc = totals(planFor(k)).calories;
      var cls = 'day';
      if (k === t) cls += ' today';
      if (cal.sel.indexOf(k) !== -1) cls += ' sel';
      if (sprintFor(k)) cls += ' spr';
      html += '<button class="' + cls + '" data-day="' + k + '"><span class="dnum">' + d + '</span><span class="dcal">' + (kc || '') + '</span></button>';
    }
    html += '</div>';

    var sel = cal.sel.slice().sort();
    if (sel.length === 1) html += dayDetail(sel[0]);
    else if (sel.length > 1) html += multiDetail(sel);
    else html += '<div class="note">Tap days to select</div>';

    html += '<div class="section-head"><div class="section-label">Sprints</div><button class="small-add-btn" id="sprint-new">+</button></div>';
    html += '<div class="logged-meals">';
    state.sprints.forEach(function (s) {
      var sub = s.length + ' days' + (s.days.length !== s.length ? ' &middot; ' + s.days.length + '-day cycle' : '');
      if (s.active) {
        var off = diffDays(s.active, t);
        sub = off < 0 ? 'Starts ' + fmtDate(s.active) : off >= s.length ? 'Ended' : 'Day ' + (off + 1) + ' of ' + s.length;
      }
      html += '<div class="card meal-item sprint-item" data-sid="' + s.id + '"><div class="meal-info">';
      html += '<div class="meal-name">' + esc(s.name) + '</div><div class="meal-macros">' + sub + '</div></div>';
      html += '<button class="log-btn" data-sid="' + s.id + '">' + (s.active ? 'STOP' : 'START') + '</button></div>';
    });
    html += '</div>';

    panel.innerHTML = html;

    panel.querySelectorAll('.cal-nav').forEach(function (b) {
      b.addEventListener('click', function () {
        var nm = new Date(y, mo + parseInt(b.dataset.nav), 1);
        cal.month = dkey(nm);
        renderPlan();
      });
    });
    panel.querySelector('#cal-multi').addEventListener('click', function () {
      cal.multi = !cal.multi;
      if (!cal.multi) cal.sel = cal.sel.slice(-1);
      renderPlan();
    });
    panel.querySelectorAll('.day').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.dataset.day;
        if (cal.multi) {
          var i = cal.sel.indexOf(k);
          if (i === -1) cal.sel.push(k); else cal.sel.splice(i, 1);
        } else {
          cal.sel = [k];
        }
        renderPlan();
      });
    });

    if (sel.length === 1) {
      var date = sel[0];
      var items = planFor(date);
      panel.querySelector('#plan-add').addEventListener('click', function () { openModal('plan', null, { date: date }); });
      panel.querySelectorAll('.plan-entry').forEach(function (row) {
        row.addEventListener('click', function () {
          var e = items.find(function (x) { return x.id === row.dataset.eid; });
          if (e) openModal('editPlan', e, { date: date });
        });
      });
    } else if (sel.length > 1) {
      panel.querySelector('#multi-add').addEventListener('click', function () { openModal('plan', null, { dates: sel }); });
      panel.querySelector('#multi-sprint').addEventListener('click', function () {
        var n = diffDays(sel[0], sel[sel.length - 1]) + 1;
        var days = [];
        for (var i = 0; i < n; i++) {
          days.push(planFor(addDays(sel[0], i)).map(function (e) { return Object.assign({ id: uid() }, pick(e)); }));
        }
        openSprint(null, days);
      });
      panel.querySelector('#multi-clear').addEventListener('click', function () {
        if (!window.confirm('Clear planned meals on ' + sel.length + ' days?')) return;
        state.plans = state.plans.filter(function (p) { return sel.indexOf(p.date) === -1 || sprintFor(p.date); });
        save();
        renderAll();
        toast('Cleared');
      });
    }

    panel.querySelector('#sprint-new').addEventListener('click', function () { openSprint(null); });
    panel.querySelectorAll('.sprint-item').forEach(function (row) {
      row.addEventListener('click', function () { var s = findSprint(row.dataset.sid); if (s) openSprint(s); });
      row.querySelector('.log-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        var s = findSprint(row.dataset.sid);
        if (!s) return;
        if (s.active) stopSprint(s); else startSprint(s);
      });
    });
  }

  function dayDetail(date) {
    var items = planFor(date), pt = totals(items), g = goalsFor(date), sf = sprintFor(date);
    var h = '<div class="detail"><div class="detail-head"><div class="detail-title">' + longDate(date) + '</div>';
    if (sf) h += '<div class="sprint-tag">' + esc(sf.sprint.name) + ' &middot; Day ' + (sf.offset + 1) + '</div>';
    h += '</div><div class="mini-grid">';
    MACROS.forEach(function (m) {
      h += '<div class="mini"><div class="mini-val">' + pt[m] + '<span>/' + g[m] + '</span></div><div class="macro-label">' + SHORT[m] + '</div></div>';
    });
    h += '</div><div class="logged-meals">';
    items.forEach(function (e) {
      var s = sv(e);
      h += '<div class="card logged-meal plan-entry" data-eid="' + e.id + '"><div class="meal-info">';
      h += '<div class="meal-name">' + (s !== 1 ? s + '&times; ' : '') + esc(e.name) + '</div>';
      h += '<div class="meal-macros">' + macroLine(scaled(e)) + '</div></div></div>';
    });
    h += '</div><button class="wide-btn" id="plan-add">+ Add meal</button>';
    if (sf && sf.sprint.days.length < sf.sprint.length) h += '<div class="note">Edits apply to every Day ' + (sf.day + 1) + ' of the cycle</div>';
    return h + '</div>';
  }

  function multiDetail(sel) {
    var h = '<div class="detail"><div class="detail-title">' + sel.length + ' days</div>';
    h += '<div class="btn-row"><button class="wide-btn" id="multi-add">+ Add to all</button>';
    h += '<button class="wide-btn" id="multi-sprint">Save as sprint</button></div>';
    h += '<button class="modal-delete" id="multi-clear">Clear</button></div>';
    return h;
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
          renderAll();
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
  function showSheet(html) {
    var modal = document.getElementById('modal');
    var overlay = document.getElementById('modal-overlay');
    clearTimeout(closeTimer);
    modal.innerHTML = html;
    modal.scrollTop = 0;
    overlay.classList.add('active');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { modal.classList.add('active'); });
    });
    overlay.onclick = function (e) { if (e.target === overlay) closeModal(); };
  }

  // modes: log, save, editLog, editMeal, logPlan (log a planned item), plan (new planned item), editPlan
  function openModal(mode, item, ctx) {
    modalMode = mode;
    modalCtx = ctx || null;
    editing = (mode === 'editLog' || mode === 'editMeal' || mode === 'editPlan' || mode === 'logPlan') ? item : null;
    var prefill = item || null;
    var hasServings = mode !== 'save' && mode !== 'editMeal';
    var suggest = mode === 'log' || mode === 'logPlan' || mode === 'plan' || mode === 'editPlan';
    var canDelete = mode === 'editLog' || mode === 'editMeal' || mode === 'editPlan';

    var html = '<div class="modal-handle"></div><div class="modal-fields">';
    html += '<input type="text" id="m-name" class="modal-input" placeholder="Name" autocomplete="off">';
    if (suggest) html += '<div class="suggestions" id="m-suggest"></div>';
    html += '<input type="text" id="m-desc" class="modal-input" placeholder="Description" autocomplete="off">';
    html += '<div class="modal-macro-grid">';
    MACROS.forEach(function (m) { html += macroInput('m-' + m, LABELS[m]); });
    html += '</div>';
    if (hasServings) {
      html += '<div class="servings-row">';
      html += '<button class="step-btn" id="m-minus">&minus;</button>';
      html += '<div class="modal-macro"><input type="number" id="m-servings" class="modal-input macro-input" value="1" step="0.25" min="0" inputmode="decimal"><span class="input-label">Servings</span></div>';
      html += '<button class="step-btn" id="m-plus">+</button>';
      html += '</div>';
    }
    if ((mode === 'log' || mode === 'plan' || mode === 'logPlan') && !(prefill && prefill.id && state.meals.some(function (m) { return m.id === prefill.id; }))) {
      html += '<label class="save-toggle"><input type="checkbox" id="m-save"><span>Save to library</span></label>';
    }
    html += '</div>';
    var label = mode === 'log' || mode === 'logPlan' ? 'Log' : mode === 'plan' ? 'Add' : 'Save';
    html += '<button class="modal-submit" id="m-submit">' + label + '</button>';
    if (canDelete) html += '<button class="modal-delete" id="m-delete">Delete</button>';

    showSheet(html);

    if (prefill) fill(prefill);
    if (hasServings && prefill && prefill.servings) document.getElementById('m-servings').value = sv(prefill);

    if (hasServings) {
      var sEl = document.getElementById('m-servings');
      document.getElementById('m-minus').addEventListener('click', function () {
        sEl.value = Math.max(0.25, (parseFloat(sEl.value) || 1) - 0.5);
      });
      document.getElementById('m-plus').addEventListener('click', function () {
        sEl.value = (parseFloat(sEl.value) || 0) + 0.5;
      });
    }

    if (!prefill) setTimeout(function () { var el = document.getElementById('m-name'); if (el) el.focus(); }, 350);

    document.getElementById('m-submit').addEventListener('click', submitModal);
    if (canDelete) document.getElementById('m-delete').addEventListener('click', deleteEditing);
    if (suggest) initSuggest();
  }

  function fill(m) {
    document.getElementById('m-name').value = m.name;
    document.getElementById('m-desc').value = m.desc || '';
    MACROS.forEach(function (k) { document.getElementById('m-' + k).value = m[k]; });
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
    var el = document.getElementById(id);
    if (!el) return 0;
    var n = isFloat ? parseFloat(el.value) : parseInt(el.value);
    return isNaN(n) ? 0 : n;
  }

  function closeModal() {
    document.getElementById('modal').classList.remove('active');
    var overlay = document.getElementById('modal-overlay');
    clearTimeout(closeTimer);
    closeTimer = setTimeout(function () { overlay.classList.remove('active'); }, 300);
    editing = null;
    modalCtx = null;
  }

  function finish(msg) {
    var back = modalCtx && modalCtx.sprintId ? findSprint(modalCtx.sprintId) : null;
    save();
    renderAll();
    toast(msg);
    if (back) openSprint(back); else closeModal();
  }

  function deleteEditing() {
    if (!editing) return;
    if (modalMode === 'editLog') {
      var lid = editing.id;
      state.logs = state.logs.filter(function (l) { return l.id !== lid; });
    } else if (modalMode === 'editPlan') {
      removePlan(modalCtx, editing.id);
    } else {
      var mid = editing.id;
      state.meals = state.meals.filter(function (m) { return m.id !== mid; });
    }
    finish('Deleted');
  }

  function submitModal() {
    var name = (document.getElementById('m-name').value || '').trim();
    if (!name) { document.getElementById('m-name').focus(); return; }

    var data = { name: name, desc: (document.getElementById('m-desc').value || '').trim() };
    MACROS.forEach(function (m) { data[m] = num('m-' + m); });
    var servings = document.getElementById('m-servings') ? (num('m-servings', true) || 1) : 1;
    var cb = document.getElementById('m-save');
    var msg = 'Saved';

    if (modalMode === 'log' || modalMode === 'logPlan') {
      var log = Object.assign({ id: uid(), date: today(), servings: servings }, data);
      if (modalMode === 'logPlan') log.planId = editing.pid;
      state.logs.push(log);
      msg = 'Logged';
    } else if (modalMode === 'plan') {
      addPlan(modalCtx, Object.assign({}, data, { servings: servings }));
      msg = 'Planned';
    } else if (modalMode === 'editPlan') {
      updatePlan(modalCtx, editing.id, Object.assign({}, data, { servings: servings }));
    } else if (modalMode === 'editLog') {
      Object.assign(editing, data, { servings: servings });
    } else if (modalMode === 'editMeal') {
      Object.assign(editing, data);
    } else {
      upsertMeal(data);
    }
    if (cb && cb.checked) upsertMeal(data);

    finish(msg);
  }

  // ===== Sprint sheet =====
  var sprintDraftDays = null;

  function openSprint(sp, seedDays) {
    modalMode = 'sprint';
    editing = sp || null;
    modalCtx = null;
    sprintDraftDays = sp ? null : (seedDays || [[], [], [], [], [], [], []]);
    var days = sp ? sp.days : sprintDraftDays;
    var g = sp && sp.goals ? sp.goals : state.goals;

    var html = '<div class="modal-handle"></div><div class="modal-fields">';
    html += '<input type="text" id="s-name" class="modal-input" placeholder="Name" autocomplete="off">';
    html += '<div class="modal-macro-grid">';
    html += '<div class="modal-macro"><input type="number" id="s-length" class="modal-input macro-input" inputmode="numeric" value="' + (sp ? sp.length : days.length) + '"><span class="input-label">Total days</span></div>';
    html += '<div class="modal-macro"><input type="number" id="s-cycle" class="modal-input macro-input" inputmode="numeric" value="' + days.length + '"><span class="input-label">Repeat every</span></div>';
    html += '</div><div class="modal-macro-grid">';
    MACROS.forEach(function (m) {
      html += '<div class="modal-macro"><input type="number" id="s-' + m + '" class="modal-input macro-input" inputmode="numeric" value="' + g[m] + '"><span class="input-label">' + LABELS[m] + '</span></div>';
    });
    html += '</div>';
    if (sp) {
      html += '<div class="sp-days">';
      sp.days.forEach(function (entries, i) {
        html += '<div class="sp-day"><div class="sp-day-head"><span class="sp-day-title">Day ' + (i + 1) + '</span>';
        html += '<span class="meal-macros">' + totals(entries).calories + ' cal</span><button class="sp-add" data-day="' + i + '">+</button></div>';
        entries.forEach(function (e) {
          html += '<div class="sp-entry" data-day="' + i + '" data-eid="' + e.id + '"><span>' + (sv(e) !== 1 ? sv(e) + '&times; ' : '') + esc(e.name) + '</span><span class="meal-macros">' + scaled(e).calories + '</span></div>';
        });
        html += '</div>';
      });
      html += '</div>';
    }
    html += '</div>';
    html += '<button class="modal-submit" id="s-save">Save</button>';
    if (sp) {
      html += '<div class="btn-row"><button class="wide-btn" id="s-fit">Fit to goals</button>';
      html += '<button class="wide-btn" id="s-toggle">' + (sp.active ? 'Stop' : 'Start') + '</button></div>';
      html += '<button class="modal-delete" id="s-delete">Delete</button>';
    }

    showSheet(html);
    document.getElementById('s-name').value = sp ? sp.name : '';

    document.getElementById('s-save').addEventListener('click', function () {
      var s = commitSprint();
      save();
      renderAll();
      toast('Saved');
      if (sp) closeModal(); else openSprint(s);
    });

    if (!sp) return;

    document.querySelectorAll('.sp-add').forEach(function (b) {
      b.addEventListener('click', function () {
        commitSprint();
        openModal('plan', null, { sprintId: sp.id, day: +b.dataset.day });
      });
    });
    document.querySelectorAll('.sp-entry').forEach(function (row) {
      row.addEventListener('click', function () {
        commitSprint();
        var e = (sp.days[+row.dataset.day] || []).find(function (x) { return x.id === row.dataset.eid; });
        if (e) openModal('editPlan', e, { sprintId: sp.id, day: +row.dataset.day });
      });
    });
    document.getElementById('s-fit').addEventListener('click', function () {
      commitSprint();
      sp.days.forEach(function (entries) {
        var c = totals(entries).calories;
        if (!c) return;
        var f = sp.goals.calories / c;
        entries.forEach(function (e) { e.servings = Math.max(0.25, Math.round(sv(e) * f * 4) / 4); });
      });
      save();
      renderAll();
      toast('Fitted to goals');
      openSprint(sp);
    });
    document.getElementById('s-toggle').addEventListener('click', function () {
      commitSprint();
      if (sp.active) stopSprint(sp); else startSprint(sp);
      closeModal();
    });
    document.getElementById('s-delete').addEventListener('click', function () {
      if (!window.confirm('Delete ' + sp.name + '?')) return;
      state.sprints = state.sprints.filter(function (s) { return s.id !== sp.id; });
      save();
      renderAll();
      toast('Deleted');
      closeModal();
    });
  }

  function commitSprint() {
    var sp = editing;
    if (!sp) {
      sp = { id: uid(), active: null, days: sprintDraftDays };
      state.sprints.push(sp);
      editing = sp;
    }
    sp.name = (document.getElementById('s-name').value || '').trim() || 'Sprint';
    var cycle = Math.max(1, num('s-cycle') || sp.days.length || 7);
    while (sp.days.length < cycle) sp.days.push([]);
    sp.days.length = cycle;
    sp.length = Math.max(1, num('s-length') || cycle);
    sp.goals = {};
    MACROS.forEach(function (m) { sp.goals[m] = num('s-' + m); });
    return sp;
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
  function visiblePanels() {
    return Array.prototype.filter.call(document.querySelectorAll('.panel'), function (p) { return p.style.display !== 'none'; });
  }

  function renderDots(activeIdx) {
    var wrap = document.getElementById('nav-dots');
    var panels = document.getElementById('panels');
    var html = '';
    visiblePanels().forEach(function (p, i) { html += '<div class="dot' + (i === activeIdx ? ' active' : '') + '"></div>'; });
    wrap.innerHTML = html;
    wrap.querySelectorAll('.dot').forEach(function (dot, i) {
      dot.addEventListener('click', function () {
        panels.scrollTo({ left: i * panels.clientWidth, behavior: 'smooth' });
      });
    });
  }

  function initNav() {
    var panels = document.getElementById('panels');
    applySkin();

    var scrollTimer;
    panels.addEventListener('scroll', function () {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function () {
        var idx = Math.round(panels.scrollLeft / panels.clientWidth);
        document.querySelectorAll('.dot').forEach(function (d, i) { d.classList.toggle('active', i === idx); });
      }, 50);
    }, { passive: true });
  }

  // ===== Init =====
  function init() {
    load();
    initNav();
    renderAll();

    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

    setTimeout(function () { pull(true); }, 400);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') { renderHome(); renderPlan(); pull(false); }
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
