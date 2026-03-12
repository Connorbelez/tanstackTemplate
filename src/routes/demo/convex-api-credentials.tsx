import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Copy, Key, Plus, RotateCw, ShieldX } from "lucide-react";
import { useCallback, useState } from "react";
import { DemoLayout } from "#/components/demo-layout";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/demo/convex-api-credentials")({
	ssr: false,
	component: ApiCredentialsDemo,
});

function ApiCredentialsDemo() {
	return (
		<DemoLayout
			description="Manage API keys and tokens with creation, validation, rotation, and revocation."
			title="API Credentials"
		>
			<Tabs defaultValue="keys">
				<TabsList>
					<TabsTrigger value="keys">API Keys</TabsTrigger>
					<TabsTrigger value="tokens">API Tokens</TabsTrigger>
				</TabsList>
				<TabsContent value="keys">
					<ApiKeysTab />
				</TabsContent>
				<TabsContent value="tokens">
					<ApiTokensTab />
				</TabsContent>
			</Tabs>
		</DemoLayout>
	);
}

function ApiKeysTab() {
	const [name, setName] = useState("");
	const [createdKey, setCreatedKey] = useState<string | null>(null);
	const [validateInput, setValidateInput] = useState("");

	const createKey = useMutation(api.demo.apiCredentials.createKey);
	const keys = useQuery(api.demo.apiCredentials.listKeys);

	const handleCreate = useCallback(async () => {
		if (!name.trim()) {
			return;
		}
		const result = await createKey({ name: name.trim() });
		setCreatedKey(result?.token ?? JSON.stringify(result));
		setName("");
	}, [createKey, name]);

	return (
		<div className="space-y-4 pt-4">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<Key className="size-4" />
						Create API Key
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="flex gap-2">
						<Input
							className="max-w-xs"
							onChange={(e) => setName(e.target.value)}
							placeholder="Key name"
							value={name}
						/>
						<Button disabled={!name.trim()} onClick={handleCreate}>
							<Plus className="mr-1 size-4" />
							Create
						</Button>
					</div>
					{createdKey && (
						<div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950">
							<span className="flex-1 truncate font-mono text-sm">
								{createdKey}
							</span>
							<Button
								onClick={() => navigator.clipboard.writeText(createdKey)}
								size="icon"
								variant="ghost"
							>
								<Copy className="size-4" />
							</Button>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Validate */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Validate Key</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2">
					<div className="flex gap-2">
						<Input
							className="flex-1"
							onChange={(e) => setValidateInput(e.target.value)}
							placeholder="Paste token to validate"
							value={validateInput}
						/>
					</div>
					<p className="text-muted-foreground text-sm">
						Paste a key above and use the validate query to check its status.
					</p>
				</CardContent>
			</Card>

			{/* List */}
			{Array.isArray(keys) && keys.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Keys ({keys.length})</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							{keys.map((key: Record<string, unknown>) => (
								<div
									className="flex items-center gap-2 rounded-md border p-2 text-sm"
									key={key._id as string}
								>
									<Key className="size-3.5" />
									<span className="flex-1">{key.name as string}</span>
									<Badge variant="outline">{key.status as string}</Badge>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}

function ApiTokensTab() {
	const [name, setName] = useState("");
	const [namespace, setNamespace] = useState("demo");
	const [createdToken, setCreatedToken] = useState<string | null>(null);
	const [tokenToRotate, setTokenToRotate] = useState("");

	const createToken = useMutation(api.demo.apiCredentials.createToken);
	const revokeToken = useMutation(api.demo.apiCredentials.revokeToken);
	const rotateToken = useMutation(api.demo.apiCredentials.rotateToken);

	const handleCreate = useCallback(async () => {
		if (!name.trim()) {
			return;
		}
		const result = await createToken({
			name: name.trim(),
			namespace,
		});
		setCreatedToken(result?.token ?? JSON.stringify(result));
		setName("");
	}, [createToken, name, namespace]);

	const handleRotate = useCallback(async () => {
		if (!tokenToRotate.trim()) {
			return;
		}
		const result = await rotateToken({ token: tokenToRotate.trim() });
		if (result && "token" in result) {
			setCreatedToken(result.token as string);
		}
		setTokenToRotate("");
	}, [rotateToken, tokenToRotate]);

	return (
		<div className="space-y-4 pt-4">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<Key className="size-4" />
						Create API Token
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="flex flex-wrap gap-2">
						<Input
							className="w-48"
							onChange={(e) => setName(e.target.value)}
							placeholder="Token name"
							value={name}
						/>
						<Input
							className="w-32"
							onChange={(e) => setNamespace(e.target.value)}
							placeholder="Namespace"
							value={namespace}
						/>
						<Button disabled={!name.trim()} onClick={handleCreate}>
							<Plus className="mr-1 size-4" />
							Create
						</Button>
					</div>
					{createdToken && (
						<div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950">
							<span className="flex-1 truncate font-mono text-sm">
								{createdToken}
							</span>
							<Button
								onClick={() => navigator.clipboard.writeText(createdToken)}
								size="icon"
								variant="ghost"
							>
								<Copy className="size-4" />
							</Button>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Rotate */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<RotateCw className="size-4" />
						Rotate Token
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex gap-2">
						<Input
							className="flex-1"
							onChange={(e) => setTokenToRotate(e.target.value)}
							placeholder="Paste token to rotate"
							value={tokenToRotate}
						/>
						<Button
							disabled={!tokenToRotate.trim()}
							onClick={handleRotate}
							variant="outline"
						>
							Rotate
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* Revoke */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<ShieldX className="size-4" />
						Revoke Token
					</CardTitle>
				</CardHeader>
				<CardContent>
					<TokenRevokeForm revokeToken={revokeToken} />
				</CardContent>
			</Card>
		</div>
	);
}

function TokenRevokeForm({
	revokeToken,
}: {
	revokeToken: ReturnType<typeof useMutation>;
}) {
	const [token, setToken] = useState("");
	return (
		<div className="flex gap-2">
			<Input
				className="flex-1"
				onChange={(e) => setToken(e.target.value)}
				placeholder="Paste token to revoke"
				value={token}
			/>
			<Button
				disabled={!token.trim()}
				onClick={() => {
					revokeToken({ token: token.trim() });
					setToken("");
				}}
				variant="destructive"
			>
				Revoke
			</Button>
		</div>
	);
}
