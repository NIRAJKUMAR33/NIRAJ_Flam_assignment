// src/config.js
const { connect } = require('./db');

const DEFAULTS = {
  backoffBase: 2,
  defaultMaxRetries: 3
};

async function getConfig(key) {
  const db = await connect();
  const doc = await db.collection('config').findOne({ key });
  if (!doc) return DEFAULTS[key] ?? null;
  return doc.value;
}

async function setConfig(key, value) {
  const db = await connect();
  await db.collection('config').updateOne(
    { key },
    { $set: { key, value: String(value) } },
    { upsert: true }
  );
}

async function getAll() {
  const db = await connect();
  const rows = await db.collection('config').find({}).toArray();
  const out = { ...DEFAULTS };
  rows.forEach(r => {
    out[r.key] = isNaN(r.value) ? r.value : Number(r.value);
  });
  return out;
}

module.exports = { getConfig, setConfig, getAll, DEFAULTS };
