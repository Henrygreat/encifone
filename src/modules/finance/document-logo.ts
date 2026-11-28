import jpeg from "jpeg-js";
import { PNG } from "pngjs";

const maxPixels = 4_000_000;
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function validatePngHeader(bytes: Buffer) {
  if (bytes.length < 33 || bytes.readUInt32BE(8) !== 13 || bytes.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error("Invalid PNG header.");
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!width || !height || width * height > maxPixels) throw new Error("Dimensions exceed the logo limit.");
  for (let offset = 33; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (type === "IHDR" || offset + 12 + length > bytes.length) throw new Error("Invalid PNG chunk.");
    offset += 12 + length;
  }
}

export async function encodeDocumentLogo(file: File) {
  if (file.size > 512 * 1024) throw new Error("Logo exceeds the upload limit.");
  const bytes = Buffer.from(await file.arrayBuffer());
  let encoded: Buffer;
  if (bytes.subarray(0, 8).equals(pngSignature)) {
    validatePngHeader(bytes);
    encoded = PNG.sync.write(PNG.sync.read(bytes));
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    const pixels = jpeg.decode(bytes, { maxResolutionInMP: 4, maxMemoryUsageInMB: 64, tolerantDecoding: false });
    encoded = Buffer.from(jpeg.encode(pixels, 88).data);
  } else {
    throw new Error("Only PNG and JPEG logos are supported.");
  }
  const stored = encoded.toString("base64");
  if (stored.length > 750_000) throw new Error("Logo exceeds the storage limit.");
  return stored;
}
