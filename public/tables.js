'use strict';
// ============ Tableaux : tri par colonne, filtre par colonne et nombre de lignes affichées ============
// Amélioration automatique de tout tableau de données de l'application (une ligne d'en-tête, des lignes de même largeur).
// Les lignes « Total » restent en bas, hors tri, filtre et pagination. Les tableaux dont les en-têtes ont déjà un clic propre sont laissés tels quels.
(() => {
  const SIZES = [[10, '10'], [25, '25'], [50, '50'], [100, '100'], [0, 'Tous']];
  const states = new Map(); // état conservé d'un réaffichage à l'autre : tri, filtres, taille, page
  let size0 = 0;
  try { const v = localStorage.getItem('tblsize'); if (v != null && SIZES.some(s => s[0] === +v)) size0 = +v; } catch { /* stockage indisponible */ }

  const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const cellText = td => {
    const sel = td.querySelector('select'); if (sel) return sel.options[sel.selectedIndex]?.text ?? '';
    const inp = td.querySelector('input:not([type=checkbox]):not([type=radio])'); if (inp) return inp.value ?? '';
    const chk = td.querySelector('input[type=checkbox]'); if (chk) return chk.checked ? 'oui' : 'non';
    return td.textContent.replace(/\s+/g, ' ').trim();
  };
  /** Valeur numérique d'un texte (montant, pourcentage, date jj/mm/aaaa ou ISO) ; null sinon. */
  function num(t) {
    const s = t.replace(/[  \s€%]/g, '').replace(/[−–]/g, '-').replace(',', '.');
    if (/^[-+]?\d+(\.\d+)?$/.test(s)) return +s;
    let m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (m) return +(m[3] + m[2] + m[1]);
    m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return +(m[1] + m[2] + m[3]);
    return null;
  }
  /** Filtre : texte contenu (sans accent ni casse), ou comparaison numérique (>100, <=50, 10..20, =5). */
  function matcher(q) {
    q = q.trim(); if (!q) return null;
    let m = q.match(/^(>=|<=|>|<|=)\s*(-?[\d\s.,]+)$/);
    if (m) { const v = num(m[2]), op = m[1]; if (v != null) return t => { const n = num(t); return n != null && (op === '>' ? n > v : op === '<' ? n < v : op === '>=' ? n >= v : op === '<=' ? n <= v : n === v); }; }
    m = q.match(/^(-?[\d.,]+)\s*\.\.\s*(-?[\d.,]+)$/);
    if (m) { const a = num(m[1]), b = num(m[2]); if (a != null && b != null) return t => { const n = num(t); return n != null && n >= Math.min(a, b) && n <= Math.max(a, b); }; }
    const nq = norm(q); return t => norm(t).includes(nq);
  }

  function eligible(table) {
    if (!table.tHead || !table.tBodies.length || table.dataset.notable != null || table.closest('[data-notable]')) return null;
    const hr = table.tHead.rows[table.tHead.rows.length - 1]; if (!hr) return null;
    const ths = [...hr.cells]; if (ths.length < 2 || ths.some(t => t.colSpan > 1 || typeof t.onclick === 'function' || /[▲▼]/.test(t.textContent))) return null;
    const rows = [...table.tBodies[0].rows].filter(r => !r.classList.contains('tfilter'));
    const isTotal = r => r.classList.contains('total') || /^total\b/i.test(r.cells[0]?.textContent.trim() ?? '');
    const data = rows.filter(r => !isTotal(r)), tot = rows.filter(isTotal);
    if (data.length < (location.hash.startsWith('#/bien') ? 1 : 2) || data.some(r => r.cells.length !== ths.length || [...r.cells].some(c => c.colSpan > 1))) return null;
    return { hr, ths, data, tot };
  }

  function enhance(table) {
    const E = eligible(table); if (!E) return;
    const { hr, ths, data, tot } = E, key = location.hash.split('?')[0] + '|' + ths.map(t => t.textContent.trim()).join('|');
    const st = states.get(key) ?? { sort: null, f: [], size: size0, page: 0 };
    states.set(key, st); st.f.length = ths.length;
    table._enh = { n: data.length, data, key };
    const wrap = table.closest('.tablewrap') ?? table;
    const bar = document.createElement('div'); bar.className = 'tblbar'; wrap.after(bar); table._enh.bar = bar;

    // ligne de filtres
    const fr = document.createElement('tr'); fr.className = 'tfilter';
    ths.forEach((th, c) => {
      const cell = document.createElement('th'); fr.append(cell);
      if (!th.textContent.trim()) return;
      const inp = document.createElement('input'); inp.type = 'search'; inp.placeholder = '⌕'; inp.title = 'Filtrer cette colonne : texte, >100, <=50 ou 10..20'; inp.value = st.f[c] ?? '';
      inp.addEventListener('input', () => { st.f[c] = inp.value; st.page = 0; apply(); });
      inp.addEventListener('click', e => e.stopPropagation()); cell.append(inp);
      th.classList.add('sortable'); const ind = document.createElement('span'); ind.className = 'tsort'; th.append(ind); th._ind = ind;
      th.addEventListener('click', e => { if (e.target.closest('input,select,button,a')) return; st.sort = st.sort?.c === c ? (st.sort.d > 0 ? { c, d: -1 } : null) : { c, d: 1 }; apply(); });
    });
    hr.after(fr); table._enh.fr = fr;

    function apply() {
      const tests = st.f.map(q => matcher(q ?? ''));
      let rows = data.filter(r => tests.every((f, c) => !f || f(cellText(r.cells[c]))));
      const nFiltered = rows.length;
      if (st.sort) {
        const { c, d } = st.sort, keyed = rows.map(r => { const t = cellText(r.cells[c]); return { r, t, n: num(t) }; });
        keyed.sort((a, b) => (a.n != null && b.n != null ? a.n - b.n : a.t.localeCompare(b.t, 'fr', { numeric: true, sensitivity: 'base' })) * d);
        rows = keyed.map(x => x.r);
      }
      const size = st.size, pages = size ? Math.max(1, Math.ceil(rows.length / size)) : 1;
      st.page = Math.min(st.page, pages - 1);
      const shown = new Set(size ? rows.slice(st.page * size, st.page * size + size) : rows);
      const body = table.tBodies[0], hidden = data.filter(r => !rows.includes(r));
      body.append(...rows, ...hidden, ...tot);
      for (const r of data) r.style.display = shown.has(r) ? '' : 'none';
      ths.forEach((th, c) => { if (th._ind) th._ind.textContent = st.sort?.c === c ? (st.sort.d > 0 ? '▲' : '▼') : ''; });
      // barre de contrôle
      bar.innerHTML = '';
      const mk = (tag, txt, props = {}) => Object.assign(document.createElement(tag), { textContent: txt, ...props });
      const sel = mk('select', '', { title: 'Nombre de lignes affichées' });
      for (const [v, l] of SIZES) { const o = mk('option', l, { value: v }); if (v === size) o.selected = true; sel.append(o); }
      sel.addEventListener('change', () => { st.size = +sel.value; st.page = 0; size0 = st.size; try { localStorage.setItem('tblsize', String(size0)); } catch { /* stockage indisponible */ } apply(); });
      const filtered = tests.some(Boolean) || st.sort;
      bar.append(mk('span', 'Lignes affichées :'), sel,
        mk('span', `${shown.size} sur ${nFiltered}${nFiltered < data.length ? ' (filtré sur ' + data.length + ')' : ''}`, { className: 'muted' }));
      if (pages > 1) bar.append(mk('button', '◀', { type: 'button', className: 'btn sm sec', disabled: st.page === 0, onclick: () => { st.page--; apply(); } }), mk('span', `page ${st.page + 1} / ${pages}`),
        mk('button', '▶', { type: 'button', className: 'btn sm sec', disabled: st.page >= pages - 1, onclick: () => { st.page++; apply(); } }));
      if (filtered) bar.append(mk('button', '↺ Réinitialiser', { type: 'button', className: 'btn sm sec', onclick: () => { st.sort = null; st.f = []; st.page = 0; fr.querySelectorAll('input').forEach(i => { i.value = ''; }); apply(); } }));
    }
    apply();
  }

  function scan() {
    for (const table of document.querySelectorAll('main table, #modalRoot table')) {
      const E = table._enh;
      if (E) {
        const live = E.data.length === E.n && E.data[0].isConnected && E.data.at(-1).isConnected && E.fr?.isConnected;
        if (live) continue;
        E.bar?.remove(); E.fr?.remove(); table.querySelectorAll('.tsort').forEach(s => s.remove()); table._enh = null;
        // les en-têtes recréés ne portent plus nos écouteurs ; ceux conservés sont nettoyés en les remplaçant
        if (table.tHead) for (const tr of table.tHead.rows) for (const th of [...tr.cells]) { const c = th.cloneNode(true); th.replaceWith(c); }
      }
      enhance(table);
    }
  }
  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { try { scan(); } catch (e) { console.warn('tables.js', e); } }, 120); };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('hashchange', schedule); schedule();
})();
