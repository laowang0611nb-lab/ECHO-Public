import { MePage } from "@/features/me/components/me-page";

const meTabs = ["profile", "security", "system", "notifications", "appearance", "about"] as const;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeTab(value: string | string[] | undefined) {
  const tab = first(value);
  return meTabs.find((candidate) => candidate === tab) ?? "profile";
}

export default async function MeRoute({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const query = await searchParams;
  return <MePage initialTab={normalizeTab(query.tab)} />;
}
