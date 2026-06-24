(function () {
  'use strict';

  var config = window.APP_CONFIG || {};
  // The admin endpoint lives next to the public submit function on the same
  // Supabase project, so derive it instead of hardcoding a second URL.
  var ADMIN_ENDPOINT = (config.submissionEndpoint || '').replace(/submit-exercise\/?$/, 'admin-data');
  var TOKEN_KEY = 'northstar_admin_token';

  // Free-tier ceilings as of 2026-06. These are the plan limits we measure usage
  // against — verify against current Supabase/Vercel pricing pages before acting
  // on a number, since providers revise them.
  var LIMITS = {
    supabaseDbBytes: 500 * 1024 * 1024,        // 500 MB included database
    supabaseEgressBytes: 5 * 1024 * 1024 * 1024, // 5 GB/mo egress
    supabaseEdgeInvocations: 500000,            // 500k edge function calls/mo
    supabaseMau: 50000,                         // 50k monthly active users
    vercelBandwidthBytes: 100 * 1024 * 1024 * 1024 // 100 GB/mo (Hobby)
  };
  // Rough bytes shipped per visitor of the static site (HTML+CSS+JS+fonts, mostly
  // cached after first load). Used only to sanity-check Vercel bandwidth.
  var BYTES_PER_VISIT = 350 * 1024;

  // Token estimate per AI roadmap, used to approximate LLM cost for calls made
  // before per-call token logging was deployed (submit-exercise records exact
  // usage going forward). Calibrated against a real logged call: web_search
  // inflates input far beyond the prompt size (~9.7k in / ~1.9k out observed).
  var EST_TOKENS = { input: 9700, output: 1900 };

  // ---- tiny DOM helpers -------------------------------------------------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function fmt(n) { return (n == null ? 0 : Number(n)).toLocaleString('en-US'); }
  function money(n) {
    if (!isFinite(n)) return '$0.00';
    if (n > 0 && n < 0.01) return '<$0.01';
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: n < 100 ? 4 : 2 });
  }
  function bytes(b) {
    b = Number(b) || 0;
    if (b >= 1024 * 1024 * 1024) return (b / 1073741824).toFixed(2) + ' GB';
    if (b >= 1024 * 1024) return (b / 1048576).toFixed(1) + ' MB';
    if (b >= 1024) return (b / 1024).toFixed(0) + ' KB';
    return b + ' B';
  }
  function pct(part, whole) { return whole > 0 ? Math.min(100, (part / whole) * 100) : 0; }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function relTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso), diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + 'd ago';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // Question id -> prompt, for the detail drawer.
  var QUESTION_LABELS = {};
  try {
    (window.EXERCISE_DATA && window.EXERCISE_DATA.questions || []).forEach(function (q) {
      QUESTION_LABELS[q.id] = q.title;
    });
  } catch (e) { /* data.js optional */ }

  // ---- state ------------------------------------------------------------
  var state = { token: '', data: null, filter: '' };

  // ---- auth / fetch -----------------------------------------------------
  function getToken() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }
  function setToken(t) {
    try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }

  async function fetchData(token) {
    if (!ADMIN_ENDPOINT) throw new Error('Admin endpoint is not configured in js/config.js.');
    var url = ADMIN_ENDPOINT + '?exercise=' + encodeURIComponent(config.exerciseId || '') + '&limit=1000';
    var res = await fetch(url, { headers: { 'x-admin-token': token } });
    var body = await res.json().catch(function () { return {}; });
    if (res.status === 401) { var err = new Error('Token not accepted.'); err.unauthorized = true; throw err; }
    if (!res.ok) throw new Error(body.error || ('Request failed (' + res.status + ').'));
    return body;
  }

  // ---- gate -------------------------------------------------------------
  function showGate(message) {
    $('#dash').hidden = true;
    $('#gate').hidden = false;
    var errEl = $('#gateError');
    if (message) { errEl.textContent = message; errEl.hidden = false; } else { errEl.hidden = true; }
  }

  async function attempt(token) {
    var btn = $('#gateSubmit');
    btn.disabled = true; btn.textContent = 'Checking…';
    try {
      var data = await fetchData(token);
      state.token = token; state.data = data;
      setToken(token);
      $('#gate').hidden = true;
      $('#dash').hidden = false;
      render();
    } catch (e) {
      setToken('');
      showGate(e.unauthorized ? 'That token was not accepted.' : e.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Unlock';
    }
  }

  async function refresh() {
    var btn = $('#refreshBtn');
    btn.disabled = true; btn.textContent = 'Refreshing…';
    try {
      state.data = await fetchData(state.token);
      render();
    } catch (e) {
      if (e.unauthorized) { setToken(''); showGate('Session expired — re-enter the token.'); }
      else alert(e.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Refresh';
    }
  }

  // ---- cost model -------------------------------------------------------
  function costOf(inputTokens, outputTokens, pricing) {
    return (inputTokens / 1e6) * pricing.inputPricePerMTok + (outputTokens / 1e6) * pricing.outputPricePerMTok;
  }
  function openaiRoadmapCount(s) { return (s.roadmapSource && s.roadmapSource.openai) || 0; }

  // True cost from logged token events when we have them; otherwise an estimate
  // from the count of AI-generated roadmaps. `measured` says which it is so the
  // UI can label it honestly.
  function llmCostSummary(s, pricing) {
    var llm = s.llm || {};
    if ((llm.calls || 0) > 0) {
      return {
        measured: true,
        allTime: costOf(llm.inputTokens || 0, llm.outputTokens || 0, pricing),
        thisMonth: costOf(llm.inputTokensThisMonth || 0, llm.outputTokensThisMonth || 0, pricing),
        perCall: llm.successes ? costOf(llm.inputTokens || 0, llm.outputTokens || 0, pricing) / llm.successes : 0
      };
    }
    var n = openaiRoadmapCount(s);
    var per = costOf(EST_TOKENS.input, EST_TOKENS.output, pricing);
    return { measured: false, allTime: n * per, thisMonth: null, perCall: per, basisCount: n };
  }

  // ---- renderers --------------------------------------------------------
  function render() {
    var d = state.data, s = d.stats || {};
    $('#metaLine').textContent = 'Exercise: ' + (s.exerciseId || 'all') +
      ' · loaded ' + new Date().toLocaleString('en-US') +
      ' · ' + fmt(d.submissionsReturned) + ' of ' + fmt((s.totals || {}).all) + ' rows';
    renderKpis(s);
    renderTrend(s.dailySubmissions || []);
    renderCost(s.llm || {}, d.pricing || {});
    renderScale(s, d.pricing || {});
    renderBars('#byPath', s.byPath, pathLabel);
    renderBars('#byDecision', s.byDecision, titleCase);
    renderBars('#byReadiness', s.byReadiness, function (x) { return x; });
    renderFlags('#topFlags', s.topFlags || []);
    renderBars('#roadmapSource', s.roadmapSource, sourceLabel);
    renderTable();
    $('#footNote').textContent = 'Free-tier limits are reference values for 2026-06; confirm on the Supabase and Vercel dashboards before upgrading. LLM cost uses the price assumptions shown above.';
  }

  function kpi(label, value, sub) {
    var c = el('div', 'kpi');
    c.appendChild(el('div', 'kpi__label', label));
    c.appendChild(el('div', 'kpi__value', value));
    if (sub) c.appendChild(el('div', 'kpi__sub', sub));
    return c;
  }

  function renderKpis(s) {
    var t = s.totals || {}, llm = s.llm || {}, pricing = (state.data.pricing || {});
    var cost = llmCostSummary(s, pricing);
    var yes = (s.byDecision && s.byDecision.yes) || 0;
    var convRate = t.all ? Math.round((yes / t.all) * 100) : 0;
    var grid = $('#kpis'); grid.innerHTML = '';
    grid.appendChild(kpi('Total', fmt(t.all), fmt(t.thisMonth) + ' this month'));
    grid.appendChild(kpi('Today', fmt(t.today), fmt(t.last7) + ' last 7d'));
    grid.appendChild(kpi('Decided "yes"', convRate + '%', fmt(yes) + ' of ' + fmt(t.all)));
    grid.appendChild(kpi('Avg clarity', (s.avgClarity != null ? s.avgClarity : '—') + '/5', 'composite ' + (s.avgComposite != null ? s.avgComposite : '—')));
    grid.appendChild(kpi('AI roadmaps', fmt(openaiRoadmapCount(s)), fmt(llm.calls) + ' logged calls'));
    grid.appendChild(kpi('LLM cost', money(cost.allTime), cost.measured ? 'measured' : 'estimated'));
  }

  function renderTrend(daily) {
    var wrap = $('#trendChart'); wrap.innerHTML = '';
    var max = Math.max.apply(null, daily.map(function (x) { return x.count; }).concat([1]));
    var row = el('div', 'trend__bars');
    daily.forEach(function (pt) {
      var col = el('div', 'trend__col');
      var bar = el('div', 'trend__bar' + (pt.count ? '' : ' is-zero'));
      bar.style.height = (pt.count ? Math.max(4, (pt.count / max) * 100) : 2) + '%';
      bar.title = pt.date + ': ' + pt.count + ' submission' + (pt.count === 1 ? '' : 's');
      col.appendChild(bar);
      row.appendChild(col);
    });
    wrap.appendChild(row);
    var axis = el('div', 'trend__axis');
    axis.appendChild(el('span', null, daily.length ? daily[0].date : ''));
    axis.appendChild(el('span', null, 'peak ' + max + '/day'));
    axis.appendChild(el('span', null, daily.length ? daily[daily.length - 1].date : ''));
    wrap.appendChild(axis);
  }

  function renderCost(llm, pricing) {
    var s = state.data.stats || {};
    var wrap = $('#costPanel'); wrap.innerHTML = '';
    var cost = llmCostSummary(s, pricing);

    var headline = cost.measured ? (cost.thisMonth != null ? money(cost.thisMonth) : money(cost.allTime)) : money(cost.allTime);
    wrap.appendChild(el('div', 'cost__big', headline));
    var tag = el('span', 'pill ' + (cost.measured ? 'pill--green' : 'pill--amber'));
    tag.textContent = cost.measured ? 'measured' : 'estimated';
    var sub = el('div', 'kpi__label');
    sub.textContent = (cost.measured ? 'Spent this calendar month ' : 'Estimated all-time spend ');
    sub.appendChild(tag);
    wrap.appendChild(sub);

    var dl = el('dl', 'cost__rows');
    function row(k, v) { dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', null, v)); }
    if (cost.measured) {
      row('All-time cost', money(cost.allTime));
      row('Cost / roadmap', money(cost.perCall));
      row('Calls (success / fail)', fmt(llm.successes) + ' / ' + fmt(llm.failures));
      row('Input tokens', fmt(llm.inputTokens));
      row('Output tokens', fmt(llm.outputTokens));
      row('Calls this month', fmt(llm.callsThisMonth));
    } else {
      row('AI roadmaps generated', fmt(cost.basisCount));
      row('Est. cost / roadmap', money(cost.perCall));
      row('Assumed tokens / call', fmt(EST_TOKENS.input) + ' in · ' + fmt(EST_TOKENS.output) + ' out');
      row('Logged token events', fmt(llm.calls) + ' (deploy submit-exercise to log exact usage)');
    }
    wrap.appendChild(dl);

    wrap.appendChild(el('p', 'cost__note',
      'Model ' + (pricing.model || '?') + ' · assumed ' + money(pricing.inputPricePerMTok) +
      '/M in, ' + money(pricing.outputPricePerMTok) + '/M out. Roadmaps are deduped per person and rate-limited per IP, so calls ≤ submissions.' +
      (cost.measured ? '' : ' Figures are estimated until exact token logging is deployed.')));
  }

  function meter(name, used, limit, detailText, etaText) {
    var p = pct(used, limit);
    var box = el('div', 'meter');
    var top = el('div', 'meter__top');
    top.appendChild(el('div', 'meter__name', name));
    top.appendChild(el('div', 'meter__pct', p < 0.1 && used > 0 ? '<0.1%' : p.toFixed(1) + '%'));
    box.appendChild(top);
    var track = el('div', 'meter__track');
    var fill = el('div', 'meter__fill' + (p >= 90 ? ' is-crit' : p >= 70 ? ' is-warn' : ''));
    fill.style.width = Math.max(p, used > 0 ? 1.5 : 0) + '%';
    track.appendChild(fill);
    box.appendChild(track);
    box.appendChild(el('div', 'meter__detail', detailText));
    if (etaText) box.appendChild(el('div', 'meter__eta', etaText));
    return { node: box, pct: p };
  }

  function monthsToLimit(used, limit, perMonth) {
    if (perMonth <= 0) return Infinity;
    return (limit - used) / perMonth;
  }
  function etaLabel(months) {
    if (!isFinite(months)) return 'No growth measured yet.';
    if (months <= 0) return 'Limit already reached.';
    if (months < 1) return 'Headroom: under a month at the current rate.';
    if (months > 240) return 'Headroom: 20+ years at the current rate.';
    return 'Headroom: ~' + Math.round(months) + ' month' + (Math.round(months) === 1 ? '' : 's') + ' at the current rate.';
  }

  function renderScale(s, pricing) {
    var wrap = $('#scalePanel'); wrap.innerHTML = '';
    var t = s.totals || {}, storage = s.storage || {}, llm = s.llm || {};
    var monthlySubs = t.last30 || 0; // submissions in the trailing 30 days
    var verdicts = [];

    // 1) Supabase database size
    var dbUsed = storage.databaseBytes || 0;
    var perSub = t.all > 0 ? (storage.submissionsTableBytes || 0) / t.all : 0;
    var dbGrowthPerMonth = perSub * monthlySubs;
    var dbMonths = monthsToLimit(dbUsed, LIMITS.supabaseDbBytes, dbGrowthPerMonth);
    var m1 = meter('Supabase database', dbUsed, LIMITS.supabaseDbBytes,
      bytes(dbUsed) + ' of ' + bytes(LIMITS.supabaseDbBytes) + ' · ~' + bytes(perSub) + '/submission · +' + bytes(dbGrowthPerMonth) + '/mo',
      etaLabel(dbMonths));
    wrap.appendChild(m1.node);
    if (isFinite(dbMonths) && dbMonths < 6) verdicts.push('Supabase database in ~' + Math.round(dbMonths) + ' months');

    // 2) Supabase edge invocations (estimated from submissions)
    var invMonth = monthlySubs; // ≈ 1 submit call each; health checks/admin add a little
    var m2 = meter('Supabase edge calls (est.)', invMonth, LIMITS.supabaseEdgeInvocations,
      '~' + fmt(invMonth) + ' of ' + fmt(LIMITS.supabaseEdgeInvocations) + '/mo, estimated from submissions. Actual count is on the Supabase dashboard.',
      invMonth > 0 ? 'Would need ~' + fmt(Math.round(LIMITS.supabaseEdgeInvocations / Math.max(invMonth, 1))) + '× current volume to hit the cap.' : 'No traffic in the last 30 days.');
    wrap.appendChild(m2.node);

    // 3) LLM monthly spend — not a free tier, but the real variable cost
    var cost = llmCostSummary(s, pricing);
    var monthCost = cost.measured && cost.thisMonth != null
      ? cost.thisMonth
      : cost.perCall * Math.min(openaiRoadmapCount(s), monthlySubs); // rough when estimated
    var budget = Number(pricing.softMonthlyBudget) || 50;
    var m3 = meter('OpenAI spend this month' + (cost.measured ? '' : ' (est.)'),
      Math.round(monthCost * 100), Math.round(budget * 100),
      money(monthCost) + (cost.measured ? ' so far' : ' estimated') + ' · ~' + money(cost.perCall) + '/roadmap · soft budget ' + money(budget),
      'Scales with new people, not resubmissions (roadmaps are cached per person).');
    wrap.appendChild(m3.node);

    // 4) Vercel bandwidth (very rough — we cannot measure visits here)
    var estVercel = monthlySubs * 6 * BYTES_PER_VISIT; // assume ~6 visits per completed submission
    var m4 = meter('Vercel bandwidth (rough est.)', estVercel, LIMITS.vercelBandwidthBytes,
      '~' + bytes(estVercel) + ' of ' + bytes(LIMITS.vercelBandwidthBytes) + '/mo, guessed at ~6 visits/submission. Use Vercel Analytics for the real figure.',
      'Static site — bandwidth is rarely the binding limit here.');
    wrap.appendChild(m4.node);

    // Verdict line — nearest binding constraint
    var verdict = el('div', 'scale__verdict');
    var headline;
    if (verdicts.length) headline = 'Heads up: projected to outgrow the free plan — ' + verdicts.join('; ') + '.';
    else if (monthlySubs === 0) headline = 'No submissions in the last 30 days, so nothing is trending toward a limit yet.';
    else headline = 'Comfortably inside the free tier. At ~' + fmt(monthlySubs) + ' submissions/month the binding constraint is OpenAI spend, not Supabase or Vercel quotas.';
    verdict.innerHTML = '<strong>Upgrade signal.</strong> ' + escapeHtml(headline) +
      ' Free Supabase projects also pause after ~7 days of inactivity — keep it warm with a periodic ping if traffic is sporadic.';
    wrap.appendChild(verdict);
  }

  function renderBars(sel, obj, labelFn) {
    var wrap = $(sel); wrap.innerHTML = '';
    var entries = Object.keys(obj || {}).map(function (k) { return [k, obj[k]]; })
      .sort(function (a, b) { return b[1] - a[1]; });
    if (!entries.length) { wrap.appendChild(el('div', 'bars--empty', 'No data yet.')); return; }
    var max = Math.max.apply(null, entries.map(function (e) { return e[1]; }));
    entries.forEach(function (e) {
      var row = el('div', 'bar-row');
      row.appendChild(el('div', 'bar-row__label', labelFn ? labelFn(e[0]) : e[0]));
      var track = el('div', 'bar-row__track');
      var fill = el('div', 'bar-row__fill');
      fill.style.width = pct(e[1], max) + '%';
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el('div', 'bar-row__val', fmt(e[1])));
      wrap.appendChild(row);
    });
  }

  function renderFlags(sel, flags) {
    var wrap = $(sel); wrap.innerHTML = '';
    if (!flags.length) { wrap.appendChild(el('div', 'bars--empty', 'No flags raised.')); return; }
    var max = Math.max.apply(null, flags.map(function (f) { return f.count; }));
    flags.forEach(function (f) {
      var row = el('div', 'bar-row');
      row.appendChild(el('div', 'bar-row__label', f.flag));
      var track = el('div', 'bar-row__track');
      var fill = el('div', 'bar-row__fill');
      fill.style.width = pct(f.count, max) + '%';
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el('div', 'bar-row__val', fmt(f.count)));
      wrap.appendChild(row);
    });
  }

  // ---- labels -----------------------------------------------------------
  function pathLabel(p) { return ({ job: 'Career track', build: 'Builder track', else: 'Something else', unset: 'Unset' })[p] || p; }
  function sourceLabel(p) { return ({ openai: 'AI-generated', fallback: 'Deterministic', none: 'None' })[p] || p; }
  function titleCase(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function decisionPill(d) {
    var map = { yes: 'pill--green', refine: 'pill--amber', unsure: 'pill--gray' };
    return '<span class="pill ' + (map[d] || 'pill--gray') + '">' + escapeHtml(d || '—') + '</span>';
  }

  // ---- submissions table ------------------------------------------------
  function clarityOf(row) {
    var st = row.assessment_stats || {};
    return st.northStarClarity != null ? st.northStarClarity + '/5' : '—';
  }

  function filteredRows() {
    var rows = (state.data.submissions || []);
    var q = state.filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(function (r) {
      return [r.name, r.email, r.phone_e164, r.north_star_statement].some(function (v) {
        return v && String(v).toLowerCase().indexOf(q) !== -1;
      });
    });
  }

  function renderTable() {
    var body = $('#subsBody'); body.innerHTML = '';
    var rows = filteredRows();
    $('#subsEmpty').hidden = rows.length > 0;
    rows.forEach(function (r, i) {
      var tr = el('tr');
      tr.appendChild(td(relTime(r.submitted_at), null, new Date(r.submitted_at).toLocaleString('en-US')));
      tr.appendChild(td(r.name || '—', 'cell-name'));
      var contact = el('td', 'cell-contact');
      contact.innerHTML = (r.email ? escapeHtml(r.email) + '<br>' : '') + escapeHtml(r.phone_e164 || '');
      tr.appendChild(contact);
      tr.appendChild(td(pathLabel(r.path)));
      var dec = el('td'); dec.innerHTML = decisionPill(r.decision); tr.appendChild(dec);
      tr.appendChild(td(r.readiness_state || '—'));
      tr.appendChild(td(clarityOf(r)));
      var src = el('td');
      var gen = (r.roadmap && r.roadmap.generatedBy) || 'none';
      src.innerHTML = '<span class="pill ' + (gen === 'openai' ? 'pill--accent' : 'pill--gray') + '">' + sourceLabel(gen) + '</span>';
      tr.appendChild(src);
      var flags = el('td');
      var fwrap = el('div', 'flags');
      (r.review_flags || []).forEach(function (f) { fwrap.appendChild(el('span', 'flag-chip', f)); });
      if (!(r.review_flags || []).length) fwrap.textContent = '—';
      flags.appendChild(fwrap); tr.appendChild(flags);
      var act = el('td');
      var btn = el('button', 'link-btn', 'View');
      btn.addEventListener('click', function () { openDrawer(r); });
      act.appendChild(btn); tr.appendChild(act);
      body.appendChild(tr);
    });
  }
  function td(text, cls, title) {
    var n = el('td', cls, text);
    if (title) n.title = title;
    return n;
  }

  // ---- detail drawer ----------------------------------------------------
  function openDrawer(r) {
    var body = $('#drawerBody'); body.innerHTML = '';
    body.appendChild(el('h2', 'dr-h', r.name || 'Submission'));
    var meta = el('p', 'dr-meta');
    meta.textContent = [r.email, r.phone_e164].filter(Boolean).join(' · ') +
      ' · ' + new Date(r.submitted_at).toLocaleString('en-US') +
      (r.elapsed_seconds ? ' · ' + Math.round(r.elapsed_seconds / 60) + ' min' : '');
    body.appendChild(meta);

    // status chips
    var chips = el('div', 'dr-chips'); chips.style.marginBottom = '18px';
    [['pill--accent', pathLabel(r.path)], ['pill--gray', r.readiness_state],
     [r.decision === 'yes' ? 'pill--green' : 'pill--amber', 'decision: ' + (r.decision || '—')],
     ['pill--gray', 'clarity ' + clarityOf(r)]].forEach(function (c) {
      if (c[1]) { var p = el('span', 'pill ' + c[0]); p.textContent = c[1]; chips.appendChild(p); }
    });
    body.appendChild(chips);

    if (r.north_star_statement) {
      var ns = el('div', 'dr-section');
      ns.appendChild(el('h3', null, 'North Star'));
      ns.appendChild(el('div', 'dr-quote', r.north_star_statement));
      body.appendChild(ns);
    }

    // answers
    var ans = r.answers || {};
    var qa = el('div', 'dr-section');
    qa.appendChild(el('h3', null, 'Answers'));
    Object.keys(ans).forEach(function (key) {
      var v = ans[key];
      if (v == null || v === '') return;
      var block = el('dl', 'dr-qa');
      block.appendChild(el('dt', null, QUESTION_LABELS[key] || key));
      block.appendChild(el('dd', null, Array.isArray(v) ? v.join(', ') : String(v)));
      qa.appendChild(block);
    });
    body.appendChild(qa);

    // roadmap summary
    if (r.roadmap) {
      var rm = el('div', 'dr-section');
      rm.appendChild(el('h3', null, 'Roadmap (' + sourceLabel(r.roadmap.generatedBy || 'none') + ')'));
      if (r.roadmap.headline) rm.appendChild(el('div', 'dr-quote', r.roadmap.headline));
      (r.roadmap.milestones || []).forEach(function (m) {
        var b = el('dl', 'dr-qa');
        b.appendChild(el('dt', null, m.window + ' · ' + m.title));
        b.appendChild(el('dd', null, m.detail || ''));
        rm.appendChild(b);
      });
      body.appendChild(rm);
    }

    $('#drawer').hidden = false;
  }
  function closeDrawer() { $('#drawer').hidden = true; }

  // ---- CSV --------------------------------------------------------------
  function exportCsv() {
    var rows = filteredRows();
    if (!rows.length) { alert('Nothing to export.'); return; }
    var cols = ['submitted_at', 'name', 'email', 'phone_e164', 'whatsapp_consent', 'path', 'decision',
      'readiness_state', 'north_star_statement', 'elapsed_seconds', 'review_flags', 'roadmap_source'];
    var lines = [cols.join(',')];
    rows.forEach(function (r) {
      var vals = [r.submitted_at, r.name, r.email, r.phone_e164, r.whatsapp_consent, r.path, r.decision,
        r.readiness_state, r.north_star_statement, r.elapsed_seconds, (r.review_flags || []).join('|'),
        (r.roadmap && r.roadmap.generatedBy) || ''];
      lines.push(vals.map(csvCell).join(','));
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'north-star-submissions-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function csvCell(v) {
    var s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  // ---- wiring -----------------------------------------------------------
  function init() {
    $('#gateForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var t = $('#tokenInput').value.trim();
      if (t) attempt(t);
    });
    $('#refreshBtn').addEventListener('click', refresh);
    $('#csvBtn').addEventListener('click', exportCsv);
    $('#logoutBtn').addEventListener('click', function () { setToken(''); state.token = ''; showGate(); });
    $('#search').addEventListener('input', function (e) { state.filter = e.target.value; renderTable(); });
    document.querySelectorAll('[data-close]').forEach(function (n) { n.addEventListener('click', closeDrawer); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });

    var saved = getToken();
    if (saved) attempt(saved); else showGate();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
