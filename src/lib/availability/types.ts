export type DayLabel = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

/** HH:mm — grid-aligned :00, :20, or :40 */
export type SlotStartTime = string;

export type WeeklySlotMap = Record<DayLabel, SlotStartTime[]>;

export type SlotStatus = "off" | "open" | "booked";

export interface TeacherWeeklyAvailability {
  teacherId: string;
  slots: WeeklySlotMap;
  updatedAt: string;
}

export interface TeacherScheduleSlotView {
  id: string;
  teacherId: string;
  dayOfWeek: number;
  dayLabel: DayLabel;
  startTime: SlotStartTime;
  endTime: SlotStartTime;
  /** Teacher enabled this block in availability sheet */
  isEnabled: boolean;
  /** Available for new student booking */
  isOpen: boolean;
  isBooked: boolean;
  lessonId?: string;
  studentName?: string;
}
