import type {
  PasswordChangeRequest,
  PasswordChangeResponse,
  TeacherProfile,
  TeacherProfileUpdateRequest,
} from "@echo/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api";
import { useTeacherSession } from "@/providers/teacher-session-provider";

export const teacherProfileQueryKeys = {
  profile: (userId: string) => ["teacher", "me", "profile", userId] as const,
};

export function useTeacherProfile() {
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useQuery<TeacherProfile>({
    queryKey: teacherProfileQueryKeys.profile(userId ?? "anonymous"),
    queryFn: () => apiClient.getTeacherProfile(userId!),
    enabled: Boolean(userId),
    staleTime: 30_000,
    retry: 1,
  });
}

export function useUpdateTeacherProfile() {
  const queryClient = useQueryClient();
  const { user, updateUser } = useTeacherSession();
  const userId = user?.id;
  return useMutation<TeacherProfile, Error, TeacherProfileUpdateRequest>({
    mutationFn: (payload) => apiClient.updateTeacherProfile(userId!, payload),
    onSuccess: (profile) => {
      queryClient.setQueryData(teacherProfileQueryKeys.profile(userId!), profile);
      updateUser({
        display_name: profile.display_name,
        email: profile.email,
        role: profile.role,
        updated_at: profile.updated_at,
      });
      void queryClient.invalidateQueries({ queryKey: ["teacher", "me", "profile"] });
    },
  });
}

export function useChangePassword() {
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useMutation<PasswordChangeResponse, Error, PasswordChangeRequest>({
    mutationFn: (payload) => apiClient.changePassword(userId!, payload),
  });
}
