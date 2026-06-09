/**
 * Vercel Entry Point for TanStack Start
 * This file bridges Vercel's Node.js runtime with TanStack Start's Nitro server
 */

const { createServer } = require('http');
const { fileURLToPath } = require('url');
const path = require('path');

// Import the server entry built by TanStack Start
let server;

async function getServer() {
  if (!server) {
    // The .output/server folder contains the Nitro server
    const serverModule = await import('./.output/server/index.mjs');
    server = serverModule.default || serverModule;
  }
  return server;
}

// Vercel serverless function handler
module.exports = async (req, res) => {
  try {
    const handler = await getServer();
    
    // Forward the request to the Nitro server
    if (typeof handler.fetch === 'function') {
      // H3/Nitro handler pattern
      const nodeHandler = handler.toNodeListener?.() || handler;
      return nodeHandler(req, res);
    }
    
    // Fallback for direct handler
    return handler(req, res);
  } catch (error) {
    console.error('Vercel handler error:', error);
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
};
