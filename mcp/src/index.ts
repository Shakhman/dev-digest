#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { createApiClient } from './api-client.js';
import * as listAgents from './tools/list-agents.js';
import * as runAgentOnPr from './tools/run-agent-on-pr.js';
import * as getFindings from './tools/get-findings.js';
import * as getConventions from './tools/get-conventions.js';
import * as getBlastRadius from './tools/get-blast-radius.js';

process.on('uncaughtException', (err) => {
  console.error('[devdigest-mcp] Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[devdigest-mcp] Unhandled rejection:', reason);
  process.exit(1);
});

async function main(): Promise<void> {
  const config = loadConfig();
  const api = createApiClient(config.apiBaseUrl);
  const ctx = { api, config };

  const server = new McpServer({ name: 'devdigest', version: '0.1.0' });

  listAgents.register(server, ctx);
  runAgentOnPr.register(server, ctx);
  getFindings.register(server, ctx);
  getConventions.register(server, ctx);
  getBlastRadius.register(server, ctx);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('[devdigest-mcp] Fatal error:', err);
  process.exit(1);
});
