import { activitySummarySchema } from '@cellarsnap/shared';
import { getAccessTokenForApi, getWebApiBaseUrl } from './webApi';

export async function fetchActivitySummary() {
  const base=getWebApiBaseUrl();
  if(!base)throw new Error("Activity API is unavailable.");
  const token=await getAccessTokenForApi();
  if(!token)throw new Error('Sign in to load activity counts.');
  const response=await fetch(`${base}/api/profile/summary`,{
    headers:{Authorization:`Bearer ${token}`},cache:'no-store',
  });
  if(!response.ok)throw new Error('Unable to load activity counts.');
  return activitySummarySchema.parse(await response.json());
}
