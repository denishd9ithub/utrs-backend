/**
 * ETL Sync Service
 * - De-duplication: Match by Lat/Long + Fuzzy Name
 * - Winning Source: Lowest Net Rate
 */
import { supabase } from '../config/supabase.js';
import { HyperGuestConnector } from '../connectors/hyperguestConnector.js';
import { RoibosConnector } from '../connectors/roibosConnector.js';
import * as villaService from './villaService.js';
import * as pricingService from './pricingService.js';
import * as partnerService from './partnerService.js';

const COORD_TOLERANCE = 0.01; // ~1km
const NAME_SIMILARITY_THRESHOLD = 0.7;

function slugify(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function fuzzyMatchName(a, b) {
  const na = (a || '').toLowerCase();
  const nb = (b || '').toLowerCase();
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const wordsA = new Set(na.split(/\s+/));
  const wordsB = new Set(nb.split(/\s+/));
  const intersect = [...wordsA].filter((w) => wordsB.has(w)).length;
  return (intersect * 2) / (wordsA.size + wordsB.size);
}

function coordsMatch(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return false;
  return (
    Math.abs(lat1 - lat2) < COORD_TOLERANCE &&
    Math.abs(lon1 - lon2) < COORD_TOLERANCE
  );
}

async function findOrCreateMasterVilla(normalized, partnerId, netRate) {
  const { latitude, longitude, name, nameNormalized } = normalized;

  const { data: existing } = await supabase
    .from('villas')
    .select('id, name, villa_sources(net_rate, partner_id)')
    .eq('is_active', true);

  for (const v of existing || []) {
    const vLat = v?.latitude ?? v?.lat;
    const vLon = v?.longitude ?? v?.lng;
    if (coordsMatch(latitude, longitude, vLat, vLon)) {
      const sim = fuzzyMatchName(nameNormalized, v.name_normalized);
      if (sim >= NAME_SIMILARITY_THRESHOLD) {
        return { villaId: v.id, isNew: false };
      }
    }
  }

  const villa = await villaService.createVilla({
    name: normalized.name,
    name_normalized: nameNormalized,
    latitude: normalized.latitude,
    longitude: normalized.longitude,
    location: normalized.location,
    region: normalized.region,
    country: normalized.country,
    max_guests: normalized.maxGuests || 1,
    bedrooms: normalized.bedrooms,
    bathrooms: normalized.bathrooms,
    amenities: normalized.amenities,
    images: normalized.images,
    description: normalized.description,
    slug: slugify(normalized.name) + '-' + Date.now().toString(36),
  });

  return { villaId: villa.id, isNew: true };
}

async function upsertVillaSource(villaId, partnerId, externalId, netRate, rawData) {
  const { data: existing } = await supabase
    .from('villa_sources')
    .select('id')
    .eq('villa_id', villaId)
    .eq('partner_id', partnerId)
    .single();

  const payload = {
    villa_id: villaId,
    partner_id: partnerId,
    external_id: externalId,
    net_rate: netRate,
    raw_data: rawData,
    is_winning_source: false,
  };

  if (existing) {
    await supabase.from('villa_sources').update(payload).eq('id', existing.id);
  } else {
    await supabase.from('villa_sources').insert(payload);
  }

  await updateWinningSource(villaId);
}

async function updateWinningSource(villaId) {
  const { data: sources } = await supabase
    .from('villa_sources')
    .select('id, net_rate')
    .eq('villa_id', villaId);

  if (!sources?.length) return;

  const best = sources.reduce((a, b) =>
    (a?.net_rate ?? Infinity) < (b?.net_rate ?? Infinity) ? a : b
  );

  await supabase
    .from('villa_sources')
    .update({ is_winning_source: false })
    .eq('villa_id', villaId);
  await supabase
    .from('villa_sources')
    .update({ is_winning_source: true })
    .eq('id', best.id);
}

export async function syncPartner(partnerCode, options = {}) {
  const partner = await partnerService.getPartnerByCode(partnerCode);
  if (!partner) throw new Error(`Partner not found: ${partnerCode}`);

  const connector =
    partnerCode === 'hyperguest'
      ? new HyperGuestConnector()
      : partnerCode === 'roibos'
        ? new RoibosConnector()
        : null;

  if (!connector) throw new Error(`No connector for ${partnerCode}`);

  const { data: logRow } = await supabase
    .from('sync_logs')
    .insert({
      partner_id: partner.id,
      sync_type: 'full',
      status: 'started',
    })
    .select('id')
    .single();
  const logId = logRow?.id;

  let created = 0,
    updated = 0,
    skipped = 0,
    errMsg = null;

  try {
    const inventory = await connector.fetchInventory(options);
    for (const item of inventory) {
      const netRate = item.rawData?.netRate ?? item.rawData?.price ?? 0;
      const { villaId, isNew } = await findOrCreateMasterVilla(
        item,
        partner.id,
        netRate
      );
      if (isNew) created++;
      else updated++;

      await upsertVillaSource(
        villaId,
        partner.id,
        item.externalId,
        netRate,
        item.rawData
      );

      if (item.rawData?.pricing) {
        const rows = Object.entries(item.rawData.pricing).map(([date, rate]) => ({
          date,
          netRate: rate,
        }));
        await pricingService.upsertPricing(villaId, partner.id, rows);
      }
    }

    await supabase
      .from('sync_logs')
      .update({
        status: 'success',
        records_processed: inventory.length,
        records_created: created,
        records_updated: updated,
        records_skipped: skipped,
        completed_at: new Date().toISOString(),
      })
      .eq('id', logId);
  } catch (e) {
    errMsg = e.message;
    await supabase
      .from('sync_logs')
      .update({
        status: 'failed',
        error_message: errMsg,
        completed_at: new Date().toISOString(),
      })
      .eq('id', logId);
    throw e;
  }

  return { created, updated, skipped };
}
