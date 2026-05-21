import { readFileSync } from 'fs';
import path from 'path';
import JSZip from 'jszip';

globalThis.window = globalThis;
globalThis.JSZip = JSZip;
globalThis.TextDecoder = TextDecoder;

const parserSrc = readFileSync(
  path.join('C:', 'Users', 'Livan', 'OneDrive', 'Documentos', 'EDGE', 'Categorias Activos', 'js', 'sqxParser.js'),
  'utf-8'
);
eval(parserSrc);

const dir = path.join('C:', 'Users', 'Livan', 'OneDrive', 'Desktop', 'SP500LONGM30CLOSE');
const files = [
  'Strategy 0.130387.sqx',
  'Strategy 0.340182.sqx',
  'Strategy 0.544331.sqx',
  'Strategy 0.622177.sqx',
  'Strategy 0.333026.sqx',
  'TEMPLATE SP500LONGM30 CLOSE 2.13.36(1).sqx',
];

for (const f of files) {
  const full = path.join(dir, f);
  const buf = readFileSync(full);
  const fake = {
    name: f,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
  try {
    const r = await SQXParser.parseSqxFile(fake);
    const totalPl = r.trades.reduce((s, t) => s + t.pl, 0);
    const ct = {};
    r.trades.forEach(t => ct[t.close_type] = (ct[t.close_type] || 0) + 1);
    const audit = SQXParser.auditStrategyXml(r.strategy_xml);
    console.log(
      f.padEnd(48),
      '|', (r.header.strategy_name || '').padEnd(22),
      '|', String(r.trades.length).padStart(4), 'trades',
      '| PL $' + totalPl.toFixed(0).padStart(7),
      '| EAB=' + audit.exitAfterBars,
      '| PT=' + (audit.profitTarget || '?'),
      '| pct=' + audit.percentileCount,
      '| postfix=' + audit.isPostFixV6
    );
  } catch (e) {
    console.log(f, 'ERROR:', e.message);
  }
}
