import { supabase } from '../config/supabase.js';

/**
 * Margin Monitor - Real-time profitability per booking
 * Columns: Booking ID | Supplier Cost | Sell Price | Net Margin ($) | Margin %
 */
export async function getMarginMonitor() {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id,
      booking_ref,
      check_in,
      check_out,
      net_cost,
      sell_price,
      margin_amount,
      margin_percent,
      status,
      villas (name, location)
    `)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}
