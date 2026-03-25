import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import {
	Layers,
	Lock,
	Plus,
	RefreshCw,
	Shield,
	Timer,
	Trash2,
	User,
} from "lucide-react";
import { useCallback, useState } from "react";
import { DemoLayout } from "#/components/demo-layout";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/demo/convex-fluent")({
	ssr: false,
	component: FluentConvexDemo,
});

function extractErrorMessage(error: unknown): string {
	if (error instanceof ConvexError) {
		return typeof error.data === "string"
			? error.data
			: JSON.stringify(error.data);
	}
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

function FluentConvexDemo() {
	return (
		<DemoLayout
			description="Fluent API builder for Convex with middleware, validation, RBAC, Zod, custom plugins, and callables."
			docsHref="https://friendly-zebra-716.convex.site/"
			title="fluent-convex"
		>
			<div className="space-y-6">
				<BuilderBasicsCard />
				<MiddlewareCard />
				<ValidationCard />
				<RbacAdminCard />
				<RbacPermissionCard />
				<CallablesCard />
				<CustomPluginCard />
			</div>
		</DemoLayout>
	);
}

// ── 1. Builder Basics ───────────────────────────────────────────────

function BuilderBasicsCard() {
	const [name, setName] = useState("");
	const widgets = useQuery(api.demo.fluentConvex.listWidgets, {});
	const createWidget = useMutation(api.demo.fluentConvex.createWidget);
	const deleteWidget = useMutation(api.demo.fluentConvex.deleteWidget);
	const seedWidgets = useMutation(api.demo.fluentConvex.seedWidgets);
	const [seedError, setSeedError] = useState("");

	const handleCreate = useCallback(async () => {
		if (!name.trim()) {
			return;
		}
		await createWidget({ name: name.trim() });
		setName("");
	}, [createWidget, name]);

	const handleSeed = useCallback(async () => {
		setSeedError("");
		try {
			await seedWidgets({});
		} catch (e) {
			setSeedError(extractErrorMessage(e));
		}
	}, [seedWidgets]);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<Layers className="size-4" />
					Builder Basics
				</CardTitle>
				<CardDescription>
					Create widgets with the fluent builder — .query(), .input(),
					.handler(), .public()
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex gap-3">
					<Input
						className="max-w-xs"
						onChange={(e) => setName(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && handleCreate()}
						placeholder="Widget name"
						value={name}
					/>
					<Button disabled={!name.trim()} onClick={handleCreate}>
						<Plus className="mr-2 size-4" />
						Create
					</Button>
					<Button onClick={handleSeed} variant="outline">
						Seed Data
					</Button>
				</div>

				{seedError && (
					<Alert variant="destructive">
						<AlertDescription>{seedError}</AlertDescription>
					</Alert>
				)}

				{widgets && widgets.length > 0 && (
					<div className="space-y-2">
						{widgets.map((w) => (
							<div
								className="flex items-center gap-3 rounded-md border p-3"
								key={w._id}
							>
								<span className="flex-1 font-medium">{w.name}</span>
								<Badge variant="outline">{w.createdBy}</Badge>
								<Button
									onClick={() => deleteWidget({ id: w._id })}
									size="icon"
									variant="ghost"
								>
									<Trash2 className="size-4" />
								</Button>
							</div>
						))}
					</div>
				)}

				{widgets && widgets.length === 0 && (
					<p className="text-muted-foreground text-sm">
						No widgets yet. Create one or seed sample data.
					</p>
				)}
			</CardContent>
		</Card>
	);
}

// ── 2. Middleware ────────────────────────────────────────────────────

function MiddlewareCard() {
	const [name, setName] = useState("");
	const profile = useQuery(api.demo.fluentConvex.getMyProfile, {});
	const createWidgetLogged = useMutation(
		api.demo.fluentConvex.createWidgetLogged
	);
	const [logResult, setLogResult] = useState<{
		success?: string;
		error?: string;
	}>({});

	const handleCreate = useCallback(async () => {
		if (!name.trim()) {
			return;
		}
		setLogResult({});
		try {
			await createWidgetLogged({ name: name.trim() });
			setLogResult({ success: `Created "${name.trim()}" with logging` });
			setName("");
		} catch (e) {
			setLogResult({ error: extractErrorMessage(e) });
		}
	}, [createWidgetLogged, name]);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<Shield className="size-4" />
					Middleware
				</CardTitle>
				<CardDescription>
					Context-enrichment (auth) and onion (logging) middleware
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid gap-4 md:grid-cols-2">
					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="text-sm">Auth Middleware</CardTitle>
						</CardHeader>
						<CardContent>
							{profile ? (
								<div className="space-y-1 text-sm">
									<p>
										<span className="text-muted-foreground">Name:</span>{" "}
										{profile.name}
									</p>
									<p>
										<span className="text-muted-foreground">Email:</span>{" "}
										{profile.email}
									</p>
								</div>
							) : (
								<p className="text-muted-foreground text-sm">
									Sign in to see your profile via authMiddleware
								</p>
							)}
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="text-sm">Logging Middleware</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							<div className="flex gap-2">
								<Input
									className="flex-1"
									onChange={(e) => setName(e.target.value)}
									placeholder="Widget name"
									value={name}
								/>
								<Button
									disabled={!name.trim()}
									onClick={handleCreate}
									size="sm"
								>
									Create
								</Button>
							</div>
							<p className="text-muted-foreground text-xs">
								Check Convex dashboard logs for timing output
							</p>
							{logResult.success && (
								<Alert>
									<AlertDescription>{logResult.success}</AlertDescription>
								</Alert>
							)}
							{logResult.error && (
								<Alert variant="destructive">
									<AlertDescription>{logResult.error}</AlertDescription>
								</Alert>
							)}
						</CardContent>
					</Card>
				</div>
			</CardContent>
		</Card>
	);
}

