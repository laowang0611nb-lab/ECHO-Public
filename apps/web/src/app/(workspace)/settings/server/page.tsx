import { ServerSettingsPage } from "@/features/server-settings/components/server-settings-page";

const serverTabs = ["services", "network", "ai", "database", "storage"] as const;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeTab(value: string | string[] | undefined) {
  const tab = first(value);
  return serverTabs.find((candidate) => candidate === tab) ?? "services";
}

export default async function ServerSettingsRoute({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const query = await searchParams;
  return <ServerSettingsPage initialTab={normalizeTab(query.tab)} />;
}
