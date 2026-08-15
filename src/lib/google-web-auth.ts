/** Open Google OAuth without losing the user-gesture popup (needed in Cursor preview / iframes). */

export function isEmbeddedFrame() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function openOAuthWindow(url: string, preopened: Window | null) {
  if (preopened && !preopened.closed) {
    preopened.location.replace(url);
    preopened.focus();
    return preopened;
  }

  if (isEmbeddedFrame()) {
    try {
      window.top!.location.href = url;
      return null;
    } catch {
      /* fall through */
    }
  }

  const w = window.open(url, "sanam-google-oauth", "width=500,height=720,noopener=no");
  if (w) {
    w.focus();
    return w;
  }

  window.location.assign(url);
  return null;
}

/** Must run synchronously in the click handler, before any await. */
export function openBlankOAuthPopup() {
  try {
    const w = window.open("about:blank", "sanam-google-oauth", "width=500,height=720");
    if (w) {
      try {
        w.document.write("جاري فتح حسابات Google…");
      } catch {
        /* ignore */
      }
    }
    return w;
  } catch {
    return null;
  }
}
