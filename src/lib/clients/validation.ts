import { z } from "zod";
import { validateGstin } from "@/lib/gstin";
import { BUSINESS_TYPES } from "@/lib/format";

/** Turn "" into undefined so optional fields are stored as NULL, not empty strings. */
const optionalText = (max: number, tooLong: string) =>
  z
    .string()
    .trim()
    .max(max, tooLong)
    .transform((v) => (v === "" ? undefined : v));

const businessTypeValues = BUSINESS_TYPES.map((t) => t.value) as [string, ...string[]];

export const clientSchema = z
  .object({
    name: z.string().trim().min(2, "Enter the client's business name.").max(200, "Name is too long."),
    gstin: z.string().trim(),
    contactName: optionalText(100, "Contact name is too long."),
    email: optionalText(254, "Email is too long.").refine(
      (v) => v === undefined || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "Enter a valid email address.",
    ),
    phone: optionalText(20, "Phone number is too long.").refine(
      (v) => v === undefined || /^[+]?[0-9][0-9\s-]{6,18}$/.test(v),
      "Enter a valid phone number.",
    ),
    businessType: z
      .string()
      .transform((v) => (v === "" ? undefined : v))
      .refine((v) => v === undefined || businessTypeValues.includes(v), "Choose a business type."),
  })
  .transform((input, ctx) => {
    // GSTIN is optional (unregistered clients), but if given it must be valid.
    if (input.gstin === "") {
      return { ...input, gstin: null, stateCode: null };
    }
    const check = validateGstin(input.gstin);
    if (!check.valid) {
      ctx.addIssue({ code: "custom", path: ["gstin"], message: check.reason });
      return z.NEVER;
    }
    return { ...input, gstin: check.gstin, stateCode: check.stateCode };
  });

export type ClientInput = z.output<typeof clientSchema>;

export const CLIENT_FIELDS = ["name", "gstin", "contactName", "email", "phone", "businessType"] as const;
