/** Lightweight stats for the built-in MoL guide — keeps the preview instant without loading 4k rows. */
export const BUILTIN_OCCUPATION_META = {
  total: 4313,
  byClass: { "1": 1634, "2": 1115, "3": 1564 } as Record<string, number>,
  sample: [
    { code: "1120001001", nameAr: "رئيس مجلس إدارة", nameEn: "Board of Directors Chairman", skillClass: "1" },
    { code: "1120001002", nameAr: "نائب رئيس مجلس إدارة", nameEn: "Board of Directors Deputy Chairman", skillClass: "1" },
    { code: "1120002001", nameAr: "رئيس تنفيذي", nameEn: "Chief Executive Officer", skillClass: "1" },
    { code: "1120002002", nameAr: "رئيس تنفيذي للعمليات", nameEn: "Chief Operation Officer", skillClass: "1" },
    { code: "1120002003", nameAr: "نائب رئيس تنفيذي", nameEn: "Deputy Chief Executive Officer", skillClass: "1" },
    { code: "1411005001", nameAr: "مدير وحدة الغسيل الجاف", nameEn: "Laundry Unit Manager", skillClass: "2" },
    { code: "2163008001", nameAr: "مصمم ديكور حرفي", nameEn: "Craftsman Decorator Designer", skillClass: "3" },
    { code: "5223046001", nameAr: "بائع ألعاب أطفال", nameEn: "Toys Seller", skillClass: "3" },
  ],
} as const;
