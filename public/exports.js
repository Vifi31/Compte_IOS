'use strict';
// ============ Exports PDF : prompts, versions, documentation, licence, manifeste ============
const exLines = (text, indentBullets = true) => String(text ?? '').replace(/\r/g, '').split('\n').map(l => l.trimEnd());
const exPara = text => exLines(text).filter(l => l.trim()).map(l => ({ t: 'p', text: l }));
const LEVEL_FR = { major: 'majeur', minor: 'intermédiaire', patch: 'mineur' };

async function exportPromptsPdf(list) {
  const items = list.slice().sort((a, b) => a.date.localeCompare(b.date));
  const blocks = [{ t: 'kpis', items: [
    { label: 'Prompts', value: String(items.length), sub: `${items.filter(e => e.source === 'demande').length} demandes · ${items.filter(e => e.source === 'ia').length} envois IA`, color: '#6366f1' },
    { label: 'Réalisés', value: String(items.filter(e => e.status === 'réalisé').length), sub: 'demandes menées à terme', color: '#10b981' },
    { label: 'En attente', value: String(items.filter(e => ['à faire', 'en cours'].includes(e.status)).length), sub: 'à faire ou en cours', color: '#f59e0b' }] }];
  for (const e of items) {
    blocks.push({ t: 'h3', text: `${fmtDT(e.date)}  ·  ${e.status}  ·  ${e.source === 'ia' ? 'envoi IA' : 'demande'}${e.version ? '  ·  v' + e.version : ''}` });
    blocks.push(...exPara(e.text));
    if (e.notes) blocks.push({ t: 'p', text: 'Notes : ' + e.notes, indent: 12 });
  }
  return generateReport({ title: 'Journal des prompts', file: 'journal-prompts', subtitle: `${items.length} entrée(s) · ${S.data.license?.product ?? 'Comptes'}`, blocks });
}

async function exportVersionsPdf() {
  const D = await (await fetch('/api/versions')).json(), list = D.list;
  const blocks = [{ t: 'kpis', items: [
    { label: 'Version installée', value: 'v' + D.current, sub: `Node ${D.about.node}`, color: '#6366f1' },
    { label: 'Versions publiées', value: String(list.length), sub: list.length ? `de v${list[list.length - 1].version} à v${list[0].version}` : '–', color: '#10b981' },
    { label: 'Dernière publication', value: list[0] ? fdate(list[0].createdAt.slice(0, 10)) : '–', sub: list[0] ? LEVEL_FR[list[0].bump] ?? '' : '', color: '#0ea5e9' }] },
    { t: 'h2', text: 'Historique des versions' },
    { t: 'table', columns: [{ title: 'Version', w: 1 }, { title: 'Date', w: 1.6 }, { title: 'Niveau', w: 1.2 }, { title: 'Fichiers', w: 1, align: 'right' }, { title: 'Taille', w: 1, align: 'right' }], rows: list.map(v => ({ cells: ['v' + v.version, fmtDT(v.createdAt), LEVEL_FR[v.bump] ?? v.bump ?? '', v.files, fmtBytes(v.size)] })) },
    { t: 'h2', text: 'Journal des modifications' }];
  for (const v of list) {
    blocks.push({ t: 'h3', text: `v${v.version}  ·  ${fmtDT(v.createdAt)}  ·  ${LEVEL_FR[v.bump] ?? ''}` });
    const lines = (v.notes || '').split('\n').map(l => l.trim()).filter(Boolean);
    (lines.length ? lines : ['(sans note)']).forEach(l => blocks.push({ t: 'p', text: '•  ' + l.replace(/^[-*•]\s*/, ''), indent: 10 }));
    if (v.prompt) { blocks.push({ t: 'p', text: 'Prompt utilisé :', indent: 10 }); exLines(v.prompt).filter(l => l.trim()).forEach(l => blocks.push({ t: 'p', text: l, indent: 24 })); }
  }
  return generateReport({ title: 'Journal des versions', file: 'versions', subtitle: `Version installée v${D.current} · ${S.data.license?.product ?? 'Comptes'}`, blocks });
}