// ── 3. Validation ───────────────────────────────────────────────────

function ValidationCard() {
	const [count, setCount] = useState("5");
	const [name, setName] = useState("test");
	const [email, setEmail] = useState("user@example.com");

	const propResult = useQuery(api.demo.fluentConvex.validateProperty, {
		count: Number(count) || 1,
		name: name || "test",
	});
	const objResult = useQuery(api.demo.fluentConvex.validateObject, {
		count: Number(count) || 1,
		name: name || "test",
	});

	const zodResult = useQuery(api.demo.fluentConvex.validateZod, {
		count: Number(count) || 1,
		email: email || "user@example.com",
	});

	const [zodName, setZodName] = useState("");
	const [zodScore, setZodScore] = useState("");
	const [zodRefineResult, setZodRefineResult] = useState<{
		success?: string;
		error?: string;
	}>({});

	const addPositiveWidget = useMutation(
		api.demo.fluentConvex.addPositiveWidget
	);

	const handleZodRefine = useCallback(async () => {
		setZodRefineResult({});
		try {
			await addPositiveWidget({
				name: zodName || "test",
				score: Number(zodScore) || 0,
			});
			setZodRefineResult({ success: "Widget created!" });
			setZodName("");
			setZodScore("");
		} catch (e) {
			setZodRefineResult({ error: extractErrorMessage(e) });
		}
	}, [addPositiveWidget, zodName, zodScore]);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Validation — 3 Approaches</CardTitle>
				<CardDescription>
					Property validators, v.object() + .returns(), and Zod schemas
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Tabs defaultValue="property">
					<TabsList className="mb-4">
						<TabsTrigger value="property">Property</TabsTrigger>
						<TabsTrigger value="object">v.object()</TabsTrigger>
						<TabsTrigger value="zod">Zod</TabsTrigger>
						<TabsTrigger value="refinements">Zod Refinements</TabsTrigger>
					</TabsList>

					<TabsContent className="space-y-3" value="property">
						<div className="flex gap-3">
							<Input
								className="w-24"
								onChange={(e) => setCount(e.target.value)}
								placeholder="Count"
								type="number"
								value={count}
							/>
							<Input
								className="max-w-xs"
								onChange={(e) => setName(e.target.value)}
								placeholder="Name"
								value={name}
							/>
						</div>
						{propResult && (
							<pre className="rounded-md bg-muted p-3 text-sm">
								{JSON.stringify(propResult, null, 2)}
							</pre>
						)}
					</TabsContent>

					<TabsContent className="space-y-3" value="object">
						<p className="text-muted-foreground text-sm">
							Same inputs, validated with v.object() + .returns() for runtime
							return type checking.
						</p>
						{objResult && (
							<pre className="rounded-md bg-muted p-3 text-sm">
								{JSON.stringify(objResult, null, 2)}
							</pre>
						)}
					</TabsContent>

					<TabsContent className="space-y-3" value="zod">
						<div className="flex gap-3">
							<Input
								className="w-24"
								onChange={(e) => setCount(e.target.value)}
								placeholder="Count (1-100)"
								type="number"
								value={count}
							/>
							<Input
								className="max-w-xs"
								onChange={(e) => setEmail(e.target.value)}
								placeholder="Email"
								value={email}
							/>
						</div>
						<p className="text-muted-foreground text-sm">
							Zod validates: count must be int 1-100, email must be valid.
							Errors show server-side Zod validation.
						</p>
						{zodResult && (
							<pre className="rounded-md bg-muted p-3 text-sm">
								{JSON.stringify(zodResult, null, 2)}
							</pre>
						)}
					</TabsContent>

					<TabsContent className="space-y-3" value="refinements">
						<p className="text-muted-foreground text-sm">
							Zod refinements: name 1-50 chars, score must be positive. Try 0 or
							negative.
						</p>
						<div className="flex gap-3">
							<Input
								className="max-w-xs"
								onChange={(e) => setZodName(e.target.value)}
								placeholder="Name (1-50 chars)"
								value={zodName}
							/>
							<Input
								className="w-32"
								onChange={(e) => setZodScore(e.target.value)}
								placeholder="Score (>0)"
								type="number"
								value={zodScore}
							/>
							<Button onClick={handleZodRefine} size="sm">
								Add
							</Button>
						</div>
						{zodRefineResult.success && (
							<Alert>
								<AlertDescription>{zodRefineResult.success}</AlertDescription>
							</Alert>
						)}
						{zodRefineResult.error && (
							<Alert variant="destructive">
								<AlertDescription>{zodRefineResult.error}</AlertDescription>
							</Alert>
						)}
					</TabsContent>
				</Tabs>
			</CardContent>
		</Card>
	);
}

