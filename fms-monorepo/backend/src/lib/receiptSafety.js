import path from "node:path";
import { fileTypeFromBuffer } from "file-type";

const formats = Object.freeze({
  "image/jpeg": new Set([".jpg", ".jpeg"]),
  "image/png": new Set([".png"]),
  "image/webp": new Set([".webp"]),
  "application/pdf": new Set([".pdf"]),
});

export const allowedReceiptMimeTypes = new Set(Object.keys(formats));
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

export function safeOriginalName(originalName) {
  const base = path.basename(originalName || "receipt").normalize("NFKC");
  const sanitized = base.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (sanitized || "receipt").slice(-120);
}

export async function validateReceiptFile({ buffer, originalName, declaredMimeType }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw Object.assign(new Error("Receipt file is empty"), { statusCode: 400 });
  if (buffer.length > MAX_RECEIPT_BYTES) throw Object.assign(new Error("Receipt exceeds the 5 MB limit"), { statusCode: 400 });

  const detected = await fileTypeFromBuffer(buffer);
  const extension = path.extname(originalName || "").toLowerCase();
  if (!detected || !formats[detected.mime]) {
    throw Object.assign(new Error("Receipt content must be a valid JPG, PNG, WebP, or PDF"), { statusCode: 400 });
  }
  if (!formats[detected.mime].has(extension)) {
    throw Object.assign(new Error("Receipt file extension does not match its content"), { statusCode: 400 });
  }
  if (declaredMimeType && declaredMimeType !== detected.mime) {
    throw Object.assign(new Error("Receipt MIME type does not match its content"), { statusCode: 400 });
  }

  return { contentType: detected.mime, extension, size: buffer.length, safeName: safeOriginalName(originalName) };
}

// Future integration point for ClamAV or a managed malware-scanning service.
export async function scanReceiptForMalware(_file) {
  return { clean: true, scanner: "not-configured" };
}
