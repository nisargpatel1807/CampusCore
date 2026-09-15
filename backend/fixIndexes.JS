const mongoose = require("mongoose");
require("dotenv").config();

async function fixIndexes() {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/campuscore");
    console.log("Connected to database...");

    const collection = mongoose.connection.collection("subjects");

    // 1. Inspect existing indexes
    const indexes = await collection.indexes();
    console.log("Current indexes:", indexes.map(i => i.name));

    // 2. Drop the existing subjectCode index if it exists
    const subjectCodeIndex = indexes.find(i => i.name === "subjectCode_1" || (i.key && i.key.subjectCode));
    if (subjectCodeIndex) {
      await collection.dropIndex(subjectCodeIndex.name);
      console.log(`Dropped corrupted index: ${subjectCodeIndex.name}`);
    }

    // 3. Remove invalid documents with null or empty subjectCode
    const deleteResult = await collection.deleteMany({
      $or: [
        { subjectCode: null },
        { subjectCode: "" },
        { subjectCode: { $exists: false } }
      ]
    });
    console.log(`Removed ${deleteResult.deletedCount} corrupted subject entries.`);

    // 4. Rebuild unique index with sparse flag (prevents null collisions)
    await collection.createIndex({ subjectCode: 1 }, { unique: true, sparse: true });
    console.log("Rebuilt clean unique index on subjectCode.");

    console.log("Database cleanup completed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Index cleanup error:", err);
    process.exit(1);
  }
}

fixIndexes();