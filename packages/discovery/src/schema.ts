export const DISCOVERY_SCHEMA_VERSION = 1 as const;

export type DiscoveryCapabilityCategory =
  | 'libraries'
  | 'middleware'
  | 'tools'
  | 'adapters'
  | 'vector'
  | 'skills'
  | 'templates';

export interface DiscoveryCatalogEntry {
  id: string;
  category: DiscoveryCapabilityCategory;
  title: string;
  packageName?: string;
  version?: string;
  summary: string;
  docsPath?: string;
  examples?: string[];
  tags?: string[];
  aliases?: string[];
}

export type DiscoveryRecipeKind = 'package' | 'bundle';

export type DiscoveryRecipeInstallType = 'tool' | 'middleware' | 'package';

export interface DiscoveryRecipeInstallStep {
  type: DiscoveryRecipeInstallType;
  name: string;
}

export interface DiscoveryRecipeChoice {
  id: string;
  label: string;
  options: Array<{
    id: string;
    label: string;
    description?: string;
    packageName?: string;
  }>;
  allowCustomPackage?: boolean;
}

export type DiscoveryConfigScope = 'tool' | 'middleware';

export interface DiscoveryRecipeConfigAction {
  kind: 'setConfig';
  scope: DiscoveryConfigScope;
  id: string;
  config: Record<string, unknown>;
}

export interface DiscoveryRecipeEnableAction {
  kind: 'enableCapability';
  id: string;
  type: DiscoveryRecipeInstallType;
}

export type DiscoveryRecipePostInstallAction =
  | DiscoveryRecipeConfigAction
  | DiscoveryRecipeEnableAction;

export interface DiscoveryInstallRecipe {
  id: string;
  label: string;
  description: string;
  kind: DiscoveryRecipeKind;
  category: 'tools' | 'middleware';
  installs: DiscoveryRecipeInstallStep[];
  choices?: DiscoveryRecipeChoice[];
  postInstall: DiscoveryRecipePostInstallAction[];
}
