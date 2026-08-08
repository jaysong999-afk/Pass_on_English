"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FinanceSummary } from "@/types";

interface FinanceChartProps {
  data: FinanceSummary[];
}

export function FinanceChart({ data }: FinanceChartProps) {
  const chartData = data.map((d) => ({
    month: d.month.slice(5),
    revenue: Math.round(d.revenueKrw / 10000),
    expense: Math.round(d.expensePhp / 1000),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>재무 현황</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="month">
          <TabsList>
            <TabsTrigger value="month">월별</TabsTrigger>
            <TabsTrigger value="quarter">분기</TabsTrigger>
            <TabsTrigger value="year">연간</TabsTrigger>
          </TabsList>
          <TabsContent value="month">
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="revenue" name="수입 (만원)" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" name="지출 (천 PHP)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
          <TabsContent value="quarter">
            <p className="py-12 text-center text-sm text-gray-500">분기별 집계는 Phase 3에서 연동됩니다.</p>
          </TabsContent>
          <TabsContent value="year">
            <p className="py-12 text-center text-sm text-gray-500">연간 집계는 Phase 3에서 연동됩니다.</p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
