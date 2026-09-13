export { authenticatedPhotoUrl, isValidPhotoPath } from '@shared/photoDelivery';
/** Cookie clients and explicitly adopted bearer clients use request delivery. */
const requestPhotoClients = new WeakSet<object>();
export function registerRequestPhotoClient<T extends object>(client: T): T {
  requestPhotoClients.add(client);
  return client;
}
export function usesRequestPhotoDelivery(client: object) {
  return requestPhotoClients.has(client);
}
