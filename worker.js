#!/usr/bin/env node
// src/worker.js

const { claimNextJob, markCompleted, markFailedOrRetry } = require('./jobModel');
const { getConfig, DEFAULTS } = require('./config');
const { sleep } = require('./utils');
const util = require('util');
const child = require('child_process');
const execP = util.promisify(child.exec);
const { MongoClient } = require('mongodb');
require('dotenv').config();

let shuttingDown = false;
let currentJobId = null;

// Handle termination signals gracefully
process.on('SIGTERM', () => { shuttingDown = true; console.log('[worker] SIGTERM'); });
process.on('SIGINT', () => { shuttingDown = true; console.log('[worker] SIGINT'); });

// Crash-safety: if worker exits unexpectedly, mark current processing jobs as failed
process.on('exit', async (code) => {
  if (code !== 0) {
    try {
      const client = new MongoClient(process.env.MONGO_URL);
      await client.connect();
      const db = client.db(process.env.DB_NAME);
      const res = await db.collection('jobs').updateMany(
        { state: 'processing' },
        { $set: { state: 'failed', error: 'Worker exited unexpectedly' } }
      );
      if (res.modifiedCount > 0)
        console.log(`[worker ${process.pid}] marked ${res.modifiedCount} job(s) failed on exit`);
      await client.close();
    } catch (e) {
      console.error(`[worker ${process.pid}] exit handler error:`, e.message);
    }
  }
});

async function getBackoffBase() {
  const v = await getConfig('backoffBase');
  return v ? Number(v) : DEFAULTS.backoffBase;
}

async function loop(pollIntervalMs = 1000) {
  const backoffBase = await getBackoffBase();
  console.log(`[worker ${process.pid}] started, backoffBase=${backoffBase}`);

  // Set maximum allowed job runtime (30 seconds)
  const JOB_TIMEOUT_MS = 30000;

  while (!shuttingDown) {
    try {
      const job = await claimNextJob();
      if (!job) {
        await sleep(pollIntervalMs);
        continue;
      }

      currentJobId = job._id;
      console.log(`[worker ${process.pid}] executing job ${job._id}: ${job.command}`);

      try {
        // ✅ Use cmd.exe on Windows to avoid PowerShell hanging issues
        const shellOption = process.platform === "win32" ? "cmd.exe" : "/bin/sh";

        // Execute command with timeout protection
        const { stdout, stderr } = await execP(job.command, {
          shell: shellOption,
          timeout: JOB_TIMEOUT_MS, // auto-fail after 30 seconds
        });

        const output = (stdout || '') + (stderr || '');
        await markCompleted(job._id, output);
        console.log(`[worker ${process.pid}] completed ${job._id}`);
      } catch (err) {
        const message = (err && (err.stderr || err.message)) ? (err.stderr || err.message) : String(err);
        console.log(`[worker ${process.pid}] failed ${job._id}: ${message}`);
        await markFailedOrRetry(job._id, job.attempts, job.maxRetries, message, backoffBase);
      }

      currentJobId = null; // Clear after job finishes
    } catch (outer) {
      console.error(`[worker ${process.pid}] loop error:`, outer);
      await sleep(1000);
    }
  }

  console.log(`[worker ${process.pid}] exiting gracefully.`);
}

if (require.main === module) {
  const interval = process.argv[2] ? Number(process.argv[2]) : 1000;
  loop(interval).catch(e => {
    console.error('worker fatal', e);
    process.exit(1);
  });
}

module.exports = { loop };
