'use strict';
// ============ Sauvegardes ============
const BK = { data: { ico: '🗂️', color: '#6366f1' }, program: { ico: '⚙️', color: '#f59e0b' }, full: { ico: '📦', color: '#10b981' } };
const fmtBytes = n => n < 1024 ? n + ' o' : n < 1048576 ? (n / 1024).toFixed(1).replace('.', ',') + ' Ko' : n < 1073741824 ? (n / 1048576).toFixed(1).replace('.', ',') + ' Mo' : (n / 1073741824).toFixed(2).replace('.', ',') + ' Go';
const fmtDT = iso => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
function ago(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 90) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
}
const inFuture = iso => { const s = (new Date(iso) - Date.now()) / 1000; return s <= 60 ? 'imminente' : s < 3600 ? `dans ${Math.round(s / 60)} min` : s < 86400 ? `dans ${Math.round(s / 3600)} h` : `dans ${Math.round(s / 86400)} j`; };

async function bkApi(path, method = 'GET', body) {
  const r = await apiFetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok) { toast('⚠️ ' + (j.error || 'Erreur')); throw new Error(j.error); }
  return j;
}

async function pageBackups(v) {
  v.append(h('div', { class: 'loading' }, 'Chargement…'));
  const D = await bkApi('/api/backups');
  v.innerHTML = '';
  if (S.page !== 'backups') return;
  const { list, byType, total, volumes: V, settings: st } = D;
  const last = list.find(b => b.manifest);
  const reload = async fn => { await fn(); render(); };

  // ---- indicateurs
  v.append(h('div', { class: 'grid g4' },
    kpi('k3', 'Sauvegardes', String(total.count), Object.entries(byType).map(([t, x]) => `${x.count} ${D.types[t]?.label ?? t}`).join(' · ') || 'Aucune', '💾'),
    kpi('k4', 'Volume total', fmtBytes(total.size), total.count ? `moyenne ${fmtBytes(total.size / total.count)} par sauvegarde` : '—', '🧮'),
    kpi('k2', 'Dernière sauvegarde', last ? ago(last.manifest.createdAt) : 'Jamais', last ? fmtDT(last.manifest.createdAt) + ' · ' + (D.types[last.manifest.type]?.label ?? '') : 'Créez-en une ci-dessous', '🕒'),
    kpi(st.auto ? 'k2' : 'k1', 'Sauvegarde automatique', st.auto ? ({ daily: 'Quotidienne', weekly: 'Hebdomadaire' }[st.every]) : 'Désactivée', st.auto && D.nextAuto ? 'prochaine ' + inFuture(D.nextAuto) : 'Activez-la dans les paramètres', '⏰')));

  // ---- création
  const labelIn = h('input', { type: 'text', placeholder: 'Libellé facultatif (ex. avant mise à jour)', style: { flex: 1, minWidth: '220px' } });
  const sz = { data: V.statements.size + V.settings.size, program: V.program.size, full: V.statements.size + V.settings.size + V.program.size + V.reports.size };
  const nf = { data: V.statements.count + V.settings.count, program: V.program.count, full: V.statements.count + V.settings.count + V.program.count + V.reports.count };
  v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, 'Créer une sauvegarde', h('small', {}, 'archives ZIP dans le dossier Sauvegardes')),
    h('div', { class: 'toolbar' }, labelIn),
    h('div', { class: 'grid g3' }, Object.entries(D.types).map(([t, info]) => h('div', { class: 'bkcard', style: { '--c': BK[t].color } },
      h('div', { class: 'bk-ico' }, BK[t].ico), h('div', { class: 'bk-t' }, info.label), h('div', { class: 'muted', style: { minHeight: '38px' } }, info.desc),
      h('div', { class: 'bk-meta' }, `${nf[t]} fichiers · ≈ ${fmtBytes(sz[t])}`),
      h('button', { class: 'btn', style: { background: BK[t].color, width: '100%', marginTop: '10px' }, onclick: e => reload(async () => { e.target.disabled = true; e.target.textContent = 'Création…'; const r = await bkApi('/api/backups', 'POST', { type: t, label: labelIn.value }); toast('✅ ' + r.created); }) }, 'Sauvegarder maintenant'))))));

  v.append(scheduleCard(D, reload));

  // ---- graphiques + volumes
  const volRows = [['📄', 'Relevés PDF', V.statements, '#6366f1'], ['🏠', 'Documents des biens', V.biens ?? { count: 0, size: 0 }, '#0ea5e9'], ['🗂️', 'Paramétrage (catégories, règles…)', V.settings, '#ec4899'], ['⚙️', 'Programme', V.program, '#f59e0b'], ['📑', 'Rapports PDF', V.reports, '#10b981']];
  const maxV = Math.max(1, ...volRows.map(r => r[2].size));
  v.append(h('div', { class: 'grid g2', style: { marginTop: '18px' } },
    h('div', { class: 'card' }, h('h2', {}, 'Ce qui est protégé', h('small', {}, 'volumes actuels')),
      h('div', { class: 'legend' }, volRows.map(([ico, name, x, col]) => h('div', { class: 'lrow', style: { cursor: 'default' } }, h('div', { class: 'bubble', style: { background: tint(col, .18) } }, ico),
        h('div', {}, h('div', { class: 'name' }, name), h('div', { class: 'bar' }, h('i', { style: { width: Math.max(2, x.size / maxV * 100) + '%', background: col } }))),
        h('div', { class: 'amt' }, fmtBytes(x.size), h('small', {}, x.count + ' fichier(s)')))))),
    h('div', { class: 'card' }, h('h2', {}, 'Répartition des sauvegardes', h('small', {}, 'volume par type')),
      total.count ? h('div', { class: 'chart-box short' }, h('canvas', { id: 'bkDonut' })) : h('div', { class: 'empty' }, 'Aucune sauvegarde'))));
  if (total.count) chart($('#bkDonut'), { type: 'doughnut', data: { labels: Object.keys(byType).map(t => D.types[t]?.label ?? t), datasets: [{ data: Object.values(byType).map(x => x.size), backgroundColor: Object.keys(byType).map(t => BK[t]?.color ?? '#999'), borderWidth: 2, borderColor: css('--card') }] }, options: { cutout: '62%', plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: c => ` ${c.label} : ${fmtBytes(c.parsed)} (${byType[Object.keys(byType)[c.dataIndex]].count})` } } } } });

  const ok = list.filter(b => b.manifest).slice().reverse();
  if (ok.length > 1) {
    v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, 'Historique des sauvegardes', h('small', {}, 'taille de chaque archive')), h('div', { class: 'chart-box short' }, h('canvas', { id: 'bkHist' }))));
    chart($('#bkHist'), { type: 'bar', data: { labels: ok.map(b => fmtDT(b.manifest.createdAt)), datasets: [{ data: ok.map(b => b.size), backgroundColor: ok.map(b => BK[b.manifest.type]?.color ?? '#999'), borderRadius: 5 }] }, options: { scales: { x: { ticks: { maxTicksLimit: 8, maxRotation: 0 }, grid: { display: false } }, y: { ticks: { callback: v => fmtBytes(v) } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + fmtBytes(c.parsed.y) } } } } });
  }

  // ---- liste
  const file = h('input', { type: 'file', accept: '.zip', style: { display: 'none' }, onchange: async () => {
    const f = file.files[0]; if (!f) return;
    const r = await apiFetch('/api/backups/import?name=' + encodeURIComponent(f.name), { method: 'POST', body: f }); const j = await r.json();
    if (!r.ok) return toast('⚠️ ' + j.error); toast('✅ Sauvegarde importée : ' + j.imported); render();
  } });
  const rows = list.map(b => {
    const m = b.manifest, c = m?.counts ?? {};
    return h('tr', {},
      h('td', { class: 'num' }, m ? fmtDT(m.createdAt) : fmtDT(b.mtime), h('div', { class: 'sub' }, m ? ago(m.createdAt) : '')),
      h('td', {}, m ? h('span', { class: 'chip', style: { background: tint(BK[m.type]?.color ?? '#999999', .15), color: BK[m.type]?.color } }, `${BK[m.type]?.ico ?? ''} ${D.types[m.type]?.label ?? m.type}`) : h('span', { class: 'badge' }, 'illisible'),
        m?.auto ? h('span', { class: 'badge', style: { marginLeft: '6px' } }, 'auto') : null),
      h('td', {}, m?.label || h('span', { class: 'muted' }, '—'), h('div', { class: 'sub' }, b.name)),
      h('td', { class: 'muted num' }, m ? `${m.files} fichiers` : '', h('div', { class: 'sub' }, c.operations != null ? `${c.operations} op. · ${c.statements} relevés · ${c.categories} cat. · ${c.rules} règles` : '')),
      h('td', { class: 'r num' }, fmtBytes(b.size), m ? h('div', { class: 'sub' }, 'brut ' + fmtBytes(m.rawSize)) : null),
      h('td', { class: 'r', style: { whiteSpace: 'nowrap' } },
        h('a', { class: 'icon-btn', title: 'Télécharger', href: apiUrl('/api/backups/file?name=' + encodeURIComponent(b.name)), style: { textDecoration: 'none' } }, '⬇️'),
        h('button', { class: 'icon-btn', title: 'Vérifier l’intégrité', onclick: async () => { const r = await bkApi('/api/backups/verify', 'POST', { name: b.name }); toast(r.ok ? `✅ Intègre (${r.entries} fichiers)` : '⚠️ Corrompue : ' + r.bad.join(', ')); } }, '🔍'),
        m && m.type !== 'program' ? h('button', { class: 'icon-btn', title: 'Restaurer', onclick: () => restoreBackup(b) }, '♻️') : null,
        h('button', { class: 'icon-btn', title: 'Supprimer', onclick: () => modal('Supprimer cette sauvegarde ?', [h('p', {}, b.name + ' (' + fmtBytes(b.size) + ') sera définitivement supprimée.')], close => [h('button', { class: 'btn sec', onclick: close }, 'Annuler'), h('button', { class: 'btn danger', onclick: async () => { await bkApi('/api/backups?name=' + encodeURIComponent(b.name), 'DELETE'); close(); toast('Sauvegarde supprimée'); render(); } }, 'Supprimer')]) }, '🗑️')));
  });
  v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, `Sauvegardes disponibles (${list.length})`,
    h('span', {}, file, h('button', { class: 'btn sm sec', onclick: () => file.click() }, '⬆️ Importer un .zip'))),
    list.length ? h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Date'), h('th', {}, 'Type'), h('th', {}, 'Libellé / fichier'), h('th', {}, 'Contenu'), h('th', { class: 'r' }, 'Taille'), h('th'))), h('tbody', {}, rows))) : h('div', { class: 'empty' }, 'Aucune sauvegarde pour le moment.')));

}

