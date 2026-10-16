import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { MAX_FILE_BYTES } from "@/lib/recon/read-file";
import { storeImport, type Source } from "@/lib/recon/store";

/**
 * POST multipart/form-data { file, source } -> { ok: true } | { ok: false, error }
 * A route handler (rather than a server action) so files up to 10 MB are accepted.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !session.user.emailVerified) {
    return NextResponse.json({ ok: false, error: "Your session has expired. Sign in again." }, { status: 401 });
  }
  const { id } = await params;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "The upload was incomplete. Please try again." }, { status: 400 });
  }

  const source = form.get("source");
  const file = form.get("file");
  if (source !== "PURCHASE_REGISTER" && source !== "GSTR2B") {
    return NextResponse.json({ ok: false, error: "Unknown file type." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "Choose a file to upload." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ ok: false, error: "The file is larger than 10 MB." }, { status: 413 });
  }

  const outcome = await storeImport({
    session,
    reconciliationId: id,
    source: source as Source,
    fileName: file.name,
    bytes: new Uint8Array(await file.arrayBuffer()),
  });
  return NextResponse.json(outcome, { status: outcome.ok ? 200 : 422 });
}
