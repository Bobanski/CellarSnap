import type { HomeApiResponse } from '../../../../../packages/shared/src/home';
import { hasProjectedSlides, isOwnerRating, isPublicRatingLabel, isRecord, readProjected, type ProjectedReadDependencies } from './projectedRead';

export function createHomeFetcher(dependencies: ProjectedReadDependencies) {
  return (viewerUserId: string) => readProjected(dependencies, '/api/home', (body): body is HomeApiResponse => {
    if (!isRecord(body) || body.viewer_user_id !== viewerUserId ||
      !Array.isArray(body.recentEntries) || !Array.isArray(body.circleEntries)) return false;
    const validEntry = (entry: unknown) => isRecord(entry) && typeof entry.id === 'string' &&
      Array.isArray(entry.tasted_with_names) && hasProjectedSlides(entry) && isPublicRatingLabel(entry.public_rating_label);
    return body.recentEntries.every(entry => validEntry(entry) && entry.user_id === viewerUserId && isOwnerRating(entry.rating)) &&
      body.circleEntries.every(entry => validEntry(entry) && typeof entry.user_id === 'string' && entry.rating === null);
  });
}
