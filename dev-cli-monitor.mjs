#!/usr/bin/env node

import { spawn } from 'child_process';
import { platform } from 'os';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

// Process state
let serverProcess = null;
let clientProcess = null;
let serverReady = false;
let startTime = Date.now();
let monitorInterval = null;

// Stats tracking
const stats = {
  server: { started: null, ready: null, pid: null },
  client: { started: null, ready: null, pid: null },
};

// Utility functions
function formatTime() {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  return `${colors.dim}[${elapsed}s]${colors.reset}`;
}

function log(prefix, color, message) {
  const timestamp = formatTime();
  console.log(`${timestamp} ${color}${prefix}${colors.reset} ${message}`);
}

function logServer(message) {
  log('[SERVER]', colors.blue, message);
}

function logClient(message) {
  log('[CLIENT]', colors.magenta, message);
}

function logSystem(message) {
  log('[SYSTEM]', colors.cyan, message);
}

function logError(prefix, message) {
  log(prefix, colors.red, message);
}

function logMonitor(message) {
  log('[MONITOR]', colors.yellow, message);
}

// Process monitoring (basic - works cross-platform)
async function getProcessInfo(pid) {
  if (!pid) return null;

  try {
    // Check if process exists
    process.kill(pid, 0);
    return { pid, exists: true };
  } catch (e) {
    return { pid, exists: false };
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

// Start monitoring
function startMonitoring() {
  let lastLog = 0;
  const LOG_INTERVAL = 10000; // Log every 10 seconds

  monitorInterval = setInterval(async () => {
    const now = Date.now();

    if (now - lastLog >= LOG_INTERVAL) {
      const serverInfo = await getProcessInfo(stats.server.pid);
      const clientInfo = await getProcessInfo(stats.client.pid);

      if (serverInfo?.exists || clientInfo?.exists) {
        const uptime = ((now - startTime) / 1000).toFixed(0);
        let statusParts = [`Uptime: ${uptime}s`];

        if (serverInfo?.exists) {
          statusParts.push(`Server PID: ${serverInfo.pid}`);
        }
        if (clientInfo?.exists) {
          statusParts.push(`Client PID: ${clientInfo.pid}`);
        }

        logMonitor(statusParts.join(' | '));
      }

      lastLog = now;
    }
  }, 1000);
}

// Process cleanup
function cleanup() {
  logSystem('Shutting down processes...');

  if (monitorInterval) {
    clearInterval(monitorInterval);
  }

  if (clientProcess) {
    clientProcess.kill();
  }

  if (serverProcess) {
    serverProcess.kill();
  }

  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Start server process
function startServer() {
  logSystem('Starting server...');
  stats.server.started = Date.now();

  const isWindows = platform() === 'win32';
  const npmCmd = isWindows ? 'npm.cmd' : 'npm';

  serverProcess = spawn(npmCmd, ['run', 'server:dev'], {
    stdio: 'pipe',
    shell: isWindows,
  });

  stats.server.pid = serverProcess.pid;
  logSystem(`Server PID: ${colors.bright}${serverProcess.pid}${colors.reset}`);

  serverProcess.stdout.on('data', (data) => {
    const output = data.toString();
    output.split('\n').forEach((line) => {
      if (line.trim()) {
        logServer(line);

        // Check for ready message
        if (!serverReady && line.includes('Server is ready! (HTTPS)')) {
          serverReady = true;
          stats.server.ready = Date.now();
          const readyTime = ((stats.server.ready - stats.server.started) / 1000).toFixed(1);
          logSystem(`${colors.green}Server ready in ${readyTime}s${colors.reset}`);
          startClient();
        }
      }
    });
  });

  serverProcess.stderr.on('data', (data) => {
    const output = data.toString();
    output.split('\n').forEach((line) => {
      if (line.trim()) {
        logError('[SERVER]', line);
      }
    });
  });

  serverProcess.on('error', (error) => {
    logError('[SERVER]', `Failed to start: ${error.message}`);
    process.exit(1);
  });

  serverProcess.on('exit', (code, signal) => {
    if (code !== null) {
      logError('[SERVER]', `Exited with code ${code}`);
    } else if (signal) {
      logSystem(`Server killed with signal ${signal}`);
    }

    if (!serverReady) {
      logError('[SYSTEM]', 'Server exited before becoming ready');
      process.exit(1);
    }
  });
}

// Start client process
function startClient() {
  logSystem('Starting client...');
  stats.client.started = Date.now();

  const isWindows = platform() === 'win32';
  const npmCmd = isWindows ? 'npm.cmd' : 'npm';

  clientProcess = spawn(npmCmd, ['run', 'client:dev'], {
    stdio: 'pipe',
    shell: isWindows,
  });

  stats.client.pid = clientProcess.pid;
  logSystem(`Client PID: ${colors.bright}${clientProcess.pid}${colors.reset}`);

  clientProcess.stdout.on('data', (data) => {
    const output = data.toString();
    output.split('\n').forEach((line) => {
      if (line.trim()) {
        logClient(line);

        // Detect when Vite is ready
        if (!stats.client.ready && (line.includes('Local:') || line.includes('ready in'))) {
          stats.client.ready = Date.now();
          const readyTime = ((stats.client.ready - stats.client.started) / 1000).toFixed(1);
          logSystem(`${colors.green}Client ready in ${readyTime}s${colors.reset}`);
          printSummary();
          startMonitoring();
        }
      }
    });
  });

  clientProcess.stderr.on('data', (data) => {
    const output = data.toString();
    output.split('\n').forEach((line) => {
      if (line.trim()) {
        logError('[CLIENT]', line);
      }
    });
  });

  clientProcess.on('error', (error) => {
    logError('[CLIENT]', `Failed to start: ${error.message}`);
  });

  clientProcess.on('exit', (code, signal) => {
    if (code !== null) {
      logError('[CLIENT]', `Exited with code ${code}`);
    } else if (signal) {
      logSystem(`Client killed with signal ${signal}`);
    }
  });
}

// Print startup summary
function printSummary() {
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '='.repeat(70));
  logSystem(`${colors.green}${colors.bright}All services ready!${colors.reset}`);
  logSystem(`Total startup time: ${colors.bright}${totalTime}s${colors.reset}`);
  logSystem(`Server PID: ${colors.bright}${stats.server.pid}${colors.reset} | Client PID: ${colors.bright}${stats.client.pid}${colors.reset}`);
  logSystem(`${colors.gray}Press Ctrl+C to stop all processes${colors.reset}`);
  console.log('='.repeat(70) + '\n');
}

// Start the application
console.clear();
console.log(`${colors.cyan}${colors.bright}
╔═══════════════════════════════════════════════════════════════════╗
║           Nodius Development Environment (with Monitor)          ║
╚═══════════════════════════════════════════════════════════════════╝
${colors.reset}`);

logSystem('Initializing development environment...');
startServer();
