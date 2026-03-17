import { useQuery } from "convex/react";
import { cn } from "#/lib/utils";
import { api } from "../../../convex/_generated/api";
import { ScrollArea, ScrollBar } from "../ui/scroll-area";
import { DealCard } from "./deal-card";

// Types (mirrored from convex/deals/queries.ts)
type DealPhase =
	| "initiated"
	| "lawyerOnboarding"
	| "documentReview"
	| "fundsTransfer"
	| "confirmed"
	| "failed";

interface DealWithPhase {
	_id: string;
	buyerId: string;
	closingDate?: number;
	createdAt: number;
	createdBy: string;
	fractionalShare: number;
	lawyerId?: string;
	lawyerType?: "platform_lawyer" | "guest_lawyer";
	mortgageId: string;
	sellerId: string;
	status: string;
}

interface DealsByPhase {
	confirmed: DealWithPhase[];
	documentReview: DealWithPhase[];
	failed: DealWithPhase[];
	fundsTransfer: DealWithPhase[];
	initiated: DealWithPhase[];
	lawyerOnboarding: DealWithPhase[];
}

// Column configuration
const columns: { id: DealPhase; title: string; color: string }[] = [
	{ id: "initiated", title: "Initiated", color: "bg-blue-500" },
	{ id: "lawyerOnboarding", title: "Lawyer Onboarding", color: "bg-amber-500" },
	{ id: "documentReview", title: "Document Review", color: "bg-purple-500" },
	{ id: "fundsTransfer", title: "Funds Transfer", color: "bg-cyan-500" },
	{ id: "confirmed", title: "Confirmed", color: "bg-emerald-500" },
	{ id: "failed", title: "Failed", color: "bg-red-500" },
];

export function KanbanDealsBoard() {
	const dealsByPhase = useQuery(api.deals.queries.getDealsByPhase) as
		| DealsByPhase
		| undefined;
	const isLoading = dealsByPhase === undefined;

	// Render column content
	const renderColumn = (columnId: DealPhase) => {
		if (isLoading) {
			return (
				<div className="flex h-32 items-center justify-center">
					<p className="text-muted-foreground text-sm">Loading...</p>
				</div>
			);
		}

		const deals = dealsByPhase?.[columnId] ?? [];

		if (deals.length === 0) {
			return (
				<div className="flex h-32 items-center justify-center">
					<p className="text-muted-foreground text-sm">No deals</p>
				</div>
			);
		}

		return (
			<div className="space-y-3">
				{deals.map((deal) => (
					<DealCard deal={deal} key={deal._id} />
				))}
			</div>
		);
	};

	return (
		<div className="flex h-full flex-col">
			{/* Kanban Columns */}
			<ScrollArea className="flex-1">
				<div className="flex min-w-max gap-4 pb-4">
					{columns.map((column) => (
						<div className="w-80 flex-shrink-0" key={column.id}>
							{/* Column Header */}
							<div className="mb-3 flex items-center gap-2">
								<div className={cn("h-3 w-3 rounded-full", column.color)} />
								<h3 className="font-semibold text-sm">{column.title}</h3>
								<span className="ml-auto text-muted-foreground text-xs">
									{isLoading ? "—" : (dealsByPhase?.[column.id]?.length ?? 0)}
								</span>
							</div>

							{/* Column Content */}
							<div
								className={cn(
									"min-h-[200px] rounded-lg border bg-card p-3",
									"transition-colors hover:border-muted-foreground/20"
								)}
							>
								{renderColumn(column.id)}
							</div>
						</div>
					))}
				</div>
				<ScrollBar orientation="horizontal" />
			</ScrollArea>
		</div>
	);
}
