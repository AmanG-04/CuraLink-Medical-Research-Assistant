import { createApp } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { config } from "./config/env.js";

async function main() {
  await connectDatabase();
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`CuraLink API listening on http://localhost:${config.port}`);
  });
}

main().catch((error) => {
  console.error("Failed to start CuraLink API", error);
  process.exit(1);
});
