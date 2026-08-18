import { LandingFooter, LandingHeader } from "@/components/landing/LandingSections";

type PolicyKind = "terms" | "privacy" | "refund";

const ko = {
  terms: { title: "이용약관", intro: "PassOn English 서비스 이용에 적용되는 기본 조건입니다.", items: ["계정 정보는 정확하게 입력하고 안전하게 관리해야 합니다.", "수업 신청, 일정 변경 및 서비스 이용은 화면에 안내된 절차와 운영 정책을 따릅니다.", "서비스 장애 또는 정책 문의는 고객센터로 접수할 수 있습니다."] },
  privacy: { title: "개인정보처리방침", intro: "회원가입과 수업 운영에 필요한 정보만 수집하고 서비스 제공 목적으로 이용합니다.", items: ["수집 항목: 계정 정보, 연락처, 학습자 정보, 수업 및 결제 처리 기록", "이용 목적: 본인 확인, 수업 운영, 고객지원, 서비스 보안", "열람·정정·삭제 요청은 support@passonenglish.com으로 접수할 수 있습니다."] },
  refund: { title: "수강 및 환불 규정", intro: "결석, 일정 변경, 보강 및 환불은 신청 시점과 진행된 수업을 기준으로 처리합니다.", items: ["공휴일 및 휴강 일정은 수업 캘린더와 별도 안내를 통해 확인합니다.", "일정 변경은 포털에서 요청하고 상대방 확인 후 확정됩니다.", "환불 금액과 처리 기준은 이용한 수업 및 관련 법령을 반영해 개별 안내합니다."] },
};

const zh = {
  terms: { title: "服务条款", intro: "使用 PassOn English 服务时适用的基本条件。", items: ["请准确填写并妥善管理账户信息。", "课程申请、改期和服务使用须遵循页面说明与运营政策。", "服务故障或政策问题可通过客服咨询。"] },
  privacy: { title: "隐私政策", intro: "仅收集注册与课程运营所需信息，并用于提供服务。", items: ["收集内容：账户、联系方式、学习者、课程与支付处理记录", "使用目的：身份确认、课程运营、客户支持与服务安全", "查阅、更正或删除请求请发送至 support@passonenglish.com。"] },
  refund: { title: "课程与退款规则", intro: "缺席、改期、补课和退款将根据申请时间与已使用课程处理。", items: ["节假日与停课安排请查看课程日历及相关通知。", "改期须在门户提交并经对方确认后生效。", "退款金额将依据已使用课程及适用法规另行说明。"] },
};

export function PolicyPage({ locale, kind }: { locale: string; kind: PolicyKind }) {
  const content = (locale === "zh-CN" ? zh : ko)[kind];
  const notice = locale === "zh-CN"
    ? "包含经营者信息与生效日期的最终政策文件将在运营信息确定后发布。"
    : "구체적인 사업자 정보와 시행일을 포함한 최종 정책 문서는 운영 정보 확정 후 게시해야 합니다.";
  return <div className={`min-h-screen locale-${locale}`}><LandingHeader locale={locale} /><main className="landing-container py-16 md:py-24"><article className="mx-auto max-w-3xl"><h1 className="landing-display text-4xl md:text-5xl">{content.title}</h1><p className="landing-prose mt-6">{content.intro}</p><ul className="mt-10 space-y-4">{content.items.map((item) => <li key={item} className="rounded-2xl border border-brand-100 bg-white p-5 leading-7 text-ink-muted">{item}</li>)}</ul><p className="mt-10 text-sm leading-7 text-ink-muted">{notice}</p></article></main><LandingFooter locale={locale} /></div>;
}
