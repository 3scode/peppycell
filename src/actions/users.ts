"use server";

import { withAction } from "@/lib/action-wrapper";
import { createUser, deleteUsers, toggleUser, updateUser } from "@/lib/data/repository";
import {
  createUserSchema,
  deleteUsersSchema,
  toggleUserSchema,
  updateUserSchema,
} from "@/lib/validations/user";
import type { UserSummary } from "@/types/domain";

export const createUserAction = withAction(
  "createUser",
  ["admin"],
  createUserSchema,
  async (input, { user }): Promise<UserSummary> => await createUser(user, input),
);

export const updateUserAction = withAction(
  "updateUser",
  ["admin"],
  updateUserSchema,
  async (input, { user }): Promise<UserSummary> => await updateUser(user, input),
);

export const toggleUserAction = withAction(
  "toggleUser",
  ["admin"],
  toggleUserSchema,
  async (input, { user }): Promise<UserSummary> => await toggleUser(user, input.id, input.isActive),
);

export const deleteUsersAction = withAction(
  "deleteUsers",
  ["admin"],
  deleteUsersSchema,
  async (input, { user }): Promise<{ deleted: number }> => await deleteUsers(user, input.ids),
);
