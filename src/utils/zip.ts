type ZipEntryData = string | Uint8Array | ArrayBuffer;

export interface ZipEntry {
  name: string;
  data: ZipEntryData;
  modifiedAt?: Date;
}

const textEncoder = new TextEncoder();

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

const normalizeZipData = (data: ZipEntryData): Uint8Array => {
  if (typeof data === 'string') return textEncoder.encode(data);
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(data);
};

const toArrayBufferPart = (bytes: Uint8Array): ArrayBuffer => {
  const start = bytes.byteOffset;
  const end = start + bytes.byteLength;
  return bytes.buffer.slice(start, end) as ArrayBuffer;
};

const toDosDateTime = (date: Date): { dosDate: number; dosTime: number } => {
  const year = Math.min(2107, Math.max(1980, date.getFullYear()));
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const minute = date.getMinutes();
  const second = Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  const dosTime = (hour << 11) | (minute << 5) | second;
  return { dosDate, dosTime };
};

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    const index = (crc ^ bytes[i]) & 0xff;
    crc = (crc >>> 8) ^ CRC32_TABLE[index];
  }
  return (crc ^ 0xffffffff) >>> 0;
};

export const createZipBlob = (entries: ZipEntry[]): Blob => {
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let localOffset = 0;
  const now = new Date();

  entries.forEach((entry) => {
    const normalizedName = entry.name.replace(/\\/g, '/');
    const fileNameBytes = textEncoder.encode(normalizedName);
    const fileBytes = normalizeZipData(entry.data);
    const checksum = crc32(fileBytes);
    const { dosDate, dosTime } = toDosDateTime(entry.modifiedAt ?? now);

    const localHeader = new Uint8Array(30 + fileNameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, dosTime, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, fileBytes.length, true);
    localView.setUint32(22, fileBytes.length, true);
    localView.setUint16(26, fileNameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(fileNameBytes, 30);
    localChunks.push(localHeader, fileBytes);

    const centralHeader = new Uint8Array(46 + fileNameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, dosTime, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, fileBytes.length, true);
    centralView.setUint32(24, fileBytes.length, true);
    centralView.setUint16(28, fileNameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, localOffset, true);
    centralHeader.set(fileNameBytes, 46);
    centralChunks.push(centralHeader);

    localOffset += localHeader.length + fileBytes.length;
  });

  const centralOffset = localOffset;
  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const entryCount = Math.min(entries.length, 0xffff);

  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entryCount, true);
  endView.setUint16(10, entryCount, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);
  endView.setUint16(20, 0, true);

  const parts: BlobPart[] = [
    ...localChunks.map(toArrayBufferPart),
    ...centralChunks.map(toArrayBufferPart),
    toArrayBufferPart(endRecord)
  ];
  return new Blob(parts, { type: 'application/zip' });
};
