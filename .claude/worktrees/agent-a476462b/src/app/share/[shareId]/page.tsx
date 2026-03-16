import { redirect } from "next/navigation";

export default async function LegacySharePage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  redirect(`/s/${shareId}`);
}
