import type { Employee, EmployeeDocument } from "@prisma/client";
import { DOC_LABEL } from "./constants";
import { pick, type Lang } from "./i18n";

export type DocView = {
  key: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  type: string;
  label: string;
  number: string | null;
  expiry: Date | null;
  fileUrl: string | null;
  /** Set for uploaded documents; ID, passport and residence live on the employee record instead. */
  document?: EmployeeDocument;
};

type EmployeeWithDocs = Employee & { documents: EmployeeDocument[] };

function pushDoc(rows: DocView[], row: DocView) {
  if (!row.number && !row.expiry && !row.fileUrl) return;
  rows.push(row);
}

export function collectDocuments(employees: EmployeeWithDocs[], lang: Lang = "ar") {
  const rows: DocView[] = [];
  for (const employee of employees) {
    const base = { employeeId: employee.id, employeeName: employee.fullName, employeeNumber: employee.employeeNumber, fileUrl: null };
    pushDoc(rows, { ...base, key: `${employee.id}-id`, type: "ID_CARD", label: pick(DOC_LABEL.ID_CARD, lang), number: employee.idNumber, expiry: employee.idExpiry });
    pushDoc(rows, { ...base, key: `${employee.id}-passport`, type: "PASSPORT", label: pick(DOC_LABEL.PASSPORT, lang), number: employee.passportNumber, expiry: employee.passportExpiry });
    pushDoc(rows, { ...base, key: `${employee.id}-residence`, type: "RESIDENCE", label: pick(DOC_LABEL.RESIDENCE, lang), number: employee.residenceNumber, expiry: employee.residenceExpiry });
    for (const document of employee.documents) {
      pushDoc(rows, {
        ...base,
        key: document.id,
        type: document.type,
        label: pick(DOC_LABEL[document.type], lang, document.type),
        number: document.documentNo,
        expiry: document.expiryDate,
        fileUrl: document.fileUrl,
        document,
      });
    }
  }
  return rows;
}
