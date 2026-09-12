import { providerFailed } from "../resume-validation.js";

export async function requestJson(url, options, config, fetchImpl) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(providerFailed());
    }, config.timeoutMs ?? 30000);
  });
  try {
    // Race the entire operation as injected transports/body readers may ignore
    // abort. Native fetch still receives the signal to release network resources.
    return await Promise.race([deadline, (async () => {
      const response = await fetchImpl(url, { ...options, signal: controller.signal });
      if (!response.ok) throw providerFailed();
      return await response.json();
    })()]);
  } catch {
    throw providerFailed();
  } finally {
    clearTimeout(timer);
  }
}
