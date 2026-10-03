// Comptes et opérations saisis manuellement (autre banque, espèces, carte de crédit…).
export const MANUAL_TYPES = { MAN_COURANT: 'Compte courant', MAN_EPARGNE: 'Épargne', MAN_ESPECES: 'Espèces', MAN_CARTE: 'Carte de crédit' };

export function manualData(store) {
  store.manualAccounts ??= []; store.manualOps ??= []; store.manualSeq ??= 0;
  return {
    accounts: store.manualAccounts.map(a => ({ number: a.number, type: a.type, name: a.name, bank: a.bank || '', opening: a.opening || 0, manual: true })),
    ops: store.manualOps.map(o => ({ id: 'man-' + o.id, account: o.account, date: o.date, amount: o.amount, label: o.label, details: o.details || '', statement: 'Saisie manuelle', manual: true })),
  };
}

const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(new Date(s));

export function setupManual({ getStore, saveStore, state }) {
  return async function handle(req, res, url, { json, readBody }) {
    const p = url.pathname, m = req.method, store = getStore();
    store.manualAccounts ??= []; store.manualOps ??= []; store.manualSeq ??= 0;
    const err = (msg, code = 400) => { json(res, code, { error: msg }); return true; };
    const ok = () => { saveStore(); json(res, 200, state()); return true; };
    const cleanAcc = b => ({
      name: String(b.name || '').trim().slice(0, 40), type: MANUAL_TYPES[b.type] ? b.type : 'MAN_COURANT',
      bank: String(b.bank || '').trim().slice(0, 40), opening: Math.round((Number(b.opening) || 0) * 100) / 100,
    });
    let mm;

    if (p === '/api/accounts' && m === 'POST') {
      const a = cleanAcc(await readBody(req)); if (!a.name) return err('Le nom du compte est obligatoire');
      store.manualAccounts.push({ number: 'M' + (++store.manualSeq), ...a }); return ok();
    }
    if ((mm = p.match(/^\/api\/accounts\/(M\d+)$/))) {
      const i = store.manualAccounts.findIndex(a => a.number === mm[1]);
      if (i < 0) return err('Compte introuvable', 404);
      if (m === 'PUT') {
        const a = cleanAcc({ ...store.manualAccounts[i], ...(await readBody(req)) }); if (!a.name) return err('Le nom du compte est obligatoire');
        store.manualAccounts[i] = { number: mm[1], ...a }; return ok();
      }
      if (m === 'DELETE') {
        const ids = store.manualOps.filter(o => o.account === mm[1]).map(o => 'man-' + o.id);
        store.manualOps = store.manualOps.filter(o => o.account !== mm[1]);
        ids.forEach(id => delete store.overrides[id]);
        store.manualAccounts.splice(i, 1); return ok();
      }
    }
    const opFrom = b => ({
      account: String(b.account || ''), date: String(b.date || ''), amount: Math.round(Number(b.amount) * 100) / 100,
      label: String(b.label || '').trim().slice(0, 120), details: String(b.details || '').trim().slice(0, 300),
    });
    const checkOp = o => !store.manualAccounts.some(a => a.number === o.account) ? 'Compte inconnu' : !isDate(o.date) ? 'Date invalide' : !Number.isFinite(o.amount) || o.amount === 0 ? 'Montant invalide' : !o.label ? 'Le libellé est obligatoire' : null;

    if (p === '/api/manual-ops' && m === 'POST') {
      const b = await readBody(req), o = opFrom(b), e = checkOp(o); if (e) return err(e);
      const id = ++store.manualSeq; store.manualOps.push({ id, ...o });
      if (b.categoryId && store.categories.some(c => c.id === b.categoryId)) store.overrides['man-' + id] = b.categoryId;
      return ok();
    }
    if ((mm = p.match(/^\/api\/manual-ops\/(\d+)$/))) {
      const i = store.manualOps.findIndex(o => String(o.id) === mm[1]);
      if (i < 0) return err('Opération introuvable', 404);
      if (m === 'PUT') {
        const b = await readBody(req), o = opFrom(b), e = checkOp(o); if (e) return err(e);
        store.manualOps[i] = { id: store.manualOps[i].id, ...o };
        if (b.categoryId && store.categories.some(c => c.id === b.categoryId)) store.overrides['man-' + mm[1]] = b.categoryId;
        return ok();
      }
      if (m === 'DELETE') { store.manualOps.splice(i, 1); delete store.overrides['man-' + mm[1]]; return ok(); }
    }
    return false;
  };
}
