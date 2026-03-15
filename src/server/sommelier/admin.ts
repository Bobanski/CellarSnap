const ADMIN_ENV_KEYS = [
  "POCKET_SOMMELIER_ADMIN_USER_IDS",
  "CELLARSNAP_ADMIN_USER_IDS",
] as const;

function parseUserIds(value: string | undefined) {
  return new Set(
    (value ?? "")
      .split(/[,\s]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

export class SommelierAdminError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 403, code = "FORBIDDEN") {
    super(message);
    this.name = "SommelierAdminError";
    this.status = status;
    this.code = code;
  }
}

export function getSommelierAdminUserIds(env: NodeJS.ProcessEnv = process.env) {
  for (const key of ADMIN_ENV_KEYS) {
    const parsed = parseUserIds(env[key]);
    if (parsed.size > 0) {
      return parsed;
    }
  }

  return new Set<string>();
}

export function isSommelierAdminUser(
  userId: string,
  env: NodeJS.ProcessEnv = process.env
) {
  const adminUserIds = getSommelierAdminUserIds(env);
  return adminUserIds.size > 0 && adminUserIds.has(userId);
}

export function assertSommelierAdminUser(
  userId: string,
  env: NodeJS.ProcessEnv = process.env
) {
  const adminUserIds = getSommelierAdminUserIds(env);

  if (adminUserIds.size === 0) {
    throw new SommelierAdminError(
      "Sommelier admin access is not configured. Set POCKET_SOMMELIER_ADMIN_USER_IDS to enable ingestion.",
      503,
      "CONFIGURATION_REQUIRED"
    );
  }

  if (!adminUserIds.has(userId)) {
    throw new SommelierAdminError(
      "Only Pocket Sommelier admins can manage the knowledge base."
    );
  }
}
