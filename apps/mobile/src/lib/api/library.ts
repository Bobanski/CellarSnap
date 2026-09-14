import { PHOTO_DELIVERY_HEADERS, getAccessTokenForApi, getWebApiBaseUrl } from './webApi';
import { createLibraryFetcher } from './libraryRequest';

export const fetchMobileLibrary = createLibraryFetcher({
  getBaseUrl: getWebApiBaseUrl, getAccessToken: getAccessTokenForApi, photoHeaders: PHOTO_DELIVERY_HEADERS,
});
