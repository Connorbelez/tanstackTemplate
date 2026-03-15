import { CheckCircle2, Landmark, XCircle } from "lucide-react";
import { Badge } from "#/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Progress } from "#/components/ui/progress";

const UNITS_TOTAL = 10_000;

export interface MortgagePosition {
	accountId: string;
	balance: number;
	displayName: string;
	lenderId: string;
}

export interface MortgageCardProps {
	entryCount: number;
	invariantValid: boolean;
	label: string;
	mortgageId: string;
	positions: MortgagePosition[];
	total: number;
	treasuryBalance: number;
}

export function MortgageCard({
	label,
	treasuryBalance,
	positions,
	invariantValid,
	total,
	entryCount,
}: MortgageCardProps) {
	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="flex items-center justify-between text-sm">
					<span className="flex items-center gap-2">
						<Landmark className="size-4" />
						{label}
					</span>
					<Badge
						className={
							invariantValid
								? "bg-green-100 text-green-800"
								: "bg-red-100 text-red-800"
						}
						variant="outline"
					>
						{invariantValid ? (
							<CheckCircle2 className="mr-1 size-3" />
						) : (
							<XCircle className="mr-1 size-3" />
						)}
						{total.toLocaleString()} / {UNITS_TOTAL.toLocaleString()}
					</Badge>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3">
				{/* Treasury */}
				<div>
					<div className="mb-1 flex justify-between text-xs">
						<span className="text-muted-foreground">Treasury (unissued)</span>
						<span className="font-mono">
							{treasuryBalance.toLocaleString()} units (
							{Math.round((treasuryBalance / UNITS_TOTAL) * 100)}%)
						</span>
					</div>
					<Progress
						className="h-2"
						value={(treasuryBalance / UNITS_TOTAL) * 100}
					/>
				</div>

				{/* Positions */}
				{positions.map((p) => (
					<div key={p.accountId}>
						<div className="mb-1 flex justify-between text-xs">
							<span className="font-medium">{p.displayName}</span>
							<span className="font-mono">
								{p.balance.toLocaleString()} units (
								{Math.round((p.balance / UNITS_TOTAL) * 100)}%)
							</span>
						</div>
						<Progress
							className="h-2 [&>div]:bg-emerald-500"
							value={(p.balance / UNITS_TOTAL) * 100}
						/>
					</div>
				))}

				<div className="text-muted-foreground text-xs">
					{entryCount} journal {entryCount === 1 ? "entry" : "entries"}
				</div>
			</CardContent>
		</Card>
	);
}
