import app from "./app.js";

import {
  client,
  connectDB,
} from "./config/db.js";

import {
  createIndexes,
} from "./config/indexes.js";

import {
  PORT,
} from "./config/env.js";

const startServer =
  async () => {
    try {
      await connectDB();

      await createIndexes();

      const server =
        app.listen(
          PORT,
          () => {
            console.log(
              `ReSellHub server running on port ${PORT}`
            );
          }
        );

      const shutdown =
        async () => {
          server.close(
            async () => {
              await client.close();
              process.exit(0);
            }
          );
        };

      process.on(
        "SIGINT",
        shutdown
      );

      process.on(
        "SIGTERM",
        shutdown
      );
    } catch (error) {
      console.error(
        "Server startup failed:",
        error
      );

      process.exitCode = 1;
    }
  };

startServer();