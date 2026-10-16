import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { ClientForm } from "./client-form";

export const metadata: Metadata = { title: "Add client" };

export default function NewClientPage() {
  return (
    <div className="space-y-6">
      <Link href="/clients" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-ink">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Clients
      </Link>
      <PageHeader
        title="Add client"
        description="The GSTIN is validated, including its check digit, before anything is saved."
      />
      <div className="max-w-3xl rounded-2xl border border-line bg-white p-6 sm:p-8">
        <ClientForm />
      </div>
    </div>
  );
}
