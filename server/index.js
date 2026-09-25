import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { pathToFileURL } from "node:url";
import { readAccessConfig } from './access-config.js';
import { AccessStore } from './access-store.js';
import { createAccessControl } from './access-control.js';
import { createAdminControl } from './admin-control.js';
import path from 'node:path';

export function createServerApp(env = process.env, { fetchImpl = fetch, services = {} } = {}) {
  const production = env.NODE_ENV === 'production' || Boolean(env.POCKETBAY_DATA_DIR?.trim());
  const accessConfig = readAccessConfig(env);
  const store = accessConfig.enabled ? new AccessStore(accessConfig) : null;
  if (store && accessConfig.adminBootstrapPassword && !store.hasAdmin()) {
    store.setupAdmin(accessConfig.adminBootstrapPassword);
  }
  const accessControl = accessConfig.enabled ? createAccessControl(accessConfig, store) : createAccessControl(accessConfig);
  const adminControl = accessConfig.enabled ? createAdminControl(accessConfig, store) : createAdminControl(accessConfig);
  try {
    return createApp({ config: readConfig(env), fetchImpl, services, accessConfig, accessControl, adminControl, staticDir: production ? path.resolve('dist/client') : null });
  } catch (configError) {
    return createApp({ configError, fetchImpl, services, accessConfig, accessControl, adminControl, staticDir: production ? path.resolve('dist/client') : null });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 8787);
  const host = process.env.HOST || (process.env.NODE_ENV === 'production' || process.env.POCKETBAY_DATA_DIR?.trim() ? '0.0.0.0' : '127.0.0.1');
  createServerApp().listen(port, host);
}
