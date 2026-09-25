import type { CacheConfig } from './cacheConfig';
import { DEFAULT_CACHE_CONFIG } from './cacheConfig';

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

/** Time bounded key/value cache for read queries. */
export class QueryCache {
  private readonly config: CacheConfig;
  private readonly entries = new Map<string, CacheEntry>();

  constructor(config: CacheConfig = DEFAULT_CACHE_CONFIG) {
    this.config = config;
  }

  /** Returns a live entry, or undefined when the key is absent or stale. */
  get<T>(key: string): T | undefined {
    if (!this.config.enabled) {
      return undefined;
    }
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      this.invalidate(key);
      return undefined;
    }
    return entry.value as T;
  }

  /** Stores a value under a key for the configured lifetime. */
  set<T>(key: string, value: T): void {
    if (!this.config.enabled) {
      return;
    }
    if (this.size() >= this.config.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) {
        this.invalidate(oldest);
      }
    }
    this.entries.set(key, { value, expiresAt: Date.now() + this.config.ttlMillis });
  }

  /** Drops one key. */
  invalidate(key: string): void {
    this.entries.delete(key);
  }

  /** Number of entries currently held, stale ones included. */
  size(): number {
    return this.entries.size;
  }
}
