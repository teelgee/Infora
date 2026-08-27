// The OOXML container. docx, xlsx and pptx are all zips of XML parts, so all
// three readers need exactly this: find one entry by name and inflate it.
//
// **T-306 collected it here, and found the reason to.** It had been copied into
// `upload.ts` (docx) and `xlsx.ts` (the plan import), and the two had already
// drifted: the xlsx copy inflates with a **bounded output length and a
// try/catch**, so a crafted entry cannot balloon kilobytes into gigabytes, and
// the docx copy did not. Both read untrusted uploads. A deck reader would have
// made a third copy and a third chance to be the unhardened one, so there is
// one, and it is the hardened one.
//
// The zip WRITER stays in `xlsx.ts`, beside the only thing that writes one.
import { inflateRawSync } from 'node:zlib';

/** a crafted entry must not balloon kilobytes into gigabytes */
const MAX_INFLATED = 32 * 1024 * 1024;

/** One entry from a zip, inflated. Null when the archive or the entry is absent. */
export function unzipEntry(zip: Buffer, wanted: string): Buffer | null {
  // find end-of-central-directory
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0 && i >= zip.length - 22 - 65536; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) return null;
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString();
    if (name === wanted) {
      const localNameLength = zip.readUInt16LE(localOffset + 26);
      const localExtraLength = zip.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const payload = zip.subarray(dataStart, dataStart + compressedSize);
      if (method !== 8) return Buffer.from(payload);
      try {
        return inflateRawSync(payload, { maxOutputLength: MAX_INFLATED });
      } catch {
        return null;
      }
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}
