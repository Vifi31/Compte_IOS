// Mini lecteur/écrivain ZIP (méthodes stored / deflate), sans dépendance.
import zlib from 'zlib';

const dosDateTime = d => ({
  time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
  date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
});

/** entries : [{ name, data: Buffer, mtime?: Date }] -> Buffer */
export function createZip(entries) {
  const locals = [], centrals = []; let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name.replace(/\\/g, '/'), 'utf8');
    const raw = e.data, crc = zlib.crc32(raw);
    let comp = zlib.deflateRawSync(raw, { level: 6 }), method = 8;
    if (comp.length >= raw.length) { comp = raw; method = 0; }
    const { time, date } = dosDateTime(e.mtime ?? new Date());
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(time, 10); lh.writeUInt16LE(date, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(time, 12); ch.writeUInt16LE(date, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, name, comp); centrals.push(ch, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/** Lit l'annuaire d'un ZIP : [{ name, size, csize, crc, read() }] */
export function readZip(buf) {
  let p = buf.length - 22;
  while (p >= 0 && buf.readUInt32LE(p) !== 0x06054b50) p--;
  if (p < 0) throw new Error('Archive ZIP invalide');
  const count = buf.readUInt16LE(p + 10); let q = buf.readUInt32LE(p + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(q) !== 0x02014b50) throw new Error('Annuaire ZIP corrompu');
    const method = buf.readUInt16LE(q + 10), crc = buf.readUInt32LE(q + 16), csize = buf.readUInt32LE(q + 20), size = buf.readUInt32LE(q + 24);
    const nl = buf.readUInt16LE(q + 28), el = buf.readUInt16LE(q + 30), cl = buf.readUInt16LE(q + 32), lo = buf.readUInt32LE(q + 42);
    const name = buf.toString('utf8', q + 46, q + 46 + nl);
    out.push({
      name, size, csize, crc,
      read() {
        const dataStart = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28);
        const comp = buf.subarray(dataStart, dataStart + csize);
        return method === 0 ? Buffer.from(comp) : zlib.inflateRawSync(comp);
      },
    });
    q += 46 + nl + el + cl;
  }
  return out;
}
