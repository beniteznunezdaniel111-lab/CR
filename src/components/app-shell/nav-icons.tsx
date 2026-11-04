import {
  BarChart3Icon,
  BookOpenCheckIcon,
  Building2Icon,
  FileSearchIcon,
  FileTextIcon,
  GraduationCapIcon,
  HomeIcon,
  InboxIcon,
  type LucideIcon,
  MessagesSquareIcon,
  RocketIcon,
  UsersIcon,
} from "lucide-react";
import type { NavIcon } from "@/lib/navigation";

export const NAV_ICONS: Record<NavIcon, LucideIcon> = {
  home: HomeIcon,
  jobs: FileTextIcon,
  candidates: FileSearchIcon,
  onboarding: RocketIcon,
  faq: MessagesSquareIcon,
  hrQueries: InboxIcon,
  trainings: GraduationCapIcon,
  myTrainings: BookOpenCheckIcon,
  organization: Building2Icon,
  members: UsersIcon,
  aiUsage: BarChart3Icon,
};
