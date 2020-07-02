import { CxPackageBuilderOptions } from './schema';

export interface ProvisioningItem {
  name: string;
  itemType: ProvisioningItemType;
  location: string;
}

export type ProvisioningItemType = 'catalog';

export type CxPackageBuilderOptionsItem = CxPackageBuilderOptions['items'][number];

export type ProvisioningItemFactory = (
  item: CxPackageBuilderOptionsItem
) => Promise<ProvisioningItem>;
