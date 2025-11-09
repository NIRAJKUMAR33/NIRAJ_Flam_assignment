QueueCTL 
(Node.js + MongoDB Atlas)
Tech Stack
Node.js v22 + MongoDB Atlas + Commander CLI

Objective
Implement a minimal, production-ready background-job engine supporting:

Job enqueueing
Multiple parallel workers
Retry with exponential backoff
Dead Letter Queue (DLQ)
Persistent storage in MongoDB Atlas
CLI commands for all operations
Job Specification
Each job document looks like:

{
  "id": "unique-job-id",
  "command": "echo 'Hello World'",
  "state": "pending",
  "attempts": 0,
  "max_retries": 3,
  "created_at": "2025-11-04T10:30:00Z",
  "updated_at": "2025-11-04T10:30:00Z"
}

##  Objective

enqueue the job  
Multiple parallel workers  
Retry with exponential backoff  
Dead Letter Queue (DLQ)  
Persistent storage in MongoDB Atlas  
CLI commands for all operations  

## Job Lifecycle

State	            
   Meaning
pending         	
   Waiting for a worker
processing	        
   Being executed
completed	        
   Command executed successfully
failed	            
   Temporary failure (will retry)
dead	            
   Permanently failed (moved to DLQ)


## Step-by-Step Setup (Windows + VS Code + Atlas)

1.
git clone 
cd queuectl-node
npm install

2 
Create .env

Copy .env.example → .env and fill in your Atlas URI:

MONGO_URL=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/queuectl?retryWrites=true&w=majority
DB_NAME=queuectl
NODE_TLS_REJECT_UNAUTHORIZED=0


NODE_TLS_REJECT_UNAUTHORIZED=0 disables strict TLS checks — safe for local testing only. Remove it in production.

3
Verify Atlas connectivity
node -e "require('dotenv').config(); const { MongoClient } = require('mongodb'); new MongoClient(process.env.MONGO_URL).connect().then(()=>console.log('Connected OK')).catch(e=>console.error( e.message));"


Expected → Connected OK

Quick Usage
Enqueue a job

(Windows command-prompt-safe)

   node src/cli.js enqueue "{""command"":""echo Hello from Atlas && timeout /t 1 >nul""}"

Start workers
   node src/workerManager.js start --count 2

Check status
   node src/cli.js status

List jobs by state
   node src/cli.js list --state pending
   node src/cli.js list --state completed

DLQ operations
   node src/cli.js dlq-list
   node src/cli.js dlq-retry <job-id>

Stop workers
   node src/workerManager.js stop

Testing Failure + DLQ

Enqueue a job that always fails:

   node src/cli.js enqueue "{""id"":""fail-job-1"",""command"":""cmd /c exit 1"",""maxRetries"":2}"


Start worker and observe retries:

   node src/workerManager.js start --count 1
   node src/cli.js status
   node src/cli.js dlq-list


Retry DLQ job manually:

   node src/cli.js dlq-retry fail-job-1


---

## Project Structure

queuectl-node/
├─ .env.example
├─ .env
├─ package.json
├─ src/
│  ├─ cli.js              # CLI command definitions (Commander)
│  ├─ controller.js       # High-level actions mapped to CLI
│  ├─ config.js           # Global config (retry, backoff)
│  ├─ db.js               # MongoDB connection + index setup
│  ├─ jobModel.js         # DB operations (insert, update, DLQ)
│  ├─ worker.js           # Worker loop (execute, retry/backoff)
│  ├─ workerManager.js    # Start/stop worker processes
│  └─ utils.js            # Helpers (sleep, timestamp)
├─ pidfile/
│  └─ workers.pid
├─ tests/
│  └─ quick-test.bat      # End-to-end Windows test script
└─ README.md

---

##  Architecture Overview

┌──────────────┐      enqueue       ┌─────────────┐
│  CLI (user)  │ ─────────────────▶ │ MongoDB Jobs│
└──────┬───────┘                    └──────┬──────┘
       │                                    │
       │ fetch pending                      │ update
       ▼                                    ▼
 ┌──────────────┐   execute cmd   ┌─────────────────┐
 │  Worker(s)   │────────────────▶│  System Shell   │
 └──────────────┘◀────────────────└─────────────────┘
       │ update
       ▼
 ┌──────────────┐
 │ DLQ / Status │
 └──────────────┘

---

## Windows-Specific Notes

Use Command Prompt (cmd.exe) in VS Code for running commands with &&, > and timeout.

Commands examples:

Success → echo Hello && timeout /t 1 >nul

Failure → cmd /c exit 1

Worker execution enforces shell: "cmd.exe" to avoid PowerShell hangs.

process.kill(pid, 'SIGTERM') is used to stop workers — acceptable for development on Windows.

For testing, add 0.0.0.0/0 to Atlas IP whitelist; restrict before production.

Testing Checklist

---

#	Scenario	Expected


1	Enqueue simple job	Moves to completed
2	Enqueue failing job	Retries with backoff → dead (DLQ)
3	Multiple workers	No duplicate execution
4	Stop workers mid-run	Worker finishes current job then exits
5	Restart app	Pending jobs persist in Atlas DB

---

## Author

Niraj Kumar
M.Tech (CSE) @ NIT Jamshedpur
nirajnk1516@gmail.com
8651587979

