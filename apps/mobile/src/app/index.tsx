import { Redirect } from "expo-router";

import { LoadingState } from "@/components/states/page-state";
import { useStudentSession } from "@/providers/student-session-provider";

export default function IndexScreen() {
  const { ready, user } = useStudentSession();

  if (!ready) {
    return <LoadingState message="正在恢复学习状态..." />;
  }

  return <Redirect href={user ? "/(tabs)/ai" : "/login"} />;
}
