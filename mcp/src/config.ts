import { z } from 'zod';

const ConfigSchema = z.object({
  DEVDIGEST_API_URL: z.string().url().default('http://localhost:3001'),
  DEVDIGEST_MCP_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
});

export interface Config {
  apiBaseUrl: string;
  timeoutMs: number;
}

export function loadConfig(): Config {
  const result = ConfigSchema.safeParse(process.env);
  if (!result.success) {
    const flattened = result.error.flatten();
    console.error('[devdigest-mcp] Invalid configuration:', JSON.stringify(flattened, null, 2));
    process.exit(1);
  }
  return {
    apiBaseUrl: result.data.DEVDIGEST_API_URL,
    timeoutMs: result.data.DEVDIGEST_MCP_TIMEOUT_MS,
  };
}
