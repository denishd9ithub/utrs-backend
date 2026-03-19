/**
 * WhatsApp Cloud API - X-Hub-Signature-256 validation
 */

import crypto from 'crypto';
import { config } from '../config/index.js';

const APP_SECRET = config.whatsapp?.appSecret;

export function validateWebhookSignature(rawBody, signature) {
  if (!APP_SECRET) {
    console.warn('[WhatsApp] APP_SECRET not set - skipping signature validation');
    return true;
  }
  if (!signature || typeof rawBody !== 'string' && !Buffer.isBuffer(rawBody)) return false;

  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString();
  const expected = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(body).digest('hex');
  const sig = String(signature);
  if (sig.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}
