// src/controller.js
const { insertJob, listJobs, statusSummary, moveDlqRetry } = require('./jobModel');
const { getConfig, setConfig, getAll, DEFAULTS } = require('./config');
const { nowISO } = require('./utils');

async function enqueue(jsonStr) {
  let obj;
  try { obj = JSON.parse(jsonStr); } catch (e) { throw new Error('Invalid JSON: ' + e.message); }
  if (!obj.command) throw new Error('job must include "command"');
  const job = {
    id: obj.id || obj._id || (Date.now().toString() + Math.random().toString(36).slice(2,8)),
    command: obj.command,
    maxRetries: obj.maxRetries != null ? obj.maxRetries : obj.max_retries != null ? obj.max_retries : DEFAULTS.defaultMaxRetries,
    attempts: 0,
    state: 'pending',
    createdAt: obj.createdAt || nowISO(),
    runAt: obj.runAt || null
  };
  const doc = await insertJob(job);
  return doc;
}

async function list(state) { return listJobs({ state }); }
async function status() { return statusSummary(); }
async function dlqList() { return listJobs({ state: 'dead' }); }
async function dlqRetry(id) { return moveDlqRetry(id); }

module.exports = { enqueue, list, status, dlqList, dlqRetry, getConfig, setConfig, getAll };
