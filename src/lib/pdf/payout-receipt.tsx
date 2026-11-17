import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { PayoutRecord, UserRole } from "@/types/domain";
import { formatDateTimeId, formatPeriod } from "@/lib/period";
import { formatRupiah } from "@/lib/money";

const CATEGORY_LABEL = {
  admin_dividend: "Deviden Admin",
  investor_dividend: "Deviden Investor",
  employee_commission: "Gaji Karyawan",
} as const;

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Admin",
  karyawan: "Karyawan",
  investor: "Investor",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 44,
    paddingHorizontal: 40,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#1c1c1c",
  },
  brand: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#0f766e" },
  brandSub: { fontSize: 8, color: "#5b6470", marginTop: 2 },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 18 },
  subtle: { fontSize: 8, color: "#5b6470" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  section: { marginTop: 16 },
  sectionTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#5b6470",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  infoGrid: {
    borderWidth: 1,
    borderColor: "#e2e5ea",
    borderRadius: 4,
    padding: 10,
  },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  infoLabel: { color: "#5b6470" },
  infoValue: { fontFamily: "Helvetica-Bold" },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f2f5f7",
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  tableHeaderCell: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#5b6470" },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#eef0f3",
  },
  cell: { fontSize: 8 },
  cellStrong: { fontSize: 8, fontFamily: "Helvetica-Bold" },
  right: { textAlign: "right" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#cbd2da",
  },
  totalLabel: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  totalValue: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#0f766e" },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: "#e2e5ea",
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 7, color: "#8a929c" },
  note: {
    marginTop: 12,
    backgroundColor: "#f6f8f9",
    borderRadius: 4,
    padding: 8,
    fontSize: 7.5,
    color: "#5b6470",
    lineHeight: 1.5,
  },
});

export interface ReceiptViewer {
  id: string;
  fullName: string;
  role: UserRole;
}

export function PayoutReceiptDocument({
  payout,
  viewer,
}: {
  payout: PayoutRecord;
  viewer: ReceiptViewer;
}) {
  const isAdmin = viewer.role === "admin";
  const items = isAdmin ? payout.items : payout.items.filter((item) => item.userId === viewer.id);
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const period = formatPeriod(payout.startDate, payout.endDate);

  return (
    <Document
      title={`Bukti payout ${period}`}
      author="PeppyCell"
      subject="Bukti pembagian laba mingguan"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.brand}>PeppyCell</Text>
            <Text style={styles.brandSub}>Pembukuan konter pulsa &amp; kuota</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.title}>{isAdmin ? "BUKTI PAYOUT" : "BUKTI DEVIDEN"}</Text>
            <Text style={styles.subtle}>{payout.id}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informasi periode</Text>
          <View style={styles.infoGrid}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Periode</Text>
              <Text style={styles.infoValue}>{period}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Status</Text>
              <Text style={styles.infoValue}>{payout.status.toUpperCase()}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Wallet sumber</Text>
              <Text style={styles.infoValue}>{payout.walletName ?? payout.walletId}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Dieksekusi</Text>
              <Text style={styles.infoValue}>
                {formatDateTimeId(payout.completedAt ?? payout.createdAt)} WIB
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Diterbitkan untuk</Text>
              <Text style={styles.infoValue}>
                {viewer.fullName} ({ROLE_LABEL[viewer.role]})
              </Text>
            </View>
            {isAdmin ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Kas ditahan</Text>
                <Text style={styles.infoValue}>{formatRupiah(payout.retainedEarnings)}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {isAdmin ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ringkasan laba</Text>
            <View style={styles.infoGrid}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Margin penjualan</Text>
                <Text style={styles.infoValue}>{formatRupiah(payout.grossMargin)}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Beban operasional</Text>
                <Text style={styles.infoValue}>-{formatRupiah(payout.operatingExpense)}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Laba bersih</Text>
                <Text style={styles.infoValue}>{formatRupiah(payout.netProfit)}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Total dibagikan</Text>
                <Text style={styles.infoValue}>{formatRupiah(payout.totalDistributed)}</Text>
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {isAdmin ? "Penerima" : "Penerimaan Anda"}
          </Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { width: "30%" }]}>Nama</Text>
            <Text style={[styles.tableHeaderCell, { width: "14%" }]}>Role</Text>
            <Text style={[styles.tableHeaderCell, { width: "22%" }]}>Kategori</Text>
            <Text style={[styles.tableHeaderCell, { width: "12%", textAlign: "right" }]}>
              Porsi
            </Text>
            <Text style={[styles.tableHeaderCell, { width: "22%", textAlign: "right" }]}>
              Nominal
            </Text>
          </View>
          {items.map((item) => (
            <View key={item.id} style={styles.tableRow} wrap={false}>
              <Text style={[styles.cell, { width: "30%" }]}>{item.userName}</Text>
              <Text style={[styles.cell, { width: "14%" }]}>{ROLE_LABEL[item.role]}</Text>
              <Text style={[styles.cell, { width: "22%" }]}>
                {CATEGORY_LABEL[item.category] ?? item.category}
              </Text>
              <Text style={[styles.cell, { width: "12%", textAlign: "right" }]}>
                {item.weightPct}%
              </Text>
              <Text style={[styles.cellStrong, { width: "22%", textAlign: "right" }]}>
                {formatRupiah(item.amount)}
              </Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{isAdmin ? "Total dibagikan" : "Deviden Anda"}</Text>
            <Text style={styles.totalValue}>{formatRupiah(total)}</Text>
          </View>
        </View>

        <View style={styles.note}>
          <Text>
            Dokumen ini dihasilkan otomatis oleh PeppyCell dan sah tanpa tanda tangan basah.
            Perhitungan memakai pembulatan rupiah dengan kas ditahan sebagai penyerap sisa.
            Payout tidak dapat dibatalkan; koreksi dilakukan melalui penyesuaian saldo beraudit.
          </Text>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>PeppyCell - bukti pembagian laba</Text>
          <Text style={styles.footerText}>Dicetak {formatDateTimeId(new Date().toISOString())} WIB</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderPayoutReceiptPdf(
  payout: PayoutRecord,
  viewer: ReceiptViewer,
): Promise<Uint8Array> {
  const buffer = await renderToBuffer(
    <PayoutReceiptDocument payout={payout} viewer={viewer} />,
  );
  return new Uint8Array(buffer);
}