async function exportDocsPdf() {
  const tmp = h('div'); pageDocs(tmp);
  const blocks = [];
  for (const ch of tmp.querySelectorAll('section.docchapter')) {
    blocks.push({ t: 'h1', tocLevel: 1, text: `${ch.dataset.num}. ${ch.dataset.title}` });
    for (const sec of ch.querySelectorAll(':scope > section.doc')) {
      blocks.push({ t: 'h2', tocLevel: 2, text: `${sec.dataset.num}  ${sec.dataset.title}` });
      for (const el of sec.children) {
        const tag = el.tagName;
        if (tag === 'H3') continue;
        if (tag === 'H4') blocks.push({ t: 'h3', text: el.textContent.trim() });
        else if (tag === 'P') blocks.push({ t: 'p', text: el.textContent.trim() });
        else if (tag === 'UL' || tag === 'OL') [...el.children].forEach((li, i) => blocks.push({ t: 'p', text: (tag === 'OL' ? `${i + 1}.  ` : '•  ') + li.textContent.trim(), indent: 10 }));
        else if (el.classList.contains('tip')) blocks.push({ t: 'p', text: (el.classList.contains('warn') ? 'Attention : ' : 'Conseil : ') + el.textContent.replace(/^[^\p{L}\p{N}]+/u, '').trim(), indent: 10 });
        else if (el.classList.contains('faq')) { blocks.push({ t: 'h3', text: el.querySelector('summary').textContent.trim() }); blocks.push({ t: 'p', text: el.querySelector('p').textContent.trim(), indent: 10 }); }
      }
    }
  }
  return generateReport({ title: 'Mode d’emploi', file: 'documentation', toc: true, subtitle: `${S.data.license?.product ?? 'Comptes'} · version ${S.data.version}`, blocks });
}

async function exportLicensePdf() {
  const D = await (await fetch('/api/license')).json(), L = D.license, acc = L.acceptance, ok = acc && acc.eulaVersion === L.eulaVersion;
  const blocks = [{ t: 'kpis', items: [
    { label: 'Copyright', value: D.brief.copyright, sub: D.brief.product, color: '#6366f1' },
    { label: 'Licence de diffusion', value: D.types[L.licenseType].label.split(' — ')[0], sub: D.types[L.licenseType].spdx, color: '#8b5cf6' },
    { label: 'Licence d’utilisation', value: ok ? 'Acceptée' : 'Non acceptée', sub: ok ? `${acc.name} · ${fmtDT(acc.at)}` : `version ${L.eulaVersion}`, color: ok ? '#10b981' : '#f59e0b' }] },
    { t: 'h2', text: 'Licence du logiciel' }, ...exPara(D.licenseFile),
    { t: 'h2', text: 'Licence d’utilisation' }, ...exPara(D.eulaPreview),
    { t: 'h2', text: 'Composants tiers' },
    { t: 'table', columns: [{ title: 'Composant', w: 3 }, { title: 'Version', w: 1.2 }, { title: 'Licence', w: 2 }], rows: D.thirdParty.map(c => ({ cells: [c.name, c.version, c.license] })) }];
  return generateReport({ title: 'Copyright et licences', file: 'licence', subtitle: `${D.brief.product} · ${D.brief.copyright}`, blocks });
}

async function exportManifestPdf(M, saved) {
  const blocks = [{ t: 'kpis', items: [
    { label: 'Version', value: 'v' + M.version, sub: M.copyright, color: '#6366f1' },
    { label: 'Fichiers du programme', value: String(M.summary.files), sub: fmtBytes(M.summary.bytes), color: '#0ea5e9' },
    { label: 'Intégrité', value: saved ? (saved.matches ? 'Conforme' : 'Modifié') : 'Non enregistré', sub: M.integrity.slice(0, 24) + '…', color: saved?.matches ? '#10b981' : '#f59e0b' }] },
    { t: 'h2', text: 'Identité' },
    { t: 'table', columns: [{ title: 'Propriété', w: 1.4 }, { title: 'Valeur', w: 4 }], rows: [['Nom', M.name], ['Produit', M.product], ['Description', M.description], ['Titulaire', M.holder], ['Licence', `${M.license.type} (${M.license.spdx})`], ['Environnement', `Node ${M.runtime.node} · ${M.runtime.platform}/${M.runtime.arch}${M.runtime.installed ? ' · installé' : ''}`], ['Généré le', fmtDT(M.generatedAt)], ['Empreinte globale', M.integrity]].map(c => ({ cells: c })) },
    { t: 'h2', text: 'Fonctionnalités' }, ...M.features.map(f => ({ t: 'p', text: '•  ' + f, indent: 10 })),
    { t: 'h2', text: 'Dépendances' }, { t: 'table', columns: [{ title: 'Composant', w: 3 }, { title: 'Version', w: 1.2 }, { title: 'Licence', w: 2 }], rows: M.dependencies.map(c => ({ cells: [c.name, c.version, c.license] })) },
    { t: 'h2', text: 'Fichiers et empreintes SHA-256' },
    { t: 'table', fontSize: 7, columns: [{ title: 'Fichier', w: 3 }, { title: 'Taille', w: 0.8, align: 'right' }, { title: 'SHA-256', w: 4.4 }], rows: M.files.map(f => ({ cells: [f.path, f.size, f.sha256] })) }];
  return generateReport({ title: 'Manifeste du programme', file: 'manifeste', subtitle: `${M.product} v${M.version} · ${M.copyright}`, blocks });
}

const pdfBtn = (label, fn) => h('button', { class: 'btn pdf', title: 'Générer un PDF', onclick: async e => { const b = e.currentTarget; b.disabled = true; try { await fn(); } catch (err) { toast('⚠️ ' + (err.message || 'Export impossible')); } b.disabled = false; } }, label || '📄 Exporter en PDF');
