"use server";

import { requireUser } from "@/lib/auth";
import { briefDay, briefScope } from "@/lib/brief";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";

export async function refreshDailyBrief() {
  const user = await requireUser();
  const { lang } = await getI18n();
  await prisma.dailyBrief.deleteMany({ where: { companyId: user.companyId, day: briefDay(), lang, scope: briefScope(user.permissions) } });
  refreshAll();
  go("/#brief");
}
