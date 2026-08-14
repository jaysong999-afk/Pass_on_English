import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BroadcastAudience,
  BroadcastChannel,
  BroadcastEnrollmentFilter,
  DirectMessage,
  DirectThreadPreview,
  PushCampaignRow,
  PushCampaignTotals,
  SystemNotificationRule,
} from "@/lib/admin/messages/types";
import {
  BROADCAST_AUDIENCE_LABELS,
  BROADCAST_FILTER_LABELS,
} from "@/lib/admin/messages/types";
import { FALLBACK_SYSTEM_NOTIFICATION_RULES } from "@/lib/admin/messages/constants";
import {
  appendAdminDirectMessageToCache,
  getAdminCampaignCache,
  getAdminDirectMessagesCache,
  getAdminDirectThreadCache,
  getSystemNotificationRulesCache,
  patchAdminDirectThreadInCache,
  patchAdminCampaignInCache,
  patchSystemNotificationRulesInCache,
  prependAdminCampaignToCache,
  setAdminMessagingCache,
} from "@/lib/admin/messages/admin-messages-cache";
import { fetchStudentDisplayNameInDb, fetchStudentAvatarUrlInDb } from "@/lib/accounts/repository";
import { getTeacherFromCache } from "@/lib/teachers/teacher-profile-cache";
import { resolveTeacherId } from "@/lib/teachers/resolve-teacher-id";
import { createBootstrapDbClient, createRequestDbClient, createServiceDbClient } from "@/lib/supabase/db-client";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsersInDb } from "@/lib/push/send-service";
import { sendNotificationWithOptionalPushInDb } from "@/lib/notifications/repository";
import {
  ADMIN_SENDER_DISPLAY_NAME,
  resolveAdminProfileIdInDb,
} from "@/lib/admin/resolve-admin-sender";

interface DirectThreadRow {
  id: string;
  target_type: "student" | "teacher";
  student_id: string | null;
  teacher_id: string | null;
  profile_id: string;
  last_message_at: string | null;
  last_message_preview: string;
  created_at: string;
}

interface DirectMessageRow {
  id: string;
  thread_id: string;
  sender_role: "admin" | "student" | "teacher";
  sender_id: string | null;
  body: string;
  read_at: string | null;
  created_at: string;
}

interface BroadcastRow {
  id: string;
  title: string;
  body: string;
  sent_at: string;
  audience: string | null;
  enrollment_filters: string[] | null;
  channel: "push_chat" | "push_only" | "chat_only";
  segment_label: string | null;
  recipient_count: number;
  delivered_count: number;
  failed_count: number;
  clicked_count: number;
}

interface RuleRow {
  rule_key: string;
  label: string;
  description: string;
  enabled: boolean;
  channels: string[];
}

async function fetchProfileEmail(profileId: string): Promise<string | undefined> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.getUserById(profileId);
    return data.user?.email ?? undefined;
  } catch {
    return undefined;
  }
}

async function buildThreadPreview(row: DirectThreadRow): Promise<DirectThreadPreview> {
  let displayName = "User";
  let subtitle = "";
  let targetId = row.profile_id;
  let avatarUrl: string | undefined;
  let unread = 0;

  const supabase = await createClient();
  const { count } = await supabase
    .from("admin_direct_messages")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", row.id)
    .neq("sender_role", "admin")
    .is("read_at", null);
  unread = count ?? 0;

  if (row.target_type === "student" && row.student_id) {
    targetId = row.student_id;
    displayName = await fetchStudentDisplayNameInDb(row.student_id, "Student");
    avatarUrl = await fetchStudentAvatarUrlInDb(row.student_id);
    const email = await fetchProfileEmail(row.profile_id);
    subtitle = email ? `학부모 · ${email}` : "학부모";
    const { data: student } = await supabase
      .from("students")
      .select("full_name")
      .eq("id", row.student_id)
      .maybeSingle();
    if (student?.full_name && student.full_name !== displayName) {
      subtitle = email ? `${student.full_name} · ${email}` : student.full_name;
    }
  } else if (row.target_type === "teacher" && row.teacher_id) {
    targetId = row.teacher_id;
    const teacher = getTeacherFromCache(row.teacher_id);
    displayName = teacher?.displayName ?? "Teacher";
    avatarUrl = teacher?.avatarUrl;
    subtitle = "선생님";
  }

  return {
    id: row.id,
    targetType: row.target_type,
    targetId,
    displayName,
    subtitle,
    avatarUrl,
    lastMessage: row.last_message_preview || "(새 대화)",
    lastMessageAt: row.last_message_at ?? row.created_at,
    unread,
  };
}

