import "dotenv/config";
import { randomUUID } from "node:crypto";
import { validateReceiptFile } from "../src/lib/receiptSafety.js";
import { createLocalSignedReceiptPath, deleteReceipt, readLocalReceipt, uploadReceipt, verifyLocalReceiptSignature } from "../src/lib/storage.js";

if ((process.env.STORAGE_PROVIDER ?? "local") !== "local") {
  console.error("Storage smoke test requires STORAGE_PROVIDER=local.");
  process.exit(1);
}

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const key = `phase7-tests/${randomUUID()}.png`;

async function main() {
  const verified = await validateReceiptFile({ buffer: png, originalName: "receipt.png", declaredMimeType: "image/png" });
  if (verified.contentType !== "image/png") throw new Error("PNG content detection failed");

  let mismatchRejected = false;
  try { await validateReceiptFile({ buffer: png, originalName: "receipt.pdf", declaredMimeType: "application/pdf" }); }
  catch { mismatchRejected = true; }
  if (!mismatchRejected) throw new Error("Mismatched extension/MIME was accepted");

  await uploadReceipt({ key, buffer: png, contentType: "image/png" });
  const stored = await readLocalReceipt(key);
  if (!stored.equals(png)) throw new Error("Stored receipt bytes differ");

  const signedPath = createLocalSignedReceiptPath("expense-test", key);
  const query = new URL(`http://localhost${signedPath}`).searchParams;
  const expires = query.get("expires");
  const signature = query.get("signature");
  if (!verifyLocalReceiptSignature("expense-test", key, expires, signature)) throw new Error("Valid local signature was rejected");
  if (verifyLocalReceiptSignature("expense-test", key, expires, `${signature}0`)) throw new Error("Tampered local signature was accepted");
  if (verifyLocalReceiptSignature("expense-test", key, "1", signature)) throw new Error("Expired local signature was accepted");

  let traversalRejected = false;
  try { await uploadReceipt({ key: "../escape.png", buffer: png, contentType: "image/png" }); }
  catch { traversalRejected = true; }
  if (!traversalRejected) throw new Error("Local storage accepted path traversal");

  console.log("Storage smoke test passed.");
}

main()
  .finally(() => deleteReceipt(key).catch(() => {}))
  .catch((error) => { console.error(error); process.exitCode = 1; });
