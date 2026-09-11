const mongoose = require('mongoose');
const dns = require('dns');

// Force Node.js to use IPv4 DNS resolution first (resolves querySrv ECONNREFUSED
// on networks that mangle or block IPv6/AAAA lookups for SRV records).
dns.setDefaultResultOrder('ipv4first');

// Explicit resolver override: some corporate/home routers or VPNs intercept
// or refuse the default OS resolver's SRV queries against mongodb.net.
// Google's actual primary/secondary pair — more consistently reachable
// than mixing providers.
dns.setServers(['8.8.8.8', '8.8.4.4']);

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

mongoose.set('strictQuery', true);

/**
 * Connects to MongoDB Atlas with retry/backoff, since M0 clusters can be
 * slow to resume from an idle/paused state and DNS SRV lookups can
 * occasionally hiccup on first boot.
 */
async function connectDB(retriesLeft = MAX_RETRIES) {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.error('[db] MONGO_URI is not set. Check /services/api/.env against .env.example.');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri, {
      // Keep pool small & bounded — M0 free tier caps total connections
      // across ALL apps/devs sharing the cluster.
      maxPoolSize: 10,
      minPoolSize: 1,

      // Fail fast instead of hanging silently if Atlas is unreachable
      // (wrong IP whitelist, wrong credentials, DNS issue, etc.)
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 45000,

      // Ensure writes are acknowledged — matches the hash-chain integrity
      // requirements of Report.js / AuditLog.js.
      retryWrites: true,
    });

    const { host, name } = mongoose.connection;
    console.log(`[db] Connected to MongoDB Atlas — host: ${host}, database: ${name}`);
  } catch (error) {
    console.error(`[db] Connection attempt failed: ${error.message}`);

    if (retriesLeft > 0) {
      console.warn(
        `[db] Retrying in ${RETRY_DELAY_MS / 1000}s... (${retriesLeft} attempt(s) left)`
      );
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return connectDB(retriesLeft - 1);
    }

    console.error('[db] Exhausted all retries. Exiting process.');
    console.error(
      '[db] Checklist: (1) Is your IP whitelisted in Atlas Network Access? ' +
        '(2) Is the password in MONGO_URI URL-encoded? ' +
        '(3) Is the Atlas cluster running (not paused)? ' +
        '(4) Is a VPN/corporate DNS blocking SRV lookups — try disabling it or use the non-SRV connection string.'
    );
    process.exit(1);
  }
}

// Diagnostic listeners — surface mid-session issues (not just startup failures)
mongoose.connection.on('error', (error) => {
  console.error(`[db] Mongoose connection error: ${error.message}`);
});

mongoose.connection.on('disconnected', () => {
  console.warn('[db] Mongoose disconnected from MongoDB Atlas.');
});

mongoose.connection.on('reconnected', () => {
  console.log('[db] Mongoose reconnected to MongoDB Atlas.');
});

/**
 * Graceful shutdown — closes the Mongoose connection cleanly on process
 * termination so Atlas doesn't accumulate orphaned connections against
 * the shared free-tier cap.
 */
async function disconnectDB() {
  await mongoose.connection.close();
  console.log('[db] MongoDB connection closed gracefully.');
}

process.on('SIGINT', async () => {
  await disconnectDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnectDB();
  process.exit(0);
});

module.exports = { connectDB, disconnectDB };