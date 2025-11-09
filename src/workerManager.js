#!/usr/bin/env node
// src/workerManager.js

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const PIDFILE = path.resolve(__dirname, '..', 'pidfile', 'workers.pid');
const WORKER_SCRIPT = path.resolve(__dirname, 'worker.js');

// 🧠 Helper function: reset jobs stuck in "processing" state
async function resetProcessingJobs() {
  try {
    const client = new MongoClient(process.env.MONGO_URL);
    await client.connect();
    const db = client.db(process.env.DB_NAME);
    const res = await db.collection('jobs').updateMany(
      { state: 'processing' },
      { $set: { state: 'pending' } }
    );
    if (res.modifiedCount > 0) {
      console.log(`[workerManager] Auto-reset ${res.modifiedCount} job(s) from processing → pending`);
    } else {
      console.log('[workerManager] No stuck jobs found.');
    }
    await client.close();
  } catch (err) {
    console.error('[workerManager] Auto-reset error:', err.message);
  }
}

program
  .command('start')
  .option('--count <n>', 'number of workers', '1')
  .action(async (opts) => {
    // 🧩 Step 1: reset stuck jobs automatically before spawning workers
    await resetProcessingJobs();

    const count = Number(opts.count || 1);
    const pids = [];
    fs.mkdirSync(path.dirname(PIDFILE), { recursive: true });

    // 🧩 Step 2: spawn requested number of workers
    for (let i = 0; i < count; ++i) {
      const child = spawn(process.execPath, [WORKER_SCRIPT], {
        detached: true,
        stdio: ['ignore', 'inherit', 'inherit']
      });
      child.unref();
      pids.push(child.pid);
      console.log(`[workerManager] Spawned worker pid=${child.pid}`);
    }

    // 🧩 Step 3: write all worker PIDs to file
    fs.writeFileSync(PIDFILE, pids.join('\n'));
    console.log(`[workerManager] Wrote pidfile ${PIDFILE}`);
  });

program
  .command('stop')
  .action(() => {
    if (!fs.existsSync(PIDFILE)) {
      console.log('[workerManager] No pidfile found.');
      process.exit(0);
    }

    const content = fs.readFileSync(PIDFILE, 'utf8');
    const lines = content.split(/\r?\n/).filter(Boolean);

    for (const l of lines) {
      const pid = Number(l);
      try {
        process.kill(pid, 'SIGTERM');
        console.log(`[workerManager] Sent SIGTERM to ${pid}`);
      } catch (e) {
        console.log(`[workerManager] Could not kill ${pid}: ${e.message}`);
      }
    }

    fs.unlinkSync(PIDFILE);
    console.log('[workerManager] Stopped workers and removed pidfile.');
  });

program.parse(process.argv);
