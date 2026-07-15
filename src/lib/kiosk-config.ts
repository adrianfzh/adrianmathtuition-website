// Read/write the kiosk master switch (kiosk_config single row) + compute open state.
import { getSupabaseAdmin } from '@/lib/supabase';
import { kioskOpenForMode, type KioskMode } from '@/lib/kiosk-hours';

export async function getKioskMode(): Promise<KioskMode> {
  const supa = getSupabaseAdmin();
  const { data } = await supa.from('kiosk_config').select('mode').eq('id', 'current').single();
  const m = data?.mode;
  return m === 'open' || m === 'scheduled' ? m : 'closed';
}

export async function setKioskMode(mode: KioskMode): Promise<void> {
  const supa = getSupabaseAdmin();
  await supa.from('kiosk_config')
    .upsert({ id: 'current', mode, updated_at: new Date().toISOString() });
}

// Is the kiosk servable to a non-admin right now?
export async function isKioskOpen(): Promise<boolean> {
  return kioskOpenForMode(await getKioskMode());
}
