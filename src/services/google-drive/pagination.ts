import { Effect } from "effect";
import type { drive_v3 } from "googleapis";
import { GoogleDriveFileError } from "./file.js";

// Helper to handle paginated API calls
export const fetchAllPages = (
  drive: drive_v3.Drive,
  listParams: drive_v3.Params$Resource$Files$List,
  options?: { showProgress?: boolean; maxPages?: number },
) =>
  Effect.gen(function* () {
    const allItems: drive_v3.Schema$File[] = [];
    let pageToken: string | undefined;
    let pageCount = 0;
    const showProgress = options?.showProgress ?? false;

    do {
      pageCount++;
      const params = { ...listParams };
      if (pageToken) {
        params.pageToken = pageToken;
      }

      const response = yield* Effect.tryPromise({
        try: () => drive.files.list(params),
        catch: (error) =>
          new GoogleDriveFileError({
            message: `Failed to fetch page: ${error}`,
          }),
      });

      const files = response.data.files || [];
      allItems.push(...files);

      if (showProgress || pageCount % 10 === 0) {
        console.log(
          `Page ${pageCount}: Fetched ${files.length} items, Total: ${allItems.length}`,
        );
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken && (!options?.maxPages || pageCount < options.maxPages));

    console.log(
      `✅ Finished fetching ${allItems.length} items across ${pageCount} pages`,
    );
    return allItems;
  });
