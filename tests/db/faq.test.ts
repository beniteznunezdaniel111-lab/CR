/**
 * Fase 4 · FAQ interna: documentos visibles solo cuando están listos, búsqueda
 * híbrida aislada por empresa, conversaciones privadas, consultas a RRHH con
 * avisos y estadísticas anónimas solo para RRHH.
 */
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Org,
  type TestUser,
  connect,
  createOrganization,
  createUser,
  exec,
  inviteAndAccept,
  query,
} from "./helpers";

const DIMS = 1024;
const MODEL = "test-embeddings";

/** Vector unitario en el eje `i`: similitud 1 consigo mismo y 0 con cualquier otro eje. */
function axis(i: number): string {
  const values = new Array<number>(DIMS).fill(0);
  values[i] = 1;
  return `[${values.join(",")}]`;
}

type Doc = { id: string; path: string; chunks: string[] };
type ChunkSeed = { heading: string; blocks: string[]; axis: number; page: number };

let db: Client;
let orgA: Org;
let orgB: Org;
const u = {} as Record<"aAdmin" | "aHr" | "aEmp" | "aEmp2" | "bAdmin" | "bEmp", TestUser>;
const docs = {} as Record<"readyA" | "pendingA" | "readyB", Doc>;

async function createDocument(
  user: TestUser,
  org: Org,
  title: string,
  chunks: ChunkSeed[],
  ready: boolean,
): Promise<Doc> {
  const id = randomUUID();
  const path = `${org.id}/${id}.pdf`;
  await exec(
    db,
    user,
    `insert into public.kb_documents (id, org_id, title, doc_type, file_path, file_mime, file_size)
     values ($1, $2, $3, 'policy', $4, 'application/pdf', 1000)`,
    [id, org.id, title, path],
  );
  const chunkIds: string[] = [];
  for (const [index, chunk] of chunks.entries()) {
    const [row] = await query<{ id: string }>(
      db,
      user,
      `insert into public.kb_chunks
         (org_id, document_id, chunk_index, heading, blocks, content, page_from, page_to, embedding)
       values ($1, $2, $3, $4, $5, $6, $7, $7, $8) returning id`,
      [
        org.id,
        id,
        index,
        chunk.heading,
        chunk.blocks,
        chunk.blocks.join("\n\n"),
        chunk.page,
        axis(chunk.axis),
      ],
    );
    chunkIds.push(row!.id);
  }
  if (ready) {
    await exec(
      db,
      user,
      "update public.kb_documents set status = 'ready', embedding_model = $2, chunk_count = $3 where id = $1",
      [id, MODEL, chunks.length],
    );
  }
  // El fichero lo sube el navegador con una URL firmada; aquí basta con la fila.
  await db.query("insert into storage.objects (bucket_id, name) values ('kb-documents', $1)", [
    path,
  ]);
  return { id, path, chunks: chunkIds };
}

async function search(
  user: TestUser,
  orgId: string,
  embedding: string,
  text: string,
  model = MODEL,
): Promise<string[]> {
  const rows = await query<{ chunk_id: string }>(
    db,
    user,
    "select chunk_id from public.match_kb_chunks($1, $2::extensions.vector, $3, $4)",
    [orgId, embedding, text, model],
  );
  return rows.map((row) => row.chunk_id);
}

async function startConversation(user: TestUser, org: Org, question: string, embedding: string) {
  const [conversation] = await query<{ id: string }>(
    db,
    user,
    "insert into public.faq_conversations (org_id, title) values ($1, $2) returning id",
    [org.id, question.slice(0, 120)],
  );
  await exec(
    db,
    user,
    `insert into public.faq_messages (org_id, conversation_id, role, content, question_embedding, embedding_model)
     values ($1, $2, 'user', $3, $4, $5)`,
    [org.id, conversation!.id, question, embedding, MODEL],
  );
  return conversation!.id;
}

async function reply(user: TestUser, org: Org, conversationId: string, outcome: string) {
  await exec(
    db,
    user,
    `insert into public.faq_messages (org_id, conversation_id, role, content, outcome)
     values ($1, $2, 'assistant', 'Respuesta', $3)`,
    [org.id, conversationId, outcome],
  );
}

