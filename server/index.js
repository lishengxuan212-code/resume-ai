import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { pathToFileURL } from "node:url";
import { readAccessConfig } from './access-config.js';
import { AccessStore } from './access-store.js';
import { createAccessControl } from './access-control.js';

export function createServerApp(env = process.env, { fetchImpl = fetch, services = {} } = {}) {
  const accessConfig = readAccessConfig(env);
  const accessControl = accessConfig.enabled ? createAccessControl(accessConfig, new AccessStore(accessConfig)) : createAccessControl(accessConfig);
  try {
    return createApp({ config: readConfig(env), fetchImpl, services, accessConfig, accessControl });
  } catch (configError) {
    return createApp({ configError, fetchImpl, services, accessConfig, accessControl });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 8787);
  createServerApp().listen(port, "127.0.0.1");
}
