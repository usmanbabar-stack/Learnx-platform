import { logger } from './logger';
import http from 'http';
import https from 'https';
import tls from 'tls';
import { URL } from 'url';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * CONNECT-tunnel agent: sends HTTP CONNECT to the proxy, then wraps in TLS.
 * Replaces `https-proxy-agent` (ESM-only v8) for this CJS project.
 */
class TunnelAgent extends https.Agent {
  private proxyHost: string;
  private proxyPort: number;
  private proxyAuth: string | null;

  constructor(proxyUrl: string) {
    super({ keepAlive: true });
    const parsed = new URL(proxyUrl);
    this.proxyHost = parsed.hostname;
    this.proxyPort = parseInt(parsed.port) || 80;
    this.proxyAuth = parsed.username
      ? 'Basic ' + Buffer.from(`${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password || '')}`).toString('base64')
      : null;
  }

  createConnection(options: any, callback: (err: Error | null, socket?: any) => void): any {
    const connectHeaders: Record<string, string> = {
      Host: `${options.host}:${options.port || 443}`,
    };
    if (this.proxyAuth) connectHeaders['Proxy-Authorization'] = this.proxyAuth;

    const req = http.request({
      host: this.proxyHost,
      port: this.proxyPort,
      method: 'CONNECT',
      path: `${options.host}:${options.port || 443}`,
      headers: connectHeaders,
    });

    req.on('connect', (_res, socket) => {
      if (_res.statusCode !== 200) {
        callback(new Error(`Proxy CONNECT failed: ${_res.statusCode}`));
        socket.destroy();
        return;
      }
      const tlsSocket = tls.connect({
        socket,
        host: options.host,
        servername: options.servername || options.host,
      });
      callback(null, tlsSocket);
    });
    req.on('error', callback);
    req.setTimeout(10000, () => {
      req.destroy(new Error('Proxy CONNECT timeout'));
    });
    req.end();
  }
}

interface ProxyEntry {
  id: string;
  url: string;
  source: 'webshare' | 'go2proxy' | 'env';
  agent?: TunnelAgent;
  health: number;
  cooldownUntil: number;
  successCount: number;
  failCount: number;
  lastUsed: number;
}

