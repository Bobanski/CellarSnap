/** Cookie clients can use same-origin, request-authorized image delivery.
 * Bearer/native clients retain their existing response contract until adoption. */
const cookieClients = new WeakSet<object>();
export function registerCookiePhotoClient<T extends object>(client: T): T {
  cookieClients.add(client);
  return client;
}
export function usesCookiePhotoDelivery(client: object) {
  return cookieClients.has(client);
}

export function authenticatedPhotoUrl(path: string, variant: 'display' | 'original' = 'display') {
  return `/api/photos/image?path=${encodeURIComponent(path)}&variant=${variant}`;
}

export function isValidPhotoPath(path: string) {
  return path.length > 0 && path.length <= 2048 && path !== 'pending' &&
    !/[\\\x00-\x1f\x7f]/.test(path) &&
    path.split('/').every(segment => segment && segment !== '.' && segment !== '..');
}
