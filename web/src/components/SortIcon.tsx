import { ChevronUp, ChevronDown } from "lucide-react";

export default function SortIcon({ active, asc }: { active: boolean; asc: boolean }) {
  if (!active) return null;
  return asc
    ? <ChevronUp className="h-3 w-3 inline-block ml-0.5 align-middle" />
    : <ChevronDown className="h-3 w-3 inline-block ml-0.5 align-middle" />;
}
