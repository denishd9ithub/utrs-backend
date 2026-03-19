/**
 * WhatsApp "Search Engine" Middleware (PRD Module 3)
 * - AI Parser: Extract { location, guests } from message
 * - List Message with 3 top villas within 24h free window
 * - Target: respond within 3 seconds
 */
import OpenAI from 'openai';
import { config } from '../config/index.js';

const APP_URL = config.app?.url || config.defaults?.appUrl || 'http://localhost:5173';

function isWithin24hWindow(lastMessageAt) {
  if (!lastMessageAt) return true;
  const last = new Date(lastMessageAt).getTime();
  const now = Date.now();
  return now - last < 24 * 60 * 60 * 1000;
}

import * as searchService from './searchService.js';
import { supabase } from '../config/supabase.js';
import * as whatsappClient from '../lib/whatsappClient.js';

const openai = config.openai?.apiKey ? new OpenAI({ apiKey: config.openai.apiKey }) : null;
const INTENT_SYSTEM_PROMPT = `You extract villa search intent from user messages. Return ONLY valid JSON: {"location": "string or null", "guests": number or null}.
- location: city/region (e.g. Goa, Bali, Kerala). null if not mentioned.
- guests: number of people. null if not mentioned.
Examples: "Need villa in Goa for 4" -> {"location":"Goa","guests":4}. "Something in Kerala" -> {"location":"Kerala","guests":null}.`;

async function parseIntentWithAI(text) {
  if (!openai || !text?.trim()) return parseIntentFallback(text);

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: INTENT_SYSTEM_PROMPT },
        { role: 'user', content: text.trim() },
      ],
      temperature: 0,
      max_tokens: 64,
    });

    let content = completion?.choices?.[0]?.message?.content?.trim();
    if (!content) return parseIntentFallback(text);
    content = content.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();

    const parsed = JSON.parse(content);
    const location = typeof parsed?.location === 'string' ? parsed.location.trim() || null : null;
    const guests = typeof parsed?.guests === 'number' && parsed.guests > 0 ? parsed.guests : null;
    return { location, guests };
  } catch (err) {
    console.warn('[WhatsApp] OpenAI intent parse failed, using fallback:', err.message);
    return parseIntentFallback(text);
  }
}

function parseIntentFallback(text) {
  const lower = (text || '').toLowerCase();
  const locationMatch =
    lower.match(/(?:in|at|near|for)\s+([a-z\s]+?)(?:\s+for|$|,)/i) ||
    lower.match(/(goa|bali|mumbai|delhi|kerala|uttarakhand)/i);
  const guestsMatch =
    lower.match(/(\d+)\s*(?:people|guests|persons|pax)/i) ||
    lower.match(/for\s+(\d+)/i);
  return {
    location: locationMatch?.[1]?.trim() || locationMatch?.[1] || null,
    guests: guestsMatch ? parseInt(guestsMatch[1], 10) : null,
  };
}                                           

export async function handleIncomingMessage(body) {
  const entry = body?.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;
  const message = value?.messages?.[0];
  if (!message?.from) return;

  const from = message.from;
  const metaMessageId = message?.id;

  if (message?.type === 'interactive') {
    await handleInteractiveResponse(from, metaMessageId, message);
    return;
  }

  if (message?.type !== 'text') {
    await sendTextFallback(from, 'Please send a text message with your search (e.g. "Villas in Goa for 4 people")');
    return;
  }

  const text = message?.text?.body;
  if (!metaMessageId || !text) return;

  const { data: existing } = await supabase
    .from('whatsapp_messages')
    .select('id')
    .eq('meta_message_id', metaMessageId)
    .limit(1)
    .maybeSingle();

  if (existing) return;

  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('last_message_at, search_count')
    .eq('phone_number', from)
    .single();

  const withinWindow = isWithin24hWindow(session?.last_message_at);
  const newSearchCount = (session?.search_count ?? 0) + 1;

  await supabase.from('whatsapp_messages').insert({
    meta_message_id: metaMessageId,
    phone_number: from,
    direction: 'inbound',
    message_type: 'text',
    payload: { text },
    status: 'processed',
  });

  await supabase.from('whatsapp_sessions').upsert(
    {
      phone_number: from,
      last_message_at: new Date().toISOString(),
      search_count: newSearchCount,
    },
    { onConflict: 'phone_number' }
  );

  if (!withinWindow) {
    await sendTextFallback(from, 'Your 24h free window has expired. Send a new message to search again.');
    return;
  }

  const intent = await parseIntentWithAI(text);
  const result = await searchService.search({
    location: intent.location,
    guests: intent.guests,
    limit: 3,
  });

  const villas = result?.data || [];
  const sections = [
    {
      title: 'Top Villas',
      rows: villas.map((v) => ({
        id: v.id || v.slug || `villa-${v.id}`,
        title: (v.name || 'Villa').slice(0, 24),
        description: (v.location || '').slice(0, 72),
      })),
    },
  ];

  if (villas.length > 0) {
    try {
      await whatsappClient.sendListMessage(from, sections, {
        bodyText: `Found ${villas.length} villa(s) for you. Select one to view details & book.`,
        buttonText: 'View Villas',
      });
    } catch (err) {
      console.error('[WhatsApp] Send failed:', err.message);
      await sendTextFallback(
        from,
        `Found ${villas.length} villa(s). Visit our website to view & book.`
      );
    }
  } else {
    await sendTextFallback(
      from,
      "We couldn't find villas matching your search. Try 'Villas in Goa for 4 people' or visit our website."
    );
  }
}

async function handleInteractiveResponse(from, metaMessageId, message) {
  const listReply = message?.interactive?.list_reply;
  const id = listReply?.id;
  if (!id) return;

  const { data: existing } = await supabase
    .from('whatsapp_messages')
    .select('id')
    .eq('meta_message_id', metaMessageId)
    .maybeSingle();
  if (existing) return;

  await supabase.from('whatsapp_messages').insert({
    meta_message_id: metaMessageId,
    phone_number: from,
    direction: 'inbound',
    message_type: 'interactive',
    payload: { listReply: { id } },
    status: 'processed',
  });

  const slugOrId = String(id).startsWith('villa-') ? id.replace('villa-', '') : id;
  const checkoutUrl = `${APP_URL}/villas/${slugOrId}?from=whatsapp`;
  await sendTextFallback(
    from,
    `View & book here: ${checkoutUrl}`
  );
}

async function sendTextFallback(to, text) {
  try {
    await whatsappClient.sendText(to, text);
  } catch (err) {
    console.error('[WhatsApp] Text fallback failed:', err.message);
  }
}
