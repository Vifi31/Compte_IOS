'use strict';
// ============ Relevés : gestion et affichage par année ============
function pageStatements(v) {
  const stmts = S.data.statements.filter(s => s.date).slice().sort((a, b) => b.date.localeCompare(a.date));
  const other = S.data.statements.filter(s => !s.date);
  const years = [...new Set(stmts.map(s => s.date.slice(0, 4)))].sort().reverse();
  S.stOpen ??= new Set([years[0]]);
  const C = cats(), allMonths_ = new Set(S.data.operations.map(o => o.date.slice(0, 7)));
  const flows = y => {
    const ops = S.data.operations.filter(o => o.date.startsWith(y) && S.data.accounts.find(a => a.number === o.account)?.type === 'CCP');
    const A = analyze(ops); return { n: ops.length, exp: A.expense, inc: A.income };
  };
  const totalOps = S.data.operations.length, totalSize = sum(S.data.statements.map(s => s.size || 0));
  const bad = S.data.statements.filter(s => !s.ok && !s.duplicate).length;

  v.append(h('div', { class: 'grid g4' },
    kpi('k3', 'Relevés', String(stmts.length), `${years.length} année(s) · ${years[years.length - 1] ?? '–'} → ${years[0] ?? '–'}`, '🗃️'),
    kpi('k4', 'Opérations importées', totalOps.toLocaleString('fr-FR'), `${S.data.accounts.length} comptes`, '🧾'),
    kpi('k2', 'Volume des PDF', fmtBytes(totalSize), stmts.length ? `≈ ${fmtBytes(totalSize / stmts.length)} par relevé` : '–', '📁'),
    kpi(bad ? 'k1' : 'k2', 'Contrôles', bad ? `${bad} à vérifier` : 'Tous OK', 'totaux et soldes recoupés à l’import', bad ? '⚠️' : '✅')));

  v.append(h('div', { class: 'dropzone', style: { marginTop: '18px' }, onclick: pickFiles }, h('div', { style: { fontSize: '26px' } }, '📥'), h('b', {}, 'Ajouter des relevés PDF'),
    h('span', { class: 'muted' }, 'Cliquez ici ou glissez-déposez vos fichiers n’importe où dans la fenêtre.')));

  for (const y of years) {
    const list = stmts.filter(s => s.date.startsWith(y)), F = flows(y), open = S.stOpen.has(y);
    const okAll = list.every(s => s.ok || s.duplicate);
    const cov = h('div', { class: 'cov' }, MOIS.map((m, i) => h('span', { class: allMonths_.has(`${y}-${String(i + 1).padStart(2, '0')}`) ? 'on' : '', title: allMonths_.has(`${y}-${String(i + 1).padStart(2, '0')}`) ? 'Opérations présentes' : 'Aucune opération' }, m.replace('.', ''))));
    const head = h('div', { class: 'yearhead', onclick: () => { open ? S.stOpen.delete(y) : S.stOpen.add(y); render(); } },
      h('span', { style: { fontSize: '18px', width: '18px' } }, open ? '▾' : '▸'), h('div', { class: 'yr' }, y),
      h('div', {}, h('b', {}, `${list.length} relevé${list.length > 1 ? 's' : ''}`), h('div', { class: 'muted', style: { fontSize: '12.5px' } }, `${F.n} opérations (comptes courants) ${okAll ? '· ✅ contrôles OK' : '· ⚠️ à vérifier'}`)),
      h('div', { style: { marginLeft: 'auto', display: 'flex', gap: '22px', alignItems: 'center', flexWrap: 'wrap' } },
        h('div', { class: 'num', style: { textAlign: 'right' } }, h('div', { class: 'neg', style: { fontWeight: 700 } }, '▼ ' + eur0(F.exp)), h('small', { class: 'muted' }, 'dépenses')),
        h('div', { class: 'num', style: { textAlign: 'right' } }, h('div', { class: 'pos', style: { fontWeight: 700 } }, '▲ ' + eur0(F.inc)), h('small', { class: 'muted' }, 'revenus')), cov));
    const body = !open ? null : h('div', { class: 'yearbody' }, h('div', { class: 'tablewrap' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Relevé du'), h('th', {}, 'Période des opérations'), h('th', {}, 'Fichier'), h('th', { class: 'r' }, 'Opérations'), h('th', { class: 'r' }, 'Débits'), h('th', { class: 'r' }, 'Crédits'), h('th', {}, 'Contrôle'), h('th', { class: 'r' }, 'Taille'), h('th'))),
      h('tbody', {}, list.map(s => stmtRow(s))))));
    v.append(h('div', { class: 'card yearcard', style: { marginTop: '14px' } }, head, body));
  }
  if (other.length) v.append(h('div', { class: 'card', style: { marginTop: '14px' } }, h('h2', {}, '⚠️ Fichiers non reconnus'), h('div', { class: 'tablewrap' }, h('table', {}, h('tbody', {}, other.map(s => stmtRow(s)))))));
  if (!stmts.length && !other.length) v.append(h('div', { class: 'card empty', style: { marginTop: '14px' } }, 'Aucun relevé. Ajoutez vos PDF pour commencer.'));
  v.append(h('div', { style: { marginTop: '16px' } }, h('button', { class: 'btn sm sec', onclick: async () => { S.data = await api('/api/reimport', 'POST'); toast('Relevés réimportés'); render(); } }, '↻ Réimporter tous les PDF')));
}

