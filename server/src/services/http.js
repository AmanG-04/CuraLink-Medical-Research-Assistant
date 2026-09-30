const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Bounded provider calls; never retries model generation or arbitrary POSTs. */
export async function providerFetch(url, options = {}, fetcher = fetch) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetcher(url, {
        ...options,
        signal: controller.signal,
      });
      // Consume the body inside the deadline too; fetch resolves at headers.
      const body = await response.text();
      const buffered = new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
      if (attempt === 0 && [429, 502, 503, 504].includes(response.status)) {
        await sleep(350);
        continue;
      }
      return buffered;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("Provider retry exhausted");
}