function rowToDirectMessage(row: DirectMessageRow): DirectMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    senderRole: row.sender_role,
    body: row.body,
    createdAt: row.created_at,
  };
}

function rowToCampaign(row: BroadcastRow): PushCampaignRow {
  return {
    id: row.id,
    title: row.title,
    segment: row.segment_label ?? row.audience ?? "전체",
    sentAt: row.sent_at,
    recipients: row.recipient_count,
    delivered: row.delivered_count,
    failed: row.failed_count,
    clicked: row.clicked_count,
    channel: row.channel === "push_chat" ? "push_chat" : "push",
  };
}

function rowToRule(row: RuleRow): SystemNotificationRule {
  return {
    id: row.rule_key,
    label: row.label,
    description: row.description,
    enabled: row.enabled,
    channels: row.channels.filter(
      (c): c is "push" | "in_app" => c === "push" || c === "in_app"
    ),
  };
}

function buildSegmentLabel(
  audience: BroadcastAudience,
  filters: BroadcastEnrollmentFilter[]
): string {
  let label = BROADCAST_AUDIENCE_LABELS[audience];
  if (filters.length > 0 && audience !== "teachers") {
    label += ` · ${filters.map((f) => BROADCAST_FILTER_LABELS[f]).join(", ")}`;
  }
  return label;
}

export async function warmAdminMessagingCache(): Promise<void> {
  const supabase = createBootstrapDbClient();

  const [threadRes, campaignRes, ruleRes] = await Promise.all([
    supabase.from("admin_direct_threads").select("*").order("last_message_at", {
      ascending: false,
      nullsFirst: false,
    }),
    supabase
      .from("admin_broadcasts")
      .select(
        "id, title, body, sent_at, audience, enrollment_filters, channel, segment_label, recipient_count, delivered_count, failed_count, clicked_count"
      )
      .order("sent_at", { ascending: false })
      .limit(50),
    supabase.from("system_notification_rules").select("*").order("rule_key"),
  ]);

  if (threadRes.error) {
    throw new Error(`admin_direct_threads_fetch_failed: ${threadRes.error.message}`);
  }
  if (campaignRes.error) {
    throw new Error(`admin_broadcasts_fetch_failed: ${campaignRes.error.message}`);
  }
  if (ruleRes.error) {
    throw new Error(`system_notification_rules_fetch_failed: ${ruleRes.error.message}`);
  }

  const threadRows = (threadRes.data ?? []) as DirectThreadRow[];
  const threads = await Promise.all(threadRows.map(buildThreadPreview));

  const messagesByThread: Record<string, DirectMessage[]> = {};
  if (threadRows.length > 0) {
    const threadIds = threadRows.map((r) => r.id);
    const { data: messageRows, error: msgError } = await supabase
      .from("admin_direct_messages")
      .select("*")
      .in("thread_id", threadIds)
      .order("created_at", { ascending: true });
    if (msgError) {
      throw new Error(`admin_direct_messages_fetch_failed: ${msgError.message}`);
    }
    for (const row of (messageRows ?? []) as DirectMessageRow[]) {
      messagesByThread[row.thread_id] = [
        ...(messagesByThread[row.thread_id] ?? []),
        rowToDirectMessage(row),
      ];
    }
  }

  const campaigns = ((campaignRes.data ?? []) as BroadcastRow[]).map(rowToCampaign);
  const rules =
    (ruleRes.data ?? []).length > 0
      ? ((ruleRes.data ?? []) as RuleRow[]).map(rowToRule)
      : FALLBACK_SYSTEM_NOTIFICATION_RULES;

  setAdminMessagingCache({
    threads,
    messagesByThread,
    campaigns,
    rules,
  });
}

