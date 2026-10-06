begin;

insert into public.faq_items (
  id,
  category_ko,
  category_zh,
  question_ko,
  question_zh,
  answer_ko,
  answer_zh,
  sort_order,
  published,
  updated_at
)
values (
  '00000000-0000-0000-0001-000000000009'::uuid,
  '환불·변경',
  '退款与变更',
  '수강 중 취소하면 환불받을 수 있나요?',
  '中途退课可以退款吗？',
  '네. 정규수업 총 20회(무료체험 제외) 기준으로 다음과 같이 환불해드립니다. ① 수업 시작 전: 결제한 수강료 전액 ② 1~6회 진행: 결제한 수강료의 2/3 ③ 7~9회 진행: 결제한 수강료의 1/2 ④ 10회 이상 진행: 환불 대상에서 제외됩니다. 환불 금액은 요청 접수일까지 진행된 정규수업을 기준으로 산정하며, 학생 개인 사정으로 결석한 수업은 진행 횟수에 포함됩니다. 회사 또는 강사의 사정으로 제공되지 못한 수업은 진행 횟수에서 제외하고 보강 수업 또는 해당 수업료 환불 등으로 안내드립니다. 정확한 금액은 신청 내역과 수업 기록을 확인한 후 안내드립니다.',
  '可以。以共 20 节正式课程（不含免费试听）为基准，按以下标准办理退款：① 开课前：退还已支付学费全额；② 已进行 1–6 节：退还已支付学费的 2/3；③ 已进行 7–9 节：退还已支付学费的 1/2；④ 已进行 10 节及以上：不属于退款范围。退款金额以申请受理日前已进行的正式课程次数计算；因学生个人原因缺席的课程计入已进行次数；因本公司或教师原因未能提供的课程不计入已进行次数，我们将通过补课或退还相应课时费用等方式另行处理。最终退款金额将在核对申请信息和上课记录后告知。',
  90,
  true,
  now()
)
on conflict (id) do update set
  category_ko = excluded.category_ko,
  category_zh = excluded.category_zh,
  question_ko = excluded.question_ko,
  question_zh = excluded.question_zh,
  answer_ko = excluded.answer_ko,
  answer_zh = excluded.answer_zh,
  sort_order = excluded.sort_order,
  published = excluded.published,
  updated_at = excluded.updated_at;

commit;
