import {
  client,
  connectDB,
} from "../src/config/db.js";

import {
  createIndexes,
} from "../src/config/indexes.js";

import {
  syncInstitutionsFromUGC,
} from "../src/services/institution.service.js";

const run = async () => {
  try {
    console.log(
      "Connecting to MongoDB..."
    );

    await connectDB();

    console.log(
      "Creating indexes..."
    );

    await createIndexes();

    console.log(
      "Syncing institutions from UGC..."
    );

    const result =
      await syncInstitutionsFromUGC();

    console.log(
      "Institution sync completed successfully."
    );

    console.log(
      JSON.stringify(
        result,
        null,
        2
      )
    );
  } catch (error) {
    console.error(
      "Institution sync failed:"
    );

    console.error(
      error
    );

    process.exitCode = 1;
  } finally {
    try {
      await client.close();
    } catch (error) {
      console.error(
        "MongoDB close error:",
        error
      );
    }
  }
};

run();