export function getAdminDirectThreadsFromCache(): DirectThreadPreview[] {
  return getAdminDirectThreadCache();
}

export function getAdminDirectInboxSummaryFromCache(): {
  threads: DirectThreadPreview[];
  totalUnread: number;
} {
  const threads = getAdminDirectThreadCache();
  const totalUnread = threads.reduce((sum, thread) => sum + thread.unread, 0);
  return { threads, totalUnread };
}

export function getAdminDirectMessagesFromCache(threadId: string): DirectMessage[] {
  return getAdminDirectMessagesCache(threadId);
}

export function getPushCampaignsFromCache(): PushCampaignRow[] {
  return getAdminCampaignCache();
}

export function getPushCampaignTotalsFromCache(): PushCampaignTotals {
  const campaigns = getAdminCampaignCache();
  const sent = campaigns.reduce((s, c) => s + c.recipients, 0);
  const delivered = campaigns.reduce((s, c) => s + c.delivered, 0);
  const failed = campaigns.reduce((s, c) => s + c.failed, 0);
  const clicked = campaigns.reduce((s, c) => s + c.clicked, 0);
  return {
    sent,
    delivered,
    failed,
    clicked,
    deliveryRate: sent ? Math.round((delivered / sent) * 100) : 0,
    ctr: delivered ? Math.round((clicked / delivered) * 100) : 0,
  };
}

export function getSystemNotificationRulesFromCache(): SystemNotificationRule[] {
  return getSystemNotificationRulesCache();
}

export async function resolveBroadcastRecipientProfileIds(input: {
  audience: BroadcastAudience;
  filters: BroadcastEnrollmentFilter[];
}): Promise<string[]> {
  const supabase = await createClient();
  return resolveBroadcastRecipientProfileIdsWithClient(supabase, input);
}

export async function resolveBroadcastRecipientProfileIdsWithClient(
  supabase: SupabaseClient,
  input: {
    audience: BroadcastAudience;
    filters: BroadcastEnrollmentFilter[];
  }
): Promise<string[]> {
  const ids = new Set<string>();

  const addTeachers = async () => {
    const { data: teachers } = await supabase
      .from("teachers")
      .select("id")
      .eq("status", "active");
    for (const row of teachers ?? []) {
      ids.add(row.id);
    }
  };

  const addStudents = async (country?: "KR" | "CN") => {
    let studentQuery = supabase
      .from("students")
      .select("id, account_holder_id, country")
      .eq("is_active", true);
    if (country) {
      studentQuery = studentQuery.eq("country", country);
    }
    const { data: students } = await studentQuery;
    const studentList = students ?? [];
    const studentIds = studentList.map((s) => s.id as string);

    if (input.filters.length === 0) {
      for (const student of studentList) {
        ids.add(student.account_holder_id as string);
      }
      return;
    }

    const matchedStudentIds = new Set<string>();

    if (input.filters.includes("pending_registration")) {
      const { data: pendingRegs } = await supabase
        .from("student_registration_reviews")
        .select("id")
        .eq("status", "pending");
      for (const reg of pendingRegs ?? []) {
        if (studentIds.includes(reg.id as string)) {
          matchedStudentIds.add(reg.id as string);
        }
      }
    }

    const enrollmentFilters = input.filters.filter(
      (f) => f !== "pending_registration"
    ) as Array<"active" | "expiring_soon" | "pending_payment" | "completed">;

    if (enrollmentFilters.length > 0 && studentIds.length > 0) {
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("student_id, status")
        .in("student_id", studentIds)
        .in("status", enrollmentFilters);
      for (const e of enrollments ?? []) {
        matchedStudentIds.add(e.student_id as string);
      }
    }

    for (const student of studentList) {
      if (matchedStudentIds.has(student.id as string)) {
        ids.add(student.account_holder_id as string);
      }
    }
  };

  switch (input.audience) {
    case "teachers":
      await addTeachers();
      break;
    case "students_kr":
      await addStudents("KR");
      break;
    case "students_cn":
      await addStudents("CN");
      break;
    case "students_all":
      await addStudents();
      break;
    case "all":
      await addTeachers();
      await addStudents();
      break;
  }

  return [...ids];
}

