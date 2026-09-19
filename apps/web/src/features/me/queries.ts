import type {
  AvatarUploadResponse,
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
        avatar_url: profile.avatar_url,
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

export function useUploadAvatar() {
  const queryClient = useQueryClient();
  const { user, updateUser } = useTeacherSession();
  const userId = user?.id;
  return useMutation<AvatarUploadResponse, Error, File>({
    mutationFn: (file) => apiClient.uploadAvatar(userId!, file, file.name),
    onSuccess: (result) => {
      updateUser({ avatar_url: result.avatar_url });
      queryClient.setQueryData<TeacherProfile | undefined>(
        teacherProfileQueryKeys.profile(userId!),
        (current) => (current ? { ...current, avatar_url: result.avatar_url } : current),
      );
      void queryClient.invalidateQueries({ queryKey: ["teacher", "me", "profile"] });
      void queryClient.invalidateQueries({ queryKey: ["teacher", "course"] });
    },
  });
}

export function useDeleteAvatar() {
  const queryClient = useQueryClient();
  const { user, updateUser } = useTeacherSession();
  const userId = user?.id;
  return useMutation<void, Error, void>({
    mutationFn: () => apiClient.deleteAvatar(userId!),
    onSuccess: () => {
      updateUser({ avatar_url: null });
      queryClient.setQueryData<TeacherProfile | undefined>(
        teacherProfileQueryKeys.profile(userId!),
        (current) => (current ? { ...current, avatar_url: null } : current),
      );
      void queryClient.invalidateQueries({ queryKey: ["teacher", "me", "profile"] });
      void queryClient.invalidateQueries({ queryKey: ["teacher", "course"] });
    },
  });
}
