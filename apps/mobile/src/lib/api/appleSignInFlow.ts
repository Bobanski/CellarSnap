type AppleCredential = {
  identityToken: string | null;
  fullName?: { givenName?: string | null; familyName?: string | null } | null;
};

export async function exchangeAppleCredential<T>(dependencies: {
  randomNonce: () => string;
  hashNonce: (nonce: string) => Promise<string>;
  requestCredential: (hashedNonce: string) => Promise<AppleCredential>;
  exchange: (input: { provider: 'apple'; token: string; nonce: string }) => Promise<T>;
}) {
  const nonce = dependencies.randomNonce();
  // Expo forwards this value unchanged to Apple; Supabase hashes the raw nonce.
  const credential = await dependencies.requestCredential(await dependencies.hashNonce(nonce));
  if (!credential.identityToken) throw new Error('Apple Sign In failed - no identity token received.');
  const data = await dependencies.exchange({ provider: 'apple', token: credential.identityToken, nonce });
  return { data, credential };
}
