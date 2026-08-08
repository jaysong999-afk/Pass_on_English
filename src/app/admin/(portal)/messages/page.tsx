"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function AdminMessagesPage() {
  return (
    <div className="grid grid-cols-12 gap-6">
      <Card className="col-span-5">
        <CardHeader>
          <CardTitle>브로드캐스트</CardTitle>
          <CardDescription>전체 또는 특정 사용자에게 푸시/채팅 발송</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>대상</Label>
            <select className="flex h-11 w-full rounded-xl border border-gray-300 bg-white px-4 text-sm">
              <option value="all">전체 사용자</option>
              <option value="students">학생 전체</option>
              <option value="teachers">선생님 전체</option>
              <option value="kr">한국 학생</option>
              <option value="cn">중국 학생</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>제목</Label>
            <Input placeholder="알림 제목" />
          </div>
          <div className="space-y-2">
            <Label>내용</Label>
            <Textarea placeholder="메시지 내용" rows={5} />
          </div>
          <div className="flex gap-2">
            <Button>푸시 + 채팅 발송</Button>
            <Button variant="outline">푸시만</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="col-span-7">
        <CardHeader>
          <CardTitle>최근 대화</CardTitle>
          <CardDescription>학생·선생님 1:1 채팅 (메시지함에서 열기)</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">
            상단 알림 벨 또는 학생/선생님 상세 페이지에서 채팅을 열 수 있습니다.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
