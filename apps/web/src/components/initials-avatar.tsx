import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

// No user/contact photo upload exists anywhere in the product yet, so every
// avatar is initials-based - deterministic per name rather than a stock photo
// standing in for a real person.
const PALETTE = ["#fff3c4", "#eef4e9", "#f3e3da", "#e0ecf7", "#f6e3ee"];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return hash;
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function InitialsAvatar({ name, size = "default", className }: { name: string; size?: "sm" | "default" | "lg"; className?: string }) {
  const color = PALETTE[hashName(name) % PALETTE.length];
  return (
    <Avatar size={size} className={cn("bg-transparent", className)}>
      <AvatarFallback style={{ backgroundColor: color, color: "#111423" }} className="font-semibold">
        {initialsFor(name)}
      </AvatarFallback>
    </Avatar>
  );
}
