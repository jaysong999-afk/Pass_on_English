"use client";

import { AdminDirectChatPanel } from "@/components/shared/AdminDirectChatPanel";

export default function TeacherAdminSupportPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Pass on English Support</h2>
        <p className="text-sm text-gray-500 mt-1">Messages from the admin team</p>
      </div>
      <AdminDirectChatPanel role="teacher" placeholder="Type a message..." />
    </div>
  );
}
