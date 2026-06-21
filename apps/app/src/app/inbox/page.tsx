import { Card, Stat } from "@o/ui";
import { BriefInbox } from "../_components/brief-inbox";

export const metadata = { title: "Brief" };

export default function InboxPage() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <Stat label="New today" value="3" sub="2 photos, 1 invoice" />
        <Stat label="This week" value="8" sub="across all projects" />
        <Stat label="Older" value="14" sub="still unread from this month" />
      </div>
      <Card>
        <BriefInbox />
      </Card>
    </>
  );
}
