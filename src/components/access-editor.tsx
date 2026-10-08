"use client";

import { useState } from "react";
import { pick } from "@/lib/i18n";
import { ACTION_COLUMNS, ACTION_LABEL, MODULES, MODULE_ACTIONS, MODULE_LABEL, ROLE_PRESETS, normalizePermissions, type Module } from "@/lib/permissions";
import { useLang } from "./lang-provider";

type Role = "ADMIN" | "MANAGER" | "VIEWER" | "CUSTOM";

/** Role presets plus a module × action grid. Ticking a box on a preset switches to CUSTOM, starting from that preset. */
export function AccessEditor({ defaultRole = "VIEWER", defaultPermissions = [] }: { defaultRole?: string; defaultPermissions?: string[] }) {
  const { lang, t } = useLang();
  const initialRole = (["ADMIN", "MANAGER", "VIEWER", "CUSTOM"].includes(defaultRole) ? defaultRole : "VIEWER") as Role;
  const [role, setRole] = useState<Role>(initialRole);
  const [custom, setCustom] = useState<string[]>(initialRole === "CUSTOM" ? normalizePermissions(defaultPermissions) : ROLE_PRESETS[initialRole as "VIEWER"]);
  const granted = new Set(role === "CUSTOM" ? custom : ROLE_PRESETS[role]);

  const presets: { id: Role; title: string; text: string }[] = [
    { id: "ADMIN", title: t("مسؤول", "Admin"), text: t("كل شيء + الإعدادات والأعضاء", "Everything + settings and members") },
    { id: "MANAGER", title: t("مدير", "Manager"), text: t("كل العمليات عدا الإعدادات", "All operations, no settings") },
    { id: "VIEWER", title: t("مستخدم", "User"), text: t("عرض وطباعة وتصدير فقط", "View, print and export only") },
    { id: "CUSTOM", title: t("مخصص", "Custom"), text: t("تختار كل صلاحية بنفسك", "Pick each permission yourself") },
  ];

  function choosePreset(next: Role) {
    if (next === "CUSTOM") setCustom([...granted]);
    setRole(next);
  }

  function update(change: (set: Set<string>) => void) {
    const set = new Set(granted);
    change(set);
    setCustom(normalizePermissions([...set]));
    setRole("CUSTOM");
  }

  function toggle(module: Module, action: string) {
    const key = `${module}.${action}`;
    update((set) => {
      if (set.has(key)) {
        set.delete(key);
        if (action === "view") MODULE_ACTIONS[module].forEach((item) => set.delete(`${module}.${item}`));
      } else set.add(key);
    });
  }

  function toggleRow(module: Module) {
    const all = MODULE_ACTIONS[module].every((action) => granted.has(`${module}.${action}`));
    update((set) => MODULE_ACTIONS[module].forEach((action) => (all ? set.delete(`${module}.${action}`) : set.add(`${module}.${action}`))));
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="role" value={role} />
      {role === "CUSTOM" ? custom.map((permission) => <input key={permission} type="hidden" name="perm" value={permission} />) : null}
      <div className="grid gap-2 sm:grid-cols-4">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => choosePreset(preset.id)}
            aria-pressed={role === preset.id}
            className={`rounded-xl border px-3 py-2 text-start transition ${role === preset.id ? "border-teal-700 bg-teal-50 ring-2 ring-teal-100" : "border-slate-200 bg-white hover:bg-slate-50"}`}
          >
            <span className="block text-sm font-bold text-slate-900">{preset.title}</span>
            <span className="block text-xs leading-5 text-slate-500">{preset.text}</span>
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs font-semibold text-slate-500">
              <th className="px-3 py-2 text-start">{t("القسم", "Section")}</th>
              {ACTION_COLUMNS.map((action) => (
                <th key={action} className="px-2 py-2 text-center">
                  {pick(ACTION_LABEL[action], lang)}
                </th>
              ))}
              <th className="px-2 py-2 text-center">{t("الكل", "All")}</th>
            </tr>
          </thead>
          <tbody>
            {MODULES.map((module) => {
              const actions = MODULE_ACTIONS[module];
              const all = actions.every((action) => granted.has(`${module}.${action}`));
              return (
                <tr key={module} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-800">{pick(MODULE_LABEL[module], lang)}</td>
                  {ACTION_COLUMNS.map((action) => (
                    <td key={action} className="px-2 py-2 text-center">
                      {actions.includes(action) ? (
                        <input
                          type="checkbox"
                          className="size-4 accent-teal-700"
                          checked={granted.has(`${module}.${action}`)}
                          onChange={() => toggle(module, action)}
                          aria-label={`${pick(MODULE_LABEL[module], lang)} — ${pick(ACTION_LABEL[action], lang)}`}
                        />
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-center">
                    <input type="checkbox" className="size-4 accent-teal-700" checked={all} onChange={() => toggleRow(module)} aria-label={t("الكل", "All")} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-5 text-slate-500">
        {role === "ADMIN"
          ? t("المسؤول يدير أيضاً إعدادات المنشأة والأعضاء والدعوات.", "Admins also manage company settings, members and invitations.")
          : t(
              "إلغاء «عرض» يُخفي القسم كاملاً من القائمة. منح أي إجراء يمنح العرض تلقائياً. الإعدادات والأعضاء للمسؤول فقط.",
              "Unticking View hides the whole section. Granting any action grants View. Settings and members stay admin-only.",
            )}
      </p>
    </div>
  );
}
