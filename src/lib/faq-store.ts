import type { FaqItem, UpsertFaqInput } from "@/types";

const SEED: FaqItem[] = [
  {
    id: "faq-1",
    categoryKo: "무료 체험",
    categoryZh: "免费体验",
    questionKo: "무료 체험은 어떻게 신청하나요?",
    questionZh: "如何申请免费体验？",
    answerKo:
      "회원가입 후 간단한 설문을 작성하고, 신규 수강신청에서 요금제·선생님·수업 시간을 선택하면 첫 1회 수업이 무료 체험으로 예약됩니다. 체험 후 만족하시면 입금 신고를 통해 본 수강을 시작할 수 있습니다.",
    answerZh:
      "注册并完成简短问卷后，在「新选课」中选择套餐、老师和上课时间，第一节课将作为免费体验预约。体验满意后，可通过提交付款通知开始正式课程。",
    sortOrder: 10,
    published: true,
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "faq-2",
    categoryKo: "수강신청·결제",
    categoryZh: "选课与支付",
    questionKo: "결제(입금)는 언제 하면 되나요?",
    questionZh: "什么时候需要付款？",
    answerKo:
      "무료 체험 전에는 결제가 필요 없습니다. 체험 수업 후 수강을 결정하시면, 수강신청 단계에서 안내된 계좌로 입금하신 뒤 포털에서 「입금 신고」를 해 주세요. 관리자 확인 후 수업이 활성화됩니다.",
    answerZh:
      "免费体验前无需付款。体验课结束后若决定继续学习，请按选课页面提示的账户汇款，并在门户中「提交付款通知」。管理员确认后课程将激活。",
    sortOrder: 20,
    published: true,
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "faq-3",
    categoryKo: "수강신청·결제",
    categoryZh: "选课与支付",
    questionKo: "입금 확인은 얼마나 걸리나요?",
    questionZh: "付款确认需要多久？",
    answerKo:
      "입금 신고 후 영업일 기준 1~2일 내 관리자가 확인합니다. 확인이 완료되면 선택하신 요금제에 따라 수업 일정이 자동 등록되며, 「내 수업」에서 확인할 수 있습니다.",
    answerZh:
      "提交付款通知后，管理员将在 1~2 个工作日内确认。确认完成后，系统将根据所选套餐自动安排课表，可在「我的课程」中查看。",
    sortOrder: 30,
    published: true,
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "faq-4",
    categoryKo: "수업 일정",
    categoryZh: "上课安排",
    questionKo: "수업 시간은 어떻게 정하나요?",
    questionZh: "上课时间如何确定？",
    answerKo:
      "수강신청 시 선생님이 가능한 시간 중 하나를 선택합니다. 선택한 시간은 요금제의 모든 수업 요일(예: 월~금)에 동일하게 적용됩니다. 예를 들어 주 5회 요금제에서 오전 10:00을 선택하면, 월·화·수·목·금 모두 10:00(KST)에 수업이 진행됩니다.",
    answerZh:
      "选课时从老师可用时间中选择一项。所选时间将统一应用于套餐的所有上课日（例如周一至周五）。例如每周 5 次套餐选择上午 10:00，则周一至周五均在 10:00（KST）上课。",
    sortOrder: 40,
    published: true,
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "faq-5",
    categoryKo: "수업 일정",
    categoryZh: "上课安排",
    questionKo: "수업 시간 변경은 가능한가요?",
    questionZh: "可以更改上课时间吗？",
    answerKo:
      "학생은 월 2회까지 수업 시간 변경을 요청할 수 있습니다(선생님 승인 필요). 급한 일정 변경이나 선생님 사정으로 인한 변경은 채팅 또는 운영팀을 통해 협의할 수 있습니다. 관리자·선생님 승인 후 일정에 반영됩니다.",
    answerZh:
      "学生每月最多可申请 2 次改期（需老师确认）。紧急变更或因老师原因的调整，可通过聊天或联系运营团队协商。经管理员或老师确认后将更新课表。",
    sortOrder: 50,
    published: true,
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "faq-6",
    categoryKo: "수업 안내",
    categoryZh: "课程说明",
    questionKo: "한 수업은 몇 분인가요?",
    questionZh: "每节课多长时间？",
    answerKo:
      "본 수업은 20분이며, 20분 단위 타임슬롯(:00·:20·:40)으로 운영됩니다. 휴식은 선생님이 Availability에서 슬롯을 비워 자율 관리합니다. 요금제의 「N회」는 실제 수업 횟수를 의미합니다.",
    answerZh:
      "每节正式课程为 20 分钟，采用 20 分钟时段（:00、:20、:40）。休息由老师在可用时间里关闭时段自行安排。套餐中的「N 次」指实际上课次数。",
    sortOrder: 60,
    published: true,
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "faq-7",
    categoryKo: "계정·가족",
    categoryZh: "账户与家庭",
    questionKo: "한 계정에 자녀를 여러 명 등록할 수 있나요?",
    questionZh: "一个账户可以注册多个孩子吗？",
    answerKo:
      "네. 보호자 계정으로 가입하시면 자녀(수강생)를 추가할 수 있으며, 포털 상단에서 수강생을 전환하며 각각 수강신청·수업·학습 결과를 관리할 수 있습니다.",
    answerZh:
      "可以。以家长账户注册后可添加多名学员，在门户顶部切换学员，分别管理选课、课程和学习成果。",
    sortOrder: 70,
    published: true,
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "faq-8",
    categoryKo: "소통",
    categoryZh: "沟通",
    questionKo: "선생님과 어떻게 소통하나요?",
    questionZh: "如何与老师沟通？",
    answerKo:
      "포털의 「채팅」 메뉴에서 배정된 선생님과 1:1 메시지를 주고받을 수 있습니다. 수업 일정, 숙제, 학습 피드백 등은 채팅과 「학습결과」 탭에서 확인하세요.",
    answerZh:
      "可在门户「聊天」菜单中与分配的老师一对一留言。课表、作业和学习反馈可在聊天及「学习成果」中查看。",
    sortOrder: 80,
    published: true,
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "faq-9",
    categoryKo: "환불·변경",
    categoryZh: "退款与变更",
    questionKo: "중도 환불이 가능한가요?",
    questionZh: "可以中途退款吗？",
    answerKo:
      "잔여 수업 회차 기준으로 환불이 가능합니다. 환불 요청은 채팅 또는 고객센터 이메일로 접수해 주시면, 이용 약관에 따라 미진행 회차 금액을 정산해 드립니다. (체험 수업은 무료이므로 환불 대상이 아닙니다.)",
    answerZh:
      "可按剩余课时申请退款。请通过聊天或客服邮箱提交申请，我们将按使用条款结算未上课程费用。（免费体验课不属于退款范围。）",
    sortOrder: 90,
    published: true,
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "faq-10",
    categoryKo: "기타",
    categoryZh: "其他",
    questionKo: "수업 시간대(타임존)는 어떻게 되나요?",
    questionZh: "课程使用什么时区？",
    answerKo:
      "수업 일정은 한국 표준시(KST, UTC+9)를 기준으로 표시·운영됩니다. 중국 거주 학생 포털에서는 현지 시간으로 함께 표시될 수 있습니다. 해외 체류 중이시라면 수강신청 전 시간대를 꼭 확인해 주세요.",
    answerZh:
      "课表以韩国标准时间（KST，UTC+9）为准显示和安排。中国学生门户可能同时显示当地时间。如在海外，请在选课前确认时差。",
    sortOrder: 100,
    published: true,
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
];

let items: FaqItem[] = structuredClone(SEED);

function cloneItem(item: FaqItem): FaqItem {
  return { ...item };
}

function sortItems(list: FaqItem[]): FaqItem[] {
  return list.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

export function getAllFaqItems(): FaqItem[] {
  return sortItems(items).map(cloneItem);
}

export function getPublishedFaqItems(): FaqItem[] {
  return sortItems(items.filter((item) => item.published)).map(cloneItem);
}

export function getFaqItemById(id: string): FaqItem | undefined {
  const item = items.find((x) => x.id === id);
  return item ? cloneItem(item) : undefined;
}

export function createFaqItem(input: UpsertFaqInput): FaqItem {
  const maxOrder = items.reduce((max, item) => Math.max(max, item.sortOrder), 0);
  const item: FaqItem = {
    id: `faq-${Date.now()}`,
    categoryKo: input.categoryKo.trim(),
    categoryZh: input.categoryZh.trim(),
    questionKo: input.questionKo.trim(),
    questionZh: input.questionZh.trim(),
    answerKo: input.answerKo.trim(),
    answerZh: input.answerZh.trim(),
    sortOrder: input.sortOrder ?? maxOrder + 10,
    published: input.published ?? true,
    updatedAt: new Date().toISOString(),
  };
  items.push(item);
  return cloneItem(item);
}

export function updateFaqItem(id: string, input: UpsertFaqInput): FaqItem | null {
  const index = items.findIndex((x) => x.id === id);
  if (index === -1) return null;

  items[index] = {
    ...items[index],
    categoryKo: input.categoryKo.trim(),
    categoryZh: input.categoryZh.trim(),
    questionKo: input.questionKo.trim(),
    questionZh: input.questionZh.trim(),
    answerKo: input.answerKo.trim(),
    answerZh: input.answerZh.trim(),
    sortOrder: input.sortOrder ?? items[index].sortOrder,
    published: input.published ?? items[index].published,
    updatedAt: new Date().toISOString(),
  };
  return cloneItem(items[index]);
}

export function deleteFaqItem(id: string): boolean {
  const before = items.length;
  items = items.filter((x) => x.id !== id);
  return items.length < before;
}

/** @internal */
export function resetFaqStore() {
  items = structuredClone(SEED);
}
