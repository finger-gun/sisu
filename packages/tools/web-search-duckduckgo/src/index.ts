import type { Tool } from "@sisu-ai/core";
import { z } from "zod";

export interface DuckDuckGoSearchArgs {
  query: string;
}

interface DDGIcon {
  Height?: string | number;
  Width?: string | number;
  URL?: string;
}
interface DDGTopic {
  FirstURL: string;
  Text: string;
  Icon?: DDGIcon;
  Result?: string;
}
interface DDGTopicGroup {
  Name?: string;
  Topics: DDGTopic[];
}
type DDGRelated = Array<DDGTopic | DDGTopicGroup>;
interface DDGResponse {
  Heading?: string;
  Abstract?: string;
  AbstractText?: string;
  AbstractURL?: string;
  RelatedTopics?: DDGRelated;
  Results?: unknown[];
  Type?: string;
}

export interface DuckDuckGoResultItem {
  title: string;
  url: string;
  iconUrl?: string;
}

export const duckDuckGoWebSearch: Tool<DuckDuckGoSearchArgs> = {
  name: "webSearch",
  description: "Search the web using the DuckDuckGo Instant Answer API.",
  schema: z.object({ query: z.string() }),
  handler: async ({ query }) => {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;
    const res = await fetch(url);
    if (!res.ok)
      throw new Error(
        `DuckDuckGo search failed: ${res.status} ${res.statusText}`,
      );
    const data = (await res.json()) as DDGResponse;
    const topics = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [];

    // Flatten groups and plain topics
    const flat: DDGTopic[] = [];
    for (const entry of topics) {
      const maybeGroup = entry as DDGTopicGroup;
      if (maybeGroup && Array.isArray(maybeGroup.Topics)) {
        flat.push(...maybeGroup.Topics);
      } else {
        flat.push(entry as DDGTopic);
      }
    }

    const toAbsoluteIcon = (icon?: DDGIcon): string | undefined => {
      const u = icon?.URL || "";
      if (!u) return undefined;
      if (u.startsWith("http://") || u.startsWith("https://")) return u;
      if (u.startsWith("/")) return `https://duckduckgo.com${u}`;
      return u;
    };

    const results: DuckDuckGoResultItem[] = flat
      .filter((t) => Boolean(t?.Text) && Boolean(t?.FirstURL))
      .map((t) => ({
        title: String(t.Text),
        url: String(t.FirstURL),
        iconUrl: toAbsoluteIcon(t.Icon),
      }))
      // Deduplicate by URL (DDG sometimes repeats items across groups)
      .reduce<DuckDuckGoResultItem[]>(
        (acc, cur) =>
          acc.find((x) => x.url === cur.url) ? acc : acc.concat(cur),
        [],
      )
      .slice(0, 8);

    return results;
  },
};

export default duckDuckGoWebSearch;
