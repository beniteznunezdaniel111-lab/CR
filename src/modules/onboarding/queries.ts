import "server-only";
import { cache } from "react";
import type { Tables } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { type Progress, progressOf } from "./plan";

export type PlanSummary = {
  id: string;
  title: string;
  jobId: string;
  jobTitle: string;
  tasks: number;
  assignments: number;
  updatedAt: string;
};

export async function listPlans(orgId: string): Promise<PlanSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("onboarding_plans")
    .select(
      "id, title, job_id, updated_at, job_positions (title), onboarding_plan_tasks (count), onboarding_assignments (count)",
    )
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar los planes: ${error.message}`);
  return (data ?? []).map((row) => {
    const job = Array.isArray(row.job_positions) ? row.job_positions[0] : row.job_positions;
    return {
      id: row.id,
      title: row.title,
      jobId: row.job_id,
      jobTitle: job?.title ?? "",
      tasks: row.onboarding_plan_tasks[0]?.count ?? 0,
      assignments: row.onboarding_assignments[0]?.count ?? 0,
      updatedAt: row.updated_at,
    };
  });
}

export type PlanDetail = Tables<"onboarding_plans"> & {
  jobTitle: string;
  tasks: Tables<"onboarding_plan_tasks">[];
};

export const getPlan = cache(async (orgId: string, planId: string): Promise<PlanDetail | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("onboarding_plans")
    .select("*, job_positions (title), onboarding_plan_tasks (*)")
    .eq("org_id", orgId)
    .eq("id", planId)
    .maybeSingle();
  if (!data) return null;
  const { job_positions, onboarding_plan_tasks, ...plan } = data;
  const job = Array.isArray(job_positions) ? job_positions[0] : job_positions;
  return {
    ...plan,
    jobTitle: job?.title ?? "",
    tasks: [...onboarding_plan_tasks].sort((a, b) => a.sort_order - b.sort_order),
  };
});

export type AssignmentSummary = {
  id: string;
  employeeName: string;
  planTitle: string;
  startDate: string;
  progress: Progress;
  overdue: number;
  nextTask: { title: string; dueDate: string } | null;
};

export async function listAssignments(orgId: string, today: string): Promise<AssignmentSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("onboarding_assignments")
    .select(
      "id, employee_name, plan_title, start_date, onboarding_assignment_tasks (title, due_date, completed_at, sort_order)",
    )
    .eq("org_id", orgId)
    .order("start_date", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar las incorporaciones: ${error.message}`);
  return (data ?? []).map((row) => {
    const tasks = [...row.onboarding_assignment_tasks].sort(
      (a, b) => a.due_date.localeCompare(b.due_date) || a.sort_order - b.sort_order,
    );
    const next = tasks.find((task) => !task.completed_at) ?? null;
    return {
      id: row.id,
      employeeName: row.employee_name,
      planTitle: row.plan_title,
      startDate: row.start_date,
      progress: progressOf(tasks),
      overdue: tasks.filter((task) => !task.completed_at && task.due_date < today).length,
      nextTask: next ? { title: next.title, dueDate: next.due_date } : null,
    };
  });
}

export type AssignmentDetail = Tables<"onboarding_assignments"> & {
  memberName: string | null;
  tasks: (Tables<"onboarding_assignment_tasks"> & { completedByName: string | null })[];
};

export async function getAssignment(
  orgId: string,
  assignmentId: string,
): Promise<AssignmentDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("onboarding_assignments")
    .select("*, onboarding_assignment_tasks (*)")
    .eq("org_id", orgId)
    .eq("id", assignmentId)
    .maybeSingle();
  if (!data) return null;
  const { onboarding_assignment_tasks: tasks, ...assignment } = data;
  const peopleIds = [
    ...new Set(
      [assignment.member_user_id, ...tasks.map((task) => task.completed_by)].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ];
  const { data: people } = peopleIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", peopleIds)
    : { data: [] };
  const nameOf = (id: string | null) => {
    const person = people?.find((item) => item.id === id);
    return person ? (person.full_name ?? person.email) : null;
  };
  return {
    ...assignment,
    memberName: nameOf(assignment.member_user_id),
    tasks: [...tasks]
      .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.sort_order - b.sort_order)
      .map((task) => ({ ...task, completedByName: nameOf(task.completed_by) })),
  };
}

export type MemberOption = { userId: string; name: string };

/** Personas activas de la empresa (para vincular una incorporación a su cuenta). */
export async function listMemberOptions(orgId: string): Promise<MemberOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships")
    .select("user_id, profiles (full_name, email)")
    .eq("org_id", orgId)
    .eq("status", "active");
  return (data ?? [])
    .map((row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return { userId: row.user_id, name: profile?.full_name ?? profile?.email ?? "" };
    })
    .filter((option) => option.name)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}