export async function ensureAdminDirectThreadInDb(input: {
  targetType: "student" | "teacher";
  targetId: string;
}): Promise<DirectThreadPreview> {
  const supabase = await createClient();
  let profileId: string;
  let studentId: string | null = null;
  let teacherId: string | null = null;

  if (input.targetType === "student") {
    const { data, error } = await supabase
      .from("students")
      .select("id, account_holder_id")
      .eq("id", input.targetId)
      .single();
    if (error || !data) throw new Error("student_not_found");
    studentId = data.id;
    profileId = data.account_holder_id;
  } else {
    const resolvedTeacherId = resolveTeacherId(input.targetId);
    if (!resolvedTeacherId) throw new Error("teacher_not_found");
    teacherId = resolvedTeacherId;
    profileId = resolvedTeacherId;
    const { data, error } = await supabase
      .from("teachers")
      .select("id")
      .eq("id", resolvedTeacherId)
      .maybeSingle();
    if (error || !data) throw new Error("teacher_not_found");
  }

  const { data: existing } = await supabase
    .from("admin_direct_threads")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (existing) {
    const preview = await buildThreadPreview(existing as DirectThreadRow);
    patchAdminDirectThreadInCache(preview);
    return preview;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("admin_direct_threads")
    .insert({
      target_type: input.targetType,
      student_id: studentId,
      teacher_id: teacherId,
      profile_id: profileId,
      last_message_preview: "(새 대화)",
    })
    .select("*")
    .single();

  if (insertError || !inserted) {
    throw new Error(`admin_direct_thread_create_failed: ${insertError?.message}`);
  }

  const preview = await buildThreadPreview(inserted as DirectThreadRow);
  patchAdminDirectThreadInCache(preview);
  return preview;
}

export async function sendAdminDirectMessageInDb(input: {
  threadId: string;
  body: string;
}): Promise<DirectMessage> {
  const supabase = await createRequestDbClient();
  const senderId = await resolveAdminProfileIdInDb();
  const trimmed = input.body.trim();
  if (!trimmed) throw new Error("message_body_required");

  const { data: thread, error: threadError } = await supabase
    .from("admin_direct_threads")
    .select("*")
    .eq("id", input.threadId)
    .single();
  if (threadError || !thread) throw new Error("thread_not_found");

  const { data: row, error } = await supabase
    .from("admin_direct_messages")
    .insert({
      thread_id: input.threadId,
      sender_role: "admin",
      sender_id: senderId,
      body: trimmed,
    })
    .select("*")
    .single();

  if (error || !row) {
    throw new Error(`admin_direct_message_send_failed: ${error?.message}`);
  }

  const now = new Date().toISOString();
  await supabase
    .from("admin_direct_threads")
    .update({
      last_message_at: now,
      last_message_preview: trimmed.slice(0, 200),
    })
    .eq("id", input.threadId);

  await sendNotificationWithOptionalPushInDb({
    userId: (thread as DirectThreadRow).profile_id,
    type: "admin_direct",
    title: "Pass on English",
    body: trimmed.slice(0, 500),
    payload: { threadId: input.threadId, kind: "admin_direct" },
    push: true,
  });

  const message = rowToDirectMessage(row as DirectMessageRow);
  appendAdminDirectMessageToCache(message);
  const preview = await buildThreadPreview({
    ...(thread as DirectThreadRow),
    last_message_at: now,
    last_message_preview: trimmed.slice(0, 200),
  });
  patchAdminDirectThreadInCache(preview);
  return message;
}

export async function markAdminDirectThreadReadInDb(threadId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("admin_direct_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("thread_id", threadId)
    .neq("sender_role", "admin")
    .is("read_at", null);
  if (error) {
    throw new Error(`admin_direct_mark_read_failed: ${error.message}`);
  }
  const cached = getAdminDirectThreadCache().find((t) => t.id === threadId);
  if (cached) {
    patchAdminDirectThreadInCache({ ...cached, unread: 0 });
  }
}

interface BroadcastDeliveryStats {
  recipientCount: number;
  deliveredCount: number;
  failedCount: number;
}

function formatBroadcastChatBody(title: string, body: string): string {
  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();
  if (!trimmedTitle) return trimmedBody;
  if (!trimmedBody || trimmedTitle === trimmedBody) return trimmedTitle;
  return `${trimmedTitle}\n\n${trimmedBody}`;
}

async function ensureAdminDirectThreadForProfileWithClient(
  supabase: SupabaseClient,
  profileId: string,
  portalRole: "student" | "teacher"
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("admin_direct_threads")
    .select("id")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  if (portalRole === "teacher") {
    const { data: inserted, error } = await supabase
      .from("admin_direct_threads")
      .insert({
        target_type: "teacher",
        teacher_id: profileId,
        profile_id: profileId,
        last_message_preview: "",
      })
      .select("id")
      .single();
    if (error || !inserted) return null;
    return inserted.id as string;
  }

  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("account_holder_id", profileId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!student?.id) return null;

  const { data: inserted, error } = await supabase
    .from("admin_direct_threads")
    .insert({
      target_type: "student",
      student_id: student.id,
      profile_id: profileId,
      last_message_preview: "",
    })
    .select("id")
    .single();

  if (error || !inserted) return null;
  return inserted.id as string;
}

async function appendAdminBroadcastToDirectChatWithClient(
  supabase: SupabaseClient,
  input: {
    profileId: string;
    portalRole: "student" | "teacher";
    title: string;
    body: string;
    senderId: string | null;
  }
): Promise<boolean> {
  const threadId = await ensureAdminDirectThreadForProfileWithClient(
    supabase,
    input.profileId,
    input.portalRole
  );
  if (!threadId) return false;

  const messageBody = formatBroadcastChatBody(input.title, input.body);
  if (!messageBody) return false;

  const { error: msgError } = await supabase.from("admin_direct_messages").insert({
    thread_id: threadId,
    sender_role: "admin",
    sender_id: input.senderId,
    body: messageBody.slice(0, 5000),
  });

  if (msgError) return false;

  const now = new Date().toISOString();
  await supabase
    .from("admin_direct_threads")
    .update({
      last_message_at: now,
      last_message_preview: messageBody.slice(0, 200),
    })
    .eq("id", threadId);

  return true;
}

async function deliverBroadcastPayloadWithClient(
  supabase: SupabaseClient,
  input: {
    title: string;
    body: string;
    audience: BroadcastAudience;
    filters: BroadcastEnrollmentFilter[];
    channel: BroadcastChannel;
    profileIds: string[];
    broadcastId?: string;
  }
): Promise<BroadcastDeliveryStats> {
  const trimmedTitle = input.title.trim();
  const trimmedBody = input.body.trim();
  const profileIds = [...new Set(input.profileIds)];
  const sendPush = input.channel === "push_only" || input.channel === "push_chat";
  const sendChat = input.channel === "push_chat" || input.channel === "chat_only";

  let delivered = 0;
  let failed = 0;

  const payloadBase = {
    audience: input.audience,
    filters: input.filters,
    ...(input.broadcastId ? { broadcastId: input.broadcastId } : {}),
  };

  const roleByUserId = new Map<string, "student" | "teacher">();
  if (profileIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, role")
      .in("id", profileIds);
    for (const profile of profiles ?? []) {
      roleByUserId.set(
        profile.id as string,
        profile.role === "teacher" ? "teacher" : "student"
      );
    }
  }

  const senderId = await resolveAdminProfileIdInDb().catch(() => null);

  if (sendChat && profileIds.length > 0) {
    for (const profileId of profileIds) {
      const ok = await appendAdminBroadcastToDirectChatWithClient(supabase, {
        profileId,
        portalRole: roleByUserId.get(profileId) ?? "student",
        title: trimmedTitle,
        body: trimmedBody,
        senderId,
      });
      if (ok) {
        delivered += 1;
      } else {
        failed += 1;
      }
    }
  }

  if (sendPush && profileIds.length > 0) {
    let pushReached = 0;
    let pushAttempted = 0;

    for (const profileId of profileIds) {
      pushAttempted += 1;
      const portalRole = roleByUserId.get(profileId) ?? "student";
      const pushUrl =
        portalRole === "teacher" ? "/teacher/chat/support" : "/ko/student/chat/support";

      const pushResult = await sendPushToUsersInDb(supabase, [profileId], {
        title: trimmedTitle,
        body: trimmedBody.slice(0, 500),
        tag: "admin_broadcast",
        url: pushUrl,
        data: {
          ...payloadBase,
          portalRole,
        },
      });

      if (pushResult.skipped) {
        continue;
      }

      if (pushResult.usersReached > 0) {
        pushReached += 1;
      }
    }

    if (!sendChat) {
      delivered = pushReached;
      failed = Math.max(0, pushAttempted - pushReached);
    }
  }

  if (profileIds.length === 0) {
    failed = 0;
  }

  return {
    recipientCount: profileIds.length,
    deliveredCount: delivered,
    failedCount: failed,
  };
}

function legacyBroadcastTarget(input: { audience: BroadcastAudience }): {
  targetRole: string | null;
  targetCountry: string | null;
} {
  const legacyTargetRole =
    input.audience === "teachers"
      ? "teacher"
      : input.audience.startsWith("students")
        ? "student"
        : null;
  const legacyCountry =
    input.audience === "students_kr"
      ? "KR"
      : input.audience === "students_cn"
        ? "CN"
        : null;
  return { targetRole: legacyTargetRole, targetCountry: legacyCountry };
}

export async function deliverBroadcastInDb(input: {
  title: string;
  body: string;
  audience: BroadcastAudience;
  filters: BroadcastEnrollmentFilter[];
  channel: BroadcastChannel;
  scheduledAt?: string | null;
  sentBy?: string | null;
}): Promise<PushCampaignRow> {
  const supabase = await createRequestDbClient();
  const trimmedTitle = input.title.trim();
  const trimmedBody = input.body.trim();
  if (!trimmedTitle || !trimmedBody) throw new Error("broadcast_payload_invalid");

  const profileIds = await resolveBroadcastRecipientProfileIdsWithClient(supabase, {
    audience: input.audience,
    filters: input.filters,
  });

  const segmentLabel = buildSegmentLabel(input.audience, input.filters);
  const { targetRole, targetCountry } = legacyBroadcastTarget({ audience: input.audience });
  const isScheduled = Boolean(input.scheduledAt);

  let delivery: BroadcastDeliveryStats = {
    recipientCount: profileIds.length,
    deliveredCount: 0,
    failedCount: 0,
  };

  if (!isScheduled) {
    const { data: draft, error: draftError } = await supabase
      .from("admin_broadcasts")
      .insert({
        title: trimmedTitle,
        body: trimmedBody,
        sent_by: input.sentBy ?? (await resolveAdminProfileIdInDb()),
        target_role: targetRole,
        target_country: targetCountry,
        audience: input.audience,
        enrollment_filters: input.filters,
        channel: input.channel,
        status: "sending",
        scheduled_at: null,
        segment_label: segmentLabel,
        recipient_count: profileIds.length,
        delivered_count: 0,
        failed_count: 0,
        clicked_count: 0,
      })
      .select("id")
      .single();

    if (draftError || !draft) {
      throw new Error(`admin_broadcast_insert_failed: ${draftError?.message}`);
    }

    delivery = await deliverBroadcastPayloadWithClient(supabase, {
      title: trimmedTitle,
      body: trimmedBody,
      audience: input.audience,
      filters: input.filters,
      channel: input.channel,
      profileIds,
      broadcastId: draft.id as string,
    });

    const { data: row, error } = await supabase
      .from("admin_broadcasts")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        recipient_count: delivery.recipientCount,
        delivered_count: delivery.deliveredCount,
        failed_count: delivery.failedCount,
      })
      .eq("id", draft.id)
      .select(
        "id, title, body, sent_at, audience, enrollment_filters, channel, segment_label, recipient_count, delivered_count, failed_count, clicked_count"
      )
      .single();

    if (error || !row) {
      throw new Error(`admin_broadcast_update_failed: ${error?.message}`);
    }

    const campaign = rowToCampaign(row as BroadcastRow);
    prependAdminCampaignToCache(campaign);
    return campaign;
  }

  const { data: row, error } = await supabase
    .from("admin_broadcasts")
    .insert({
      title: trimmedTitle,
      body: trimmedBody,
      sent_by: input.sentBy ?? (await resolveAdminProfileIdInDb()),
      target_role: targetRole,
      target_country: targetCountry,
      audience: input.audience,
      enrollment_filters: input.filters,
      channel: input.channel,
      status: "scheduled",
      scheduled_at: input.scheduledAt ?? null,
      segment_label: segmentLabel,
      recipient_count: delivery.recipientCount,
      delivered_count: 0,
      failed_count: 0,
      clicked_count: 0,
    })
    .select(
      "id, title, body, sent_at, audience, enrollment_filters, channel, segment_label, recipient_count, delivered_count, failed_count, clicked_count"
    )
    .single();

  if (error || !row) {
    throw new Error(`admin_broadcast_insert_failed: ${error?.message}`);
  }

  const campaign = rowToCampaign(row as BroadcastRow);
  prependAdminCampaignToCache(campaign);
  return campaign;
}

