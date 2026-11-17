"use server";

import { withAction } from "@/lib/action-wrapper";
import {
  changePassword,
  setAvatar,
  updateNotification,
  updateProfile,
  updateTheme,
} from "@/lib/data/repository";
import {
  notificationSchema,
  passwordSchema,
  profileSchema,
  themeSchema,
} from "@/lib/validations/settings";
import type { SessionUser } from "@/types/domain";

export const updateProfileAction = withAction(
  "updateProfile",
  ["admin", "karyawan", "investor"],
  profileSchema,
  async (input, { user }): Promise<SessionUser> => await updateProfile(user, input),
);

export const updateThemeAction = withAction(
  "updateTheme",
  ["admin", "karyawan", "investor"],
  themeSchema,
  async (input, { user }): Promise<void> => await updateTheme(user, input.theme),
);

export const updateNotificationAction = withAction(
  "updateNotification",
  ["admin", "karyawan", "investor"],
  notificationSchema,
  async (input, { user }): Promise<void> => await updateNotification(user, input.enabled),
);

export const changePasswordAction = withAction(
  "changePassword",
  ["admin", "karyawan", "investor"],
  passwordSchema,
  async (input, { user }): Promise<void> =>
    await changePassword(user, input.currentPassword, input.newPassword),
);

export const removeAvatarAction = withAction(
  "removeAvatar",
  ["admin", "karyawan", "investor"],
  { parse: () => ({}) },
  async (_input, { user }): Promise<void> => await setAvatar(user, null),
);