function restoreBackup(b) {
  const c = b.manifest.counts ?? {};
  modal('Restaurer cette sauvegarde ?', [
    h('p', {}, 'Sauvegarde du ', h('b', {}, fmtDT(b.manifest.createdAt)), ' (', D_label(b.manifest.type), ').'),
    h('ul', {}, h('li', {}, 'Le paramétrage (catégories, règles, corrections, prévisions) est remplacé par celui de la sauvegarde' + (c.categories != null ? ` : ${c.categories} catégories, ${c.rules} règles, ${c.corrections ?? 0} corrections.` : '.')),
      h('li', {}, 'Les relevés PDF de la sauvegarde sont remis dans Documents/Releves (les autres relevés sont conservés).'),
      h('li', {}, 'Le programme n’est pas modifié.')),
    h('div', { class: 'tip' }, '🛟 Une sauvegarde de sécurité « Avant restauration » de l’état actuel est créée automatiquement.'),
  ], close => [h('button', { class: 'btn sec', onclick: close }, 'Annuler'),
    h('button', { class: 'btn', onclick: async () => { const r = await bkApi('/api/backups/restore', 'POST', { name: b.name }); close(); toast(`✅ Restauré (${r.restored} fichiers). Sécurité : ${r.safety}`); S.data = await api('/api/state'); render(); } }, '♻️ Restaurer')]);
}
const D_label = t => ({ data: 'Données', program: 'Programme', full: 'Complète' }[t] ?? t);

