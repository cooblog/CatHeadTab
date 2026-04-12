/**
 * CatHeadTab Background Service Worker
 *
 * Primary purpose: proxy AI API requests to avoid CORS restrictions.
 * Some AI providers (MiniMax, GLM, etc.) don't set CORS headers,
 * blocking direct browser fetch. The service worker is not subject
 * to CORS, so we relay requests through it.
 *
 * Communication uses chrome.runtime.connect (Port) for streaming.
 */

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'ai-proxy') return;

  port.onMessage.addListener(async (msg) => {
    if (msg.type !== 'fetch') return;

    const { id, url, init } = msg;

    try {
      const resp = await fetch(url, {
        method: init.method || 'POST',
        headers: init.headers || {},
        body: init.body || undefined,
      });

      // Read response as stream and relay chunks
      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        // No body — send complete response at once
        const text = await resp.text();
        port.postMessage({ id, type: 'data', data: text });
        port.postMessage({ id, type: 'end', status: resp.status, headers: Object.fromEntries(resp.headers.entries()) });
        return;
      }

      // Send response headers first
      port.postMessage({
        id,
        type: 'headers',
        status: resp.status,
        statusText: resp.statusText,
        headers: Object.fromEntries(resp.headers.entries()),
      });

      // Stream body chunks
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        port.postMessage({ id, type: 'data', data: text });
      }

      port.postMessage({ id, type: 'end' });
    } catch (err) {
      port.postMessage({ id, type: 'error', error: err.message || 'Network error' });
    }
  });
});
