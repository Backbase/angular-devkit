import { CxPackageBuilderOptions } from './schema';
import { BuilderContext } from '@angular-devkit/architect';

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

export interface ItemBuilderContext {
  item: CxPackageBuilderOptionsItem;
  destDir: string;
  builderContext: BuilderContext;
}

export type ItemBuilder = (ItemBuilderContext) => Promise<void>;
