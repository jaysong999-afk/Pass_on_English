import { ClipboardList } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { actionLabel } from "@/lib/admin/admin-review-log-store-sync";
import { CANONICAL_TIMEZONE } from "@/lib/availability/constants";
import { formatDate, formatTime } from "@/lib/utils";
import type { AdminReviewLogEntry } from "@/types";

export function ReviewLogSection({
  title,
  logs,
  empty,
}: {
  title: string;
  logs: AdminReviewLogEntry[];
  empty: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-5 w-5 text-emerald-600" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!logs.length ? (
          <p className="py-6 text-center text-sm text-gray-400">{empty}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>처리 시각</TableHead>
                  <TableHead>처리</TableHead>
                  <TableHead>대상</TableHead>
                  <TableHead>상세</TableHead>
                  <TableHead>담당</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {formatDate(log.at, "ko")} {formatTime(log.at, "ko", CANONICAL_TIMEZONE)}
                    </TableCell>
                    <TableCell className="text-xs">{actionLabel(log.action)}</TableCell>
                    <TableCell className="font-medium">{log.targetLabel}</TableCell>
                    <TableCell className="max-w-[240px] truncate text-xs text-gray-500">
                      {log.detail ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">{log.adminName}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ReviewQueueCard({
  title,
  empty,
  loading,
  isEmpty,
  children,
}: {
  title: string;
  empty: string;
  loading: boolean;
  isEmpty: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="py-8 text-center text-sm text-gray-400">불러오는 중…</p>
        ) : isEmpty ? (
          <p className="py-8 text-center text-sm text-gray-400">{empty}</p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
