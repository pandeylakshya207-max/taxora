"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auditData } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { requireSession } from "@/lib/auth/session";
import { fieldErrorsFrom, isUniqueViolation, readFields, type FormState } from "@/lib/form";
import type { BusinessTypeValue } from "@/lib/format";
import { CLIENT_FIELDS, clientSchema } from "./validation";

export async function createClient(_prev: FormState, formData: FormData): Promise<FormState> {
  // The firm always comes from the server-side session — never from the form.
  const session = await requireSession();
  const values = readFields(formData, CLIENT_FIELDS);

  const parsed = clientSchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error), values };
  }
  const input = parsed.data;

  let clientId: string;
  try {
    clientId = await db.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          firmId: session.firm.id,
          createdById: session.user.id,
          name: input.name,
          gstin: input.gstin,
          stateCode: input.stateCode,
          contactName: input.contactName,
          email: input.email,
          phone: input.phone,
          businessType: input.businessType as BusinessTypeValue | undefined,
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: auditData({
          firmId: session.firm.id,
          actorId: session.user.id,
          action: "client.created",
          entityType: "Client",
          entityId: client.id,
          details: { name: input.name, gstin: input.gstin },
        }),
      });
      await notify(tx, {
        firmId: session.firm.id,
        kind: "client.created",
        title: `Client added · ${input.name}`,
        body: `${session.user.name} added ${input.name}${input.gstin ? ` (${input.gstin})` : ""}.`,
        href: `/clients/${client.id}`,
        excludeUserId: session.user.id,
      });
      return client.id;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        status: "error",
        fieldErrors: { gstin: "A client with this GSTIN already exists in your workspace." },
        values,
      };
    }
    console.error("[clients.create] failed", { firmId: session.firm.id, error });
    return {
      status: "error",
      message: "The client could not be saved. Nothing was changed — please try again.",
      values,
    };
  }

  // Only reached after the database confirmed the write.
  redirect(`/clients/${clientId}?created=1`);
}
