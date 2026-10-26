import { Prisma } from "@prisma/client";
import { newBadgeToken } from "./badge";
import { employeeNumberScope, nextEmployeeNumber } from "./employee-number";
import { prisma } from "./prisma";
import { formatDate, isUniqueError } from "./utils";

export type TransferResult = {
  unchanged: boolean;
  /** Previous record (kept at the old sponsor with status TRANSFERRED). */
  fromEmployeeId: string;
  /** New record at the destination sponsor (personal data only). */
  toEmployeeId: string;
  fullName: string;
  fromEmployerId: string | null;
  fromEmployerName: string | null;
  toEmployerId: string | null;
  toEmployerName: string | null;
  oldNumber: string;
  newNumber: string;
};

function appendNote(existing: string | null | undefined, line: string) {
  const base = (existing || "").trim();
  return base ? `${base}\n${line}`.slice(0, 500) : line.slice(0, 500);
}

/**
 * Transfer within the same company (منشأة) to another sponsor (كفيل):
 * - Old file stays with its number and financial history; status → TRANSFERRED.
 * - New file gets personal data only, a new employee number, and empty payroll.
 */
export async function transferEmployeeToEmployer(input: {
  companyId: string;
  employeeId: string;
  toEmployerId: string | null;
}): Promise<TransferResult> {
  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, companyId: input.companyId },
    include: {
      employer: { select: { id: true, name: true } },
      documents: true,
    },
  });
  if (!employee) throw new Error("employee_not_found");
  if (employee.status === "TRANSFERRED") throw new Error("already_transferred");

  const toEmployerId = input.toEmployerId;
  if ((employee.employerId || null) === (toEmployerId || null)) {
    return {
      unchanged: true,
      fromEmployeeId: employee.id,
      toEmployeeId: employee.id,
      fullName: employee.fullName,
      fromEmployerId: employee.employerId,
      fromEmployerName: employee.employer?.name ?? null,
      toEmployerId: employee.employerId,
      toEmployerName: employee.employer?.name ?? null,
      oldNumber: employee.employeeNumber,
      newNumber: employee.employeeNumber,
    };
  }

  const toEmployer = toEmployerId
    ? await prisma.employer.findFirst({
        where: { id: toEmployerId, companyId: input.companyId },
        select: { id: true, name: true },
      })
    : null;
  if (toEmployerId && !toEmployer) throw new Error("employer_not_found");

  const fromName = employee.employer?.name ?? null;
  const toName = toEmployer?.name ?? null;
  const oldNumber = employee.employeeNumber;
  const numberScope = employeeNumberScope(toEmployerId);

  for (let attempt = 0; ; attempt += 1) {
    const newNumber = await nextEmployeeNumber(input.companyId, toEmployerId);
    const when = formatDate(new Date());
    const oldNote = `نُقل في ${when} إلى ${toName || "بدون كفيل"} برقم ${newNumber}`;
    const newNote = `نُقل في ${when} من ${fromName || "بدون كفيل"} (كان ${oldNumber}) — بلا ترحيل للرواتب أو السجل المالي السابق`;

    try {
      const created = await prisma.$transaction(async (tx) => {
        const next = await tx.employee.create({
          data: {
            companyId: input.companyId,
            employerId: toEmployerId,
            numberScope,
            employeeNumber: newNumber,
            badgeToken: newBadgeToken(),
            status: "ACTIVE",
            joiningDate: new Date(),
            contractEnd: null,
            basicSalary: 0,
            housingAllowance: 0,
            transportAllowance: 0,
            otherAllowance: 0,
            bankBic: null,
            bankAccount: null,
            annualLeaveDays: 30,
            sickLeaveDays: 0,
            otherLeaveDays: 0,
            managerId: null,
            portalToken: null,
            notes: newNote,
            fullName: employee.fullName,
            nameEn: employee.nameEn,
            nationality: employee.nationality,
            gender: employee.gender,
            dateOfBirth: employee.dateOfBirth,
            phone: employee.phone,
            email: employee.email,
            address: employee.address,
            idNumber: employee.idNumber,
            idExpiry: employee.idExpiry,
            idFileUrl: employee.idFileUrl,
            passportNumber: employee.passportNumber,
            passportExpiry: employee.passportExpiry,
            passportFileUrl: employee.passportFileUrl,
            residenceNumber: employee.residenceNumber,
            residenceExpiry: employee.residenceExpiry,
            residenceFileUrl: employee.residenceFileUrl,
            photoUrl: employee.photoUrl,
            cv: employee.cv === null ? Prisma.DbNull : employee.cv,
            cvUpdatedAt: employee.cvUpdatedAt,
            jobTitle: employee.jobTitle,
            jobTitleEn: employee.jobTitleEn,
            jobCode: employee.jobCode,
            jobClass: employee.jobClass,
            jobTitleId: employee.jobTitleId,
            department: employee.department,
            departmentEn: employee.departmentEn,
            departmentId: employee.departmentId,
            scheduleId: employee.scheduleId,
          },
        });

        if (employee.documents.length) {
          await tx.employeeDocument.createMany({
            data: employee.documents.map((doc) => ({
              employeeId: next.id,
              type: doc.type,
              documentNo: doc.documentNo,
              expiryDate: doc.expiryDate,
              fileUrl: doc.fileUrl,
              notes: doc.notes,
              reviewedAt: doc.reviewedAt,
            })),
          });
        }

        await tx.employee.update({
          where: { id: employee.id },
          data: {
            status: "TRANSFERRED",
            transferredToId: next.id,
            portalToken: null,
            notes: appendNote(employee.notes, oldNote),
          },
        });

        await tx.membership.updateMany({
          where: { employeeId: employee.id },
          data: { employeeId: next.id },
        });

        return next;
      });

      return {
        unchanged: false,
        fromEmployeeId: employee.id,
        toEmployeeId: created.id,
        fullName: employee.fullName,
        fromEmployerId: employee.employerId,
        fromEmployerName: fromName,
        toEmployerId,
        toEmployerName: toName,
        oldNumber,
        newNumber,
      };
    } catch (error) {
      if (!isUniqueError(error) || attempt >= 4) throw error;
    }
  }
}

export async function previewTransferNumber(companyId: string, employerId: string | null) {
  return nextEmployeeNumber(companyId, employerId);
}
