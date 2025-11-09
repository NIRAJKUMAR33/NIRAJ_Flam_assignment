// src/jobModel.js
const { connect } = require('./db');
const { nowISO } = require('./utils');

async function insertJob(job) {
  const db = await connect();
  const now = nowISO();
  const doc = {
    _id: job.id || job._id || (Date.now().toString() + Math.random().toString(36).slice(2,8)),
    command: job.command || '',
    state: job.state || 'pending',
    attempts: job.attempts || 0,
    maxRetries: job.maxRetries != null ? job.maxRetries : job.max_retries || 3,
    createdAt: job.createdAt || now,
    updatedAt: now,
    runAt: job.runAt || null,
    lastError: null,
    output: null
  };
  await db.collection('jobs').insertOne(doc);
  return doc;
}

async function listJobs(filter = {}) {
  const db = await connect();
  const q = {};
  if (filter.state) q.state = filter.state;
  return db.collection('jobs').find(q).sort({ createdAt: 1 }).toArray();
}

async function statusSummary() {
  const db = await connect();
  const pipeline = [{ $group: { _id: '$state', count: { $sum: 1 } } }];
  const rows = await db.collection('jobs').aggregate(pipeline).toArray();
  const res = {};
  rows.forEach(r => res[r._id] = r.count);
  return res;
}

// Atomically claim next pending job that's due
async function claimNextJob() {
  const db = await connect();
  const now = new Date().toISOString();
  const filter = {
    state: 'pending',
    $or: [{ runAt: null }, { runAt: { $lte: now } }]
  };
  const update = { $set: { state: 'processing', updatedAt: now } };
  const options = { sort: { createdAt: 1 }, returnDocument: 'after' };
  const result = await db.collection('jobs').findOneAndUpdate(filter, update, options);
  return result.value || null;
}

async function markCompleted(id, output) {
  const db = await connect();
  await db.collection('jobs').updateOne({ _id: id }, { $set: { state: 'completed', updatedAt: nowISO(), output, lastError: null } });
}

async function markFailedOrRetry(id, attempts, maxRetries, errorText, backoffBase) {
  const db = await connect();
  const attemptsNew = attempts + 1;
  if (attemptsNew > maxRetries) {
    await db.collection('jobs').updateOne({ _id: id }, { $set: { state: 'dead', attempts: attemptsNew, updatedAt: nowISO(), lastError: errorText } });
  } else {
    const delaySeconds = Math.pow(Number(backoffBase || 2), attemptsNew);
    const runAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
    await db.collection('jobs').updateOne({ _id: id }, { $set: { state: 'pending', attempts: attemptsNew, runAt, updatedAt: nowISO(), lastError: errorText } });
  }
}

async function moveDlqRetry(id) {
  const db = await connect();
  const res = await db.collection('jobs').updateOne({ _id: id, state: 'dead' }, { $set: { state: 'pending', attempts: 0, runAt: null, updatedAt: nowISO(), lastError: null } });
  return res.modifiedCount > 0;
}

module.exports = { insertJob, listJobs, statusSummary, claimNextJob, markCompleted, markFailedOrRetry, moveDlqRetry };