// ── 4. RBAC: Admin Role ─────────────────────────────────────────────

function RbacAdminCard() {
	const resetWidgets = useMutation(api.demo.fluentConvex.resetWidgets);
	const [result, setResult] = useState<{
		success?: string;
		error?: string;
	}>({});

	const handleReset = useCallback(async () => {
		setResult({});
		try {
			const res = await resetWidgets({});
			setResult({ success: `Deleted ${res.deleted} records` });
		} catch (e) {
			setResult({ error: extractErrorMessage(e) });
		}
	}, [resetWidgets]);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<Lock className="size-4" />
					RBAC: Admin Role Check
				</CardTitle>
				<CardDescription>
					Uses adminMutation chain (authMiddleware + requireAdmin). Only users
					with "admin" roleSlug can execute.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<Button onClick={handleReset} variant="destructive">
					<RefreshCw className="mr-2 size-4" />
					Reset All Demo Data
				</Button>

				{result.success && (
					<Alert>
						<AlertDescription>{result.success}</AlertDescription>
					</Alert>
				)}
				{result.error && (
					<Alert variant="destructive">
						<AlertDescription>{result.error}</AlertDescription>
					</Alert>
				)}
			</CardContent>
		</Card>
	);
}

// ── 5. RBAC: Permission Check ───────────────────────────────────────

