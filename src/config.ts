import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";

const AppConfigSchema = z.object({
  apiBaseUrl: z.url(),
  userAgent: z.string().min(1),
  auth: z.object({
    tokenUrl: z.url(),
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    scope: z.string().min(1),
  }),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

const DEFAULT_CONFIG_PATH = "config/sanamcp.local.json";

function resolveConfigPath(configPath: string): string {
  if (isAbsolute(configPath)) {
    return configPath;
  }

  return resolve(process.cwd(), configPath);
}

export function loadAppConfig(): AppConfig {
  const configPath = resolveConfigPath(
    process.env.SANA_CONFIG_PATH || DEFAULT_CONFIG_PATH
  );

  if (!existsSync(configPath)) {
    throw new Error(
      `Config file not found: ${configPath}. Copy config/sanamcp.local.example.json to config/sanamcp.local.json and set your Cognito clientSecret.`
    );
  }

  const rawConfig = readFileSync(configPath, "utf-8");
  const parsedJson = JSON.parse(rawConfig) as unknown;

  return AppConfigSchema.parse(parsedJson);
}
