import { DocsLayoutClient } from "./docs-layout-client";

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DocsLayoutClient>{children}</DocsLayoutClient>;
}