beforeAll(async () => {
  db = await connect();
  for (const label of ["aAdmin", "aHr", "aEmp", "aEmp2", "bAdmin", "bEmp"] as const) {
    u[label] = await createUser(db, label);
  }
  orgA = await createOrganization(db, u.aAdmin, "FAQ Alfa", "ES");
  orgB = await createOrganization(db, u.bAdmin, "FAQ Beta", "CR");
  await inviteAndAccept(db, u.aAdmin, orgA, u.aHr, "hr");
  await inviteAndAccept(db, u.aAdmin, orgA, u.aEmp, "employee");
  await inviteAndAccept(db, u.aAdmin, orgA, u.aEmp2, "employee");
  await inviteAndAccept(db, u.bAdmin, orgB, u.bEmp, "employee");

  docs.readyA = await createDocument(
    u.aHr,
    orgA,
    "Política de vacaciones",
    [
      {
        heading: "Vacaciones",
        blocks: [
          "Cada persona tiene derecho a 23 días laborables de vacaciones al año.",
          "Las vacaciones se solicitan con 15 días de antelación.",
        ],
        axis: 1,
        page: 2,
      },
      {
        heading: "Teletrabajo",
        blocks: ["Se puede teletrabajar dos días por semana con acuerdo del responsable."],
        axis: 2,
        page: 3,
      },
    ],
    true,
  );
  docs.pendingA = await createDocument(
    u.aHr,
    orgA,
    "Borrador de vacaciones",
    [{ heading: "Vacaciones", blocks: ["Borrador: 30 días de vacaciones."], axis: 1, page: 1 }],
    false,
  );
  docs.readyB = await createDocument(
    u.bAdmin,
    orgB,
    "Reglamento interno",
    [
      {
        heading: "Vacaciones",
        blocks: ["Corresponden dos semanas de vacaciones por cada cincuenta semanas de trabajo."],
        axis: 1,
        page: 4,
      },
    ],
    true,
  );
});

afterAll(async () => {
  for (const org of [orgA, orgB]) {
    if (!org) continue;
    await db.query("delete from public.organizations where id = $1", [org.id]);
    await db
      .query("delete from storage.objects where name like $1", [`${org.id}/%`])
      .catch(() => undefined);
  }
  await db?.end();
});