export interface Fingerprint {
  userAgent: string;
  acceptLanguage: string;
  secChUa: string;
  headers: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Fingerprint pool — real browser fingerprints (Chrome/Firefox/Edge 2025-2026)
// ---------------------------------------------------------------------------

const FINGERPRINTS: Omit<Fingerprint, 'headers'>[] = [
  { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', acceptLanguage: 'en-US,en;q=0.9', secChUa: '"Chromium";v="131", "Google Chrome";v="131", "Not_A Brand";v="24"' },
  { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', acceptLanguage: 'en-US,en;q=0.9,fr;q=0.8', secChUa: '"Chromium";v="130", "Google Chrome";v="130", "Not_A Brand";v="24"' },
  { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0', acceptLanguage: 'en-US,en;q=0.5', secChUa: '' },
  { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36', acceptLanguage: 'en-US,en;q=0.9', secChUa: '"Chromium";v="129", "Google Chrome";v="129", "Not_A Brand";v="24"' },
  { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0', acceptLanguage: 'en-US,en;q=0.9', secChUa: '"Chromium";v="128", "Microsoft Edge";v="128", "Not_A Brand";v="24"' },
  { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15', acceptLanguage: 'en-US,en;q=0.9', secChUa: '' },
  { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', acceptLanguage: 'en-GB,en-US;q=0.9,en;q=0.8', secChUa: '"Chromium";v="126", "Google Chrome";v="126", "Not_A Brand";v="8"' },
  { userAgent: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', acceptLanguage: 'en-US,en;q=0.5', secChUa: '' },
  { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 OPR/111.0.0.0', acceptLanguage: 'en-US,en;q=0.9', secChUa: '"Chromium";v="125", "Opera";v="111", "Not_A Brand";v="24"' },
  { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36', acceptLanguage: 'en-US,en;q=0.8,de;q=0.6', secChUa: '"Chromium";v="127", "Google Chrome";v="127", "Not_A Brand";v="24"' },
  { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', acceptLanguage: 'en-US,en;q=0.9,es;q=0.7', secChUa: '"Chromium";v="124", "Google Chrome";v="124", "Not_A Brand";v="8"' },
  { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0', acceptLanguage: 'en-US,en;q=0.5', secChUa: '' },
];

// ---------------------------------------------------------------------------
// ProxyPoolManager (singleton)
// ---------------------------------------------------------------------------

const PROXY_ENABLED = () => String(process.env.PROXY_ENABLED || 'false').toLowerCase() === 'true';
const COOLDOWN_MS = 5 * 60 * 1000;          // 5 min cooldown on failure
const GO2PROXY_REFRESH_MS = 30 * 60 * 1000; // refresh public list every 30 min
const HEALTH_SUCCESS_BOOST = 10;
const HEALTH_FAIL_PENALTY = 30;

let proxyPool: ProxyEntry[] = [];
let lastGo2ProxyRefresh = 0;
let roundRobinIdx = 0;

// ---------------------------------------------------------------------------
// Initialisation & refresh
// ---------------------------------------------------------------------------

export async function initProxyPool(): Promise<void> {
  if (!PROXY_ENABLED()) {
    logger.info('Proxy pool disabled (PROXY_ENABLED != true)');
    return;
  }

  proxyPool = [];

  // 1. Webshare / env proxies (stable, authenticated)
  const envProxies = process.env.WEBSHARE_PROXIES || process.env.PROXY_LIST || '';
  if (envProxies) {
    for (const raw of envProxies.split(',').map(s => s.trim()).filter(Boolean)) {
      const url = raw.startsWith('http') ? raw : `http://${raw}`;
      proxyPool.push(makeEntry(url, 'webshare'));
    }
    logger.info(`Loaded ${proxyPool.length} Webshare/env proxies`);
  }

  // 2. Go2Proxy public list
  await refreshGo2ProxyList();

  logger.info(`Proxy pool ready: ${proxyPool.length} proxies (${proxyPool.filter(p => p.source === 'webshare').length} webshare, ${proxyPool.filter(p => p.source === 'go2proxy').length} go2proxy)`);
}

async function refreshGo2ProxyList(): Promise<void> {
  if (!PROXY_ENABLED()) return;
  const now = Date.now();
  if (now - lastGo2ProxyRefresh < GO2PROXY_REFRESH_MS && proxyPool.some(p => p.source === 'go2proxy')) return;

  try {
    const axios = (await import('axios')).default;
    const { data: html } = await axios.get('https://go2proxy.com/free', {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });

    // Parse the HTML table for IP:PORT pairs
    const rows: { ip: string; port: string }[] = [];
    const rowPattern = /<td[^>]*>\s*([\d.]+)\s*<\/td>\s*<td[^>]*>\s*(\d+)\s*<\/td>/g;
    let m: RegExpExecArray | null;
    while ((m = rowPattern.exec(html)) !== null) {
      rows.push({ ip: m[1], port: m[2] });
    }

    // Remove old go2proxy entries and add fresh ones (keep max 30 for memory)
    proxyPool = proxyPool.filter(p => p.source !== 'go2proxy');
    const usEntries = rows.filter(r => true); // use all available
    for (const r of usEntries.slice(0, 30)) {
      const url = `http://${r.ip}:${r.port}`;
      proxyPool.push(makeEntry(url, 'go2proxy'));
    }

    lastGo2ProxyRefresh = now;
    logger.info(`Refreshed Go2Proxy list: ${usEntries.length} found, loaded ${Math.min(usEntries.length, 30)}`);
  } catch (e: any) {
    logger.warn(`Failed to fetch Go2Proxy list: ${e?.message?.slice(0, 100)}`);
  }
}

function makeEntry(url: string, source: ProxyEntry['source']): ProxyEntry {
  return {
    id: `${source}:${url}`,
    url,
    source,
    health: source === 'webshare' ? 80 : 50, // webshare starts healthier
    cooldownUntil: 0,
    successCount: 0,
    failCount: 0,
    lastUsed: 0,
  };
}

// ---------------------------------------------------------------------------
// Selection — pick the best proxy for the next request
// ---------------------------------------------------------------------------

function getBestProxy(): ProxyEntry | null {
  if (!PROXY_ENABLED() || proxyPool.length === 0) return null;

  const now = Date.now();

  // Eligible proxies: not in cooldown
  const eligible = proxyPool.filter(p => now >= p.cooldownUntil);
  if (eligible.length === 0) {
    // All in cooldown — clear the oldest cooldown and use it
    const oldest = proxyPool.reduce((a, b) => a.cooldownUntil < b.cooldownUntil ? a : b);
    oldest.cooldownUntil = 0;
    return oldest;
  }

  // Sort: webshare first, then by health desc, then least-recently-used
  eligible.sort((a, b) => {
    if (a.source === 'webshare' && b.source !== 'webshare') return -1;
    if (a.source !== 'webshare' && b.source === 'webshare') return 1;
    if (b.health !== a.health) return b.health - a.health;
    return a.lastUsed - b.lastUsed;
  });

  // Round-robin within top tier (top 5 healthiest) to avoid hammering one proxy
  const topTier = eligible.slice(0, Math.min(5, eligible.length));
  const idx = roundRobinIdx % topTier.length;
  roundRobinIdx++;
  const chosen = topTier[idx];
  chosen.lastUsed = now;
  return chosen;
}

// ---------------------------------------------------------------------------
// Public API — report success/failure
// ---------------------------------------------------------------------------

export function reportProxySuccess(proxyId?: string): void {
  if (!proxyId) return;
  const entry = proxyPool.find(p => p.id === proxyId);
  if (entry) {
    entry.successCount++;
    entry.health = Math.min(100, entry.health + HEALTH_SUCCESS_BOOST);
  }
}

export function reportProxyFailure(proxyId?: string): void {
  if (!proxyId) return;
  const entry = proxyPool.find(p => p.id === proxyId);
  if (entry) {
    entry.failCount++;
    entry.health = Math.max(0, entry.health - HEALTH_FAIL_PENALTY);
    if (entry.health <= 20) {
      entry.cooldownUntil = Date.now() + COOLDOWN_MS;
      logger.warn(`Proxy ${entry.url} cooled down for ${COOLDOWN_MS / 1000}s (health=${entry.health})`);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API — get proxy artefacts for consumers
// ---------------------------------------------------------------------------

export interface ProxyConfig {
  proxyId: string | undefined;
  agent: TunnelAgent | undefined;
  httpAgent: http.Agent | undefined;
  httpsAgent: https.Agent | undefined;
  proxyUrl: string | undefined;
}

export function getProxyConfig(): ProxyConfig {
  // Refresh Go2Proxy list in background if stale
  if (PROXY_ENABLED() && Date.now() - lastGo2ProxyRefresh > GO2PROXY_REFRESH_MS) {
    refreshGo2ProxyList().catch(() => {});
  }

  const proxy = getBestProxy();
  if (!proxy) {
    return { proxyId: undefined, agent: undefined, httpAgent: undefined, httpsAgent: undefined, proxyUrl: undefined };
  }

  if (!proxy.agent) {
    proxy.agent = new TunnelAgent(proxy.url);
  }

  return {
    proxyId: proxy.id,
    agent: proxy.agent,
    httpAgent: proxy.agent as unknown as http.Agent,
    httpsAgent: proxy.agent,
    proxyUrl: proxy.url,
  };
}

/**
 * Returns a proxied `fetch` function for youtubei.js Innertube.create({ fetch }).
 * Uses undici's ProxyAgent if available, otherwise falls back to global fetch.
 */
export function getProxiedFetch(): typeof globalThis.fetch | undefined {
  const proxy = getBestProxy();
  if (!proxy) return undefined;

  // Store the proxyId so callers can report success/failure
  const proxyId = proxy.id;
  const proxyUrl = proxy.url;

  try {
    // undici is bundled with Node 18+
    const { ProxyAgent, fetch: undiciFetch } = require('undici');
    const dispatcher = new ProxyAgent(proxyUrl);

    const proxiedFetch = (input: any, init?: any) => {
      return undiciFetch(input, { ...init, dispatcher });
    };

    // Attach proxyId so consumers can report back
    (proxiedFetch as any).__proxyId = proxyId;
    proxy.lastUsed = Date.now();
    return proxiedFetch as typeof globalThis.fetch;
  } catch (e: any) {
    logger.warn(`undici ProxyAgent unavailable, Innertube will use direct connection: ${e?.message}`);
    return undefined;
  }
}

/**
 * Returns axios-compatible proxy config ({ httpAgent, httpsAgent }).
 */
export function getAxiosProxyConfig(): { httpAgent?: http.Agent; httpsAgent?: https.Agent; __proxyId?: string } {
  const cfg = getProxyConfig();
  if (!cfg.agent) return {};
  return { httpAgent: cfg.httpAgent, httpsAgent: cfg.httpsAgent, __proxyId: cfg.proxyId };
}

/**
 * Returns yt-dlp CLI args for proxy: ['--proxy', 'http://...'] or [].
 */
export function getYtdlpProxyArgs(): string[] {
  const cfg = getProxyConfig();
  if (!cfg.proxyUrl) return [];
  return ['--proxy', cfg.proxyUrl];
}

/**
 * Returns a randomised browser fingerprint.
 */
export function getRandomFingerprint(): Fingerprint {
  const fp = FINGERPRINTS[Math.floor(Math.random() * FINGERPRINTS.length)];
  const headers: Record<string, string> = {
    'User-Agent': fp.userAgent,
    'Accept-Language': fp.acceptLanguage,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'DNT': '1',
  };
  if (fp.secChUa) {
    headers['sec-ch-ua'] = fp.secChUa;
    headers['sec-ch-ua-mobile'] = '?0';
    headers['sec-ch-ua-platform'] = '"Windows"';
    headers['Sec-Fetch-Dest'] = 'document';
    headers['Sec-Fetch-Mode'] = 'navigate';
    headers['Sec-Fetch-Site'] = 'none';
    headers['Sec-Fetch-User'] = '?1';
    headers['Upgrade-Insecure-Requests'] = '1';
  }
  return { ...fp, headers };
}

/**
 * Convenience: get the proxyId from a proxied fetch function.
 */
export function getProxyIdFromFetch(fn: any): string | undefined {
  return fn?.__proxyId;
}

/**
 * Proxy pool status for health-check / debugging.
 */
export function getPoolStatus(): { enabled: boolean; total: number; webshare: number; go2proxy: number; healthy: number; cooldown: number } {
  const now = Date.now();
  return {
    enabled: PROXY_ENABLED(),
    total: proxyPool.length,
    webshare: proxyPool.filter(p => p.source === 'webshare').length,
    go2proxy: proxyPool.filter(p => p.source === 'go2proxy').length,
    healthy: proxyPool.filter(p => now >= p.cooldownUntil && p.health > 20).length,
    cooldown: proxyPool.filter(p => now < p.cooldownUntil).length,
  };
}
