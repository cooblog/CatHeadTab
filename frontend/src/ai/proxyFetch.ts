/**
 * A custom fetch function that proxies requests through the Chrome extension
 * background service worker to bypass CORS restrictions.
 *
 * Falls back to native fetch when:
 * - Not running in a Chrome extension context
 * - The background service worker is unavailable
 */

let portInstance: chrome.runtime.Port | null = null;
let requestCounter = 0;
const pendingRequests = new Map<number, {
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
  chunks: string[];
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
}>();

function getPort(): chrome.runtime.Port | null {
  if (typeof chrome === 'undefined' || !chrome.runtime?.connect) return null;

  if (portInstance) return portInstance;

  try {
    portInstance = chrome.runtime.connect({ name: 'ai-proxy' });
    portInstance.onMessage.addListener((msg) => {
      const req = pendingRequests.get(msg.id);
      if (!req) return;

      switch (msg.type) {
        case 'headers':
          req.status = msg.status;
          req.statusText = msg.statusText;
          req.headers = msg.headers;
          break;

        case 'data':
          req.chunks.push(msg.data);
          break;

        case 'end': {
          const body = req.chunks.join('');
          const status = msg.status ?? req.status ?? 200;
          const headers = msg.headers ?? req.headers ?? {};
          const response = new Response(body, {
            status,
            statusText: req.statusText || '',
            headers: new Headers(headers),
          });
          pendingRequests.delete(msg.id);
          req.resolve(response);
          break;
        }

        case 'error':
          pendingRequests.delete(msg.id);
          req.reject(new Error(msg.error));
          break;
      }
    });

    portInstance.onDisconnect.addListener(() => {
      portInstance = null;
      for (const [id, req] of pendingRequests) {
        req.reject(new Error('Background service worker disconnected'));
        pendingRequests.delete(id);
      }
    });
  } catch {
    portInstance = null;
    return null;
  }

  return portInstance;
}

/** Extract serializable fields from various input types that AI SDK may pass. */
async function normalizeRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<{ url: string; method: string; headers: Record<string, string>; body?: string }> {
  let url: string;
  let method = init?.method || 'GET';
  const headers: Record<string, string> = {};
  let body: string | undefined;

  // --- URL ---
  if (typeof input === 'string') {
    url = input;
  } else if (input instanceof URL) {
    url = input.toString();
  } else if (input instanceof Request) {
    // AI SDK v6 may pass a Request object
    url = input.url;
    method = init?.method || input.method;

    // Merge headers from Request first, then override with init
    input.headers.forEach((v, k) => { headers[k] = v; });
  } else {
    url = String(input);
  }

  // --- Headers from init (override Request headers) ---
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => { headers[k] = v; });
    } else if (Array.isArray(init.headers)) {
      for (const [k, v] of init.headers) { headers[k] = v; }
    } else {
      Object.assign(headers, init.headers as Record<string, string>);
    }
  }

  // --- Body ---
  const rawBody = init?.body ?? ((input instanceof Request) ? input.body : undefined);
  if (rawBody) {
    if (typeof rawBody === 'string') {
      body = rawBody;
    } else if (rawBody instanceof ArrayBuffer) {
      body = new TextDecoder().decode(rawBody);
    } else if (ArrayBuffer.isView(rawBody)) {
      body = new TextDecoder().decode(rawBody.buffer as ArrayBuffer);
    } else if (rawBody instanceof ReadableStream) {
      // Read stream to string (AI SDK may pass ReadableStream body)
      const reader = rawBody.getReader();
      const decoder = new TextDecoder();
      const parts: string[] = [];
      let done = false;
      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (result.value) parts.push(decoder.decode(result.value, { stream: !done }));
      }
      body = parts.join('');
    } else {
      body = String(rawBody);
    }
  }

  return { url, method, headers, body };
}

/**
 * Proxy fetch through Chrome extension background service worker.
 * Automatically bypasses CORS by running the actual fetch in the
 * service worker context.
 */
export async function proxyFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const port = getPort();

  // Not in extension context — fall back to native fetch
  if (!port) {
    return fetch(input, init);
  }

  const { url, method, headers, body } = await normalizeRequest(input, init);
  const id = ++requestCounter;

  return new Promise<Response>((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject, chunks: [] });
    port.postMessage({
      type: 'fetch',
      id,
      url,
      init: { method, headers, body },
    });

    // Timeout after 60s
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error('AI proxy request timed out (60s)'));
      }
    }, 60000);
  });
}
