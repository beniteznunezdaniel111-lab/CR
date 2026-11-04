/**
 * Descarga del documento original de la FAQ: URL firmada de corta duración
 * creada con la sesión de la persona (la política del bucket solo deja leer
 * documentos listos, salvo a RRHH de la empresa).
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { KB_BUCKET } from "@/modules/faq/constants";

function safeFilename(title: string, path: string): string {
  const extension = path.endsWith(".pdf") ? "pdf" : "docx";
  const base =
    title
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^\w\- ]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80) || "documento";
  return `${base}.${extension}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ org: string; documentId: string }> },
) {
  const { org: slug, documentId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL(`/login?next=/app/${slug}/faq`, request.url));
  }
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) return new NextResponse(null, { status: 404 });

  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!org) return new NextResponse(null, { status: 404 });
  const { data: doc } = await supabase
    .from("kb_documents")
    .select("title, file_path")
    .eq("id", documentId)
    .eq("org_id", org.id)
    .maybeSingle();
  if (!doc) return new NextResponse(null, { status: 404 });

  const { data: signed, error } = await supabase.storage
    .from(KB_BUCKET)
    .createSignedUrl(doc.file_path, 60, { download: safeFilename(doc.title, doc.file_path) });
  if (error || !signed) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(signed.signedUrl);
}
