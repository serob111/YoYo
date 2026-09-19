#!/usr/bin/env node
// Throwaway local stub standing in for graph.instagram.com during load
// testing. Point worker-messaging's META_GRAPH_BASE_URL at this (see
// docker-compose.staging.yml / .env.staging) and every outbound-send call
// InstagramMessagingProvider.sendText() makes (POST
// {graphBaseUrl}/{version}/{accountId}/messages) gets a same-shaped
// {recipient_id, message_id} response after an artificial delay, with zero
// real Meta credentials and zero real messages sent.
//
// Usage: PORT=8089 STUB_DELAY_MS=150 node scripts/fake-graph-stub.js
const http = require("node:http");
const { randomUUID } = require("node:crypto");

const PORT = Number(process.env.PORT ?? 8089);
const DELAY_MS = Number(process.env.STUB_DELAY_MS ?? 150);

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || !req.url.endsWith("/messages")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "not found (fake-graph-stub only answers POST .../messages)" } }));
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    setTimeout(() => {
      let recipientId = "unknown";
      try {
        recipientId = JSON.parse(body)?.recipient?.id ?? "unknown";
      } catch {
        // Malformed body - respond anyway, matches "answer every send" contract.
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ recipient_id: recipientId, message_id: `fake_mid_${randomUUID()}` }));
    }, DELAY_MS);
  });
});

server.listen(PORT, () => {
  console.log(`fake-graph-stub listening on :${PORT} (delay ${DELAY_MS}ms)`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
