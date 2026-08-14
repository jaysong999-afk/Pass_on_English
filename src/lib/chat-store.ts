export type { PortalRole } from "@/lib/chat/repository";

export function getChatHref(role: import("@/lib/chat/repository").PortalRole, roomId: string, locale = "ko") {
  switch (role) {
    case "student":
      return `/${locale}/student/chat/${roomId}`;
    case "teacher":
      return `/teacher/chat/${roomId}`;
    case "admin":
      return `/admin/chat/${roomId}`;
  }
}

export function getAdminSupportHref(role: import("@/lib/chat/repository").PortalRole, locale = "ko") {
  switch (role) {
    case "student":
      return `/${locale}/student/chat/support`;
    case "teacher":
      return "/teacher/chat/support";
    case "admin":
      return "/admin/messages";
  }
}

export function getAdminDirectThreadHref(threadId: string) {
  return `/admin/messages?thread=${encodeURIComponent(threadId)}`;
}

export function getChatListHref(role: import("@/lib/chat/repository").PortalRole, locale = "ko") {
  switch (role) {
    case "student":
      return `/${locale}/student/chat`;
    case "teacher":
      return "/teacher/chat";
    case "admin":
      return "/admin/messages";
  }
}
