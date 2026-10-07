export type StudentAnnouncementPriority = "normal" | "important" | "urgent";
export type StudentAnnouncementStatus = "draft" | "published" | "archived";
export type StudentAnnouncementDisplayStatus =
  | StudentAnnouncementStatus
  | "scheduled"
  | "expired";

export interface StudentAnnouncement {
  id: string;
  priority: StudentAnnouncementPriority;
  title: string;
  body: string;
  startsAt: string;
  endsAt: string | null;
  portalWide: boolean;
  linkPath: string | null;
  linkLabel: string | null;
  updatedAt: string;
}

export interface AdminStudentAnnouncement {
  id: string;
  status: StudentAnnouncementStatus;
  displayStatus: StudentAnnouncementDisplayStatus;
  priority: StudentAnnouncementPriority;
  titleKo: string;
  bodyKo: string;
  titleZhCn: string;
  bodyZhCn: string;
  startsAt: string;
  endsAt: string | null;
  portalWide: boolean;
  linkPath: string | null;
  linkLabelKo: string | null;
  linkLabelZhCn: string | null;
  sortOrder: number;
  publishedAt: string | null;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertStudentAnnouncementInput {
  status: StudentAnnouncementStatus;
  priority: StudentAnnouncementPriority;
  titleKo: string;
  bodyKo: string;
  titleZhCn: string;
  bodyZhCn: string;
  startsAt: string;
  endsAt?: string | null;
  portalWide: boolean;
  linkPath?: string | null;
  linkLabelKo?: string | null;
  linkLabelZhCn?: string | null;
  sortOrder?: number;
}
