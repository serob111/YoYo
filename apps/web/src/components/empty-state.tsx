import Link from "next/link";
import type { Icon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

export function EmptyState({
  icon: IconComponent,
  title,
  description,
  action,
  compact
}: {
  icon: Icon;
  title: string;
  description: string;
  action?: { label: string; href: string; external?: boolean };
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 px-6 text-center ${compact ? "py-8" : "py-16"}`}>
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary">
        <IconComponent size={22} />
      </div>
      <div className="max-w-xs">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      {action && (
        <Button size="sm" nativeButton={false} render={action.external ? <a href={action.href} /> : <Link href={action.href} />}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