interface ScheduledBroadcastRow {
  id: string;
  title: string;
  body: string;
  audience: BroadcastAudience | null;
  enrollment_filters: BroadcastEnrollmentFilter[] | null;
  channel: BroadcastChannel;
  segment_label: string | null;
}

export async function processDueScheduledBroadcastsInDb(): Promise<{
  processed: number;
  failed: number;
  broadcastIds: string[];
}> {
  const supabase = createServiceDbClient();
  const now = new Date().toISOString();

  const { data: dueRows, error: fetchError } = await supabase
    .from("admin_broadcasts")
    .select(
      "id, title, body, audience, enrollment_filters, channel, segment_label"
    )
    .eq("status", "scheduled")
    .lte("scheduled_at", now)
    .order("scheduled_at", { ascending: true })
    .limit(20);

  if (fetchError) {
    throw new Error(`scheduled_broadcasts_fetch_failed: ${fetchError.message}`);
  }

  let processed = 0;
  let failed = 0;
  const broadcastIds: string[] = [];

  for (const due of (dueRows ?? []) as ScheduledBroadcastRow[]) {
    const { data: claimed, error: claimError } = await supabase
      .from("admin_broadcasts")
      .update({ status: "sending" })
      .eq("id", due.id)
      .eq("status", "scheduled")
      .select(
        "id, title, body, audience, enrollment_filters, channel, segment_label"
      )
      .maybeSingle();

    if (claimError || !claimed) {
      continue;
    }

    const audience = (claimed.audience ?? "all") as BroadcastAudience;
    const filters = (claimed.enrollment_filters ?? []) as BroadcastEnrollmentFilter[];
    const channel = claimed.channel as BroadcastChannel;

    try {
      const profileIds = await resolveBroadcastRecipientProfileIdsWithClient(supabase, {
        audience,
        filters,
      });

      const delivery = await deliverBroadcastPayloadWithClient(supabase, {
        title: claimed.title,
        body: claimed.body,
        audience,
        filters,
        channel,
        profileIds,
        broadcastId: claimed.id,
      });

      const sentAt = new Date().toISOString();
      const { data: updated, error: updateError } = await supabase
        .from("admin_broadcasts")
        .update({
          status: "sent",
          sent_at: sentAt,
          recipient_count: delivery.recipientCount,
          delivered_count: delivery.deliveredCount,
          failed_count: delivery.failedCount,
        })
        .eq("id", claimed.id)
        .select(
          "id, title, body, sent_at, audience, enrollment_filters, channel, segment_label, recipient_count, delivered_count, failed_count, clicked_count"
        )
        .single();

      if (updateError || !updated) {
        throw new Error(updateError?.message ?? "broadcast_update_failed");
      }

      patchAdminCampaignInCache(rowToCampaign(updated as BroadcastRow));
      processed += 1;
      broadcastIds.push(claimed.id);
    } catch (error) {
      failed += 1;
      console.error("[processDueScheduledBroadcastsInDb]", claimed.id, error);
      await supabase
        .from("admin_broadcasts")
        .update({ status: "failed" })
        .eq("id", claimed.id);
    }
  }

  return { processed, failed, broadcastIds };
}

