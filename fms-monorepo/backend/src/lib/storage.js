import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env.js";

const localRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../uploads");
let s3Client;

function safeLocalPath(key) {
  const normalized = key.replaceAll("\\", "/").replace(/^\/+/, "");
  const resolved = path.resolve(localRoot, ...normalized.split("/"));
  if (resolved !== localRoot && !resolved.startsWith(`${localRoot}${path.sep}`)) {
    throw Object.assign(new Error("Invalid receipt storage key"), { statusCode: 400 });
  }
  return resolved;
}

function client() {
  if (!s3Client) {
    s3Client = new S3Client({
      region: env.STORAGE_REGION,
      ...(env.STORAGE_ENDPOINT ? { endpoint: env.STORAGE_ENDPOINT } : {}),
      credentials: { accessKeyId: env.STORAGE_ACCESS_KEY, secretAccessKey: env.STORAGE_SECRET_KEY },
    });
  }
  return s3Client;
}

export async function uploadReceipt({ key, buffer, contentType }) {
  if (env.STORAGE_PROVIDER === "local") {
    const destination = safeLocalPath(key);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, buffer, { flag: "wx" });
    return;
  }
  await client().send(new PutObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key, Body: buffer, ContentType: contentType }));
}

export async function deleteReceipt(key) {
  if (!key) return;
  if (env.STORAGE_PROVIDER === "local") {
    await unlink(safeLocalPath(key)).catch((error) => { if (error.code !== "ENOENT") throw error; });
    return;
  }
  await client().send(new DeleteObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }));
}

export async function readLocalReceipt(key) {
  if (env.STORAGE_PROVIDER !== "local") throw Object.assign(new Error("Local receipt access is disabled"), { statusCode: 404 });
  return readFile(safeLocalPath(key));
}

export async function createCloudSignedReceiptUrl(key) {
  if (env.STORAGE_PROVIDER !== "s3") throw new Error("Cloud signed URLs require S3 storage");
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }), { expiresIn: 15 * 60 });
}

function localSignature(expenseId, key, expires) {
  return createHmac("sha256", env.JWT_SECRET).update(`${expenseId}:${key}:${expires}`).digest("hex");
}

export function createLocalSignedReceiptPath(expenseId, key) {
  const expires = Math.floor(Date.now() / 1000) + 15 * 60;
  const signature = localSignature(expenseId, key, expires);
  return `/api/expenses/${encodeURIComponent(expenseId)}/receipt?expires=${expires}&signature=${signature}`;
}

export function verifyLocalReceiptSignature(expenseId, key, expiresValue, signatureValue) {
  const expires = Number(expiresValue);
  if (!Number.isInteger(expires) || expires < Math.floor(Date.now() / 1000) || typeof signatureValue !== "string") return false;
  const expected = Buffer.from(localSignature(expenseId, key, expires));
  const received = Buffer.from(signatureValue);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
