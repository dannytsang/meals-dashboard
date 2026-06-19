'use client';

import { DebugDataPanel } from './debug-data-panel';

type ProductResolutionPayload = {
  itemName: string;
  itemTpnc: string | null;
  itemBlobPath: string | null;
  title: string;
  description: string;
  storage: string;
  preparation: string;
  ingredients: string;
  allergens: string;
  nutrition: string;
  image: string;
  productUrl?: string;
  lastFetched?: string;
  expiresAt?: string;
  productSource: string;
  descriptionSource: string;
  freshness: { lastFetched?: string; firecrawlLastFetched?: string };
  provenance: { generated: boolean; local: boolean; firecrawl: boolean; firecrawlStatus: string | null };
};

export function ProductResolutionDebugPanel() {
  return (
    <DebugDataPanel<ProductResolutionPayload>
      title="Product Resolution"
      description="Shows how the currently inspected grocery item resolved its title, description, storage and freshness data across apollo, curated_static, firecrawl and placeholder fallbacks."
      endpoint="/api/debug/product-resolution"
      testId="product-resolution-debug-panel"
      rows={(data) => [
        { label: 'itemName', value: data.itemName },
        { label: 'itemTpnc', value: data.itemTpnc ?? 'unset' },
        { label: 'itemBlobPath', value: data.itemBlobPath ?? 'unset' },
        { label: 'productSource', value: data.productSource },
        { label: 'descriptionSource', value: data.descriptionSource },
        { label: 'title', value: data.title },
        { label: 'description', value: data.description },
        { label: 'storage', value: data.storage },
        { label: 'preparation', value: data.preparation || 'unset' },
        { label: 'ingredients', value: data.ingredients || 'unset' },
        { label: 'allergens', value: data.allergens || 'unset' },
        { label: 'nutrition', value: data.nutrition },
        { label: 'image', value: data.image || 'unset' },
        { label: 'productUrl', value: data.productUrl ?? 'unset' },
        { label: 'lastFetched', value: data.lastFetched ?? 'unset' },
        { label: 'expiresAt', value: data.expiresAt ?? 'unset' },
        { label: 'provenance', value: `generated=${String(data.provenance.generated)}, local=${String(data.provenance.local)}, firecrawl=${String(data.provenance.firecrawl)} (${data.provenance.firecrawlStatus ?? 'n/a'})` },
        { label: 'freshness', value: `lastFetched=${data.freshness.lastFetched ?? 'unset'}, firecrawlLastFetched=${data.freshness.firecrawlLastFetched ?? 'unset'}` },
      ]}
    />
  );
}
