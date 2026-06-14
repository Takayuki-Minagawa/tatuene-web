export interface VersionSettings {
  individual: string;
  official: string;
}

export const DEFAULT_VERSION_SETTINGS: VersionSettings = {
  individual: "1.00",
  official: "1.0.0",
};

export function normalizeVersionSettings(settings?: Partial<VersionSettings>): VersionSettings {
  return {
    individual: settings?.individual?.trim() || DEFAULT_VERSION_SETTINGS.individual,
    official: settings?.official?.trim() || DEFAULT_VERSION_SETTINGS.official,
  };
}

export function coverVersionLabel(settings: VersionSettings): string {
  return `Ver.${normalizeVersionSettings(settings).official}`;
}
