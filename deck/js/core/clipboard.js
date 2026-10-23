// Clipboard for an embedded deck: the async Clipboard API needs the iframe's clipboard permission *and*
// document focus; a same-document textarea + execCommand is the dependable fallback inside DSH.
export async function copyText(text) {
  const value = String(text ?? '');
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); return true }
  } catch { /* fall through to the legacy path */ }
  try {
    const box = document.createElement('textarea');
    box.value = value;
    box.setAttribute('readonly', '');
    box.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.append(box);
    box.select(); box.setSelectionRange(0, value.length);
    const ok = document.execCommand('copy');
    box.remove();
    return ok;
  } catch { return false }
}
