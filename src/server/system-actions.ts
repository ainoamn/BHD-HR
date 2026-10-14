"use server";

import { requireAdmin } from "@/lib/auth";
import { visibleErrorScope } from "@/lib/errors";
import { go } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { req } from "@/lib/utils";

const BACK = "/settings/system";

/** Marks one error group, or every open one this admin can see, as solved; a new occurrence reopens it. */
export async function resolveErrors(formData: FormData) {
  const user = await requireAdmin(BACK);
  const { t } = await getI18n();
  const { where } = visibleErrorScope(user.companyId, user.platformAdmin);
  const id = req(formData, "id");
  const { count } = await prisma.errorEvent.updateMany({ where: { ...where, resolvedAt: null, ...(id ? { id } : {}) }, data: { resolvedAt: new Date() } });
  go(BACK, { message: t(`عُلّم ${count} خطأ كمحلول`, `${count} error(s) marked solved`) });
}
