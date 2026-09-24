import { AppError } from './errors.js';

export function createWindowLimiter({ limit, windowMs, message }) {
  const buckets = new Map();
  return (request, response, next) => {
    const now = Date.now();
    const key = request.ip || request.socket.remoteAddress || 'unknown';
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (buckets.size > 5000) {
      for (const [storedKey, stored] of buckets) if (stored.resetAt <= now) buckets.delete(storedKey);
    }
    response.setHeader('RateLimit-Limit', String(limit));
    response.setHeader('RateLimit-Remaining', String(Math.max(0, limit - bucket.count)));
    if (bucket.count > limit) {
      response.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return next(new AppError(429, 'rate_limited', message));
    }
    next();
  };
}

export class ConcurrencyGate {
  constructor({ limit, queueLimit = 20, timeoutMs = 15_000 }) {
    this.limit = limit;
    this.queueLimit = queueLimit;
    this.timeoutMs = timeoutMs;
    this.active = 0;
    this.queue = [];
  }

  acquire() {
    if (this.active < this.limit) {
      this.active += 1;
      return Promise.resolve(this.releaseOnce());
    }
    if (this.queue.length >= this.queueLimit) return Promise.reject(new AppError(503, 'queue_full', '当前使用人数较多，请稍后重试。'));
    return new Promise((resolve, reject) => {
      const item = { resolve, reject };
      item.timer = setTimeout(() => {
        const index = this.queue.indexOf(item);
        if (index >= 0) this.queue.splice(index, 1);
        reject(new AppError(503, 'queue_timeout', '等待时间较长，请稍后重试。'));
      }, this.timeoutMs);
      item.timer.unref?.();
      this.queue.push(item);
    });
  }

  releaseOnce() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.queue.shift();
      if (next) {
        clearTimeout(next.timer);
        next.resolve(this.releaseOnce());
      } else {
        this.active -= 1;
      }
    };
  }

  middleware() {
    return async (request, response, next) => {
      try {
        const release = await this.acquire();
        let done = false;
        const finish = () => { if (!done) { done = true; release(); } };
        response.once('finish', finish);
        response.once('close', finish);
        next();
      } catch (error) { next(error); }
    };
  }
}
