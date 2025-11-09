// src/db.js
const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
dotenv.config();

const MONGO_URL = process.env.MONGO_URL;
const DB_NAME = process.env.DB_NAME || 'queuectl';

if (!MONGO_URL) {
  console.error("MONGO_URL not set in .env. See .env.example");
  process.exit(1);
}

let client;
let db;

async function connect() {
  if (db) return db;
  client = new MongoClient(MONGO_URL, { useUnifiedTopology: true });
  await client.connect();
  db = client.db(DB_NAME);

  // indexes
  await db.collection('jobs').createIndex({ state: 1, runAt: 1, createdAt: 1 });
  await db.collection('jobs').createIndex({ createdAt: 1 });
  await db.collection('config').createIndex({ key: 1 }, { unique: true });

  return db;
}

async function close() {
  if (client) await client.close();
  client = null;
  db = null;
}

module.exports = { connect, close };
