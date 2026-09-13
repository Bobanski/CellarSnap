import { activitySummarySchema } from '@shared';

export async function fetchActivitySummary() {
  const response=await fetch('/api/profile/summary',{cache:'no-store'});
  if(!response.ok)throw new Error('Unable to load activity counts.');
  return activitySummarySchema.parse(await response.json());
}
