/**
 * WhatsApp Cloud API (Meta Direct) - Send Message client
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */
import axios from 'axios';
import { config } from '../config/index.js';

const cfg = config.whatsapp;
const BASE = `${cfg?.apiUrl}/${cfg?.apiVersion || 'v18.0'}`;

function getPhoneNumberId() {
  const id = cfg?.phoneNumberId;
  if (!id) throw new Error('WHATSAPP_PHONE_NUMBER_ID not configured');
  return id;
}

function getAccessToken() {
  const token = cfg?.apiKey;
  if (!token) throw new Error('WHATSAPP_API_KEY not configured');
  return token;
}

/**
 * Send text message
 */
export async function sendText(to, text, options = {}) {
  const phoneNumberId = getPhoneNumberId();
  const url = `${BASE}/${phoneNumberId}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: String(to).replace(/\D/g, ''),
    type: 'text',
    text: { body: text, preview_url: options.previewUrl ?? false },
  };
  const { data, status } = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
      'Content-Type': 'application/json',
    },
    timeout: 10000,
  });
  return { data, status };
}

/**
 * Send interactive list message (top 3 villas)
 */
export async function sendListMessage(to, sections, options = {}) {
  const phoneNumberId = getPhoneNumberId();
  const url = `${BASE}/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: String(to).replace(/\D/g, ''),
    type: 'interactive',
    interactive: {
      type: 'list',
      body: {
        text: options.bodyText || 'Here are top villas for you. Select one to view details & book.',
      },
      action: {
        button: options.buttonText || 'View Villas',
        sections: sections.map((sec) => ({
          title: sec.title || 'Villas',
          rows: (sec.rows || []).slice(0, 10).map((r) => ({
            id: r.id,
            title: (r.title || '').slice(0, 24),
            description: (r.description || '').slice(0, 72),
          })),
        })),
      },
    },
  };

  const { data, status } = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
      'Content-Type': 'application/json',
    },
    timeout: 10000,
  });
  return { data, status };
}
