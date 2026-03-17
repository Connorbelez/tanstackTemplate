import { useMutation, useQuery } from "convex/react";
import { Calendar, Percent, User, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useDealActions } from "@/hooks/useDealActions";
import { api } from "../../../convex/_generated/api";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "../ui/alert-dialog";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Textarea } from "../ui/textarea";

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

interface ClosingTeamAssignment {
	_id: string;
	assignedAt: number;
	assignedBy: string;
	mortgageId: string;
	role: "closing_lawyer" | "reviewing_lawyer" | "notary";
	userId: string;
}

// Phase display names
const phaseLabels: Record<DealPhase, string> = {
	initiated: "Initiated",
	lawyerOnboarding: "Lawyer Onboarding",
	documentReview: "Document Review",
	fundsTransfer: "Funds Transfer",
	confirmed: "Confirmed",
	failed: "Failed",
};

// Get sub-state display text from status
function getSubStateDisplay(status: string): string | null {
	if (status === "initiated") {
		return "Pending";
	}
	if (status.startsWith("lawyerOnboarding.")) {
		const sub = status.replace("lawyerOnboarding.", "");
		return sub.charAt(0).toUpperCase() + sub.slice(1);
	}
	if (status.startsWith("documentReview.")) {
		const sub = status.replace("documentReview.", "");
		return sub.charAt(0).toUpperCase() + sub.slice(1);
	}
	if (status.startsWith("fundsTransfer.")) {
		const sub = status.replace("fundsTransfer.", "");
		return sub.charAt(0).toUpperCase() + sub.slice(1);
	}
	if (status === "confirmed") {
		return "Complete";
	}
	if (status === "failed") {
		return "Terminated";
	}
	return null;
}

// Get current phase from status
function getCurrentPhase(status: string): DealPhase {
	if (status === "initiated") {
		return "initiated";
	}
	if (status.startsWith("lawyerOnboarding.")) {
		return "lawyerOnboarding";
	}
	if (status.startsWith("documentReview.")) {
		return "documentReview";
	}
	if (status.startsWith("fundsTransfer.")) {
		return "fundsTransfer";
	}
	if (status === "confirmed") {
		return "confirmed";
	}
	if (status === "failed") {
		return "failed";
	}
	return "initiated";
}

// Get completed phases before current
function getCompletedPhases(status: string): DealPhase[] {
	const currentPhase = getCurrentPhase(status);
	const phaseOrder: DealPhase[] = [
		"initiated",
		"lawyerOnboarding",
		"documentReview",
		"fundsTransfer",
		"confirmed",
	];
	const currentIndex = phaseOrder.indexOf(currentPhase);
	// Handle -1 case when phase is not in order (e.g., "failed")
	if (currentIndex === -1) {
		return [];
	}
	return phaseOrder.slice(0, currentIndex);
}

interface DealCardProps {
	deal: DealWithPhase;
}

