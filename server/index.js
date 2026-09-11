import { createApp } from "./app.js";
import { readConfig } from "./config.js";

const port = Number(process.env.PORT || 8787);
const app = createApp({ config: readConfig(process.env), fetchImpl: fetch, services: {} });

app.listen(port, "127.0.0.1");
