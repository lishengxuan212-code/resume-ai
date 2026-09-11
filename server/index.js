import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { pathToFileURL } from "node:url";

export function createServerApp(env = process.env, { fetchImpl = fetch, services = {} } = {}) {
  try {
    return createApp({ config: readConfig(env), fetchImpl, services });
  } catch (configError) {
    return createApp({ configError, fetchImpl, services });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 8787);
  createServerApp().listen(port, "127.0.0.1");
}