// ---- planification automatique (jour de la semaine + heure)
const JOURS = [[1, 'Lundi'], [2, 'Mardi'], [3, 'Mercredi'], [4, 'Jeudi'], [5, 'Vendredi'], [6, 'Samedi'], [0, 'Dimanche']];
function nextSlot(s, now = new Date()) {
  const [hh, mm] = s.time.split(':').map(Number);
  const at = d => { const x = new Date(d); x.setHours(hh, mm, 0, 0); return x; };
  const back = d => { const x = new Date(d); x.setDate(x.getDate() - 1); return at(x); };
  let last = at(now); if (last > now) last = back(last);
  if (s.every === 'weekly') while (last.getDay() !== +s.weekday) last = back(last);
  const next = new Date(last); next.setDate(next.getDate() + (s.every === 'weekly' ? 7 : 1)); next.setHours(hh, mm, 0, 0);
  return next;
}
function scheduleCard(D, reload) {
  const d = { ...D.settings };
  const preview = h('div', { class: 'tip', style: { margin: 0 } });
  const dayWrap = h('div', { class: 'field' });
  const freqSeg = h('div', { class: 'seg' }, [['daily', 'Tous les jours'], ['weekly', 'Chaque semaine']].map(([k, l]) => h('button', { 'data-k': k, onclick: () => { d.every = k; upd(); } }, l)));
  const upd = () => {
    dayWrap.style.display = d.every === 'weekly' ? '' : 'none';
    preview.textContent = d.auto
      ? '⏰ Prochaine sauvegarde : ' + nextSlot(d).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' · type « ' + D.types[d.type].label + ' », ' + d.keep + ' conservée(s)'
      : '⏸️ Sauvegarde programmée désactivée.';
    freqSeg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.k === d.every));
  };
  const daySel = h('select', { onchange: e => { d.weekday = +e.target.value; upd(); } }, JOURS.map(([k, l]) => h('option', { value: k, selected: +d.weekday === k }, l)));
  dayWrap.append(h('label', {}, 'Jour de la semaine'), daySel);
  const timeIn = h('input', { type: 'time', value: d.time, onchange: e => { if (e.target.value) d.time = e.target.value; upd(); } });
  const typeSel = h('select', { onchange: e => { d.type = e.target.value; upd(); } }, Object.entries(D.types).map(([k, i]) => h('option', { value: k, selected: d.type === k }, i.label)));
  const keepIn = h('input', { type: 'number', min: 1, max: 200, value: d.keep, style: { width: '90px' }, onchange: e => { d.keep = +e.target.value || 1; upd(); } });
  const on = h('input', { type: 'checkbox', checked: d.auto, onchange: e => { d.auto = e.target.checked; upd(); } });
  upd();
  return h('div', { class: 'card', style: { marginTop: '18px' } },
    h('h2', {}, '⏰ Sauvegarde programmée', h('small', {}, D.settings.auto && D.nextAuto ? 'prochaine : ' + inFuture(D.nextAuto) : 'désactivée')),
    h('div', { class: 'schedgrid' },
      h('label', { class: 'schedon' }, on, h('b', {}, 'Activer')),
      h('div', { class: 'field' }, h('label', {}, 'Fréquence'), freqSeg), dayWrap,
      h('div', { class: 'field' }, h('label', {}, 'Heure'), timeIn),
      h('div', { class: 'field' }, h('label', {}, 'Type de sauvegarde'), typeSel),
      h('div', { class: 'field' }, h('label', {}, 'Nombre à conserver'), keepIn)),
    preview,
    h('div', { class: 'toolbar', style: { margin: '14px 0 0' } },
      h('button', { class: 'btn', onclick: () => reload(async () => { await bkApi('/api/backups/settings', 'PUT', d); toast('✅ Planification enregistrée'); }) }, 'Enregistrer la planification'),
      h('button', { class: 'btn sm sec', onclick: () => reload(async () => { const r = await bkApi('/api/backups/prune', 'POST', { keep: d.keep, onlyAuto: true }); toast(r.deleted + ' sauvegarde(s) programmée(s) purgée(s)'); }) }, '🧹 Purger les anciennes'),
      h('span', { class: 'muted' }, 'Lancée à l’heure indiquée (heure de l’ordinateur) ; si l’application est éteinte à ce moment, elle est rattrapée au prochain démarrage. Dossier : ' + D.dir)));
}
