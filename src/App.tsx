import { useEffect, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { ArrowRight, Check, CheckCircle2, CloudUpload, Copy, Download, FileImage, FileText, FileUp, Link2, LoaderCircle, LockKeyhole, QrCode, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';


const endpoint = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const supabase = endpoint && anon ? createClient(endpoint, anon) : null;
type RecordInfo = { id: string; filename: string; mime_type: string; created_at?: string; updated_at?: string };
const LIMIT = 10 * 1024 * 1024;
const ACCEPT = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
function readRoute() { const parts = window.location.pathname.split('/').filter(Boolean); return { type: parts[0] || 'home', id: parts[1] || '' }; }
function makeUrl(id: string) { return `${window.location.origin}/f/${id}`; }
async function call(action: string, body: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase is not configured. See README.md for setup.');
  const { data, error } = await supabase.functions.invoke('files', { body: { action, ...body } });
  if (error) {
    const context = (error as { context?: Response }).context;
    if (context?.json) { const result = await context.json().catch(() => null); if (result?.error) throw new Error(result.error); }
    throw new Error(error.message || 'Request failed');
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
async function upload(file: File, id?: string, token?: string): Promise<{ id: string; token?: string; record: RecordInfo }> {
  if (!ACCEPT.includes(file.type)) throw new Error('Please select a PDF, PNG, JPG or WebP image.');
  if (file.size > LIMIT) throw new Error('File must be 10 MB or smaller.');
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return call(id ? 'replace' : 'create', { id, token, filename: file.name, mimeType: file.type, base64: btoa(binary) });
}
function App() {
  const route = readRoute();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [result, setResult] = useState<{ id: string; token: string; record: RecordInfo } | null>(null);
  const [record, setRecord] = useState<RecordInfo | null>(null);
  const [viewUrl, setViewUrl] = useState('');
  const [loading, setLoading] = useState(route.type !== 'home');
  const [copied, setCopied] = useState('');
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const qr = useRef<HTMLDivElement>(null);
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') || '';
  const manage = route.type === 'manage';
  const viewer = route.type === 'f';
  const currentId = manage || viewer ? route.id : result?.id || '';
  const publicLink = currentId ? makeUrl(currentId) : '';
  const editLink = result ? `${window.location.origin}/manage/${result.id}?token=${encodeURIComponent(result.token)}` : '';

  useEffect(() => {
    if (!manage && !viewer) return;
    if (!route.id) { setError('This link is incomplete.'); setLoading(false); return; }
    call(manage ? 'manage' : 'view', { id: route.id, ...(manage ? { token } : {}) })
      .then(data => { setRecord(data.record); if (data.url) setViewUrl(data.url); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function choose(f?: File) { if (!f) return; setError(''); setSuccess(''); if (!ACCEPT.includes(f.type)) { setError('Supported files: PDF, JPG, PNG and WebP.'); return; } if (f.size > LIMIT) { setError('Maximum file size is 10 MB.'); return; } setFile(f); }
  async function submit() { if (!file) return; setBusy(true); setError(''); setSuccess(''); try { const data = await upload(file, manage ? route.id : undefined, manage ? token : undefined); if (manage) { setRecord(data.record); setSuccess('File replaced successfully. Your QR code has not changed.'); } else { if (!data.token) throw new Error('The management token was not returned.'); setResult({ ...data, token: data.token }); } setFile(null); if (input.current) input.current.value = ''; } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed.'); } finally { setBusy(false); } }
  async function copy(value: string, kind: string) { try { await navigator.clipboard.writeText(value); setCopied(kind); window.setTimeout(() => setCopied(''), 2000); } catch { setError('Copy failed. Please select and copy the link manually.'); } }
  function downloadQr() { const canvas = qr.current?.querySelector('canvas'); if (!canvas) return; const a = document.createElement('a'); a.download = `rccg-victory-temple-${currentId}.png`; a.href = canvas.toDataURL('image/png'); a.click(); }
  const dropzone = <div className={`dropzone ${drag ? 'dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); choose(e.dataTransfer.files[0]); }}>
    <input ref={input} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" hidden onChange={e => choose(e.target.files?.[0])}/>
    <div className="upload-icon"><CloudUpload size={30}/></div>
    <h3>{file ? file.name : 'Drag and drop your file here'}</h3>
    <p>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · Ready to upload` : 'PDF, JPG, PNG or WebP · Up to 10 MB'}</p>
    <button type="button" className="button secondary" onClick={() => input.current?.click()}><FileUp size={17}/>{file ? 'Change file' : 'Browse files'}</button>
  </div>;
  const qrPanel = currentId ? <section className="card result-card"><div className="result-top"><span className="success-icon"><Check size={18}/></span><div><h2>{manage ? 'Your permanent QR code' : 'Your QR code is ready!'}</h2><p>It always points to the latest file.</p></div></div><div className="qr-frame" ref={qr}><QRCodeCanvas value={publicLink} size={204} marginSize={2} level="H" fgColor="#153c31" bgColor="#ffffff"/></div><div className="link-field"><span title={publicLink}>{publicLink}</span><button aria-label="Copy QR link" onClick={() => copy(publicLink, 'public')}>{copied === 'public' ? <Check size={18}/> : <Copy size={18}/>}</button></div><button className="button primary full" onClick={downloadQr}><Download size={18}/>Download QR code</button>{!manage && editLink && <div className="manage-panel"><div className="manage-label"><LockKeyhole size={16}/> Private management link</div><p>Save this link now. It lets you replace the file later without changing your QR code. Anyone with this link can edit the file.</p><div className="link-field"><span title={editLink}>{editLink}</span><button aria-label="Copy private management link" onClick={() => copy(editLink, 'manage')}>{copied === 'manage' ? <Check size={18}/> : <Copy size={18}/>}</button></div><a className="text-link" href={editLink}>Open management page <ArrowRight size={15}/></a></div>}</section> : null;
  return <div className="app"><header className="site-header"><div className="container header-inner"><a href="/" className="brand"><span className="brand-icon"><QrCode size={23}/></span><span>RCCG <strong>Victory Temple</strong></span></a><span className="header-pill"><ShieldCheck size={14}/> No account required</span></div></header><main className="container">
    {!manage && !viewer && <><div className="hero"><div className="eyebrow"><span className="dot"/> Simple, secure file sharing</div><h1>One QR code.<br/><em>Unlimited updates.</em></h1><p>Upload a PDF or image, generate a permanent QR code, and replace the file whenever you need — without changing the code.</p></div><div className="workspace"><section className="card upload-card"><div className="section-heading"><div className="number">01</div><div><h2>Upload your file</h2><p>Choose the document or image you want to share.</p></div></div>{!result ? <>{dropzone}<button className="button primary full" disabled={!file || busy} onClick={submit}>{busy ? <LoaderCircle className="spin" size={18}/> : <QrCode size={18}/>} {busy ? 'Uploading securely...' : 'Generate QR code'}{!busy && <ArrowRight size={17}/>}</button></> : <div className="done-box"><CheckCircle2 size={27}/><h3>File uploaded!</h3><p>{result.record.filename}</p><button className="button secondary" onClick={() => { setResult(null); setFile(null); setError(''); }}>Create another QR code</button></div>}</section>{result ? qrPanel : <section className="card empty-result"><div className="empty-qr"><QrCode size={88} strokeWidth={1}/></div><h2>Your QR code appears here</h2><p>Once your file is uploaded, you'll get a QR code and a private link to update it anytime.</p><div className="mini-benefits"><span><Check size={15}/> Permanent link</span><span><Check size={15}/> Replace files</span></div></section>}</div></>}
    {manage && <><div className="hero compact"><div className="eyebrow"><RefreshCw size={15}/> File management</div><h1>Update your <em>QR file.</em></h1><p>Replace the current PDF or image. Your existing QR code and public link will stay exactly the same.</p></div>{loading ? <div className="status"><LoaderCircle className="spin"/> Loading file...</div> : record && <div className="workspace"><section className="card upload-card"><div className="section-heading"><div className="number"><RefreshCw size={18}/></div><div><h2>Replace your file</h2><p>Current file: <strong>{record.filename}</strong></p></div></div>{dropzone}<button className="button primary full" disabled={!file || busy} onClick={submit}>{busy ? <LoaderCircle className="spin" size={18}/> : <RefreshCw size={18}/>} {busy ? 'Replacing file...' : 'Replace file'}</button><div className="hint"><ShieldCheck size={16}/> Only someone with your private management link can make changes.</div></section>{qrPanel}</div>}</>}
    {viewer && <><div className="hero compact"><div className="eyebrow"><Link2 size={15}/> Shared file</div><h1>Shared with <em>you.</em></h1><p>View the latest version of this file from RCCG Victory Temple.</p></div>{loading ? <div className="status"><LoaderCircle className="spin"/> Loading your file...</div> : record && <section className="card viewer-card"><div className="file-badge">{record.mime_type === 'application/pdf' ? <FileText size={30}/> : <FileImage size={30}/>}</div><h2>{record.filename}</h2><p>This link always opens the latest version of the shared file.</p>{viewUrl && <><a className="button primary" href={viewUrl} target="_blank" rel="noopener noreferrer">Open file <ArrowRight size={18}/></a><a className="button secondary" href={viewUrl} target="_blank" rel="noopener noreferrer"><Download size={18}/> View or save</a>{record.mime_type.startsWith('image/') && <img className="preview" src={viewUrl} alt={record.filename}/>}</>}</section>}</>}
    {error && <div className="toast error" role="alert"><X size={17}/>{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={15}/></button></div>}{success && <div className="toast good" role="status"><CheckCircle2 size={18}/>{success}<button onClick={() => setSuccess('')} aria-label="Dismiss"><X size={15}/></button></div>}
    {!manage && !viewer && <div className="features"><div><span className="feature-icon"><QrCode size={21}/></span><h3>Generate once</h3><p>One permanent QR code for your document or image.</p></div><div><span className="feature-icon"><RefreshCw size={21}/></span><h3>Update anytime</h3><p>Replace the file using your private management link.</p></div><div><span className="feature-icon"><ShieldCheck size={21}/></span><h3>Share confidently</h3><p>Anyone can scan. Only your private link can update.</p></div></div>}
  </main><footer className="footer"><div className="container footer-inner"><span>© {new Date().getFullYear()} RCCG Victory Temple</span><span>Made for simple, seamless sharing</span></div></footer></div>;
}
export default App;
