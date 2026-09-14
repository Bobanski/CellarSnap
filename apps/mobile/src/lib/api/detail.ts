import { PHOTO_DELIVERY_HEADERS, getAccessTokenForApi, getWebApiBaseUrl } from '@/src/lib/api/webApi';
import { createDetailFetcher } from './detailRequest';

export const fetchMobileEntryDetail = createDetailFetcher({
  getBaseUrl: getWebApiBaseUrl, getAccessToken: getAccessTokenForApi, photoHeaders: PHOTO_DELIVERY_HEADERS,
});
