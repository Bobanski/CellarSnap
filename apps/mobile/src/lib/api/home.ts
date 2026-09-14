import { PHOTO_DELIVERY_HEADERS, getAccessTokenForApi, getWebApiBaseUrl } from '@/src/lib/api/webApi';
import { createHomeFetcher } from './homeRequest';

export const fetchMobileHomeFromApi = createHomeFetcher({
  getBaseUrl: getWebApiBaseUrl, getAccessToken: getAccessTokenForApi, photoHeaders: PHOTO_DELIVERY_HEADERS,
});
