import { notFound } from "next/navigation";
import { SophieWorkspace } from "../workspace";

export default function EditorTestPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <SophieWorkspace initialSection="notes" testMode />;
}