function RbacPermissionCard() {
	const widgets = useQuery(api.demo.fluentConvex.listWidgets, {});
	const [selectedWidgetId, setSelectedWidgetId] = useState<string>("");
	const [userId, setUserId] = useState("");
	const [role, setRole] = useState("viewer");
	const [result, setResult] = useState<{
		success?: string;
		error?: string;
	}>({});

	const widgetUsers = useQuery(
		api.demo.fluentConvex.listWidgetUsers,
		selectedWidgetId ? { widgetId: selectedWidgetId as never } : "skip"
	);
	const addWidgetUser = useMutation(api.demo.fluentConvex.addWidgetUser);
	const removeWidgetUser = useMutation(api.demo.fluentConvex.removeWidgetUser);

	const handleAdd = useCallback(async () => {
		if (!(selectedWidgetId && userId.trim())) {
			return;
		}
		setResult({});
		try {
			await addWidgetUser({
				widgetId: selectedWidgetId as never,
				userId: userId.trim(),
				role,
			});
			setResult({ success: `Added user "${userId.trim()}"` });
			setUserId("");
		} catch (e) {
			setResult({ error: extractErrorMessage(e) });
		}
	}, [addWidgetUser, selectedWidgetId, userId, role]);

	const handleRemove = useCallback(
		async (id: string) => {
			setResult({});
			try {
				await removeWidgetUser({ id: id as never });
				setResult({ success: "User removed" });
			} catch (e) {
				setResult({ error: extractErrorMessage(e) });
			}
		},
		[removeWidgetUser]
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<User className="size-4" />
					RBAC: Permission Check
				</CardTitle>
				<CardDescription>
					Requires "widgets:users-table:manage" permission. Add users to
					widgets.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex gap-3">
					<select
						className="rounded-md border bg-background px-3 py-2 text-sm"
						onChange={(e) => setSelectedWidgetId(e.target.value)}
						value={selectedWidgetId}
					>
						<option value="">Select a widget...</option>
						{widgets?.map((w) => (
							<option key={w._id} value={w._id}>
								{w.name}
							</option>
						))}
					</select>
				</div>

				{selectedWidgetId && (
					<div className="flex gap-3">
						<Input
							className="max-w-xs"
							onChange={(e) => setUserId(e.target.value)}
							placeholder="User ID"
							value={userId}
						/>
						<Input
							className="w-32"
							onChange={(e) => setRole(e.target.value)}
							placeholder="Role"
							value={role}
						/>
						<Button disabled={!userId.trim()} onClick={handleAdd} size="sm">
							<Plus className="mr-2 size-4" />
							Add User
						</Button>
					</div>
				)}

				{result.success && (
					<Alert>
						<AlertDescription>{result.success}</AlertDescription>
					</Alert>
				)}
				{result.error && (
					<Alert variant="destructive">
						<AlertDescription>{result.error}</AlertDescription>
					</Alert>
				)}

				{widgetUsers && widgetUsers.length > 0 && (
					<div className="space-y-2">
						{widgetUsers.map((wu) => (
							<div
								className="flex items-center gap-3 rounded-md border p-3"
								key={wu._id}
							>
								<span className="flex-1 text-sm">{wu.userId}</span>
								<Badge variant="outline">{wu.role}</Badge>
								<Button
									onClick={() => handleRemove(wu._id)}
									size="icon"
									variant="ghost"
								>
									<Trash2 className="size-4" />
								</Button>
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

// ── 6. Callables ────────────────────────────────────────────────────

function CallablesCard() {
	const countResult = useQuery(api.demo.fluentConvex.widgetCount, {});
	const protectedResult = useQuery(
		api.demo.fluentConvex.widgetCountProtected,
		{}
	);
	const summaryResult = useQuery(api.demo.fluentConvex.widgetSummary, {});

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<Layers className="size-4" />
					Callables
				</CardTitle>
				<CardDescription>
					Same logic defined once as a callable, registered 3 ways: public, with
					auth, and composed into another handler.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="grid gap-4 md:grid-cols-3">
					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="text-sm">widgetCount (public)</CardTitle>
						</CardHeader>
						<CardContent>
							{countResult ? (
								<p className="font-bold text-2xl">{countResult.count}</p>
							) : (
								<p className="text-muted-foreground text-sm">Loading...</p>
							)}
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="text-sm">
								widgetCountProtected (auth)
							</CardTitle>
						</CardHeader>
						<CardContent>
							{protectedResult ? (
								<p className="font-bold text-2xl">{protectedResult.count}</p>
							) : (
								<p className="text-muted-foreground text-sm">
									Sign in required
								</p>
							)}
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="text-sm">
								widgetSummary (composed)
							</CardTitle>
						</CardHeader>
						<CardContent>
							{summaryResult ? (
								<div className="space-y-1 text-sm">
									<p className="font-bold text-2xl">{summaryResult.count}</p>
									<p className="text-muted-foreground text-xs">
										at {new Date(summaryResult.timestamp).toLocaleTimeString()}
									</p>
								</div>
							) : (
								<p className="text-muted-foreground text-sm">Loading...</p>
							)}
						</CardContent>
					</Card>
				</div>
			</CardContent>
		</Card>
	);
}

// ── 7. Custom Plugin ────────────────────────────────────────────────

function CustomPluginCard() {
	const timedResult = useQuery(api.demo.fluentConvex.timedWidgetList, {});

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<Timer className="size-4" />
					Custom Plugin: TimedBuilder
				</CardTitle>
				<CardDescription>
					.extend(TimedBuilder).withTiming() adds execution timing via onion
					middleware. Check dashboard logs.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{timedResult ? (
					<div className="space-y-2">
						<p className="text-muted-foreground text-sm">
							Fetched {timedResult.widgets.length} widgets at{" "}
							{new Date(timedResult.fetchedAt).toLocaleTimeString()}
						</p>
						{timedResult.widgets.length > 0 && (
							<div className="space-y-1">
								{timedResult.widgets.map((w) => (
									<div
										className="flex items-center gap-2 rounded border p-2 text-sm"
										key={w._id}
									>
										<span>{w.name}</span>
										<Badge className="ml-auto" variant="outline">
											{w.createdBy}
										</Badge>
									</div>
								))}
							</div>
						)}
					</div>
				) : (
					<p className="text-muted-foreground text-sm">Loading...</p>
				)}
			</CardContent>
		</Card>
	);
}
