#!/usr/bin/env node
import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

export const ITERATIONS = 100000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const MIN_PASSWORD_LENGTH = 14;
const MAX_PASSWORD_BYTES = 1024;

export function createOperatorPasswordHash(password, salt = randomBytes(SALT_BYTES)) {
  if (typeof password !== "string") throw new TypeError("Password must be a string");
  const bytes = Buffer.from(password, "utf8");
  if (bytes.length < MIN_PASSWORD_LENGTH || bytes.length > MAX_PASSWORD_BYTES) {
    throw new RangeError("Password must be at least 14 characters and at most 1024 UTF-8 bytes");
  }
  if (!Buffer.isBuffer(salt) || salt.length !== SALT_BYTES) {
    throw new RangeError("Salt must be exactly 16 bytes");
  }
  const derived = pbkdf2Sync(bytes, salt, ITERATIONS, KEY_BYTES, "sha256");
  return `pbkdf2$${ITERATIONS}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyOperatorPassword(password, encoded) {
  if (typeof password !== "string" || typeof encoded !== "string") return false;
  const match = /^pbkdf2\$100000\$([a-f0-9]{32})\$([a-f0-9]{64})$/i.exec(encoded);
  if (!match) return false;
  const expected = Buffer.from(match[2], "hex");
  const actual = pbkdf2Sync(Buffer.from(password, "utf8"), Buffer.from(match[1], "hex"), ITERATIONS, KEY_BYTES, "sha256");
  return timingSafeEqual(actual, expected);
}

async function readHidden(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Run this command in a local interactive terminal; piped input is refused.");
  }
  process.stdout.write(prompt);
  const chunks = [];
  const stdin = process.stdin;
  stdin.setRawMode(true);
  stdin.resume();
  try {
    for await (const chunk of stdin) {
      for (const byte of chunk) {
        if (byte === 3) throw new Error("Cancelled");
        if (byte === 13 || byte === 10) {
          process.stdout.write("\n");
          return Buffer.concat(chunks).toString("utf8");
        }
        if (byte === 127 || byte === 8) {
          if (chunks.length) chunks.pop();
          continue;
        }
        if (byte >= 32 && byte !== 127) chunks.push(Buffer.from([byte]));
      }
    }
  } finally {
    stdin.setRawMode(false);
    stdin.pause();
  }
  throw new Error("Input ended before completion");
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  try {
    const first = await readHidden("New operator password (hidden; minimum 14 characters): ");
    const second = await readHidden("Confirm new operator password (hidden): ");
    if (first !== second) throw new Error("Passwords do not match.");
    const encoded = createOperatorPasswordHash(first);
    if (!verifyOperatorPassword(first, encoded)) throw new Error("Internal verification failed.");
    process.stdout.write("\nVerified PBKDF2 hash (paste this value into the Cloudflare NF_OPERATOR_PASSWORD_HASH secret):\n");
    process.stdout.write(encoded + "\n");
  } catch (error) {
    process.stderr.write(`\nPassword hash generation failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
