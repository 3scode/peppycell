"use client";

import dynamic from "next/dynamic";
import { Shimmer } from "@/components/ui/skeleton";
import type { ChartPoint } from "@/components/dashboard/dashboard-chart";

const DashboardChart = dynamic(
  () => import("@/components/dashboard/dashboard-chart").then((mod) => mod.DashboardChart),
  {
    ssr: false,
    loading: () => <Shimmer className="h-[260px] w-full" />,
  },
);

export function DashboardChartLazy(props: {
  series7: ChartPoint[];
  series30: ChartPoint[];
  mode?: "money" | "count";
  title?: string;
}) {
  return <DashboardChart {...props} />;
}
