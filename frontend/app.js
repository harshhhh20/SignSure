const API = 'http://127.0.0.1:5002/api';
const TIMEOUT_MS = 20000;

async function timedFetch(url, opts = {}) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Request timed out — is the server running?');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function btnLoad(btn, text = 'Working…') {
  if (!btn) return;
  btn._orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="btn-spinner"></span>${text}`;
}

function btnReset(btn) {
  if (!btn) return;
  btn.disabled = false;
  if (btn._orig) btn.innerHTML = btn._orig;
}

const qs    = (s)  => document.querySelector(s);
const showEl = (el) => { if (el) el.hidden = false; };
const hideEl = (el) => { if (el) el.hidden = true; };

function shortName(name, max = 36) {
  if (name.length <= max) return name;
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  return name.slice(0, max - ext.length - 1) + '…' + ext;
}

function formatSize(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 ** 2).toFixed(2)} MB`;
}

function metaGrid(items) {
  return items.map(({ label, value }) =>
    `<div class="meta-item"><div class="meta-label">${label}</div><div class="meta-value">${value}</div></div>`
  ).join('');
}

function toast(msg, type = 'info') {
  const existing = document.getElementById('ss-toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.id = 'ss-toast';
  const isErr = type === 'error';
  t.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:999;
    padding:12px 22px;border-radius:10px;font-family:'Inter',sans-serif;
    font-size:0.875rem;font-weight:500;box-shadow:0 8px 32px rgba(0,0,0,.4);
    max-width:480px;text-align:center;backdrop-filter:blur(12px);
    animation:toastIn .2s ease;
    ${isErr
      ? 'background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.35);color:#fca5a5;'
      : 'background:rgba(16,185,129,.15);border:1px solid rgba(16,185,129,.35);color:#6ee7b7;'}
  `;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 3500);
  setTimeout(() => t.remove(), 3900);
}

function setupZone(zoneId, inputId, onFile) {
  const zone  = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  if (!zone || !input) return;
  zone.addEventListener('click',   (e) => { if (e.target !== input) input.click(); });
  zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  const browse = zone.querySelector('.link-btn');
  if (browse) browse.addEventListener('click', (e) => { e.stopPropagation(); input.click(); });
  zone.addEventListener('dragover',  (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', ()  => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault(); zone.classList.remove('drag-over');
    const f = e.dataTransfer?.files?.[0]; if (f) pick(f);
  });
  input.addEventListener('change', () => { if (input.files?.[0]) pick(input.files[0]); });
  function pick(file) { zone.classList.add('has-file'); onFile(file); }
}

async function loadStatus() {
  try {
    const res  = await timedFetch(`${API}/status`);
    const data = await res.json();
    const badge = document.getElementById('badge-openssl');
    if (badge) badge.textContent = `OpenSSL ${data.openssl_version_short || '3.x'}`;
  } catch {
    const badge = document.getElementById('badge-openssl');
    if (badge) { badge.textContent = 'Backend Offline'; badge.style.color = '#f87171'; }
  }
}

async function loadKeyInfo() {
  try {
    const res  = await timedFetch(`${API}/keys/info`);
    if (!res.ok) return;
    const d = await res.json();
    populateKeyInfo(d);
  } catch {}
}

function populateKeyInfo(d) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };
  const setStatus = (id, val) => {
    const el = document.getElementById(id);
    if (!el) return;
    const isLoaded = val === 'Loaded' || val === 'Generated';
    el.textContent = val;
    el.className = 'kip-val kip-status ' + (isLoaded ? 'loaded' : 'missing');
  };
  set('ki-algorithm', d.algorithm);
  set('ki-keysize',   d.key_size);
  set('ki-exponent',  d.exponent);
  set('ki-format',    d.format);
  setStatus('ki-priv', d.private_key);
  setStatus('ki-pub',  d.public_key);
}

let signFile    = null;
let signSession = null;

setupZone('sign-drop-zone', 'sign-file-input', (file) => {
  signFile = file;
  qs('#sign-file-chip').textContent = shortName(file.name) + `  (${formatSize(file.size)})`;
  qs('#sign-selected-file').hidden = false;
  qs('#sign-btn').disabled = false;
  hideEl(qs('#sign-result'));
});

qs('#sign-btn').addEventListener('click', async () => {
  if (!signFile) return;
  const btn = qs('#sign-btn');
  btnLoad(btn, 'Signing…');
  hideEl(qs('#sign-result'));

  try {
    const form = new FormData();
    form.append('document', signFile);
    const res  = await timedFetch(`${API}/sign`, { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);

    signSession = data.session_id;

    qs('#sign-meta-grid').innerHTML = metaGrid([
      { label: 'Document',            value: data.filename },
      { label: 'Size',                value: data.document_size },
      { label: 'Hash Algorithm',      value: data.hash_algorithm },
      { label: 'Signature Algorithm', value: data.signature_algorithm },
      { label: 'SHA-256 (first 20)',  value: data.document_sha256.slice(0, 20) + '…' },
      { label: 'Signature Size',      value: data.signature_size },
    ]);

    const hashEl = document.getElementById('sign-hash-full');
    if (hashEl) hashEl.textContent = data.document_sha256;

    showEl(qs('#sign-result'));
    qs('#sign-result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    loadKeyInfo();

  } catch (err) {
    toast(`Signing failed: ${err.message}`, 'error');
  } finally {
    btnReset(btn);
  }
});

qs('#download-sig-btn').addEventListener('click', () => {
  if (signSession) window.location.href = `${API}/sign/download/${signSession}`;
});

qs('#download-pub-btn').addEventListener('click', () => {
  window.location.href = `${API}/pubkey/download`;
});

qs('#regen-key-btn').addEventListener('click', async () => {
  if (!confirm('Regenerate RSA key pair? Old signatures will no longer verify with the new key.')) return;
  const btn = qs('#regen-key-btn');
  btnLoad(btn, 'Generating…');
  try {
    const res  = await timedFetch(`${API}/keys/generate`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    populateKeyInfo(data);
    toast('New RSA-2048 key pair generated.', 'success');
  } catch (err) {
    toast(`Key generation failed: ${err.message}`, 'error');
  } finally {
    btnReset(btn);
  }
});

let verDoc = null, verSig = null, verPub = null;
const syncVerBtn = () => { qs('#verify-btn').disabled = !(verDoc && verSig); };

setupZone('ver-doc-zone', 'ver-doc-input', (f) => { verDoc = f; qs('#ver-doc-label').textContent = shortName(f.name); hideEl(qs('#verify-result')); syncVerBtn(); });
setupZone('ver-sig-zone', 'ver-sig-input', (f) => { verSig = f; qs('#ver-sig-label').textContent = shortName(f.name); hideEl(qs('#verify-result')); syncVerBtn(); });
setupZone('ver-pub-zone', 'ver-pub-input', (f) => { verPub = f; qs('#ver-pub-label').textContent = shortName(f.name); });

qs('#verify-btn').addEventListener('click', async () => {
  if (!verDoc || !verSig) return;
  const btn = qs('#verify-btn');
  btnLoad(btn, 'Verifying…');

  try {
    const form = new FormData();
    form.append('document', verDoc);
    form.append('signature', verSig);
    if (verPub) form.append('public_key', verPub);

    const res  = await timedFetch(`${API}/verify`, { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);

    renderVerifyResult(data);
    qs('#verify-result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    toast(`Verification error: ${err.message}`, 'error');
  } finally {
    btnReset(btn);
  }
});

function renderVerifyResult(data) {
  const result = qs('#verify-result');
  const ok     = data.verified;

  result.className = ok ? 'result-card success-card' : 'result-card failure-card';

  qs('#verify-status-block').innerHTML = ok ? `
    <div class="verify-ok-block">
      <div class="verify-big-icon ok">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
      </div>
      <div>
        <div class="verify-label-big ok">Document Authentic</div>
        <div class="verify-sub">${data.message}</div>
      </div>
    </div>` : `
    <div class="verify-fail-block">
      <div class="verify-big-icon fail">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </div>
      <div>
        <div class="verify-label-big fail">Verification Failed</div>
        <div class="verify-sub">${data.message}</div>
      </div>
    </div>`;

  const pipeline = qs('#verify-pipeline');
  const pipeCompare = qs('#pipe-compare');
  const pipeResult  = qs('#pipeline-result');
  if (pipeline) {
    if (ok) {
      pipeCompare.className = 'pipe-step pipe-ok';
      qs('#pipe-compare-text').textContent = 'Hash Comparison: Match ✓';
      pipeResult.className   = 'pipeline-result ok';
      pipeResult.textContent = 'RESULT: AUTHENTIC DOCUMENT';
    } else {
      pipeCompare.className = 'pipe-step pipe-fail';
      qs('#pipe-compare-text').textContent = 'Hash Comparison: Mismatch ✗';
      pipeResult.className   = 'pipeline-result fail';
      pipeResult.textContent = 'RESULT: VERIFICATION FAILED';
    }
    showEl(pipeline);
  }

  qs('#verify-meta-grid').innerHTML = metaGrid([
    { label: 'Document',       value: data.document_name },
    { label: 'Hash Algorithm', value: data.hash_algorithm },
    { label: 'Signature Algo', value: data.signature_algorithm },
    { label: 'SHA-256',        value: data.document_sha256.slice(0, 20) + '…' },
  ]);

  const badge = qs('#verify-result-badge');
  if (badge) {
    badge.className = ok ? 'result-badge authentic-badge' : 'result-badge tampered-badge';
    badge.innerHTML = ok ? `
      <div class="rb-title">AUTHENTIC DOCUMENT</div>
      <div class="rb-items">
        <div class="rb-item rb-ok"><span class="rb-icon">✓</span>Integrity Preserved</div>
        <div class="rb-item rb-ok"><span class="rb-icon">✓</span>Signature Valid</div>
        <div class="rb-item rb-ok"><span class="rb-icon">✓</span>Sender Verified</div>
      </div>` : `
      <div class="rb-title">TAMPERED / INVALID</div>
      <div class="rb-items">
        <div class="rb-item rb-fail"><span class="rb-icon">✗</span>Integrity Failed</div>
        <div class="rb-item rb-fail"><span class="rb-icon">✗</span>Signature Invalid</div>
        <div class="rb-item rb-fail"><span class="rb-icon">✗</span>Sender Not Verified</div>
      </div>`;
    showEl(badge);
  }

  if (data.openssl_output) {
    qs('#openssl-output').textContent = data.openssl_output;
    showEl(qs('#openssl-output-wrap'));
  }

  showEl(result);
}

let tOrig = null, tMod = null, tSession = null, tOrigHash = null;

setupZone('tamp-orig-zone', 'tamp-orig-input', (f) => {
  tOrig = f;
  qs('#tamp-orig-label').textContent = shortName(f.name);
  qs('#tamp-sign-btn').disabled = false;
  hideEl(qs('#tamp-sign-result'));
  qs('#tamp-verify-orig-btn').disabled = true;
  qs('#tamp-verify-mod-btn').disabled  = true;
  hideEl(qs('#tamp-verify-orig-result'));
  hideEl(qs('#tamp-verify-mod-result'));
  hideEl(qs('#comparison-banner'));
  hideEl(qs('#tamper-conclusion'));
  hideEl(qs('#amr-verdict'));
  qs('#gen-fake-key-btn').disabled    = true;
  qs('#wrong-key-verify-btn').disabled = true;
  hideEl(qs('#wrong-key-result'));
  tSession = null; tOrigHash = null;
});

qs('#tamp-sign-btn').addEventListener('click', async () => {
  if (!tOrig) return;
  const btn = qs('#tamp-sign-btn');
  btnLoad(btn, 'Signing…');
  try {
    const form = new FormData();
    form.append('document', tOrig);
    const res  = await timedFetch(`${API}/sign`, { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    tSession  = data.session_id;
    tOrigHash = data.document_sha256;

    qs('#tamp-sign-result').innerHTML = `
      <div class="tamp-status ok">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M16 5L8 13l-4-4"/></svg>
        Signed — signature ready
      </div>
      <div class="hash-line">SHA-256: ${data.document_sha256}</div>`;
    showEl(qs('#tamp-sign-result'));
    qs('#tamp-verify-orig-btn').disabled = false;
    qs('#gen-fake-key-btn').disabled = false;
  } catch (err) {
    toast(`Sign failed: ${err.message}`, 'error');
  } finally {
    btnReset(btn);
  }
});

qs('#tamp-verify-orig-btn').addEventListener('click', async () => {
  if (!tOrig || !tSession) return;
  const btn = qs('#tamp-verify-orig-btn');
  btnLoad(btn, 'Verifying…');
  try {
    const sigRes  = await timedFetch(`${API}/sign/download/${tSession}`);
    if (!sigRes.ok) throw new Error('Signature not found on server.');
    const sigFile = new File([await sigRes.blob()], 'signature.sig');

    const form = new FormData();
    form.append('document', tOrig);
    form.append('signature', sigFile);
    const res  = await timedFetch(`${API}/verify`, { method: 'POST', body: form });
    const data = await res.json();

    const ok  = data.verified;
    const icon = ok
      ? '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M16 5L8 13l-4-4"/></svg>'
      : '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M15 5L5 15M5 5l10 10"/></svg>';

    qs('#tamp-verify-orig-result').innerHTML = `<div class="tamp-status ${ok ? 'ok' : 'fail'}">${icon} ${ok ? 'Verification Passed — Document Authentic' : 'Verification Failed'}</div>`;
    showEl(qs('#tamp-verify-orig-result'));

    if (ok) {
      qs('#comp-orig-name').textContent = tOrig.name;
      qs('#comp-orig-hash').textContent = 'SHA-256: ' + tOrigHash.slice(0, 32) + '…';
      setDiagramState('signed');
    }
  } catch (err) {
    toast(`Verify error: ${err.message}`, 'error');
  } finally {
    btnReset(btn);
  }
});

setupZone('tamp-mod-zone', 'tamp-mod-input', (f) => {
  tMod = f;
  qs('#tamp-mod-label').textContent = shortName(f.name);
  qs('#tamp-verify-mod-btn').disabled = !tSession;
  hideEl(qs('#tamp-verify-mod-result'));
  hideEl(qs('#comparison-banner'));
  hideEl(qs('#tamper-conclusion'));
});

qs('#tamp-verify-mod-btn').addEventListener('click', async () => {
  if (!tMod || !tSession) return;
  const btn = qs('#tamp-verify-mod-btn');
  btnLoad(btn, 'Verifying…');
  try {
    const sigRes  = await timedFetch(`${API}/sign/download/${tSession}`);
    if (!sigRes.ok) throw new Error('Signature not found on server.');
    const sigFile = new File([await sigRes.blob()], 'signature.sig');

    const form = new FormData();
    form.append('document', tMod);
    form.append('signature', sigFile);
    const res  = await timedFetch(`${API}/verify`, { method: 'POST', body: form });
    const data = await res.json();
    const ok   = data.verified;
    const icon = ok
      ? '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M16 5L8 13l-4-4"/></svg>'
      : '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M15 5L5 15M5 5l10 10"/></svg>';

    qs('#tamp-verify-mod-result').innerHTML = `
      <div class="tamp-status ${ok ? 'ok' : 'fail'}">${icon} ${ok ? 'Passed (Unexpected)' : 'Verification Failed — Tampering Detected'}</div>
      <div class="hash-line">SHA-256: ${data.document_sha256}</div>`;
    showEl(qs('#tamp-verify-mod-result'));

    qs('#comp-mod-name').textContent = tMod.name;
    qs('#comp-mod-hash').textContent = 'SHA-256: ' + data.document_sha256.slice(0, 32) + '…';
    qs('#comp-orig-name').textContent = tOrig ? tOrig.name : '—';
    qs('#comp-orig-hash').textContent = 'SHA-256: ' + (tOrigHash || '').slice(0, 32) + '…';
    showEl(qs('#comparison-banner'));
    if (!ok) {
      showEl(qs('#tamper-conclusion'));
      setDiagramState('tampered');
    }
  } catch (err) {
    toast(`Verify error: ${err.message}`, 'error');
  } finally {
    btnReset(btn);
  }
});

function setDiagramState(state) {
  const verdict = qs('#amr-verdict');
  if (!verdict) return;
  if (state === 'signed') {
    verdict.className = 'amr-verdict ok';
    verdict.textContent = '✓ Verification passed — document is authentic.';
    showEl(verdict);
  } else if (state === 'tampered') {
    verdict.className = 'amr-verdict fail';
    verdict.textContent = '✗ Verification failed — hash mismatch detected.';
    showEl(verdict);
  } else if (state === 'wrong-key') {
    verdict.className = 'amr-verdict fail';
    verdict.textContent = '✗ Verification failed — public key does not match signer.';
    showEl(verdict);
  }
}

qs('#gen-fake-key-btn').addEventListener('click', async () => {
  const btn = qs('#gen-fake-key-btn');
  btnLoad(btn, 'Generating Key…');
  try {
    const res  = await timedFetch(`${API}/fake-key/generate`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    toast('Different RSA-2048 key pair generated.', 'success');
    qs('#wrong-key-verify-btn').disabled = !tSession;
  } catch (err) {
    toast(`Key generation failed: ${err.message}`, 'error');
  } finally {
    btnReset(btn);
  }
});

qs('#wrong-key-verify-btn').addEventListener('click', async () => {
  if (!tOrig || !tSession) {
    toast('Complete Step 1 first — sign a document.', 'error'); return;
  }
  const btn = qs('#wrong-key-verify-btn');
  btnLoad(btn, 'Verifying with Wrong Key…');
  try {
    const sigRes  = await timedFetch(`${API}/sign/download/${tSession}`);
    if (!sigRes.ok) throw new Error('Original signature not found. Complete Step 1 first.');
    const sigFile = new File([await sigRes.blob()], 'signature.sig');

    const pubRes = await timedFetch(`${API}/fake-key/download`);
    if (!pubRes.ok) throw new Error('Different key not found. Generate it first.');
    const pubFile = new File([await pubRes.blob()], 'different_public_key.pem');

    const form = new FormData();
    form.append('document', tOrig);
    form.append('signature', sigFile);
    form.append('public_key', pubFile);

    const res  = await timedFetch(`${API}/verify`, { method: 'POST', body: form });
    const data = await res.json();

    const resultEl = qs('#wrong-key-result');
    resultEl.innerHTML = `
      <div class="tamp-status fail">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M15 5L5 15M5 5l10 10"/></svg>
        Verification failed — wrong public key
      </div>
      <div class="hash-line" style="margin-top:8px;color:var(--text-2);font-family:inherit;font-size:0.76rem;line-height:1.5">
        Document: <strong style="color:var(--text)">${tOrig.name}</strong> (unchanged)<br>
        Key: different key pair — does not match original signature.
      </div>`;
    showEl(resultEl);
    setDiagramState('wrong-key');
  } catch (err) {
    toast(`Wrong key attack error: ${err.message}`, 'error');
  } finally {
    btnReset(btn);
  }
});

const injectStyle = document.createElement('style');
injectStyle.textContent = `
  @keyframes toastIn { from{opacity:0;transform:translateX(-50%) translateY(8px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
  .amr-diagram { flex-wrap: nowrap; }
`;
document.head.appendChild(injectStyle);

document.addEventListener('DOMContentLoaded', () => {
  loadStatus();
  loadKeyInfo();
});
