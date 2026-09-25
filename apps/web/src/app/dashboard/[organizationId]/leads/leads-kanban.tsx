"use client";

import { useI18n } from "@/lib/i18n/provider";

import Link from "next/link";
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import type { PipelineDto, PipelineStageDto } from "@yoyo/contracts";
import { useLeads, useMoveAnyLeadStage, type LeadListItem } from "@/lib/leads-hooks";
import { formatCents } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function KanbanCard({ organizationId, lead }: { organizationId: string; lead: LeadListItem }) {
  const { locale } = useI18n();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="cursor-grab touch-none rounded-lg border border-border bg-card p-2.5 text-sm active:cursor-grabbing"
      data-dragging={isDragging || undefined}
    >
      <Link
        href={`/dashboard/${organizationId}/leads/${lead.id}`}
        // Dragging is implemented via pointer events on this same element, so
        // a plain click still needs to navigate - only suppress the click that
        // immediately follows an actual drag.
        onClick={(e) => isDragging && e.preventDefault()}
        className="font-medium hover:underline"
      >
        {lead.title}
      </Link>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{lead.contactDisplayName}</p>
      <p className="mt-1 text-xs font-medium tabular-nums text-muted-foreground">{formatCents(lead.valueCents, lead.currency, locale)}</p>
    </div>
  );
}

function KanbanColumn({ organizationId, stage }: { organizationId: string; stage: PipelineStageDto }) {
  const { t: translateText } = useI18n();
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useLeads(organizationId, { stageId: stage.id });
  const leads = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div
      ref={setNodeRef}
      className="flex w-72 shrink-0 flex-col gap-2 rounded-xl border border-border bg-secondary/40 p-2.5"
      data-over={isOver || undefined}
    >
      <div className="flex items-center justify-between px-0.5">
        <h3 className="text-sm font-semibold">{stage.name}</h3>
        <span className="text-xs text-muted-foreground">{leads.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {isLoading && <Skeleton className="h-16 w-full" />}
        {!isLoading && leads.length === 0 && <p className="px-1 text-xs text-muted-foreground">{translateText("No leads.")}</p>}
        {leads.map((lead) => (
          <KanbanCard key={lead.id} organizationId={organizationId} lead={lead} />
        ))}
        {hasNextPage && (
          <Button variant="ghost" size="sm" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
            {isFetchingNextPage ? translateText("Loading...") : translateText("Load more")}
          </Button>
        )}
      </div>
    </div>
  );
}

export function LeadsKanban({ organizationId, pipeline }: { organizationId: string; pipeline: PipelineDto }) {
  const moveStage = useMoveAnyLeadStage(organizationId);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(event: DragEndEvent) {
    const leadId = event.active.id as string;
    const targetStageId = event.over?.id as string | undefined;
    if (!targetStageId) return;
    moveStage.mutate({ leadId, stageId: targetStageId });
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {pipeline.stages.map((stage) => (
          <KanbanColumn key={stage.id} organizationId={organizationId} stage={stage} />
        ))}
      </div>
    </DndContext>
  );
}
