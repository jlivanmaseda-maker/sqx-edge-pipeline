// Test del parser JS bajo Node — valida que produce los mismos resultados que el Python.
// Carga el archivo de Strategy 0.333026.sqx, parsea, y compara contra CSV TradelistExport.csv.

import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Cargar el parser JS (uses global)
globalThis.window = globalThis;
// Mock JSZip
import JSZipModule from 'jszip';
globalThis.JSZip = JSZipModule;
globalThis.TextDecoder = TextDecoder;

// Source-load nuestros parsers
const parserSrc = readFileSync(
  'C:\\Users\\Livan\\OneDrive\\Documentos\\EDGE\\Categorias Activos\\js\\sqxParser.js',
  'utf-8'
);
eval(parserSrc);

const sqxPath = 'C:\\Users\\Livan\\OneDrive\\Desktop\\SP500LONGM30CLOSE\\Strategy 0.333026.sqx';
const csvPath = 'C:\\Users\\Livan\\OneDrive\\Desktop\\SP500LONGM30CLOSE\\TradelistExport.csv';

const fileBuf = readFileSync(sqxPath);
// Mimic File: object with arrayBuffer() method + name
const fakeFile = {
  name: 'Strategy 0.333026.sqx',
  arrayBuffer: async () => fileBuf.buffer.slice(fileBuf.byteOffset, fileBuf.byteOffset + fileBuf.byteLength),
};

const result = await SQXParser.parseSqxFile(fakeFile);
console.log('Strategy:', result.header.strategy_name);
console.log('Chart:', result.header.chart_name);
console.log('Symbol:', result.header.symbol);
console.log('# trades:', result.trades.length);
console.log('Total PL:', result.trades.reduce((s, t) => s + t.pl, 0).toFixed(2));

// Compare with CSV
const csvText = readFileSync(csvPath, 'utf-8').replace(/^﻿/, '');
const lines = csvText.split(/\r?\n/).filter(x => x.length);
function unq(s) { return s.replace(/^"|"$/g, '').trim(); }
const header = lines[0].split(';').map(h => unq(h));
const csvTrades = lines.slice(1).map(line => {
  const cells = line.split(';').map(c => unq(c));
  const obj = {};
  for (let i = 0; i < header.length; i++) obj[header[i]] = cells[i];
  return obj;
});

console.log('\nValidando contra CSV (' + csvTrades.length + ' trades)...');
let errors = 0;
for (let i = 0; i < result.trades.length; i++) {
  const tb = result.trades[i];
  const tc = csvTrades[i];
  if (tb.ticket !== parseInt(tc.Ticket)) { if (i < 5) console.log('Trade', i+1, 'ticket: bin=', tb.ticket, 'csv=', tc.Ticket); errors++; continue; }
  if (Math.abs(tb.size - parseFloat(tc.Size)) > 0.01) { console.log('Trade', i+1, 'size:', tb.size, 'vs', tc.Size); errors++; continue; }
  if (Math.abs(tb.open_price - parseFloat(tc['Open price'])) > 0.05) { console.log('Trade', i+1, 'OP:', tb.open_price, 'vs', tc['Open price']); errors++; continue; }
  if (Math.abs(tb.close_price - parseFloat(tc['Close price'])) > 0.05) { console.log('Trade', i+1, 'CP:', tb.close_price, 'vs', tc['Close price']); errors++; continue; }
  if (Math.abs(tb.pl - parseFloat(tc['Profit/Loss'])) > 0.05) { console.log('Trade', i+1, 'PL:', tb.pl, 'vs', tc['Profit/Loss']); errors++; continue; }
  if (Math.abs(tb.mae - parseFloat(tc['MAE ($)'])) > 0.05) { console.log('Trade', i+1, 'MAE:', tb.mae, 'vs', tc['MAE ($)']); errors++; continue; }
  if (Math.abs(tb.mfe - parseFloat(tc['MFE ($)'])) > 0.05) { console.log('Trade', i+1, 'MFE:', tb.mfe, 'vs', tc['MFE ($)']); errors++; continue; }
  if (tb.close_type !== tc['Close type']) { console.log('Trade', i+1, 'close_type:', tb.close_type, 'vs', tc['Close type']); errors++; continue; }
}
if (errors === 0) {
  console.log('[OK] ' + result.trades.length + '/' + csvTrades.length + ' trades validated exactly');
} else {
  console.log('[FAIL] ' + errors + ' field mismatches');
}

// Audit XML
if (result.strategy_xml) {
  console.log('\nAuditoria XML:');
  const audit = SQXParser.auditStrategyXml(result.strategy_xml);
  console.log(JSON.stringify(audit, null, 2));
}
