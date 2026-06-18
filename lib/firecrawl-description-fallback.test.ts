import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  fetchFirecrawlDescriptionSnippet,
  _resetRenderCallCountForTests,
  __FIRECRAWL_SCRAPE_URL_FRAGMENT_AUDIT,
} from './firecrawl-description-fallback';

describe('firecrawl-description-fallback', () => {
  let savedFallback: string | undefined;
  let savedKey: string | undefined;
  let savedBudget: string | undefined;
  let savedFetch: typeof global.fetch;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    savedFallback = process.env.MEALS_FIRECRAWL_FALLBACK;
    savedKey = process.env.FIRECRAWL_API_KEY;
    savedBudget = process.env.MEALS_FIRECRAWL_FALLBACK_BUDGET_PER_RENDER;
    savedFetch = global.fetch;
    delete process.env.MEALS_FIRECRAWL_FALLBACK;
    delete process.env.FIRECRAWL_API_KEY;
    delete process.env.MEALS_FIRECRAWL_FALLBACK_BUDGET_PER_RENDER;
    _resetRenderCallCountForTests();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    if (savedFallback === undefined) delete process.env.MEALS_FIRECRAWL_FALLBACK;
    else process.env.MEALS_FIRECRAWL_FALLBACK = savedFallback;
    if (savedKey === undefined) delete process.env.FIRECRAWL_API_KEY;
    else process.env.FIRECRAWL_API_KEY = savedKey;
    if (savedBudget === undefined) delete process.env.MEALS_FIRECRAWL_FALLBACK_BUDGET_PER_RENDER;
    else process.env.MEALS_FIRECRAWL_FALLBACK_BUDGET_PER_RENDER = savedBudget;
    global.fetch = savedFetch;
    warnSpy.mockRestore();
  });

  describe('FR-005: disabled by default', () => {
    it('returns null when MEALS_FIRECRAWL_FALLBACK is unset', async () => {
      global.fetch = vi.fn();
      const result = await fetchFirecrawlDescriptionSnippet('Tesco Milk');
      expect(result).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('returns null when MEALS_FIRECRAWL_FALLBACK=0', async () => {
      process.env.MEALS_FIRECRAWL_FALLBACK = '0';
      process.env.FIRECRAWL_API_KEY = 'fc-test';
      global.fetch = vi.fn();
      const result = await fetchFirecrawlDescriptionSnippet('Tesco Milk');
      expect(result).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('FR-007: missing API key', () => {
    it('returns null + logs a one-time warning when FIRECRAWL_API_KEY is unset', async () => {
      process.env.MEALS_FIRECRAWL_FALLBACK = '1';
      global.fetch = vi.fn();
      const result = await fetchFirecrawlDescriptionSnippet('Tesco Milk');
      expect(result).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toMatch(/FIRECRAWL_API_KEY/);
    });

    it('does not log the missing-key warning on subsequent calls', async () => {
      process.env.MEALS_FIRECRAWL_FALLBACK = '1';
      global.fetch = vi.fn();
      await fetchFirecrawlDescriptionSnippet('Tesco Milk');
      await fetchFirecrawlDescriptionSnippet('Tesco Eggs');
      await fetchFirecrawlDescriptionSnippet('Tesco Bread');
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('FR-003 + FR-004: successful search', () => {
    it('calls /v1/search with {query, limit:1} and returns first hit description', async () => {
      process.env.MEALS_FIRECRAWL_FALLBACK = '1';
      process.env.FIRECRAWL_API_KEY = 'fc-test-key';
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [
            {
              url: 'https://www.tesco.com/shop/en-GB/products/254656543',
              title: 'Tesco British Semi Skimmed Milk 2.272L, 4 Pints',
              description: 'Storage. Keep refrigerated. Once opened, best within 5 days.',
            },
          ],
          id: 'abc',
        }),
      });
      global.fetch = fetchMock as unknown as typeof global.fetch;

      const result = await fetchFirecrawlDescriptionSnippet('Tesco Semi Skimmed Milk 2.272L');
      expect(result).toBe('Storage. Keep refrigerated. Once opened, best within 5 days.');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.firecrawl.dev/v1/search');
      const parsedBody = JSON.parse(init.body);
      expect(parsedBody.limit).toBe(1);
      expect(parsedBody.query).toBe('Tesco Semi Skimmed Milk 2.272L site:tesco.com');
      expect(init.headers.Authorization).toBe('Bearer fc-test-key');
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(init.method).toBe('POST');
    });

    it('returns null when the first hit has empty description', async () => {
      process.env.MEALS_FIRECRAWL_FALLBACK = '1';
      process.env.FIRECRAWL_API_KEY = 'fc-test';
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [{ url: 'x', title: 'y', description: '   ' }],
        }),
      });
      const result = await fetchFirecrawlDescriptionSnippet('Tesco Milk');
      expect(result).toBeNull();
    });

    it('returns null when zero hits', async () => {
      process.env.MEALS_FIRECRAWL_FALLBACK = '1';
      process.env.FIRECRAWL_API_KEY = 'fc-test';
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: [] }),
      });
      const result = await fetchFirecrawlDescriptionSnippet('No Such Product');
      expect(result).toBeNull();
    });

    it('returns null when success=false', async () => {
      process.env.MEALS_FIRECRAWL_FALLBACK = '1';
      process.env.FIRECRAWL_API_KEY = 'fc-test';
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: false, data: [] }),
      });
      const result = await fetchFirecrawlDescriptionSnippet('Tesco Milk');
      expect(result).toBeNull();
    });

    it('returns null when data is not an array', async () => {
      process.env.MEALS_FIRECRAWL_FALLBACK = '1';
      process.env.FIRECRAWL_API_KEY = 'fc-test';
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: 'not-an-array' }),
      });
      const result = await fetchFirecrawlDescriptionSnippet('Tesco Milk');
      expect(result).toBeNull();
    });
  });

  describe('FR-009 + NFR-004: HTTP error handling', () => {
    it.each([401, 403, 429, 500, 502, 503])(
      'returns null + logs warning on HTTP %i',
      async (status) => {
        process.env.MEALS_FIRECRAWL_FALLBACK = '1';
        process.env.FIRECRAWL_API_KEY = 'fc-test';
        global.fetch = vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({}) });
        const result = await fetchFirecrawlDescriptionSnippet('Tesco Milk');
        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalled();
        expect(warnSpy.mock.calls[0][0]).toMatch(new RegExp(`HTTP ${status}`));
      }
    );

    it('returns null + logs warning when fetch throws (network error)', async () => {
      process.env.MEALS_FIRECRAWL_FALLBACK = '1';
      process.env.FIRECRAWL_API_KEY = 'fc-test';
      global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      const result = await fetchFirecrawlDescriptionSnippet('Tesco Milk');
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy.mock.calls[0][0]).toMatch(/fetch error/);
    });

    it('returns null + logs warning when response JSON is malformed', async () => {
      process.env.MEALS_FIRECRAWL_FALLBACK = '1';
      process.env.FIRECRAWL_API_KEY = 'fc-test';
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token');
        },
      });
      const result = await fetchFirecrawlDescriptionSnippet('Tesco Milk');
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy.mock.calls[0][0]).toMatch(/malformed JSON/);
    });
  });

  describe('FR-006 + FR-011: per-render budget', () => {
    it('honours MEALS_FIRECRAWL_FALLBACK_BUDGET_PER_RENDER=2 then exhausts', async () => {
      process.env.MEALS_FIRECRAWL_FALLBACK = '1';
      process.env.FIRECRAWL_API_KEY = 'fc-test';
      process.env.MEALS_FIRECRAWL_FALLBACK_BUDGET_PER_RENDER = '2';
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [{ url: 'x', title: 'y', description: 'snippet' }],
        }),
      });
      global.fetch = fetchMock as unknown as typeof global.fetch;

      expect(await fetchFirecrawlDescriptionSnippet('item1')).toBe('snippet');
      expect(await fetchFirecrawlDescriptionSnippet('item2')).toBe('snippet');
      // Budget exhausted.
      expect(await fetchFirecrawlDescriptionSnippet('item3')).toBeNull();
      expect(await fetchFirecrawlDescriptionSnippet('item4')).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('defaults to 3 when MEALS_FIRECRAWL_FALLBACK_BUDGET_PER_RENDER is unset', async () => {
      process.env.MEALS_FIRECRAWL_FALLBACK = '1';
      process.env.FIRECRAWL_API_KEY = 'fc-test';
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [{ url: 'x', title: 'y', description: 'snippet' }],
        }),
      });
      global.fetch = fetchMock as unknown as typeof global.fetch;

      expect(await fetchFirecrawlDescriptionSnippet('item1')).toBe('snippet');
      expect(await fetchFirecrawlDescriptionSnippet('item2')).toBe('snippet');
      expect(await fetchFirecrawlDescriptionSnippet('item3')).toBe('snippet');
      // 4th: budget exhausted.
      expect(await fetchFirecrawlDescriptionSnippet('item4')).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('treats unparseable budget as default 3', async () => {
      process.env.MEALS_FIRECRAWL_FALLBACK = '1';
      process.env.FIRECRAWL_API_KEY = 'fc-test';
      process.env.MEALS_FIRECRAWL_FALLBACK_BUDGET_PER_RENDER = 'not-a-number';
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [{ url: 'x', title: 'y', description: 'snippet' }],
        }),
      });
      global.fetch = fetchMock as unknown as typeof global.fetch;

      expect(await fetchFirecrawlDescriptionSnippet('item1')).toBe('snippet');
      expect(await fetchFirecrawlDescriptionSnippet('item2')).toBe('snippet');
      expect(await fetchFirecrawlDescriptionSnippet('item3')).toBe('snippet');
      expect(await fetchFirecrawlDescriptionSnippet('item4')).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });

  describe('FR-002: scrape endpoint MUST NOT appear', () => {
    it('audit constant is the literal "/v1/scrape" string for grep test', () => {
      // The audit constant exists so AS-010 (in the spec) can grep for
      // this exact fragment and confirm it's only referenced as a
      // declaration, never constructed as a fetch URL.
      expect(__FIRECRAWL_SCRAPE_URL_FRAGMENT_AUDIT).toBe('/v1/scrape');
    });
  });
});
