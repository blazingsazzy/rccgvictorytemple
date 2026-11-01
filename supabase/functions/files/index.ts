// Supabase Edge Function: deploy with JWT verification disabled, because visitors don't log in.
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (Supabase-provided secrets).
import { createClient } from 'npm:@supabase/supabase-js@2';
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const encoder = new TextEncoder();
const mimeTypes = ['application/pdf','image/jpeg','image/png','image/webp'];
const maxBytes = 10 * 1024 * 1024;
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))).map(v => v.toString(16).padStart(2,'0')).join('');
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32))).map(v => v.toString(16).padStart(2,'0')).join('');
function matchesMagic(bytes: Uint8Array, mime: string) {
  if (mime === 'application/pdf') return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0,5)) === '%PDF-';
  if (mime === 'image/png') return bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v);
  if (mime === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === 'image/webp') return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
  return false;
}
const safeRecord = (row: { id: string; filename: string; mime_type: string; created_at: string; updated_at: string }) => ({ id: row.id, filename: row.filename, mime_type: row.mime_type, created_at: row.created_at, updated_at: row.updated_at });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' },405);
  try {
    const body = await req.json();
    const { action, id, token: editToken } = body;
    if (!['create','replace','view','manage'].includes(action)) return json({ error: 'Invalid action' },400);
    if (action !== 'create' && (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id))) return json({ error: 'Invalid QR code ID' },400);
    let existing: Record<string,string> | null = null;
    if (action !== 'create') {
      const { data, error } = await supabase.from('qr_files').select('*').eq('id',id).maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: 'File not found' },404);
      existing = data;
    }
    if (action === 'replace' || action === 'manage') {
      if (typeof editToken !== 'string' || editToken.length !== 64 || await hash(editToken) !== existing!.edit_token_hash) return json({ error: 'Invalid private management link' },403);
    }
    if (action === 'view') {
      const { data, error } = await supabase.storage.from('qr-files').createSignedUrl(existing!.storage_path, 60 * 15);
      if (error) throw error;
      return json({ record: safeRecord(existing as never), url: data.signedUrl });
    }
    if (action === 'manage') return json({ record: safeRecord(existing as never) });
    const { filename, mimeType, base64 } = body;
    if (typeof filename !== 'string' || !filename.trim() || filename.length > 180 || !mimeTypes.includes(mimeType) || typeof base64 !== 'string' || base64.length > 14_100_000) return json({ error: 'Invalid file. Only PDF, JPG, PNG or WebP up to 10 MB.' },400);
    let bytes: Uint8Array;
    try { const binary = atob(base64); bytes = Uint8Array.from(binary, c => c.charCodeAt(0)); } catch { return json({ error: 'Invalid file encoding' },400); }
    if (!bytes.length || bytes.length > maxBytes || !matchesMagic(bytes,mimeType)) return json({ error: 'File is too large or does not match its declared type' },400);
    const fileId = action === 'create' ? crypto.randomUUID() : id;
    const extension = { 'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp' }[mimeType as 'application/pdf'];
    const storagePath = `${fileId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from('qr-files').upload(storagePath, bytes, { contentType: mimeType, upsert: false, cacheControl:'60' });
    if (uploadError) throw uploadError;
    const cleanName = filename.replace(/[\x00-\x1f]/g,'').slice(0,180);
    if (action === 'create') {
      const secret = token();
      const { data, error } = await supabase.from('qr_files').insert({ id:fileId, edit_token_hash: await hash(secret), storage_path:storagePath, filename:cleanName, mime_type:mimeType }).select().single();
      if (error) { await supabase.storage.from('qr-files').remove([storagePath]); throw error; }
      return json({ id:fileId, token:secret, record:safeRecord(data) });
    }
    const { data, error } = await supabase.from('qr_files').update({ storage_path:storagePath, filename:cleanName, mime_type:mimeType, updated_at:new Date().toISOString() }).eq('id',id).eq('storage_path',existing!.storage_path).select().maybeSingle();
    if (error || !data) { await supabase.storage.from('qr-files').remove([storagePath]); return json({ error:'Could not update file. Please retry.' },409); }
    await supabase.storage.from('qr-files').remove([existing!.storage_path]);
    return json({ id, record:safeRecord(data) });
  } catch (error) { console.error(error); return json({ error: 'Unable to complete request. Please try again.' },500); }
});