function stmtRow(s) {
  const url = '/api/statements/file?name=' + encodeURIComponent(s.file);
  return h('tr', {},
    h('td', { class: 'num', style: { fontWeight: 600 } }, s.date ? fdate(s.date) : '–'),
    h('td', { class: 'muted num' }, s.from ? `${fdate(s.from)} → ${fdate(s.to)}` : '–'),
    h('td', {}, s.file, s.duplicate ? h('span', { class: 'badge', style: { marginLeft: '6px' } }, 'doublon ignoré') : null),
    h('td', { class: 'r num' }, s.ops), h('td', { class: 'r num neg' }, s.debit != null ? eur0(Math.abs(s.debit)) : ''), h('td', { class: 'r num pos' }, s.credit != null ? eur0(s.credit) : ''),
    h('td', {}, s.error ? h('span', { class: 'badge', title: s.error }, '❌ illisible') : s.ok ? h('span', { class: 'badge', style: { color: 'var(--good)' } }, '✅ OK') : h('span', { class: 'badge', style: { color: 'var(--warn)' } }, '⚠️ écart')),
    h('td', { class: 'r muted num' }, s.size ? fmtBytes(s.size) : ''),
    h('td', { class: 'r', style: { whiteSpace: 'nowrap' } },
      h('a', { class: 'icon-btn', title: 'Ouvrir le PDF', target: '_blank', href: apiUrl(url), style: { textDecoration: 'none' } }, '👁️'),
      h('a', { class: 'icon-btn', title: 'Télécharger', href: apiUrl(url + '&download=1'), style: { textDecoration: 'none' } }, '⬇️'),
      h('button', { class: 'icon-btn', title: 'Supprimer', onclick: () => modal('Supprimer ce relevé ?', [
        h('p', {}, h('b', {}, s.file), ' sera supprimé du dossier Documents/Releves et ses ' + s.ops + ' opérations disparaîtront de l’application.'),
        h('div', { class: 'tip warn' }, 'Pensez à faire une sauvegarde « Données » avant : la suppression est définitive.'),
      ], close => [h('button', { class: 'btn sec', onclick: close }, 'Annuler'),
        h('button', { class: 'btn danger', onclick: async () => { S.data = await api('/api/statements?name=' + encodeURIComponent(s.file), 'DELETE'); close(); toast('Relevé supprimé'); render(); } }, 'Supprimer')]) }, '🗑️')));
}
