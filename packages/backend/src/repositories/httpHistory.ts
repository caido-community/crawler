import type { BackendSDK } from "../types";

const HISTORY_PAGE_SIZE = 1000;

export async function getSeedUrlsFromHistory(
  sdk: BackendSDK,
  host: string,
): Promise<string[]> {
  if (host.trim() === "") {
    return [];
  }

  const seen = new Set<string>();
  const urls: string[] = [];
  let cursor: string | undefined;

  try {
    while (true) {
      let query = sdk.requests
        .query()
        .filter(`req.host.eq:"${host}"`)
        .first(HISTORY_PAGE_SIZE)
        .ascending("req", "created_at");

      if (cursor !== undefined) {
        query = query.after(cursor);
      }

      const connection = await query.execute();

      for (const item of connection.items) {
        const request = item.request;
        if (request.getMethod() !== "GET") {
          continue;
        }
        const url = request.getUrl();
        if (url !== undefined && url.trim() !== "" && !seen.has(url)) {
          seen.add(url);
          urls.push(url);
        }
      }

      if (connection.pageInfo.hasNextPage) {
        cursor = connection.pageInfo.endCursor;
        if (cursor === undefined) {
          break;
        }
      } else {
        break;
      }
    }

    return urls;
  } catch {
    return [];
  }
}