describe("documentos y fragmentos", () => {
  const allDocs = () => [docs.readyA.id, docs.pendingA.id, docs.readyB.id];
  const visibleDocs = async (user: TestUser) =>
    (
      await query<{ id: string }>(
        db,
        user,
        "select id from public.kb_documents where id = any ($1) order by title",
        [allDocs()],
      )
    ).map((row) => row.id);

  it("la plantilla solo ve los documentos listos de su empresa; RRHH los ve todos", async () => {
    expect(await visibleDocs(u.aEmp)).toEqual([docs.readyA.id]);
    expect((await visibleDocs(u.aHr)).sort()).toEqual([docs.readyA.id, docs.pendingA.id].sort());
    expect(await visibleDocs(u.bEmp)).toEqual([docs.readyB.id]);
  });

  it("los fragmentos siguen la misma regla", async () => {
    const count = async (user: TestUser, documentId: string) => {
      const [row] = await query<{ n: number }>(
        db,
        user,
        "select count(*)::int as n from public.kb_chunks where document_id = $1",
        [documentId],
      );
      return row!.n;
    };
    expect(await count(u.aEmp, docs.readyA.id)).toBe(2);
    expect(await count(u.aEmp, docs.pendingA.id)).toBe(0);
    expect(await count(u.aHr, docs.pendingA.id)).toBe(1);
    expect(await count(u.bEmp, docs.readyA.id)).toBe(0);
  });

  it("solo RRHH crea documentos y fragmentos, y nunca en otra empresa", async () => {
    const insertDoc = (user: TestUser, org: Org) => {
      const id = randomUUID();
      return exec(
        db,
        user,
        `insert into public.kb_documents (id, org_id, title, file_path, file_mime, file_size)
         values ($1, $2, 'Intruso', $3, 'application/pdf', 10)`,
        [id, org.id, `${org.id}/${id}.pdf`],
      );
    };
    await expect(insertDoc(u.aEmp, orgA)).rejects.toThrow(/row-level security/);
    await expect(insertDoc(u.aHr, orgB)).rejects.toThrow(/row-level security/);

    const insertChunk = (orgId: string) =>
      exec(
        db,
        u.aHr,
        `insert into public.kb_chunks (org_id, document_id, chunk_index, blocks, content, embedding)
         values ($1, $2, 9, array['x'], 'x', $3)`,
        [orgId, docs.readyB.id, axis(3)],
      );
    // Fragmento colgado de un documento de otra empresa: ni con su org_id ni con el propio.
    await expect(insertChunk(orgB.id)).rejects.toThrow(/row-level security/);
    await expect(insertChunk(orgA.id)).rejects.toThrow(/foreign key/);
  });

  it("la ruta del fichero tiene que ser la de la empresa y el documento", async () => {
    const id = randomUUID();
    await expect(
      exec(
        db,
        u.aHr,
        `insert into public.kb_documents (id, org_id, title, file_path, file_mime, file_size)
         values ($1, $2, 'Ruta manipulada', $3, 'application/pdf', 10)`,
        [id, orgA.id, `${orgB.id}/${id}.pdf`],
      ),
    ).rejects.toThrow(/kb_documents_path_format/);
  });

  it("el fichero original solo se comparte con la plantilla cuando el documento está listo", async () => {
    const files = async (user: TestUser) =>
      (
        await query<{ name: string }>(
          db,
          user,
          "select name from storage.objects where bucket_id = 'kb-documents' and name = any ($1)",
          [[docs.readyA.path, docs.pendingA.path, docs.readyB.path]],
        )
      )
        .map((row) => row.name)
        .sort();
    expect(await files(u.aEmp)).toEqual([docs.readyA.path]);
    expect(await files(u.aHr)).toEqual([docs.readyA.path, docs.pendingA.path].sort());
    expect(await files(u.bEmp)).toEqual([docs.readyB.path]);
  });

  it("borrar un documento borra sus fragmentos", async () => {
    const temp = await createDocument(
      u.aHr,
      orgA,
      "Temporal",
      [{ heading: "Temporal", blocks: ["Texto temporal."], axis: 7, page: 1 }],
      true,
    );
    expect(await exec(db, u.aEmp, "delete from public.kb_documents where id = $1", [temp.id])).toBe(
      0,
    );
    expect(await exec(db, u.aHr, "delete from public.kb_documents where id = $1", [temp.id])).toBe(
      1,
    );
    const { rows } = await db.query("select 1 from public.kb_chunks where document_id = $1", [
      temp.id,
    ]);
    expect(rows).toHaveLength(0);
  });
});