export async function updateSystemNotificationRulesInDb(
  updates: { id: string; enabled: boolean }[]
): Promise<SystemNotificationRule[]> {
  const supabase = await createClient();
  const now = new Date().toISOString();

  for (const update of updates) {
    const { error } = await supabase
      .from("system_notification_rules")
      .update({ enabled: update.enabled, updated_at: now })
      .eq("rule_key", update.id);
    if (error) {
      throw new Error(`system_notification_rule_update_failed: ${error.message}`);
    }
  }

  const { data, error } = await supabase
    .from("system_notification_rules")
    .select("*")
    .order("rule_key");
  if (error) {
    throw new Error(`system_notification_rules_fetch_failed: ${error.message}`);
  }

  const rules =
    (data ?? []).length > 0
      ? ((data ?? []) as RuleRow[]).map(rowToRule)
      : FALLBACK_SYSTEM_NOTIFICATION_RULES;
  patchSystemNotificationRulesInCache(rules);
  return rules;
}

export async function reloadAdminDirectMessagesInDb(
  threadId: string
): Promise<DirectMessage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("admin_direct_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`admin_direct_messages_fetch_failed: ${error.message}`);
  }
  return ((data ?? []) as DirectMessageRow[]).map(rowToDirectMessage);
}

async function buildRecipientThreadPreview(
  row: DirectThreadRow
): Promise<DirectThreadPreview> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("admin_direct_messages")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", row.id)
    .eq("sender_role", "admin")
    .is("read_at", null);

  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.profile_id,
    displayName: ADMIN_SENDER_DISPLAY_NAME,
    subtitle: "Customer Support",
    lastMessage: row.last_message_preview,
    lastMessageAt: row.last_message_at ?? row.created_at,
    unread: count ?? 0,
  };
}

