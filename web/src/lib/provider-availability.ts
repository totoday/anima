import type { ProviderCatalogEntry } from '@shared/provider-catalog';
import type { ProviderAvailability } from '@shared/provider-catalog';

export function providerStatus(
  provider: ProviderCatalogEntry,
  availability: ProviderAvailability[] | null,
): ProviderAvailability | undefined {
  return availability?.find((item) => item.kind === provider.kind);
}

export function providerReady(
  provider: ProviderCatalogEntry | undefined,
  availability: ProviderAvailability[] | null | undefined,
): boolean {
  if (!provider || !availability) return false;
  const status = providerStatus(provider, availability);
  return status?.present === true;
}

export function firstReadyProvider(
  providers: ProviderCatalogEntry[],
  availability: ProviderAvailability[] | null,
): ProviderCatalogEntry | undefined {
  return providers.find((provider) => providerReady(provider, availability));
}

export function providerUnavailableLabel(
  provider: ProviderCatalogEntry,
  availability: ProviderAvailability[] | null | undefined,
): string | undefined {
  if (!availability) return 'checking...';
  const status = providerStatus(provider, availability);
  if (!status?.present) return 'not installed';
  return undefined;
}

export function providerUnavailableHint(
  provider: ProviderCatalogEntry | undefined,
  availability: ProviderAvailability[] | null | undefined,
): string | undefined {
  if (!provider || !availability) return undefined;
  const status = providerStatus(provider, availability);
  if (!status?.present) return provider.installHint;
  return undefined;
}

export function unavailableProviderHints(
  providers: ProviderCatalogEntry[],
  availability: ProviderAvailability[] | null | undefined,
): Array<{ hint: string; kind: ProviderCatalogEntry['kind']; label: string; status: string }> {
  if (!availability) return [];
  return providers.flatMap((provider) => {
    const label = providerUnavailableLabel(provider, availability);
    const hint = providerUnavailableHint(provider, availability);
    return label && hint ? [{ kind: provider.kind, label: provider.label, status: label, hint }] : [];
  });
}
