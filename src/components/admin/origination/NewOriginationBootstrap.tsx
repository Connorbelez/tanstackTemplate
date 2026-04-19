import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAdminBreadcrumbLabel } from "#/components/admin/shell/AdminPageMetadataContext";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { EMPTY_ADMIN_DETAIL_SEARCH } from "#/lib/admin-detail-search";
import {
	registerOriginationBootstrapCase,
	reserveOriginationBootstrapState,
} from "#/lib/admin-origination-bootstrap";
import { api } from "../../../../convex/_generated/api";

type BootstrapState = "error" | "pending";

export function NewOriginationBootstrap() {
	const createCase = useMutation(api.admin.origination.cases.createCase);
	const navigate = useNavigate({ from: "/admin/originations/new" });
	const startedRef = useRef(false);
	const [bootstrapState, setBootstrapState] =
		useState<BootstrapState>("pending");
	const [errorMessage, setErrorMessage] = useState<string | undefined>(
		undefined
	);

	useAdminBreadcrumbLabel("New");

	const bootstrapCase = useCallback(async () => {
		setBootstrapState("pending");
		setErrorMessage(undefined);

		try {
			const bootstrap = reserveOriginationBootstrapState();
			const caseId = await createCase({
				bootstrapToken: bootstrap.token,
			});
			registerOriginationBootstrapCase(bootstrap.token, caseId);
			await navigate({
				to: "/admin/originations/$caseId",
				params: { caseId },
				search: EMPTY_ADMIN_DETAIL_SEARCH,
				replace: true,
			});
		} catch (error) {
			setBootstrapState("error");
			setErrorMessage(
				error instanceof Error ? error.message : "Unable to create draft case"
			);
		}
	}, [createCase, navigate]);

	useEffect(() => {
		if (startedRef.current) {
			return;
		}

		startedRef.current = true;
		void bootstrapCase();
	}, [bootstrapCase]);

	return (
		<div className="mx-auto flex w-full max-w-2xl flex-1 items-start justify-center pt-10">
			<Card className="w-full border-border/70 shadow-sm">
				<CardHeader className="text-center">
					<CardTitle className="text-2xl">New origination</CardTitle>
					<CardDescription className="text-sm leading-6">
						Create a durable draft case, then redirect into the seven-step
						workspace so refresh and deep links stay stable.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-5">
					{bootstrapState === "pending" ? (
						<div className="flex flex-col items-center gap-4 rounded-2xl border border-border/70 bg-muted/20 px-6 py-10 text-center">
							<LoaderCircle className="size-8 animate-spin text-sky-600" />
							<div className="space-y-1">
								<p className="font-medium">Allocating draft case</p>
								<p className="text-muted-foreground text-sm">
									The system is creating the staging aggregate and redirecting
									to its canonical route.
								</p>
							</div>
						</div>
					) : (
						<div className="space-y-4 rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-6 text-center">
							<p className="font-medium text-destructive">
								Draft bootstrap failed
							</p>
							<p className="text-destructive/90 text-sm">
								{errorMessage ?? "Unable to create the origination case draft."}
							</p>
							<div className="flex flex-wrap items-center justify-center gap-3">
								<Button onClick={() => void bootstrapCase()} type="button">
									<RefreshCw className="mr-2 size-4" />
									Retry
								</Button>
								<Button asChild type="button" variant="outline">
									<Link
										search={EMPTY_ADMIN_DETAIL_SEARCH}
										to="/admin/originations"
									>
										Back to drafts
									</Link>
								</Button>
							</div>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