export async function getAdminDirectInboxForProfileInDb(profileId: string): Promise<{
  thread: DirectThreadPreview | null;
  messages: DirectMessage[];
}> {
  const supabase = await createClient();
  const { data: threadRow } = await supabase
    .from("admin_direct_threads")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (!threadRow) {
    return { thread: null, messages: [] };
  }

  const thread = await buildRecipientThreadPreview(threadRow as DirectThreadRow);
  const messages = await reloadAdminDirectMessagesInDb(threadRow.id);
  return { thread, messages };
}

export async function sendAdminDirectReplyFromRecipientInDb(input: {
  threadId: string;
  profileId: string;
  body: string;
}): Promise<DirectMessage> {
  const supabase = await createClient();
  const trimmed = input.body.trim();
  if (!trimmed) throw new Error("message_body_required");

  const { data: thread, error: threadError } = await supabase
    .from("admin_direct_threads")
    .select("*")
    .eq("id", input.threadId)
    .eq("profile_id", input.profileId)
    .single();
  if (threadError || !thread) throw new Error("thread_not_found");

  const senderRole = (thread as DirectThreadRow).target_type;

  const { data: row, error } = await supabase
    .from("admin_direct_messages")
    .insert({
      thread_id: input.threadId,
      sender_role: senderRole,
      sender_id: input.profileId,
      body: trimmed,
    })
    .select("*")
    .single();

  if (error || !row) {
    throw new Error(`admin_direct_message_send_failed: ${error?.message}`);
  }

  const now = new Date().toISOString();
  await supabase
    .from("admin_direct_threads")
    .update({
      last_message_at: now,
      last_message_preview: trimmed.slice(0, 200),
    })
    .eq("id", input.threadId);

  return rowToDirectMessage(row as DirectMessageRow);
}

export async function markAdminDirectThreadReadForRecipientInDb(
  threadId: string,
  profileId: string
): Promise<void> {
  const supabase = await createClient();
  const { data: thread } = await supabase
    .from("admin_direct_threads")
    .select("id")
    .eq("id", threadId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!thread) throw new Error("thread_not_found");

  const { error } = await supabase
    .from("admin_direct_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("thread_id", threadId)
    .eq("sender_role", "admin")
    .is("read_at", null);

  if (error) {
    throw new Error(`admin_direct_mark_read_failed: ${error.message}`);
  }
}
