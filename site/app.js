/* GitHub Pulse — app logic */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const fmt = new Intl.NumberFormat('en-US');

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const shortName = (repo) => {
    const parts = String(repo).split('/');
    return parts.length === 2 ? parts[1] : repo;
  };

  function chip(lang) {
    if (!lang) return '<span class="chip none">—</span>';
    return `<span class="chip">${esc(lang)}</span>`;
  }

  function rankCls(i) { return i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : ''; }

  function trendBadge(r) {
    if (!r || !r.trend) return '';
    if (r.trend === 'up') return `<span class="trend up" title="up ${r.rank_delta} places">▲${r.rank_delta}</span>`;
    if (r.trend === 'new') return `<span class="trend new" title="new to the list">NEW</span>`;
    if (r.trend === 'down') return `<span class="trend down" title="down ${-r.rank_delta} places">▼${-r.rank_delta}</span>`;
    return `<span class="trend same" title="unchanged">=</span>`;
  }

  function repoCell(r) {
    const desc = r.desc ? `<span class="repo-desc">${esc(r.desc)}</span>` : '';
    return `<div class="repo-cell"><a class="repo-name" href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.repo)}</a>${desc}</div>`;
  }

  function renderGainers(s) {
    const rows = (s.top_hot || s.top_gainers || []).map((r, i) => `
      <tr>
        <td class="rank ${rankCls(i)}">${String(i + 1).padStart(2, '0')}</td>
        <td>${repoCell(r)}</td>
        <td class="num hot">${fmt.format(r.heat || 0)}</td>
        <td class="num">${fmt.format(r.events || 0)} ev</td>
        <td class="num">👥 ${fmt.format(r.actors || 0)}</td>
        <td class="num pos">+${fmt.format(r.stars || 0)}★</td>
        <td>${chip(r.language)}</td>
        <td>${trendBadge(r)}</td>
      </tr>`).join('');
    $('gainers-body').innerHTML = rows
      ? `<table><thead><tr><th>#</th><th>repository</th><th style="text-align:right">heat</th><th style="text-align:right">events</th><th style="text-align:right">actors</th><th style="text-align:right">stars</th><th>lang</th><th>trend</th></tr></thead><tbody>${rows}</tbody></table>`
      : '<div class="empty">quiet hour — no meaningful activity recorded</div>';
  }

  function renderActive(s) {
    const rows = (s.top_active || []).map((r, i) => `
      <tr>
        <td class="rank ${rankCls(i)}">${String(i + 1).padStart(2, '0')}</td>
        <td>${repoCell(r)}</td>
        <td class="num hot">${fmt.format(r.events || 0)}</td>
        <td>${chip(r.language)}</td>
        <td>${trendBadge(r)}</td>
      </tr>`).join('');
    $('active-body').innerHTML = rows
      ? `<table><thead><tr><th>#</th><th>repository</th><th style="text-align:right">events</th><th>lang</th><th>trend</th></tr></thead><tbody>${rows}</tbody></table>`
      : '<div class="empty">no activity recorded this hour</div>';
  }

  function renderHuman(s) {
    const rows = (s.top_human || []).map((r, i) => `
      <tr>
        <td class="rank ${rankCls(i)}">${String(i + 1).padStart(2, '0')}</td>
        <td>${repoCell(r)}</td>
        <td class="num hot">${fmt.format(r.human || 0)}</td>
        <td class="num">${fmt.format(r.prs || 0)}</td>
        <td class="num">${fmt.format(r.issues || 0)}</td>
        <td class="num">${fmt.format(r.reviews || 0)}</td>
        <td class="num pos">+${fmt.format(r.stars || 0)}★</td>
        <td>${chip(r.language)}</td>
        <td>${trendBadge(r)}</td>
      </tr>`).join('');
    $('human-body').innerHTML = rows
      ? `<table><thead><tr><th>#</th><th>repository</th><th style="text-align:right">score</th><th style="text-align:right">PRs</th><th style="text-align:right">issues</th><th style="text-align:right">reviews</th><th style="text-align:right">stars</th><th>lang</th><th>trend</th></tr></thead><tbody>${rows}</tbody></table>`
      : '<div class="empty">no human-scale activity this hour</div>';
  }

  function renderLangs(s) {
    const list = s.top_languages || [];
    if (!list.length) { $('langs-body').innerHTML = '<div class="empty">language data filling in — repos are being enriched</div>'; return; }
    const max = Math.max(...list.map((l) => l.events || 0), 1);
    $('langs-body').innerHTML = list.map((l) => {
      const score = l.events || 0;
      const pct = Math.max(4, Math.round((score / max) * 100));
      return `
      <div class="lang-row">
        <div class="lang-top">
          <span class="lang-name">${esc(l.language)}</span>
          <span class="lang-meta">${fmt.format(l.events)} ev · ${fmt.format(l.repos)} repos</span>
        </div>
        <div class="lang-bar"><div class="lang-fill" style="width:${pct}%"></div></div>
      </div>`;
    }).join('');
  }

  function renderNew(s) {
    const list = s.top_actors || [];
    $('new-body').innerHTML = list.length
      ? `<div class="card-grid">${list.map((a) => `
          <div class="card">
            <a class="card-name" href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.actor)}</a>
            <div class="card-desc">${fmt.format(a.events)} events · ${fmt.format(a.repos)} repos</div>
            <div class="card-meta"><span class="star">⚡ ${esc(a.top_repo ? a.top_repo.split('/').pop() : '—')}</span></div>
          </div>`).join('')}</div>`
      : '<div class="empty">no actor data this hour</div>';
  }

  function renderBots(s) {
    const sub = $('bot-sub');
    if (sub) sub.textContent = s.push_spam_pct != null
      ? `push-farms: high push volume, almost no humans · ${s.push_spam_pct}% of ALL pushes this hour are farm spam`
      : 'push-farms: high push volume, almost no humans';
    const rows = (s.bot_watch || []).map((r, i) => `
      <tr>
        <td class="rank ${rankCls(i)}">${String(i + 1).padStart(2, '0')}</td>
        <td>${repoCell(r)}</td>
        <td class="num hot">${fmt.format(r.pushes || 0)}</td>
        <td class="num">👥 ${fmt.format(r.actors || 0)}</td>
        <td class="num">${fmt.format(r.events || 0)} ev</td>
        <td>${chip(r.language)}</td>
      </tr>`).join('');
    $('bots-body').innerHTML = rows
      ? `<table><thead><tr><th>#</th><th>repository</th><th style="text-align:right">pushes</th><th style="text-align:right">actors</th><th style="text-align:right">events</th><th>lang</th></tr></thead><tbody>${rows}</tbody></table>`
      : '<div class="empty">no push-farms detected this hour — clean archive, for once</div>';
  }

  function renderReleases(s) {
    const list = s.top_releases || [];
    $('releases-body').innerHTML = list.length
      ? `<div class="rel-list">${list.map((r) => `
          <div class="rel">
            <span class="rel-icon">🚀</span>
            <div class="rel-body">
              <div class="rel-title"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.repo)}</a> <span class="rel-tag">${esc(r.tag || r.release || '')}</span></div>
              ${r.desc ? `<div class="rel-desc">${esc(r.desc)}</div>` : ''}
            </div>
          </div>`).join('')}</div>`
      : '<div class="empty">no releases this hour</div>';
  }

  function renderHistory(items) {
    const sorted = items.sort((a, b) => (a.hour < b.hour ? 1 : -1));
    if (!sorted.length) {
      $('history-body').innerHTML = '<div class="empty">no history yet — this is the first sweep</div>';
      $('stat-hours').textContent = '1';
      return;
    }
    const max = Math.max(...sorted.map((s) => s.events), 1);
    $('history-body').innerHTML = sorted.map((s) => `
      <div class="hist-row">
        <span class="hist-hour">${esc(s.hour)}</span>
        <div class="hist-bar"><div class="hist-fill" style="width:${Math.max(3, Math.round((s.events / max) * 100))}%"></div></div>
        <span class="hist-count">${fmt.format(s.events)} ev</span>
      </div>`).join('');
    $('stat-hours').textContent = fmt.format(sorted.length);
  }

  async function loadHistory() {
    try {
      const res = await fetch('data/history/index.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('no index');
      const idx = await res.json();
      const snaps = await Promise.all(idx.files.map(async (f) => {
        try {
          const r = await fetch('data/history/' + f, { cache: 'no-store' });
          return r.ok ? r.json() : null;
        } catch { return null; }
      }));
      renderHistory(snaps.filter(Boolean));
    } catch {
      renderHistory([]);
    }
  }

  async function load() {
    try {
      const res = await fetch('data/snapshot.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const s = await res.json();
      $('asof-badge').textContent = 'AS OF ' + String(s.as_of || '').replace('T', ' ').replace('Z', ' UTC');
      $('asof-badge').classList.add('live');
      $('stat-events').textContent = fmt.format(s.events || 0);
      $('stat-repos').textContent = fmt.format(s.repos_seen || 0);
      renderGainers(s);
      renderHuman(s);
      renderActive(s);
      renderLangs(s);
      renderNew(s);
      renderReleases(s);
      renderBots(s);
      document.title = `GitHub Pulse — ${fmt.format(s.events || 0)} events in ${String(s.hour || '')}`;
    } catch (e) {
      const box = document.createElement('div');
      box.className = 'error-box';
      box.innerHTML = `<h3>signal lost</h3><p>could not reach the data feed (${esc(e.message)}). the radar will retry automatically.</p><button class="retry-btn">retry now</button>`;
      box.querySelector('button').onclick = () => { location.reload(); };
      document.querySelector('main').prepend(box);
    }
  }

  function tick() {
    const d = new Date();
    $('foot-clock').textContent = d.toISOString().slice(11, 19) + ' UTC · local ' + d.toLocaleTimeString();
  }

  $('refresh-btn').addEventListener('click', (e) => { e.preventDefault(); load(); loadHistory(); });

  load();
  loadHistory();
  tick();
  setInterval(tick, 1000);
  setInterval(load, 60000); // keep the radar fresh
})();
