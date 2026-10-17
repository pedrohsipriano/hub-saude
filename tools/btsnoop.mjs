#!/usr/bin/env node
// Leitor de btsnoop_hci.log (log HCI do Android) sem dependências.
// Lista as operações ATT (escritas, notificações, leituras) trocadas com um aparelho BLE,
// com horário local — substitui o Wireshark na análise do protocolo do relógio.
//
// Uso:
//   node tools/btsnoop.mjs <btsnoop_hci.log> [MAC] [--out arquivo.txt]
//   ex.: node tools/btsnoop.mjs capturas/relogio/btsnoop_hci.log 11:22:33:44:55:66 --out capturas/relogio/att.txt
//
// Formato btsnoop: cabeçalho de 16 bytes ("btsnoop\0", versão, datalink) + registros
// de 24 bytes de metadados seguidos do pacote HCI. Datalink 1002 = H4 (1º byte = tipo do pacote).
import { readFileSync, writeFileSync } from 'node:fs';

// Microssegundos entre 01/01/0000 e 01/01/1970 (constante do btsnoop do Android).
const EPOCH_DELTA_US = 0x00dcddb30f2f8000n;

// Tipos de pacote H4.
const H4_COMMAND = 0x01;
const H4_ACL = 0x02;
const H4_EVENT = 0x04;

// Canal L2CAP do ATT.
const CID_ATT = 0x0004;

// Nomes dos opcodes ATT que interessam.
const ATT_OPCODES = {
  0x01: 'ERROR_RSP',
  0x02: 'MTU_REQ',
  0x03: 'MTU_RSP',
  0x08: 'READ_BY_TYPE_REQ',
  0x09: 'READ_BY_TYPE_RSP',
  0x0a: 'READ_REQ',
  0x0b: 'READ_RSP',
  0x10: 'READ_BY_GROUP_REQ',
  0x11: 'READ_BY_GROUP_RSP',
  0x12: 'WRITE_REQ',
  0x13: 'WRITE_RSP',
  0x1b: 'NOTIFY',
  0x1d: 'INDICATE',
  0x1e: 'CONFIRM',
  0x52: 'WRITE_CMD',
};

/** Bytes → "AA BB CC". */
const toHex = (bytes) => Buffer.from(bytes).toString('hex').toUpperCase().replace(/(..)(?!$)/g, '$1 ');

/** Endereço BLE (6 bytes little-endian) → "AA:BB:CC:DD:EE:FF". */
const toMac = (bytes) => toHex([...bytes].reverse()).replaceAll(' ', ':');

