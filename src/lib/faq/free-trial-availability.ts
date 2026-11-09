import type { FaqItem } from "@/types";

const FREE_TRIAL_SIGNUP_FAQ_ID = "00000000-0000-0000-0001-000000000001";
const FREE_TRIAL_PAYMENT_FAQ_ID = "00000000-0000-0000-0001-000000000002";

export function applyFreeTrialAvailabilityToFaq(
  items: FaqItem[],
  freeTrialEnabled: boolean
): FaqItem[] {
  if (freeTrialEnabled) return items;

  return items.map((item) => {
    if (item.id === FREE_TRIAL_SIGNUP_FAQ_ID) {
      return {
        ...item,
        categoryKo: "회원가입·수강신청",
        categoryZh: "注册与报名",
        questionKo: "이관 기간에도 회원가입할 수 있나요?",
        questionZh: "迁移期间可以注册吗？",
        answerKo:
          "네. 기존 수강생 전환 기간에도 회원가입과 정규 수강신청은 정상적으로 이용할 수 있습니다. 다만 무료체험 수업은 전환이 완료될 때까지 일시 중단됩니다.",
        answerZh:
          "可以。现有学员迁移期间仍可正常注册并申请正式课程，但免费试听将在迁移完成前暂时停止。",
      };
    }

    if (item.id === FREE_TRIAL_PAYMENT_FAQ_ID) {
      return {
        ...item,
        answerKo:
          "현재는 무료체험 없이 정규 수강신청으로 진행합니다. 수강신청 단계에서 안내된 계좌로 입금한 뒤 포털에서 「입금 신고」를 해 주세요. 관리자 확인 후 수업이 활성화됩니다.",
        answerZh:
          "目前暂停免费试听，将直接申请正式课程。请按报名页面提示的账户汇款，并在门户中提交付款通知。管理员确认后课程将激活。",
      };
    }

    return item;
  });
}
