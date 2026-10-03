import fs from 'fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
const [,, file, pg] = process.argv;
const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(file)), useSystemFonts: true }).promise;
const page = await doc.getPage(+pg);
const tc = await page.getTextContent();
const items = tc.items.filter(i=>i.str.trim()).map(i=>({x:Math.round(i.transform[4]),y:Math.round(i.transform[5]),s:i.str}));
items.sort((a,b)=>b.y-a.y||a.x-b.x);
for (const i of items) console.log(i.y, i.x, i.s);