/** UUID little-endian (2 ou 16 bytes) → texto. */
function toUuid(bytes) {
  const hex = Buffer.from([...bytes].reverse()).toString('hex');
  if (hex.length === 4) return `0x${hex.toUpperCase()}`;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Horário com milissegundos (ex.: 18:13:05.123).
 * O Android grava o btsnoop já em hora LOCAL do celular, então o valor é lido
 * com os getters UTC (sem aplicar o fuso do PC de novo).
 */
function formatTime(ms) {
  const date = new Date(ms);
  const pad = (n, size = 2) => String(n).padStart(size, '0');
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)}`;
}

/** Lê todos os registros do arquivo btsnoop. */
function readRecords(buffer) {
  if (buffer.toString('latin1', 0, 8) !== 'btsnoop\0') throw new Error('Arquivo não é btsnoop.');
  const datalink = buffer.readUInt32BE(12);
  const records = [];
  let offset = 16;
  while (offset + 24 <= buffer.length) {
    const includedLength = buffer.readUInt32BE(offset + 4);
    const flags = buffer.readUInt32BE(offset + 8);
    const timestampUs = buffer.readBigInt64BE(offset + 16);
    let data = buffer.subarray(offset + 24, offset + 24 + includedLength);
    offset += 24 + includedLength;

    const received = (flags & 1) === 1; // 1 = controlador → celular
    let type;
    if (datalink === 1002) {
      // H4: o primeiro byte é o tipo do pacote.
      type = data[0];
      data = data.subarray(1);
    } else {
      // HCI sem encapsulamento: o tipo sai das flags.
      type = flags & 2 ? (received ? H4_EVENT : H4_COMMAND) : H4_ACL;
    }
    records.push({ received, type, data, timeMs: Number((timestampUs - EPOCH_DELTA_US) / 1000n) });
  }
  return records;
}

/** Processa os registros e devolve conexões e operações ATT. */
function analyze(records) {
  const connections = new Map(); // handle da conexão → { mac, since }
  const fragments = new Map(); // `${handle}:${direção}` → buffer L2CAP em montagem
  const attOps = [];

  for (const record of records) {
    const { type, data, received, timeMs } = record;

    // Eventos: anotam qual handle de conexão pertence a qual MAC.
    if (type === H4_EVENT && data.length >= 2) {
      const code = data[0];
      if (code === 0x3e) {
        const subevent = data[2];
        // LE Connection Complete (0x01), Enhanced (0x0A) e Enhanced v2 (0x29): mesmo início.
        if ((subevent === 0x01 || subevent === 0x0a || subevent === 0x29) && data[3] === 0x00) {
          const handle = data.readUInt16LE(4) & 0x0fff;
          connections.set(handle, { mac: toMac(data.subarray(8, 14)), since: timeMs });
        }
      }
      continue;
    }

    if (type !== H4_ACL || data.length < 4) continue;

    // Cabeçalho ACL: handle (12 bits) + flag de fragmento (2 bits) + tamanho.
    const handleFlags = data.readUInt16LE(0);
    const handle = handleFlags & 0x0fff;
    const packetBoundary = (handleFlags >> 12) & 0x03;
    const payload = data.subarray(4, 4 + data.readUInt16LE(2));
    const key = `${handle}:${received ? 'rx' : 'tx'}`;

    // Remonta quadros L2CAP divididos em vários pacotes ACL.
    let frame;
    if (packetBoundary === 0x01) {
      const previous = fragments.get(key);
      if (!previous) continue;
      frame = Buffer.concat([previous, payload]);
    } else {
      frame = Buffer.from(payload);
    }
    if (frame.length < 4 || frame.length < frame.readUInt16LE(0) + 4) {
      fragments.set(key, frame);
      continue;
    }
    fragments.delete(key);

    // Só interessa o canal ATT.
    if (frame.readUInt16LE(2) !== CID_ATT) continue;
    const att = frame.subarray(4, 4 + frame.readUInt16LE(0));
    const opcode = att[0];
    const op = {
      timeMs,
      connection: handle,
      direction: received ? '←' : '→', // ← relógio para celular; → celular para relógio
      opcode,
      name: ATT_OPCODES[opcode] ?? `OP_0x${opcode.toString(16)}`,
      attHandle: null,
      value: null,
      raw: att,
    };
    if ([0x0a, 0x12, 0x1b, 0x1d, 0x52].includes(opcode) && att.length >= 3) {
      op.attHandle = att.readUInt16LE(1);
      op.value = att.subarray(3);
    } else if (opcode === 0x0b) {
      op.value = att.subarray(1);
    }
    attOps.push(op);
  }
  return { connections, attOps };
}

/** Extrai o mapa handle → UUID das respostas de descoberta de serviços (se houver no log). */
function discoveredCharacteristics(attOps) {
  const map = new Map();
  for (const op of attOps) {
    // READ_BY_TYPE_RSP com declarações de característica: [handle][props][handle do valor][UUID].
    if (op.opcode !== 0x09 || op.raw.length < 2) continue;
    const entryLength = op.raw[1];
    if (entryLength !== 7 && entryLength !== 21) continue;
    for (let i = 2; i + entryLength <= op.raw.length; i += entryLength) {
      const entry = op.raw.subarray(i, i + entryLength);
      map.set(entry.readUInt16LE(3), { properties: entry[2], uuid: toUuid(entry.subarray(5)) });
    }
  }
  return map;
}

// ---- Programa principal ----
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex >= 0 ? args[outIndex + 1] : null;
const [file, macFilter] = args.filter((arg, index) => index !== outIndex && index !== outIndex + 1);
if (!file) {
  console.error('Uso: node tools/btsnoop.mjs <btsnoop_hci.log> [MAC] [--out arquivo.txt]');
  process.exit(1);
}

const { connections, attOps } = analyze(readRecords(readFileSync(file)));
const characteristics = discoveredCharacteristics(attOps);

// Handles de conexão do aparelho pedido (sem filtro: todos).
const wanted = new Set(
  [...connections].filter(([, info]) => !macFilter || info.mac === macFilter.toUpperCase()).map(([handle]) => handle),
);
const selected = attOps.filter((op) => !macFilter || wanted.has(op.connection));

const lines = [];
lines.push('Conexões LE no log:');
for (const [handle, info] of connections) lines.push(`  handle 0x${handle.toString(16)} → ${info.mac} (desde ${formatTime(info.since)})`);
if (characteristics.size) {
  lines.push('Características descobertas (handle do valor → UUID, propriedades):');
  for (const [valueHandle, info] of [...characteristics].sort((a, b) => a[0] - b[0])) {
    lines.push(`  0x${valueHandle.toString(16).padStart(4, '0')} → ${info.uuid} props=0x${info.properties.toString(16)}`);
  }
}

// Resumo: quantas operações por tipo e handle.
const summary = new Map();
for (const op of selected) {
  const key = `${op.direction} ${op.name} handle=${op.attHandle == null ? '-' : `0x${op.attHandle.toString(16).padStart(4, '0')}`}`;
  summary.set(key, (summary.get(key) ?? 0) + 1);
}
lines.push(`Operações ATT selecionadas: ${selected.length}`);
for (const [key, count] of [...summary].sort((a, b) => b[1] - a[1])) lines.push(`  ${String(count).padStart(5)}  ${key}`);

// Lista completa, uma operação por linha.
lines.push('', 'hora         dir operação   handle  bytes');
for (const op of selected) {
  const handleText = op.attHandle == null ? '      ' : `0x${op.attHandle.toString(16).padStart(4, '0')}`;
  const bytes = op.value ?? op.raw.subarray(1);
  lines.push(`${formatTime(op.timeMs)} ${op.direction}  ${op.name.padEnd(10)} ${handleText}  ${toHex(bytes)}`);
}

const output = lines.join('\n');
if (outFile) {
  writeFileSync(outFile, output, 'utf8');
  // No terminal, só o cabeçalho e o resumo.
  console.log(lines.slice(0, lines.indexOf('') + 1).join('\n'));
  console.log(`Lista completa gravada em ${outFile}`);
} else {
  console.log(output);
}