describe("búsqueda híbrida", () => {
  it("encuentra por similitud y nunca devuelve borradores", async () => {
    for (const user of [u.aEmp, u.aHr]) {
      const found = await search(user, orgA.id, axis(1), "zzz");
      expect(found).toContain(docs.readyA.chunks[0]);
      expect(found).not.toContain(docs.pendingA.chunks[0]);
    }
  });

  it("encuentra por palabras clave en español aunque el embedding no se parezca", async () => {
    expect(
      await search(u.aEmp, orgA.id, axis(500), "¿Cuántos días de vacaciones tengo al año?"),
    ).toEqual([docs.readyA.chunks[0]]);
  });

  it("sin fragmentos relevantes no devuelve nada", async () => {
    expect(await search(u.aEmp, orgA.id, axis(500), "¿Cuál es el horario del comedor?")).toEqual(
      [],
    );
  });

  it("nunca devuelve fragmentos de otra empresa", async () => {
    expect(await search(u.bEmp, orgA.id, axis(1), "vacaciones")).toEqual([]);
    expect(await search(u.aHr, orgB.id, axis(1), "vacaciones")).toEqual([]);
    expect(await search(u.bEmp, orgB.id, axis(1), "vacaciones")).toEqual([docs.readyB.chunks[0]]);
  });

  it("ignora documentos procesados con otro modelo de embeddings", async () => {
    expect(await search(u.aEmp, orgA.id, axis(1), "vacaciones", "otro-modelo")).toEqual([]);
  });

  it("anon no puede buscar", async () => {
    await expect(
      query(
        db,
        "anon",
        "select * from public.match_kb_chunks($1, $2::extensions.vector, 'x', $3)",
        [orgA.id, axis(1), MODEL],
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("conversaciones del chat", () => {
  let conversationId: string;

  beforeAll(async () => {
    conversationId = await startConversation(
      u.aEmp,
      orgA,
      "¿Puedo teletrabajar los viernes?",
      axis(10),
    );
    await reply(u.aEmp, orgA, conversationId, "answered");
  });

  it("solo las ve su autor: ni RRHH, ni admin, ni compañeros", async () => {
    const count = async (user: TestUser) => {
      const [row] = await query<{ c: number; m: number }>(
        db,
        user,
        `select (select count(*) from public.faq_conversations where id = $1)::int as c,
                (select count(*) from public.faq_messages where conversation_id = $1)::int as m`,
        [conversationId],
      );
      return row;
    };
    expect(await count(u.aEmp)).toEqual({ c: 1, m: 2 });
    for (const user of [u.aEmp2, u.aHr, u.aAdmin, u.bEmp]) {
      expect(await count(user)).toEqual({ c: 0, m: 0 });
    }
  });

  it("no se puede escribir en la conversación de otra persona", async () => {
    await expect(
      exec(
        db,
        u.aEmp2,
        `insert into public.faq_messages (org_id, conversation_id, role, content)
         values ($1, $2, 'user', 'Intruso')`,
        [orgA.id, conversationId],
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("las respuestas llevan resultado y las preguntas no", async () => {
    await expect(
      exec(
        db,
        u.aEmp,
        `insert into public.faq_messages (org_id, conversation_id, role, content)
         values ($1, $2, 'assistant', 'Sin resultado')`,
        [orgA.id, conversationId],
      ),
    ).rejects.toThrow(/faq_messages_outcome/);
  });

  it("al añadir un mensaje se actualiza la fecha de la conversación", async () => {
    const before = await query<{ updated_at: Date }>(
      db,
      u.aEmp,
      "select updated_at from public.faq_conversations where id = $1",
      [conversationId],
    );
    await reply(u.aEmp, orgA, conversationId, "not_found");
    const after = await query<{ updated_at: Date }>(
      db,
      u.aEmp,
      "select updated_at from public.faq_conversations where id = $1",
      [conversationId],
    );
    expect(after[0]!.updated_at.getTime()).toBeGreaterThan(before[0]!.updated_at.getTime());
  });
});

describe("consultas a RRHH y avisos", () => {
  let queryId: string;

  const notifications = (user: TestUser, kind: string) =>
    query<{ id: string; link: string }>(
      db,
      user,
      "select id, link from public.notifications where kind = $1 and org_id = $2",
      [kind, orgA.id],
    );

  beforeAll(async () => {
    const [row] = await query<{ id: string }>(
      db,
      u.aEmp,
      "insert into public.hr_queries (org_id, question) values ($1, $2) returning id",
      [orgA.id, "¿Cómo pido un día de asuntos propios?"],
    );
    queryId = row!.id;
  });

  it("al crear una consulta se avisa a admin y RRHH, no a quien pregunta", async () => {
    expect(await notifications(u.aHr, "hr_query_created")).toHaveLength(1);
    expect(await notifications(u.aAdmin, "hr_query_created")).toHaveLength(1);
    expect(await notifications(u.aEmp, "hr_query_created")).toHaveLength(0);
    const [notice] = await notifications(u.aHr, "hr_query_created");
    expect(notice!.link).toBe(`/app/${orgA.slug}/hr-queries`);
  });

  it("no se puede crear una consulta en nombre de otra persona", async () => {
    await expect(
      exec(
        db,
        u.aEmp,
        "insert into public.hr_queries (org_id, question, requester_id) values ($1, 'Pregunta ajena', $2)",
        [orgA.id, u.aEmp2.id],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      exec(db, u.bEmp, "insert into public.hr_queries (org_id, question) values ($1, 'Intrusa')", [
        orgA.id,
      ]),
    ).rejects.toThrow(/row-level security/);
  });

  it("cada persona ve sus consultas; RRHH ve las de la empresa", async () => {
    const visible = async (user: TestUser) =>
      (
        await query<{ id: string }>(db, user, "select id from public.hr_queries where id = $1", [
          queryId,
        ])
      ).length;
    expect(await visible(u.aEmp)).toBe(1);
    expect(await visible(u.aHr)).toBe(1);
    expect(await visible(u.aEmp2)).toBe(0);
    expect(await visible(u.bAdmin)).toBe(0);
  });

  it("solo RRHH responde; la persona recibe un aviso y queda auditado", async () => {
    await expect(
      query(db, u.aEmp, "select public.answer_hr_query($1, 'Me respondo yo')", [queryId]),
    ).rejects.toThrow(/Consulta no encontrada/);
    await expect(
      query(db, u.bAdmin, "select public.answer_hr_query($1, 'Desde otra empresa')", [queryId]),
    ).rejects.toThrow(/Consulta no encontrada/);
    await expect(
      query(db, "service_role", "select public.answer_hr_query($1, 'Servidor')", [queryId]),
    ).rejects.toThrow(/permission denied/);

    await query(db, u.aHr, "select public.answer_hr_query($1, $2)", [
      queryId,
      "Se solicita desde el portal con dos días de antelación.",
    ]);
    const [answered] = await query<{ status: string; answer: string; answered_by: string }>(
      db,
      u.aEmp,
      "select status, answer, answered_by from public.hr_queries where id = $1",
      [queryId],
    );
    expect(answered).toMatchObject({ status: "answered", answered_by: u.aHr.id });

    const [notice] = await notifications(u.aEmp, "hr_query_answered");
    expect(notice!.link).toBe(`/app/${orgA.slug}/faq/my-queries`);

    const audit = await query<{ details: unknown }>(
      db,
      u.aAdmin,
      "select details from public.audit_events where action = 'hr_query.answered' and entity_id = $1",
      [queryId],
    );
    expect(audit).toEqual([{ details: {} }]);
  });

  it("los avisos son privados y solo se pueden marcar como leídos", async () => {
    const [notice] = await notifications(u.aEmp, "hr_query_answered");
    expect(
      await exec(db, u.aEmp2, "update public.notifications set read_at = now() where id = $1", [
        notice!.id,
      ]),
    ).toBe(0);
    expect(
      await exec(db, u.aEmp, "update public.notifications set read_at = now() where id = $1", [
        notice!.id,
      ]),
    ).toBe(1);
    await expect(
      exec(db, u.aEmp, "update public.notifications set link = '/app/x' where id = $1", [
        notice!.id,
      ]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      exec(
        db,
        u.aEmp,
        "insert into public.notifications (org_id, user_id, kind) values ($1, $2, 'spam')",
        [orgA.id, u.aEmp2.id],
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("estadísticas anónimas para RRHH", () => {
  beforeAll(async () => {
    const first = await startConversation(
      u.aEmp,
      orgA,
      "¿Cuántos días de vacaciones tengo?",
      axis(20),
    );
    await reply(u.aEmp, orgA, first, "answered");
    const second = await startConversation(
      u.aEmp2,
      orgA,
      "¿Cuántos días de vacaciones me corresponden?",
      axis(20),
    );
    await reply(u.aEmp2, orgA, second, "not_found");
  });

  it("solo RRHH de la empresa puede consultarlas", async () => {
    await expect(
      query(db, u.aEmp, "select * from public.faq_question_clusters($1)", [orgA.id]),
    ).rejects.toThrow(/Solo RRHH/);
    await expect(
      query(db, u.bAdmin, "select * from public.faq_question_clusters($1)", [orgA.id]),
    ).rejects.toThrow(/Solo RRHH/);
  });

  it("agrupa las preguntas parecidas y cuenta las que no tuvieron respuesta, sin identificar a nadie", async () => {
    const rows = await query<Record<string, unknown>>(
      db,
      u.aHr,
      "select * from public.faq_question_clusters($1)",
      [orgA.id],
    );
    const vacations = rows.find((row) => String(row.question).includes("vacaciones"));
    expect(vacations).toMatchObject({ total: 2, unanswered: 1 });
    expect(Object.keys(vacations!).sort()).toEqual(
      ["last_asked_at", "question", "total", "unanswered"].sort(),
    );
    // La pregunta de teletrabajo (otro eje) va en su propio grupo.
    expect(rows.find((row) => String(row.question).includes("teletrabajar"))).toMatchObject({
      total: 1,
    });
  });
});
