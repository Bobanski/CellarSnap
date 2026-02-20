export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 100;
export const USERNAME_DISALLOWED_PATTERN = /[\s@]/;

export const USERNAME_MIN_LENGTH_MESSAGE = `Username must be at least ${USERNAME_MIN_LENGTH} characters.`;
export const USERNAME_MAX_LENGTH_MESSAGE = `Username must be ${USERNAME_MAX_LENGTH} characters or fewer.`;
export const USERNAME_FORMAT_MESSAGE = "Username cannot contain spaces or '@'.";

export function isUsernameFormatValid(username: string): boolean {
  return !USERNAME_DISALLOWED_PATTERN.test(username);
}
