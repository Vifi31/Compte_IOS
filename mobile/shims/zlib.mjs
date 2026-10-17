// zlib de l'appli mobile (archives ZIP des sauvegardes et versions) : fflate, en JavaScript pur.
import { deflateSync, inflateSync } from 'fflate';
import { Buffer } from 'buffer';

const TABLE = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
export function crc32(data, prev = 0) {
  const b = typeof data === 'string' ? Buffer.from(data) : data; let c = ~prev >>> 0;
  for (let i = 0; i < b.length; i++) c = TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}
export const deflateRawSync = (data, o) => Buffer.from(deflateSync(data, { level: o?.level ?? 6 }));
export const inflateRawSync = data => Buffer.from(inflateSync(data));
export default { crc32, deflateRawSync, inflateRawSync };
