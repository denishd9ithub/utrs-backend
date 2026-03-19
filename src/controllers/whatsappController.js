import * as whatsappService from '../services/whatsappService.js';
import { config } from '../config/index.js';

/**
 * GET webhook verification (Meta requirement)
 */
export function verify(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsapp?.verifyToken) {
    res.status(200).send(challenge);
  } else {
    res.status(403).send('Forbidden');
  }
}                                                                                                                                                                                      

/**
 * POST webhook - called from index.js with raw body (signature validated there)
 * Processes async after 200 ack. Target: <3s response time.
 */
export async function handleWhatsAppWebhook(rawBody) {
  let body;
  try {
    body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
  } catch {
    console.warn('[WhatsApp] Invalid JSON body');
    return;
  }
  await whatsappService.handleIncomingMessage(body);
} 







                      
