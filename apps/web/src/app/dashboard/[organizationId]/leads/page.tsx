"use client";

import { useI18n } from "@/lib/i18n/provider";

import { useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { MagnifyingGlass, UsersThree } from "@phosphor-icons/react";
import type { LeadIntent, UpsertLeadInput } from "@yoyo/contracts";
import { useOrganization } from "@/lib/hooks";
import { useCan } from "@/lib/permissions";
import { useCreateLead, useLeads } from "@/lib/leads-hooks";
import { usePipeline } from "@/lib/pipeline-hooks";
import { formatCents } from "@/lib/format";
import { LeadForm } from "@/components/lead-form";
import { EmptyState } from "@/components/empty-state";
import { LeadsKanban } from "./leads-kanban";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const LEAD_INTENTS: LeadIntent[] = ["BUYER", "RENTER", "SELLER", "LANDLORD"];
const LEAD_INTENT_LABELS: Record<LeadIntent, string> = {
  BUYER: "Buyer",
  RENTER: "Renter",
  SELLER: "Seller",
  LANDLORD: "Landlord"
};

export default function LeadsPage() {
  const { t: translateText, locale } = useI18n();
  const params = useParams<{ organizationId: string }>();
  const searchParams = useSearchParams();
  const organizationId = params.organizationId;
  const { data: organization } = useOrganization(organizationId);
  const canManage = useCan(organization?.myRole, "manageCRM");
  const isRealEstate = organization?.vertical === "real_estate";

  const { data: pipeline } = usePipeline(organizationId);
  const [view, setView] = useState<"table" | "board">("table");
  const [stageFilter, setStageFilter] = useState("");
  const [intentFilter, setIntentFilter] = useState<LeadIntent | "">("");
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const stageName = (stageId: string) => pipeline?.stages.find((s) => s.id === stageId)?.name ?? stageId;

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useLeads(organizationId, {
    stageId: stageFilter || undefined,
    search: search || undefined,
    intent: intentFilter || undefined
  });
  const leads = data?.pages.flatMap((page) => page.items) ?? [];

  const [createOpen, setCreateOpen] = useState(false);
  const createLead = useCreateLead(organizationId);

  function handleCreate(input: UpsertLeadInput) {
    createLead.mutate(input, { onSuccess: () => setCreateOpen(false) });
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{translateText("Leads")}</h1>
          <div className="flex items-center gap-1">
            <Button size="sm" variant={view === "table" ? "default" : "outline"} onClick={() => setView("table")}>
               {translateText("Table")} </Button>
            <Button size="sm" variant={view === "board" ? "default" : "outline"} onClick={() => setView("board")}>
               {translateText("Board")} </Button>
          </div>
        </div>
        {canManage && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger render={<Button />}>{translateText("New lead")}</DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{translateText("New lead")}</DialogTitle>
              </DialogHeader>
              <LeadForm organizationId={organizationId} onSubmit={handleCreate} submitLabel={translateText("Create")} isPending={createLead.isPending} />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {view === "board" ? (
        <div className="mt-6">{pipeline ? <LeadsKanban organizationId={organizationId} pipeline={pipeline} /> : <Skeleton className="h-64 w-full" />}</div>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-2">
            <div className="relative w-64">
              <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={translateText("Search leads...")} className="pl-8" />
            </div>
            {pipeline && (
              <>
                <span className="text-sm text-muted-foreground">{translateText("Stage:")}</span>
                <Select
                  items={{ all: "All stages", ...Object.fromEntries(pipeline.stages.map((s) => [s.id, s.name])) }}
                  value={stageFilter || "all"}
                  onValueChange={(v) => setStageFilter(!v || v === "all" ? "" : v)}
                >
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{translateText("All stages")}</SelectItem>
                    {pipeline.stages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        {stage.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
            {isRealEstate && (
              <>
                <span className="text-sm text-muted-foreground">{translateText("Intent:")}</span>
                <Select
                  items={{ all: "All", ...Object.fromEntries(LEAD_INTENTS.map((i) => [i, LEAD_INTENT_LABELS[i]])) }}
                  value={intentFilter || "all"}
                  onValueChange={(v) => setIntentFilter(!v || v === "all" ? "" : (v as LeadIntent))}
                >
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{translateText("All")}</SelectItem>
                    {LEAD_INTENTS.map((i) => (
                      <SelectItem key={i} value={i}>
                        {translateText(LEAD_INTENT_LABELS[i])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </div>

          <div className="mt-6">
            {isLoading && (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            )}

            {!isLoading && leads.length === 0 && (search || stageFilter || intentFilter) && (
              <p className="text-sm text-muted-foreground">{translateText("No leads match your filters.")}</p>
            )}
            {!isLoading && leads.length === 0 && !search && !stageFilter && !intentFilter && (
              <EmptyState icon={UsersThree} title={translateText("No leads yet")} description={translateText("Leads are created automatically from conversations, or use the “New lead” button above to add one.")} />
            )}

            {leads.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{translateText("Title")}</TableHead>
                    <TableHead>{translateText("Contact")}</TableHead>
                    {isRealEstate && <TableHead>{translateText("Intent")}</TableHead>}
                    <TableHead>{translateText("Stage")}</TableHead>
                    <TableHead>{translateText("Value")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell>
                        <Link href={`/dashboard/${organizationId}/leads/${lead.id}`} className="font-medium hover:underline">
                          {lead.title}
                        </Link>
                      </TableCell>
                      <TableCell>{lead.contactDisplayName}</TableCell>
                      {isRealEstate && <TableCell>{lead.intent ? LEAD_INTENT_LABELS[lead.intent] : "—"}</TableCell>}
                      <TableCell>{stageName(lead.stageId)}</TableCell>
                      <TableCell>{formatCents(lead.valueCents, lead.currency, locale)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {hasNextPage && (
              <Button variant="ghost" className="mt-2" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
                {isFetchingNextPage ? translateText("Loading...") : translateText("Load more")}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
