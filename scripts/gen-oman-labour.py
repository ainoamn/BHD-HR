# -*- coding: utf-8 -*-
"""Generate Oman labour regulation TypeScript modules from extracted DOCX text."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TMP = ROOT / ".tmp"
OUT = ROOT / "src" / "lib" / "oman-labour"
OUT.mkdir(parents=True, exist_ok=True)


def write_body(key: str, path: Path) -> None:
    text = path.read_text(encoding="utf-8").strip()
    safe = text.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")
    (OUT / f"{key}_body.ts").write_text(
        "/** Auto-extracted source text from Ministry of Labour model regulations. */\n"
        f"export const BODY = `{safe}`;\n",
        encoding="utf-8",
    )
    print(key, len(text), "chars")


def main() -> None:
    write_body("complaints", TMP / "نظام الشكاوى والتظلمات.txt")
    write_body("work_rules", TMP / "النموذج الاسترشادي للائحة نظام العمل.txt")
    penalties_path = next(TMP.glob("*الجزاءات*"))
    write_body("penalties_doc", penalties_path)

    clauses = [
        (1, "التأخير عن مواعيد الحضور حتى 15 دقيقة بدون إذن أو عذر مقبول ولم يترتب عليه تعطيل العمل",
         "Late up to 15 minutes without excuse, without disrupting work",
         ["إنذار كتابي", "5%", "10%", "20%"], "WARNING_1", "attendance"),
        (2, "التأخير عن مواعيد الحضور حتى 15 دقيقة بدون إذن أو عذر مقبول وترتب عليه تعطيل العمل",
         "Late up to 15 minutes without excuse, disrupting work",
         ["إنذار كتابي", "15%", "25%", "50%"], "WARNING_1", "attendance"),
        (3, "التأخير أكثر من 15 دقيقة حتى 30 دقيقة بدون إذن أو عذر مقبول ولم يترتب عليه تعطيل العمل",
         "Late more than 15 up to 30 minutes without disrupting work",
         ["10%", "15%", "25%", "50%"], "DEDUCTION_NOTICE", "attendance"),
        (4, "التأخير أكثر من 15 دقيقة حتى 30 دقيقة بدون إذن أو عذر مقبول وترتب عليه تعطيل عمال آخرين",
         "Late more than 15 up to 30 minutes, disrupting other workers",
         ["15%", "25%", "50%", "يوم واحد"], "DEDUCTION_NOTICE", "attendance"),
        (5, "التأخير أكثر من 30 دقيقة حتى 60 دقيقة بدون إذن أو عذر مقبول ولم يترتب عليه تعطيل العمل",
         "Late more than 30 up to 60 minutes without disrupting work",
         ["25%", "50%", "75%", "يوم واحد"], "DEDUCTION_NOTICE", "attendance"),
        (6, "التأخير أكثر من 30 دقيقة حتى 60 دقيقة بدون إذن أو عذر مقبول وترتب عليه تعطيل العمل",
         "Late more than 30 up to 60 minutes, disrupting work",
         ["50%", "75%", "يوم واحد", "يوم ونصف"], "DEDUCTION_NOTICE", "attendance"),
        (7, "التأخير لمدة تزيد على 60 دقيقة بدون إذن أو عذر مقبول",
         "Late more than 60 minutes without excuse",
         ["75%", "يوم واحد", "يوم ونصف", "يومان"], "DEDUCTION_NOTICE", "attendance"),
        (8, "الغياب بدون إذن أو عذر مقبول",
         "Absence without permission or acceptable excuse",
         ["25%", "50%", "يوم واحد", "يومان"], "ABSENCE_INQUIRY", "attendance"),
        (9, "ترك العمل أو الانصراف قبل الموعد بدون إذن أو عذر مقبول أو البقاء/العودة بعد انتهاء المواعيد بدون مبرر",
         "Leaving early or staying/returning after hours without justification",
         ["إنذار كتابي", "25%", "50%", "يوم واحد"], "WARNING_1", "attendance"),
        (10, "الخروج من غير المكان المحدد للخروج إذا كانت تعليمات المنشأة تتطلب ذلك",
         "Exiting other than the designated exit",
         ["25%", "50%", "يوم واحد", "يومان"], "DEDUCTION_NOTICE", "attendance"),
        (11, "استقبال زائرين في مكان العمل من غير العاملين بدون إذن",
         "Receiving visitors at work without permission",
         ["إنذار كتابي", "25%", "50%", "يوم واحد"], "WARNING_1", "conduct"),
        (12, "تناول الطعام في غير المكان أو الميعاد المحدد",
         "Eating outside the designated place or time",
         ["إنذار كتابي", "25%", "50%", "يوم واحد"], "WARNING_1", "conduct"),
        (13, "النوم أثناء ساعات العمل",
         "Sleeping during working hours",
         ["إنذار كتابي", "25%", "50%", "يوم واحد"], "WARNING_1", "conduct"),
        (14, "استعمال هاتف المنشأة لأغراض شخصية بدون إذن",
         "Using company phone for personal purposes without permission",
         ["إنذار كتابي", "25%", "50%", "يوم واحد"], "WARNING_1", "conduct"),
        (15, "وجود العامل في غير محله أثناء ساعات العمل بدون مبرر",
         "Being away from the workstation without justification",
         ["إنذار كتابي", "25%", "50%", "يوم واحد"], "WARNING_1", "conduct"),
        (16, "عدم إخطار صاحب العمل عن تغيير البيانات خلال 7 أيام بدون عذر مقبول",
         "Failure to notify of personal data changes within 7 days",
         ["50%", "يوم واحد", "يومان", "ثلاثة أيام"], "DEDUCTION_NOTICE", "other"),
        (17, "التلاعب في إثبات الحضور والانصراف",
         "Tampering with attendance records",
         ["يوم واحد", "يومان", "ثلاثة أيام", "خمسة أيام"], "INVESTIGATION", "integrity"),
        (18, "مخالفة أو عدم تنفيذ التعليمات المتعلقة بالعمل",
         "Violating or failing to follow work instructions",
         ["يوم واحد", "يومان", "ثلاثة أيام", "خمسة أيام"], "WARNING_1", "other"),
        (19, "التحريض على مخالفة الأوامر والتعليمات المكتوبة الخاصة بالعمل",
         "Inciting others to violate written work orders",
         ["يوم واحد", "يومان", "ثلاثة أيام", "خمسة أيام"], "INVESTIGATION", "conduct"),
        (20, "الإهمال أو التهاون عن أداء العمل وترتب عليه ضرر بصحة أو سلامة العمال أو ضرر في المواد والأدوات",
         "Negligence causing harm to safety or materials",
         ["يوم واحد", "يومان", "ثلاثة أيام", "خمسة أيام"], "INVESTIGATION", "safety"),
        (21, "النوم أثناء العمل في الحالات التي تستدعي اليقظة المستمرة",
         "Sleeping on duty where continuous alertness is required",
         ["يوم واحد", "ثلاثة أيام", "خمسة أيام", "الفصل مع المكافأة"], "INVESTIGATION", "safety"),
        (22, "وجود العامل أثناء ساعات العمل في حالة سكر أو متأثراً بمادة مخدرة أو مؤثر عقلي",
         "Being intoxicated or under the influence of drugs at work",
         ["الفصل بدون مكافأة", "الفصل بدون مكافأة", "الفصل بدون مكافأة", "الفصل بدون مكافأة"], "INVESTIGATION", "safety"),
        (23, "التدخين في الأماكن المحظور فيها في مقر العمل",
         "Smoking in prohibited workplace areas",
         ["يومان", "ثلاثة أيام", "خمسة أيام", "الفصل مع المكافأة"], "DEDUCTION_NOTICE", "safety"),
        (24, "تعمد إنقاص الإنتاج أو الإهمال الذي يؤدي إلى عدم جودته",
         "Deliberately reducing output or negligence affecting quality",
         ["يوم واحد", "يومان", "ثلاثة أيام", "خمسة أيام"], "WARNING_1", "other"),
        (25, "عدم مراعاة التعليمات المكتوبة اللازمة لسلامة العمال ومقر العمل",
         "Failing to follow written safety instructions",
         ["إنذار كتابي", "يوم واحد", "ثلاثة أيام", "الفصل بدون مكافأة"], "WARNING_1", "safety"),
        (26, "إدخال أشياء غير مصرح بها في مقر العمل أو إجراء معاملات تجارية في مقر العمل",
         "Bringing unauthorized items or conducting trade at work",
         ["يوم واحد", "يومان", "ثلاثة أيام", "خمسة أيام"], "DEDUCTION_NOTICE", "other"),
        (27, "جمع تبرعات نقدية بدون إذن",
         "Collecting cash donations without permission",
         ["إنذار كتابي", "25%", "50%", "يوم واحد"], "WARNING_1", "conduct"),
        (28, "كتابة بيانات أو عبارات أو لصق إعلانات في مقر العمل بدون إذن",
         "Writing or posting notices at work without permission",
         ["50%", "يوم واحد", "يومان", "ثلاثة أيام"], "DEDUCTION_NOTICE", "conduct"),
        (29, "الإسراف في استهلاك المواد والأدوات دون سبب مقبول",
         "Wasteful use of materials without acceptable reason",
         ["إنذار كتابي", "25%", "50%", "يوم واحد"], "WARNING_1", "other"),
        (30, "استعمال المواد والأدوات أو الآلات في أغراض خاصة",
         "Using materials or machinery for personal purposes",
         ["يوم واحد", "يومان", "ثلاثة أيام", "خمسة أيام"], "DEDUCTION_NOTICE", "other"),
        (31, "رفض العامل العمل المكلف به بدون مبرر (شريطة ألا يختلف جوهرياً عن عمله الأصلي)",
         "Refusing assigned work without justification",
         ["إنذار كتابي", "إثبات الرفض ويُعد مستقيلاً", "إثبات الرفض ويُعد مستقيلاً", "إثبات الرفض ويُعد مستقيلاً"], "WARNING_1", "other"),
        (32, "الادعاء كذباً على الرؤساء أو زملاء العمل مما يؤدي إلى تعطيل العمل",
         "False accusations against supervisors or colleagues disrupting work",
         ["50%", "يوم واحد", "يومان", "ثلاثة أيام"], "INVESTIGATION", "integrity"),
        (33, "مخالفة الاشتراطات الصحية الصادرة عن الجهات المختصة المتعلقة بالعمل",
         "Violating official health requirements related to work",
         ["75%", "يوم واحد", "يومان", "ثلاثة أيام"], "DEDUCTION_NOTICE", "safety"),
        (34, "رفض التفتيش بدون مبرر عند الانصراف من العمل",
         "Refusing inspection without justification when leaving work",
         ["يوم واحد", "يومان", "ثلاثة أيام", "خمسة أيام"], "DEDUCTION_NOTICE", "safety"),
        (35, "الامتناع عن إجراء الكشف الطبي إذا استدعى الأمر ذلك وبدون عذر مقبول",
         "Refusing a required medical examination without excuse",
         ["يوم واحد", "يومان", "ثلاثة أيام", "خمسة أيام"], "DEDUCTION_NOTICE", "safety"),
        (36, "التصرف بطريقة غير لائقة في مقر العمل",
         "Inappropriate conduct at the workplace",
         ["إنذار كتابي", "50%", "يوم واحد", "يومان"], "WARNING_1", "conduct"),
        (37, "التفوه بألفاظ تمس العادات والتقاليد أو تخدش الحياء أو لا تحترم دين أو عقيدة الآخرين أثناء العمل",
         "Using language that offends customs, modesty, or others' religion",
         ["يوم واحد", "يومان", "ثلاثة أيام", "خمسة أيام"], "INVESTIGATION", "conduct"),
        (38, "التشاجر اللفظي أو بالإشارة مع الزملاء في مقر العمل",
         "Verbal or gestural quarrel with colleagues at work",
         ["يوم واحد", "يومان", "ثلاثة أيام", "خمسة أيام"], "WARNING_1", "conduct"),
        (39, "الاعتداء البسيط على الرؤساء أو الزملاء في مقر العمل",
         "Minor assault on supervisors or colleagues at work",
         ["يومان", "ثلاثة أيام", "أربعة أيام", "خمسة أيام"], "INVESTIGATION", "conduct"),
        (40, "عدم توريد المبالغ المحصلة لحساب المنشأة في الموعد المحدد دون مبرر",
         "Failure to remit collected company funds on time",
         ["يومان", "ثلاثة أيام", "خمسة أيام", "الفصل مع المكافأة"], "INVESTIGATION", "integrity"),
        (41, "قبول مبالغ أو هدايا بقصد التأثير على العامل لأداء عمل متعلق بالمنشأة أو الامتناع عنه",
         "Accepting bribes or gifts to influence work-related acts",
         ["الفصل مع المكافأة", "الفصل مع المكافأة", "الفصل مع المكافأة", "الفصل مع المكافأة"], "INVESTIGATION", "integrity"),
        (42, "الإساءة بسمعة المنشأة أو العمال بأي وسيلة بما فيها وسائل التواصل الاجتماعي",
         "Harming the reputation of the company or workers, including on social media",
         ["ثلاثة أيام", "خمسة أيام", "الحرمان من العلاوة الدورية", "الفصل مع المكافأة"], "INVESTIGATION", "integrity"),
        (43, "الإخلال الجسيم في إتمام التدريب ودورات التطوير الإجبارية بنجاح التي التزمت المنشأة بسدادها",
         "Serious failure to complete mandatory training paid by the company",
         ["إنذار كتابي", "يومان", "ثلاثة أيام", "الفصل مع المكافأة"], "WARNING_1", "other"),
        (44, "سوء استعمال الرؤساء للسلطات المخولة لهم",
         "Abuse of authority by supervisors",
         ["إنذار كتابي", "يومان", "ثلاثة أيام", "الفصل مع المكافأة"], "INVESTIGATION", "conduct"),
        (45, "الامتناع عن الحضور أو رفض الإدلاء بالأقوال في التحقيق أو الامتناع عن تقديم الأوراق والمستندات",
         "Refusing to attend or give evidence in an investigation",
         ["يوم واحد", "يومان", "ثلاثة أيام", "الفصل مع المكافأة"], "INVESTIGATION", "integrity"),
        (46, "الاعتداء بالقول أو الإشارة على الزملاء في مقر العمل",
         "Verbal or gestural assault on colleagues at work",
         ["يومان", "ثلاثة أيام", "أربعة أيام", "خمسة أيام"], "INVESTIGATION", "conduct"),
        (47, "تقديم بلاغ أو شكوى على الرؤساء أو الزملاء وثبت أنها كيدية",
         "Filing a malicious complaint against supervisors or colleagues",
         ["يومان", "ثلاثة أيام", "خمسة أيام", "الفصل مع المكافأة"], "INVESTIGATION", "integrity"),
        (48, "أداء أي أعمال للغير بأجر أو بدون أجر في أوقات العمل",
         "Performing work for others during working hours",
         ["يوم واحد", "يومان", "ثلاثة أيام", "خمسة أيام"], "WARNING_1", "other"),
        (49, "حصول العامل على فائدة أو منفعة بسبب العمل لنفسه أو للغير بدون إذن أو سبب مشروع",
         "Obtaining a personal benefit from work without permission",
         ["يوم واحد", "يومان", "ثلاثة أيام", "خمسة أيام"], "INVESTIGATION", "integrity"),
        (50, "تدخل العامل دون وجه حق في أي عمل ليس في اختصاصه أو لم يعهد به إليه",
         "Interfering in work outside one's duties",
         ["يوم واحد", "يومان", "ثلاثة أيام", "خمسة أيام"], "WARNING_1", "other"),
        (51, "الإضراب عن العمل بدون اتباع الإجراءات القانونية",
         "Strike without following legal procedures",
         ["الفصل مع المكافأة", "الفصل مع المكافأة", "الفصل مع المكافأة", "الفصل مع المكافأة"], "INVESTIGATION", "other"),
    ]

    lines = [
        "/** Model schedule of sanctions — Ministerial Decision 618/2024 (Oman private sector). */",
        'import type { LetterKind } from "@/lib/letters";',
        "",
        "export type OmanPenaltyClause = {",
        "  code: string;",
        "  number: number;",
        "  titleAr: string;",
        "  titleEn: string;",
        "  /** Graduated sanctions: 1st–4th occurrence (within 6 months). */",
        "  sanctions: [string, string, string, string];",
        "  /** Suggested letter kind when issuing for this clause. */",
        "  defaultKind: LetterKind;",
        '  category: "attendance" | "conduct" | "safety" | "integrity" | "other";',
        "};",
        "",
        "export const OMAN_PENALTY_CLAUSES: OmanPenaltyClause[] = [",
    ]
    for n, ar, en, sanc, kind, cat in clauses:
        code = f"OMAN-618-{n:02d}"
        lines.append("  {")
        lines.append(f"    code: {json.dumps(code)},")
        lines.append(f"    number: {n},")
        lines.append(f"    titleAr: {json.dumps(ar, ensure_ascii=False)},")
        lines.append(f"    titleEn: {json.dumps(en, ensure_ascii=False)},")
        lines.append(f"    sanctions: [{', '.join(json.dumps(s, ensure_ascii=False) for s in sanc)}],")
        lines.append(f"    defaultKind: {json.dumps(kind)},")
        lines.append(f"    category: {json.dumps(cat)},")
        lines.append("  },")
    lines.append("];")
    lines.append("")
    lines.append("export function omanPenaltyByCode(code: string) {")
    lines.append("  return OMAN_PENALTY_CLAUSES.find((c) => c.code === code) ?? null;")
    lines.append("}")
    lines.append("")
    (OUT / "penalties.ts").write_text("\n".join(lines), encoding="utf-8")
    print("penalties", len(clauses))


if __name__ == "__main__":
    main()
