import { Suspense } from "react";
import { Conversations } from "../../../components/conversations";
import { Loading } from "../../../components/feedback";
export default function ConversationsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conversations />
    </Suspense>
  );
}
