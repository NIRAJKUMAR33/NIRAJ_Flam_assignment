// src/resetProcessing.js
require('dotenv').config();
const { MongoClient } = require('mongodb');

(async () => {
  try {
    const client = new MongoClient(process.env.MONGO_URL);
    await client.connect();
    const db = client.db(process.env.DB_NAME);

    const result = await db.collection('jobs').updateMany(
      { state: 'processing' },
      { $set: { state: 'pending' } }
    );

    console.log(`✅ Reset ${result.modifiedCount} job(s) from processing → pending`);
    await client.close();
  } catch (err) {
    console.error('❌ Error resetting jobs:', err.message);
  }
})();
