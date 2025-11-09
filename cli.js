#!/usr/bin/env node
// src/cli.js
const { program } = require('commander');
const controller = require('./controller');
const { connect, close } = require('./db');

program.name('queuectl').description('CLI for queuectl job queue (Node + MongoDB Atlas)').version('1.0.0');

program
  .command('enqueue')
  .argument('<jobJson>')
  .description('Enqueue a job JSON: e.g. \'{"command":"sleep 2"}\'')
  .action(async (jobJson) => {
    try { await connect(); const doc = await controller.enqueue(jobJson); console.log('Enqueued job', doc._id); }
    catch (e) { console.error('Error enqueue:', e.message); }
    finally { await close(); }
  });

program
  .command('worker-start')
  .option('-c, --count <n>', 'number of worker processes', '1')
  .description('Start background worker processes')
  .action(async (opts) => {
    const { spawn } = require('child_process');
    const path = require('path');
    const manager = path.resolve(__dirname, 'workerManager.js');
    const args = ['start', '--count', opts.count];
    const child = spawn(process.execPath, [manager, ...args], { stdio: 'inherit' });
    child.on('exit', (code) => process.exit(code));
  });

program
  .command('worker-stop')
  .description('Stop background workers')
  .action(async () => {
    const { spawn } = require('child_process');
    const path = require('path');
    const manager = path.resolve(__dirname, 'workerManager.js');
    const child = spawn(process.execPath, [manager, 'stop'], { stdio: 'inherit' });
    child.on('exit', (code) => process.exit(code));
  });

program
  .command('list')
  .option('--state <state>', 'filter by state')
  .description('List jobs (optionally --state pending|processing|completed|dead)')
  .action(async (opts) => {
    await connect();
    const rows = await controller.list(opts.state);
    for (const r of rows) console.log(JSON.stringify(r));
    await close();
  });

program
  .command('status')
  .description('Show job state counts')
  .action(async () => {
    await connect();
    const s = await controller.status();
    console.log('Job states:', s);
    await close();
  });

program
  .command('dlq-list')
  .description('List DLQ (dead) jobs')
  .action(async () => {
    await connect();
    const rows = await controller.dlqList();
    for (const r of rows) console.log(JSON.stringify(r));
    await close();
  });

program
  .command('dlq-retry')
  .argument('<jobId>')
  .description('Retry a DLQ job (move to pending, reset attempts)')
  .action(async (jobId) => {
    await connect();
    const ok = await controller.dlqRetry(jobId);
    console.log(ok ? 'Retried' : 'Job not found / not dead');
    await close();
  });

program
  .command('config-set')
  .argument('<key>')
  .argument('<value>')
  .description('Set configuration (backoffBase, defaultMaxRetries)')
  .action(async (key, value) => {
    await connect();
    await controller.setConfig(key, value);
    console.log('Set', key, '=', value);
    await close();
  });

program
  .command('config-get')
  .argument('<key>')
  .description('Get configuration value')
  .action(async (key) => {
    await connect();
    const v = await controller.getConfig(key);
    console.log(v);
    await close();
  });

program.parse(process.argv);
