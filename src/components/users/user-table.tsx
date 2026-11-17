"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteUsersAction } from "@/actions/users";
import type { UserSummary } from "@/types/domain";
import { formatDateTimeId } from "@/lib/period";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DataTable, Td } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { SelectAllCheckbox } from "@/components/ui/select-all-checkbox";
import { ActiveBadge, RoleBadge } from "@/components/ui/status-badge";
import { UserFormDialog } from "@/components/users/user-form-dialog";
import { cn } from "@/lib/utils";

function DeleteButton({ user, onDelete }: { user: UserSummary; onDelete: () => void }) {
  return (
    <button
      type="button"
      onClick={onDelete}
      aria-label={`Hapus ${user.fullName}`}
      className="inline-flex h-9 items-center gap-1 rounded-sm border border-error/20 px-2.5 text-xs font-semibold text-error-text hover:bg-error-soft"
    >
      <Trash2 className="size-3.5" aria-hidden /> Hapus
    </button>
  );
}

export function UserTable({
  users,
  currentUserId,
  protectedIds,
}: {
  users: UserSummary[];
  currentUserId: string;
  /** Akun yang tidak boleh dihapus: diri sendiri dan admin aktif terakhir. */
  protectedIds: string[];
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTargets, setDeleteTargets] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const protectedSet = useMemo(() => new Set(protectedIds), [protectedIds]);
  const selectableUsers = useMemo(
    () => users.filter((item) => !protectedSet.has(item.id)),
    [users, protectedSet],
  );
  const selectedUsers = useMemo(
    () => users.filter((item) => selectedIds.has(item.id)),
    [users, selectedIds],
  );

  const allSelected =
    selectableUsers.length > 0 && selectableUsers.every((item) => selectedIds.has(item.id));
  const someSelected = selectedUsers.length > 0 && !allSelected;
  const selectedCount = selectedUsers.length;

  const deleteTargetUsers = useMemo(
    () => (deleteTargets ? users.filter((item) => deleteTargets.includes(item.id)) : []),
    [deleteTargets, users],
  );

  function toggleOne(id: string, checked: boolean) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? new Set(selectableUsers.map((item) => item.id)) : new Set());
  }

  function requestDelete(ids: string[]) {
    setDeleteError(null);
    setDeleteTargets(ids);
  }

  function closeDeleteDialog() {
    if (deleting) return;
    setDeleteTargets(null);
    setDeleteError(null);
  }

  async function confirmDelete() {
    if (!deleteTargets || deleteTargets.length === 0) return;
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteUsersAction({ ids: deleteTargets });
    setDeleting(false);
    if (!result.ok) {
      setDeleteError(result.error?.message ?? "Gagal menghapus pengguna.");
      return;
    }
    const deleted = result.data?.deleted ?? 0;
    toast.success(deleted === 1 ? "Pengguna dihapus." : `${deleted} pengguna dihapus.`);
    setSelectedIds(new Set());
    setDeleteTargets(null);
    router.refresh();
  }

  const selectAllProps = {
    checked: allSelected,
    indeterminate: someSelected,
    onChange: toggleAll,
    disabled: selectableUsers.length === 0,
  };

  return (
    <>
      {selectedCount > 0 ? (
        <div
          role="status"
          aria-live="polite"
          className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/20 bg-primary-soft px-3 py-2"
        >
          <p className="text-xs font-semibold text-foreground">{selectedCount} pengguna dipilih</p>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              Batal pilih
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => requestDelete(selectedUsers.map((item) => item.id))}
            >
              <Trash2 className="size-4" aria-hidden /> Hapus terpilih
            </Button>
          </div>
        </div>
      ) : null}

      <div className="space-y-2 md:hidden">
        {selectableUsers.length > 0 ? (
          <label className="flex items-center gap-2 px-1 pb-0.5 text-xs font-medium text-foreground-muted">
            <SelectAllCheckbox {...selectAllProps} label="Pilih semua pengguna yang bisa dihapus" />
            Pilih semua
          </label>
        ) : null}
        {users.map((item) => {
          const isProtected = protectedSet.has(item.id);
          const selected = selectedIds.has(item.id);
          return (
            <div
              key={item.id}
              className={cn(
                "rounded-md border border-border bg-surface p-3.5 shadow-card",
                !item.isActive && "opacity-60",
                selected && "border-primary/40 bg-primary-soft/30 opacity-100",
              )}
            >
              <div className="flex items-start gap-3">
                {isProtected ? (
                  <span className="mt-0.5 size-4 shrink-0" aria-hidden />
                ) : (
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(event) => toggleOne(item.id, event.target.checked)}
                    aria-label={`Pilih ${item.fullName}`}
                    className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
                  />
                )}
                <Avatar name={item.fullName} src={item.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-semibold">{item.fullName}</p>
                    <RoleBadge role={item.role} />
                    <ActiveBadge active={item.isActive} />
                  </div>
                  <p className="truncate text-[11px] text-foreground-muted">{item.email}</p>
                  <p className="mt-1 text-[11px] text-foreground-muted">
                    Porsi bagi hasil{" "}
                    <span className="money font-semibold text-foreground">
                      {item.defaultProfitShare}%
                    </span>
                    {item.id === currentUserId ? " · Anda" : ""}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
                <span className="text-[10px] text-foreground-muted">
                  {item.lastSeenAt
                    ? `Aktif ${formatDateTimeId(item.lastSeenAt)}`
                    : "Belum pernah login"}
                </span>
                <div className="flex items-center gap-1.5">
                  <UserFormDialog user={item} mode="edit" />
                  {isProtected ? null : (
                    <DeleteButton user={item} onDelete={() => requestDelete([item.id])} />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden md:block">
        <DataTable
          caption="Daftar pengguna"
          head={[
            <SelectAllCheckbox
              key="select-all"
              {...selectAllProps}
              label="Pilih semua pengguna yang bisa dihapus"
            />,
            "Nama",
            "Email",
            "Role",
            "Porsi Bagi Hasil",
            "Status",
            "Terakhir Aktif",
            "Aksi",
          ]}
        >
          {users.map((item) => {
            const isProtected = protectedSet.has(item.id);
            const selected = selectedIds.has(item.id);
            return (
              <tr
                key={item.id}
                className={cn(
                  "hover:bg-surface-muted/40",
                  !item.isActive && "opacity-60",
                  selected && "bg-primary-soft/30 opacity-100",
                )}
              >
                <Td className="w-10 pr-0">
                  {isProtected ? (
                    <span className="inline-block size-4" aria-hidden />
                  ) : (
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(event) => toggleOne(item.id, event.target.checked)}
                      aria-label={`Pilih ${item.fullName}`}
                      className="size-4 rounded border-input accent-primary"
                    />
                  )}
                </Td>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={item.fullName} src={item.avatarUrl} size="sm" />
                    <span className="font-medium">
                      {item.fullName}
                      {item.id === currentUserId ? (
                        <span className="ml-1 text-[10px] text-foreground-muted">(Anda)</span>
                      ) : null}
                    </span>
                  </div>
                </Td>
                <Td className="text-xs text-foreground-muted">{item.email}</Td>
                <Td>
                  <RoleBadge role={item.role} />
                </Td>
                <Td className="money text-xs font-semibold">{item.defaultProfitShare}%</Td>
                <Td>
                  <ActiveBadge active={item.isActive} />
                </Td>
                <Td className="whitespace-nowrap text-xs text-foreground-muted">
                  {item.lastSeenAt ? formatDateTimeId(item.lastSeenAt) : "Belum pernah"}
                </Td>
                <Td>
                  <div className="flex items-center gap-1.5">
                    <UserFormDialog user={item} mode="edit" />
                    {isProtected ? null : (
                      <DeleteButton user={item} onDelete={() => requestDelete([item.id])} />
                    )}
                  </div>
                </Td>
              </tr>
            );
          })}
        </DataTable>
      </div>

      <Modal
        open={deleteTargets !== null}
        onClose={closeDeleteDialog}
        title={
          deleteTargetUsers.length > 1
            ? `Hapus ${deleteTargetUsers.length} pengguna?`
            : "Hapus pengguna?"
        }
        description="Tindakan ini tidak bisa dibatalkan."
        size="sm"
        footer={
          <>
            <Button variant="outline" type="button" onClick={closeDeleteDialog} disabled={deleting}>
              Batal
            </Button>
            <Button variant="danger-solid" type="button" onClick={confirmDelete} loading={deleting}>
              <Trash2 className="size-4" aria-hidden />
              {deleting ? "Menghapus…" : "Hapus Pengguna"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {deleteError ? <Alert tone="error">{deleteError}</Alert> : null}
          <Alert tone="warning" title="Pengguna tidak akan bisa login lagi">
            Akun login dinonaktifkan permanen. Riwayat transaksi, payout, dan audit tetap
            tersimpan dan masih menampilkan nama pengguna ini.
          </Alert>
          <div>
            <p className="text-xs font-semibold text-foreground-muted">
              Pengguna yang akan dihapus:
            </p>
            <ul className="mt-1.5 space-y-1">
              {deleteTargetUsers.slice(0, 6).map((item) => (
                <li
                  key={item.id}
                  className="truncate rounded-sm bg-surface-muted px-2.5 py-1.5 text-sm font-medium"
                >
                  {item.fullName}
                  <span className="ml-1 text-[11px] font-normal text-foreground-muted">
                    · {item.email}
                  </span>
                </li>
              ))}
            </ul>
            {deleteTargetUsers.length > 6 ? (
              <p className="mt-1 text-[11px] text-foreground-muted">
                +{deleteTargetUsers.length - 6} pengguna lainnya
              </p>
            ) : null}
          </div>
        </div>
      </Modal>
    </>
  );
}
