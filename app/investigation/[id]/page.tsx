import { InvestigationPage } from "@/investigations/interfaces/web/investigation-page";
import type { ReactElement } from "react";

type InvestigationDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function InvestigationDetailPage(
  props: InvestigationDetailPageProps,
): Promise<ReactElement> {
  const { id } = await props.params;

  return <InvestigationPage investigationId={id} />;
}
