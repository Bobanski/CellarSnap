import { ownerLibraryPageSchema, type OwnerLibraryPage } from '../../../../../packages/shared/src/ownerLibrary';
import { readProjected, type ProjectedReadDependencies } from './projectedRead';

export function createLibraryFetcher(dependencies: ProjectedReadDependencies) {
  return (viewerUserId: string, cursor: string | null = null) => readProjected(dependencies,
    `/api/entries/library${cursor === null ? '' : `?cursor=${encodeURIComponent(cursor)}`}`,
    (body): body is OwnerLibraryPage => {
      const result = ownerLibraryPageSchema.safeParse(body);
      return result.success && result.data.viewer_user_id === viewerUserId &&
        (cursor === null || result.data.next_cursor !== cursor);
    });
}
