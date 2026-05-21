/**
 * Parser cliente-side de archivos .sqx (StrategyQuant X).
 *
 * Funciona en navegador:
 *   const result = await parseSqxFile(file);
 *   result.header.strategy_name, result.header.symbol, result.trades[i]...
 *
 * Estructura interna .sqx = ZIP. Dentro:
 *   orders.bin  → trade list (Java serialization, block-data wrapped)
 *
 * Requiere JSZip cargado globalmente (window.JSZip).
 *
 * Validado contra parser Python equivalente: 174/174 trades coinciden con TradelistExport.csv.
 */

(function (global) {
  'use strict';

  // Los magic markers observados son permutaciones de {1,2,3,4} terminados en 01.
  // SQX usa diferentes permutaciones según versión del generador (5 observadas).
  const MAGIC_A = [0x04, 0x03, 0x02, 0x01];
  const MAGIC_B = [0x03, 0x02, 0x04, 0x01];
  const MAGIC_C = [0x02, 0x03, 0x04, 0x01];
  const MAGIC_D = [0x03, 0x04, 0x02, 0x01];
  const MAGIC_E = [0x02, 0x04, 0x03, 0x01];
  const MAGIC_F = [0x04, 0x02, 0x03, 0x01];

  const CLOSE_TYPE_MAP = {
    2: 'SL',    // Stop Loss
    3: 'PT',    // Profit Target
    4: 'XC',    // X-Close (cierre forzado fin de periodo)
    6: 'TR',    // Trailing Stop (variante antigua)
    19: 'EAB',  // Exit After Bars
    21: 'TR',   // Trailing Stop (variante observada en mining WS30 FINALES con trailing activo)
  };

  // ---------- helpers ----------
  function arraysEqual(a, b, offset) {
    for (let i = 0; i < b.length; i++) {
      if (a[offset + i] !== b[i]) return false;
    }
    return true;
  }

  function findMagicAt(stream, offset) {
    if (arraysEqual(stream, MAGIC_A, offset)) return 'A';
    if (arraysEqual(stream, MAGIC_B, offset)) return 'B';
    if (arraysEqual(stream, MAGIC_C, offset)) return 'C';
    if (arraysEqual(stream, MAGIC_D, offset)) return 'D';
    if (arraysEqual(stream, MAGIC_E, offset)) return 'E';
    if (arraysEqual(stream, MAGIC_F, offset)) return 'F';
    return null;
  }

  function findMagic(stream, fromOffset) {
    for (let i = fromOffset; i <= stream.length - 4; i++) {
      if (findMagicAt(stream, i)) return i;
    }
    return -1;
  }

  function readU16BE(stream, offset) {
    return (stream[offset] << 8) | stream[offset + 1];
  }

  function readU32BE(stream, offset) {
    return (
      (stream[offset] * 0x1000000) +
      (stream[offset + 1] * 0x10000) +
      (stream[offset + 2] * 0x100) +
      stream[offset + 3]
    );
  }

  function readI64BE(stream, offset) {
    // Returns Number (may lose precision for very large values, fine for ms timestamps until ~year 285k)
    const hi = readU32BE(stream, offset);
    const lo = readU32BE(stream, offset + 4);
    return hi * 0x100000000 + lo;
  }

  function readF32BE(stream, offset) {
    const buf = new ArrayBuffer(4);
    const view = new DataView(buf);
    for (let i = 0; i < 4; i++) view.setUint8(i, stream[offset + i]);
    return view.getFloat32(0, false);
  }

  function readUtf(stream, offset) {
    const len = readU16BE(stream, offset);
    const bytes = stream.slice(offset + 2, offset + 2 + len);
    let s = '';
    try {
      s = new TextDecoder('utf-8').decode(bytes);
    } catch (e) {
      // Fallback: latin-1
      s = String.fromCharCode.apply(null, Array.from(bytes));
    }
    return { value: s, next: offset + 2 + len };
  }

  // ---------- block stripping ----------
  /**
   * Strip Java serialization block markers (TC_BLOCKDATALONG=0x7a, TC_BLOCKDATA=0x77).
   * Devuelve Uint8Array con los datos crudos concatenados.
   */
  function stripJavaBlocks(raw) {
    const out = [];
    let i = 0;
    // Skip Java magic header ac ed 00 05
    if (raw[0] === 0xac && raw[1] === 0xed && raw[2] === 0x00 && raw[3] === 0x05) {
      i = 4;
    }
    while (i < raw.length) {
      const op = raw[i];
      if (op === 0x7a) {
        // TC_BLOCKDATALONG: 7a + 4-byte length
        const length = readU32BE(raw, i + 1);
        for (let k = 0; k < length; k++) out.push(raw[i + 5 + k]);
        i += 5 + length;
      } else if (op === 0x77) {
        // TC_BLOCKDATA: 77 + 1-byte length
        const length = raw[i + 1];
        for (let k = 0; k < length; k++) out.push(raw[i + 2 + k]);
        i += 2 + length;
      } else {
        break;
      }
    }
    return new Uint8Array(out);
  }

  // ---------- header parsing ----------
  function parseHeader(stream) {
    let off = 0;
    const fileFormat = readUtf(stream, off);
    if (!fileFormat.value.startsWith('SQOrderFileFormat')) {
      throw new Error('Unexpected file format: ' + fileFormat.value);
    }
    off = fileFormat.next;

    // Find first trade magic
    const magicPos = findMagic(stream, off);
    if (magicPos < 0) throw new Error('No trade records found');

    // Scan strings (u16 length + UTF-8) between current off and magicPos
    const strings = [];
    let scan = off;
    while (scan < magicPos - 2) {
      const slen = readU16BE(stream, scan);
      if (slen >= 1 && slen <= 200 && scan + 2 + slen <= magicPos) {
        try {
          const s = new TextDecoder('utf-8', { fatal: true })
            .decode(stream.slice(scan + 2, scan + 2 + slen));
          // Validate printable
          let printable = true;
          for (let i = 0; i < s.length; i++) {
            const c = s.charCodeAt(i);
            if (c < 0x20 || (c >= 0x7f && c < 0xa0)) { printable = false; break; }
          }
          if (printable && s.length >= 3) {
            strings.push({ pos: scan, value: s });
            scan = scan + 2 + slen;
            continue;
          }
        } catch (e) { /* not utf-8 */ }
      }
      scan++;
    }

    // Identify strategy/chart/symbol heuristically
    let strategy_name = null, chart_name = null, symbol = null;
    for (const s of strings) {
      if (s.value.includes('Main:') || s.value.includes('/')) chart_name = s.value;
      else if (/^(strategy|template)/i.test(s.value)) strategy_name = s.value;
      else if (!symbol) symbol = s.value;
    }
    if (!strategy_name && strings.length >= 3) strategy_name = strings[strings.length - 1].value;
    if (!chart_name && strings.length >= 2) chart_name = strings[0].value;
    if (!symbol && strings.length >= 2) symbol = strings[1].value;

    return {
      file_format: fileFormat.value,
      strategy_name,
      chart_name,
      symbol,
      records_offset: magicPos,
    };
  }

  // ---------- trade record parsing ----------
  function parseTradeRecord(stream, baseOffset) {
    if (!findMagicAt(stream, baseOffset)) {
      throw new Error('Bad magic at offset ' + baseOffset);
    }
    const ticket = readU32BE(stream, baseOffset + 4);
    const closeTypeId = stream[baseOffset + 13];
    const openMs = readI64BE(stream, baseOffset + 15);
    const size = readF32BE(stream, baseOffset + 24);
    const openPrice = readF32BE(stream, baseOffset + 28);
    const openFillMs = readI64BE(stream, baseOffset + 32);
    const openFillPrice = readF32BE(stream, baseOffset + 40);
    const closeMs = readI64BE(stream, baseOffset + 44);
    const closePrice = readF32BE(stream, baseOffset + 52);
    const closeFillPrice = readF32BE(stream, baseOffset + 56);
    const tpPrice = readF32BE(stream, baseOffset + 60);
    const pl = readF32BE(stream, baseOffset + 66);
    const maeAbs = readF32BE(stream, baseOffset + 99);
    const maePerLot = readF32BE(stream, baseOffset + 103);
    const mfeAbs = readF32BE(stream, baseOffset + 107);
    const mfePerLot = readF32BE(stream, baseOffset + 111);

    return {
      ticket,
      close_type_id: closeTypeId,
      close_type: CLOSE_TYPE_MAP[closeTypeId] || ('?' + closeTypeId),
      open_time: new Date(openMs),
      open_fill_time: new Date(openFillMs),
      close_time: new Date(closeMs),
      size,
      open_price: openPrice,
      open_fill_price: openFillPrice,
      close_price: closePrice,
      close_fill_price: closeFillPrice,
      tp_price: tpPrice,
      pl,
      mae: -Math.abs(maeAbs),
      mfe: mfeAbs,
      mae_per_lot: maePerLot,
      mfe_per_lot: mfePerLot,
      duration_seconds: Math.floor((closeMs - openMs) / 1000),
    };
  }

  // ---------- public: parse from File (browser) ----------
  /**
   * Parsea un File del input ZIP .sqx.
   * Devuelve { header, trades, raw_xml_strategy? }.
   */
  async function parseSqxFile(file) {
    if (!global.JSZip) {
      throw new Error('JSZip not loaded. Add <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>');
    }
    const ab = await file.arrayBuffer();
    const zip = await global.JSZip.loadAsync(ab);

    const ordersEntry = zip.file('orders.bin');
    if (!ordersEntry) throw new Error('.sqx no contiene orders.bin');
    const ordersRaw = new Uint8Array(await ordersEntry.async('uint8array'));

    const stream = stripJavaBlocks(ordersRaw);
    const header = parseHeader(stream);
    const trades = [];
    let off = header.records_offset;
    while (off + 149 <= stream.length) {
      if (!findMagicAt(stream, off)) break;
      trades.push(parseTradeRecord(stream, off));
      off += 149;
    }

    // Also extract strategy_Portfolio.xml for source code analysis
    let strategyXml = null;
    const xmlEntry = zip.file('strategy_Portfolio.xml');
    if (xmlEntry) {
      strategyXml = await xmlEntry.async('string');
    }

    return {
      header,
      trades,
      strategy_xml: strategyXml,
      file_name: file.name,
    };
  }

  // ---------- public: source code & exits audit from XML ----------
  /**
   * Audita el strategy_Portfolio.xml interno para detectar:
   *  - ExitAfterBars use=true (no debería en Capa 2)
   *  - Indicators.Number con valores absolutos > 100 (overfit antiguo)
   *  - Uso de IsLowerPercentil / IsGreaterPercentil (buena señal, escala-invariante)
   *  - Exits configurados: ProfitTarget, StopLoss, TrailingStop, TrailingActivation
   */
  function auditStrategyXml(xml) {
    const audit = {
      exitAfterBars: 'unknown',
      profitTarget: null,
      stopLoss: null,
      trailingStop: null,
      trailingActivation: null,
      moveSL2BE: null,
      usesPercentiles: false,
      percentileCount: 0,
      numberAbsoluteValues: [],
      isPostFixV6: false,
    };
    if (!xml) return audit;

    // ExitAfterBars: hay 2 formatos según versión SQX
    //   1. Capa 2 (.sqx generado por SQX moderno): <Param key="#ExitAfterBars.ExitAfterBars#">VALUE</Param>
    //      value=0 → OFF, value=N → ON con N bars
    //   2. Capa 1 (template): <Param key="#ExitAfterBars#" name="Exit After Bars">VALUE</Param>
    //      mismo significado
    let eabValue = null;
    const eab1 = /<Param key="#ExitAfterBars\.ExitAfterBars#"[^>]*?>([\d.\-]+)<\/Param>/.exec(xml);
    if (eab1) eabValue = parseFloat(eab1[1]);
    if (eabValue === null) {
      const eab2 = /<Param key="#ExitAfterBars#"[^>]*name="Exit After Bars"[^>]*>([\d.\-]+)<\/Param>/.exec(xml);
      if (eab2) eabValue = parseFloat(eab2[1]);
    }
    if (eabValue === null) {
      // No XML hit at all
      audit.exitAfterBars = xml.includes('ExitAfterBars') ? 'PRESENT_UNKNOWN' : 'NOT_FOUND';
    } else if (eabValue === 0) {
      audit.exitAfterBars = 'OFF (value=0)';
    } else {
      audit.exitAfterBars = 'ON (' + eabValue + ' bars)';
    }

    // Exits: parse Formula key=SQ.Formulas.X.ATRBasedValue / X.None
    // Estructura:
    //   <Param key="#ExitType.ExitType#" ... isFormula="true">
    //     <Formula key="SQ.Formulas.SLPT.ATRBasedValue">       <- activo
    //       <Param key="#Value#" ...>X</Param>
    //       <Param key="#AtrPeriod#" ...>Y</Param>
    //     </Formula>
    //   </Param>
    //
    // o bien:
    //   <Param key="#ExitType.ExitType#" ... isFormula="true">
    //     <Formula key="SQ.Formulas.SLPT.None" />              <- OFF
    //   </Param>
    //
    // El regex no puede matchear el Param outer porque tiene Params nested.
    // Solución: localizar el start del Param outer y buscar la siguiente Formula key= y sus Value/AtrPeriod.
    const exitKeys = [
      { name: 'profitTarget', key: 'ProfitTarget.ProfitTarget' },
      { name: 'stopLoss', key: 'StopLoss.StopLoss' },
      { name: 'trailingStop', key: 'TrailingStop.TrailingStop' },
      { name: 'trailingActivation', key: 'TrailingStop.TrailingActivation' },
      { name: 'moveSL2BE', key: 'MoveSL2BE.MoveSL2BE' },
    ];
    for (const ek of exitKeys) {
      const startRe = new RegExp('<Param key="#' + ek.key.replace(/\./g, '\\.') + '#"[^>]*?>');
      const start = startRe.exec(xml);
      if (!start) continue;
      const tail = xml.substr(start.index + start[0].length, 4000);
      // ¿Formula None?
      if (/<Formula key="SQ\.Formulas\.\w+\.None"\s*\/?>/.test(tail.slice(0, 200))) {
        audit[ek.name] = 'OFF';
        continue;
      }
      // Detectar Formula y extraer Value + AtrPeriod
      const formulaMatch = /<Formula key="SQ\.Formulas\.(\w+)\.(\w+)"/.exec(tail);
      const formulaType = formulaMatch ? formulaMatch[2] : 'CONFIGURED';
      const vm = /<Param key="#Value#"[^>]*?>([\d.]+)<\/Param>/.exec(tail);
      const apm = /<Param key="#AtrPeriod#"[^>]*?>(\d+)<\/Param>/.exec(tail);
      if (vm && apm) audit[ek.name] = parseFloat(vm[1]).toFixed(2) + ' × ATR(' + apm[1] + ')';
      else if (vm) audit[ek.name] = vm[1] + ' (' + formulaType + ')';
      else audit[ek.name] = formulaType;
    }

    // Percentiles (escala-invariante = bueno)
    const pctMatches = (xml.match(/Is(?:Greater|Lower)Percentil/g) || []);
    audit.percentileCount = pctMatches.length;
    audit.usesPercentiles = pctMatches.length > 0;

    // Number absolute values used in rules (post-fix v1+v2 deberían estar ausentes en reglas; siguen apareciendo en exits pero no en rules)
    const numRe = /<Item[^>]*?key="Number"[^>]*?>[\s\S]*?<Param[^>]*?value="([0-9.\-]+)"/g;
    let m;
    while ((m = numRe.exec(xml)) !== null) {
      const v = parseFloat(m[1]);
      if (!isNaN(v) && Math.abs(v) > 10) {
        audit.numberAbsoluteValues.push(v);
      }
    }

    // Post-fix v6 heuristic: uses Percentiles AND no large Number absolutes in rules AND no active ExitAfterBars
    const eabIsOff = audit.exitAfterBars === 'OFF (value=0)' || audit.exitAfterBars === 'NOT_FOUND';
    audit.isPostFixV6 = audit.usesPercentiles && audit.numberAbsoluteValues.length === 0 && eabIsOff;

    return audit;
  }

  // ---------- export ----------
  global.SQXParser = {
    parseSqxFile,
    stripJavaBlocks,
    parseHeader,
    parseTradeRecord,
    findMagic,
    findMagicAt,
    auditStrategyXml,
    CLOSE_TYPE_MAP,
    MAGIC_A,
    MAGIC_B,
    MAGIC_C,
    MAGIC_D,
    MAGIC_E,
    MAGIC_F,
  };
})(typeof window !== 'undefined' ? window : globalThis);