export function DealCard({ deal }: DealCardProps) {
	const closingTeams = useQuery(api.deals.queries.closingTeamAssignments);
	const transitionDeal = useMutation(api.deals.mutations.transitionDeal);
	const { actions: dealActions, isTerminal } = useDealActions(deal.status);

	const currentPhase = getCurrentPhase(deal.status);
	const subStateDisplay = getSubStateDisplay(deal.status);
	const completedPhases = getCompletedPhases(deal.status);

	// Find closing team assignments for this deal's mortgage by role
	const closingLawyer = closingTeams?.find(
		(ct: ClosingTeamAssignment) =>
			ct.mortgageId === deal.mortgageId && ct.role === "closing_lawyer"
	);
	const reviewingLawyer = closingTeams?.find(
		(ct: ClosingTeamAssignment) =>
			ct.mortgageId === deal.mortgageId && ct.role === "reviewing_lawyer"
	);
	const notary = closingTeams?.find(
		(ct: ClosingTeamAssignment) =>
			ct.mortgageId === deal.mortgageId && ct.role === "notary"
	);

	// Format closing date
	const formattedClosingDate = deal.closingDate
		? new Date(deal.closingDate).toLocaleDateString()
		: "Not set";

	// State for cancel reason
	const [cancelReason, setCancelReason] = useState("");

	// Handle deal cancellation
	const handleCancel = async (reason: string) => {
		try {
			const dealId = deal._id as string;
			const result = await transitionDeal({
				entityId: dealId,
				eventType: "DEAL_CANCELLED",
				payload: { reason },
			});

			if (result.success) {
				toast.success("Deal cancelled");
			} else {
				toast.error(result.reason ?? "Failed to cancel deal");
			}
		} catch {
			toast.error("Failed to cancel deal");
		}
		setCancelReason("");
	};

	// Filter out cancel actions only (payload-required actions will be shown)
	const availableActions = dealActions.filter((a) => !a.isCancel);

	const handleAction = async (event: string) => {
		try {
			const dealId = deal._id as string;
			const result = await transitionDeal({
				entityId: dealId,
				eventType: event,
			});

			if (result.success) {
				toast.success("Moved to next phase");
			} else {
				toast.error(result.reason ?? "Transition failed");
			}
		} catch {
			toast.error("Transition failed");
		}
	};

	return (
		<Card className="mb-3 cursor-move transition-shadow hover:shadow-md">
			<CardHeader className="pb-2">
				<div className="flex items-center justify-between">
					<CardTitle className="font-medium text-sm">
						Deal {deal._id.slice(-6)}
					</CardTitle>
					{subStateDisplay && (
						<Badge className="text-xs" variant="outline">
							{phaseLabels[currentPhase]} — {subStateDisplay}
						</Badge>
					)}
				</div>

				{/* Completed phase indicators */}
				<div className="mt-2 flex gap-1">
					{completedPhases.map((phase) => (
						<div
							className="h-1.5 flex-1 rounded-full bg-emerald-500"
							key={phase}
							title={`${phaseLabels[phase]} complete`}
						/>
					))}
					{/* Current phase indicator */}
					<div
						className={`h-1.5 flex-1 rounded-full ${
							isTerminal ? "bg-slate-400" : "bg-amber-500"
						}`}
						title={`Current: ${phaseLabels[currentPhase]}`}
					/>
					{/* Remaining phases */}
					{(() => {
						const remainingCount =
							4 - completedPhases.length - (isTerminal ? 0 : 1);
						if (remainingCount <= 0) {
							return null;
						}
						return (
							<>
								{remainingCount >= 1 && (
									<div className="h-1.5 flex-1 rounded-full bg-slate-200" />
								)}
								{remainingCount >= 2 && (
									<div className="h-1.5 flex-1 rounded-full bg-slate-200" />
								)}
								{remainingCount >= 3 && (
									<div className="h-1.5 flex-1 rounded-full bg-slate-200" />
								)}
							</>
						);
					})()}
				</div>
			</CardHeader>

			<CardContent className="space-y-3">
				{/* Deal Details */}
				<div className="space-y-1.5 text-sm">
					<div className="flex items-center gap-2 text-muted-foreground">
						<User className="h-3.5 w-3.5" />
						<span>Buyer: {deal.buyerId.slice(-8)}</span>
					</div>
					<div className="flex items-center gap-2 text-muted-foreground">
						<User className="h-3.5 w-3.5" />
						<span>Seller: {deal.sellerId.slice(-8)}</span>
					</div>
					<div className="flex items-center gap-2 text-muted-foreground">
						<Percent className="h-3.5 w-3.5" />
						<span>Share: {deal.fractionalShare}%</span>
					</div>
					<div className="flex items-center gap-2 text-muted-foreground">
						<Calendar className="h-3.5 w-3.5" />
						<span>Closing: {formattedClosingDate}</span>
					</div>
				</div>

				{/* Closing Team */}
				{(closingLawyer || reviewingLawyer || notary) && (
					<div className="border-t pt-3">
						<p className="mb-2 font-medium text-muted-foreground text-xs">
							Closing Team
						</p>
						<div className="flex flex-wrap gap-2">
							{closingLawyer && (
								<div className="flex items-center gap-1.5">
									<Avatar className="h-6 w-6">
										<AvatarFallback className="text-xs">CL</AvatarFallback>
									</Avatar>
									<span className="text-xs">Closing</span>
								</div>
							)}
							{reviewingLawyer && (
								<div className="flex items-center gap-1.5">
									<Avatar className="h-6 w-6">
										<AvatarFallback className="text-xs">RL</AvatarFallback>
									</Avatar>
									<span className="text-xs">Reviewing</span>
								</div>
							)}
							{notary && (
								<div className="flex items-center gap-1.5">
									<Avatar className="h-6 w-6">
										<AvatarFallback className="text-xs">N</AvatarFallback>
									</Avatar>
									<span className="text-xs">Notary</span>
								</div>
							)}
						</div>
					</div>
				)}

				{/* Action Buttons */}
				<div className="flex flex-col gap-2 border-t pt-3">
					{availableActions.map((action) => (
						<Button
							className="w-full"
							key={action.event}
							onClick={() => handleAction(action.event)}
							size="sm"
						>
							{action.label}
						</Button>
					))}

					{/* Cancel button for non-terminal deals */}
					{!isTerminal && (
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button
									className="w-full text-red-600 hover:bg-red-50 hover:text-red-700"
									size="sm"
									variant="outline"
								>
									<X className="mr-1 h-3.5 w-3.5" />
									Cancel Deal
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Cancel Deal</AlertDialogTitle>
									<AlertDialogDescription>
										Please provide a reason for cancelling this deal. This will
										be recorded in the audit log.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<div className="py-4">
									<Textarea
										className="min-h-[100px]"
										onChange={(e) => setCancelReason(e.target.value)}
										placeholder="Enter reason for cancellation..."
										value={cancelReason}
									/>
								</div>
								<AlertDialogFooter>
									<AlertDialogCancel onClick={() => setCancelReason("")}>
										Keep Deal
									</AlertDialogCancel>
									<AlertDialogAction
										className="bg-red-600 hover:bg-red-700"
										disabled={!cancelReason.trim()}
										onClick={() => handleCancel(cancelReason)}
									>
										Cancel Deal
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
