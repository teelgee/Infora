// A minimal real .docx, built in memory — shared by the tests that need one.
//
// Extracted from style-guide.test.ts by T-399, which needed the same fixture to
// upload a file into a check. Two hand-rolled zip writers would be two places a
// fixture could quietly stop being a real file, and the point of building a
// REAL one is that the extractor under test reads a real file and not a stub.
import { Buffer } from 'node:buffer';

/**
 * A minimal real .docx, built in memory: a zip whose only entry is
 * `word/document.xml`. Stored (no compression) so no zlib is needed, which
 * keeps the fixture honest — `docxToText` reads a real file, not a stub.
 */
export function docx(paragraphs: string[]): Buffer {
  const xml = Buffer.from(
    `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${paragraphs
      .map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`)
      .join('')}</w:body></w:document>`,
  );
  const name = Buffer.from('word/document.xml');
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  let crc = 0xffffffff;
  for (const byte of xml) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  crc = (crc ^ 0xffffffff) >>> 0;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 8); // stored
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(xml.length, 18);
  local.writeUInt32LE(xml.length, 22);
  local.writeUInt16LE(name.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(xml.length, 20);
  central.writeUInt32LE(xml.length, 24);
  central.writeUInt16LE(name.length, 28);

  const centralStart = local.length + name.length + xml.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(centralStart, 16);

  return Buffer.concat([local, name, xml, central, name, end]);
}
