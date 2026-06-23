import { useEffect, useState } from "react";
import type { ApplicationRecord } from "@/shared/types";
import { listApplications } from "@/storage/history";
import { computeAnalytics } from "@/storage/analytics";

interface DashboardProps {
  /** Inject records in tests; otherwise loaded from IndexedDB history. */
  records?: ApplicationRecord[];
}

export function Dashboard({ records }: DashboardProps) {
  const [data, setData] = useState<ApplicationRecord[] | null>(records ?? null);

  useEffect(() => {
    if (records) return;
    void listApplications().then(setData);
  }, [records]);

  if (data === null) return <p className="text-gray-500">Loading…</p>;
  if (data.length === 0)
    return (
      <p className="rounded bg-gray-50 px-3 py-4 text-gray-600">
        No applications yet. Fill your first application to see analytics here.
      </p>
    );

  const a = computeAnalytics(data);
  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Applications" value={String(a.totalApplications)} />
        <Stat label="Fields filled" value={String(a.totalFieldsFilled)} />
        <Stat label="Fill rate" value={`${Math.round(a.fillRate * 100)}%`} />
        <Stat label="AI assist rate" value={`${Math.round(a.aiAssistRate * 100)}%`} />
        <Stat label="Last 7 days" value={String(a.last7Days)} />
        <Stat label="Last 30 days" value={String(a.last30Days)} />
      </div>

      <h3 className="mt-6 mb-2 text-sm font-semibold">By platform</h3>
      <ul className="space-y-1">
        {a.byPlatform.map((p) => (
          <li key={p.platform} className="flex justify-between text-sm">
            <span className="capitalize">{p.platform}</span>
            <span className="font-medium">{p.count}</span>
          </li>
        ))}
      </ul>

      <h3 className="mt-6 mb-2 text-sm font-semibold">Recent applications</h3>
      <ul className="space-y-1 text-sm">
        {data.slice(0, 10).map((r) => (
          <li key={r.id} className="flex justify-between">
            <span className="truncate capitalize">{r.company} · {r.platform}</span>
            <span className="text-gray-500">{r.fieldsFilled}/{r.fieldsTotal}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
