import { getAccessTokenForApi, getWebApiBaseUrl } from './webApi';
import { createEntryEditor } from './entryEditRequest';
export const saveMobileEntryDetails = createEntryEditor({ getBaseUrl: getWebApiBaseUrl, getAccessToken: getAccessTokenForApi });
