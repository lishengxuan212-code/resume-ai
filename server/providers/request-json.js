import { ProviderError, providerHttpError, safeProviderError } from "../provider-error.js";
import { DEFAULT_AI_TIMEOUT_MS } from '../provider-settings.js';

export async function requestJson(url, options, config, fetchImpl) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ProviderError('timeout'));
    }, config.timeoutMs ?? DEFAULT_AI_TIMEOUT_MS);
  });
  try {
    // Race the entire operation as injected transports/body readers may ignore
    // abort. Native fetch still receives the signal to release network resources.
    return await Promise.race([deadline, (async () => {
      const response = await fetchImpl(url, { ...options, signal: controller.signal });
      if (!response.ok) {
        await response.body?.cancel?.();
        throw providerHttpError(response.status);
      }
      return await response.json();
    })()]);
  } catch (error) {
    throw safeProviderError(error);
  } finally {
    clearTimeout(timer);
  }
}
