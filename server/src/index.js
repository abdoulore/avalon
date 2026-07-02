import { app } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { createServer } from "http";
import { attachSocketServer } from "./realtime/socketServer.js";

await connectDatabase();

const httpServer = createServer(app);
attachSocketServer(httpServer, { corsOrigin: env.clientOrigin });

httpServer.listen(env.port, () => {
  console.log(`Avalon API listening on http://localhost:${env.port}`);
});
