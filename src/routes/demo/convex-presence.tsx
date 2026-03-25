import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { MessageCircle, Send, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DemoLayout } from "#/components/demo-layout";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/demo/convex-presence")({
	ssr: false,
	component: PresenceDemo,
});

const ROOM = "demo-chat-room";
const HEARTBEAT_INTERVAL = 10_000;

function PresenceDemo() {
	const username = useMemo(
		() => `User-${Math.floor(Math.random() * 10_000)}`,
		[]
	);
	const sessionId = useMemo(() => crypto.randomUUID(), []);
	const sessionTokenRef = useRef<string | null>(null);

	const heartbeat = useMutation(api.demo.presence.heartbeat);
	const disconnectMutation = useMutation(api.demo.presence.disconnect);
	const onlineUsers = useQuery(api.demo.presence.listRoom, { roomId: ROOM });
	const messages = useQuery(api.demo.presence.listMessages, { room: ROOM });
	const sendMessage = useMutation(api.demo.presence.sendMessage);
	const [text, setText] = useState("");

	useEffect(() => {
		let interval: ReturnType<typeof setInterval> | null = null;

		const sendHeartbeat = async () => {
			try {
				const result = await heartbeat({
					roomId: ROOM,
					userId: username,
					sessionId,
					interval: HEARTBEAT_INTERVAL,
				});
				sessionTokenRef.current = result.sessionToken;
			} catch (e) {
				console.error("Presence heartbeat failed:", e);
			}
		};

		void sendHeartbeat();
		interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

		return () => {
			if (interval) {
				clearInterval(interval);
			}
			if (sessionTokenRef.current) {
				void disconnectMutation({
					sessionToken: sessionTokenRef.current,
				});
			}
		};
	}, [heartbeat, disconnectMutation, username, sessionId]);

	const handleSend = useCallback(async () => {
		if (!text.trim()) {
			return;
		}
		await sendMessage({ room: ROOM, author: username, text: text.trim() });
		setText("");
	}, [sendMessage, username, text]);

	return (
		<DemoLayout
			description="Live room presence with heartbeat-based session tracking. Open this page in multiple tabs to see users appear and disappear."
			docsHref="https://www.convex.dev/components/presence"
			title="Presence"
		>
			<div className="grid gap-6 md:grid-cols-3">
				{/* Online users */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<Users className="size-4" />
							Online Now
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="mb-3 text-muted-foreground text-sm">
							You are: <strong>{username}</strong>
						</p>
						<div className="space-y-2">
							{onlineUsers?.map((user) => (
								<div
									className="flex items-center gap-2 text-sm"
									key={user.userId}
								>
									<span
										className={`inline-block size-2 rounded-full ${user.online ? "bg-green-500" : "bg-gray-400"}`}
									/>
									{user.userId}
									{user.userId === username && (
										<Badge className="text-xs" variant="outline">
											you
										</Badge>
									)}
								</div>
							))}
							{!onlineUsers && (
								<p className="text-muted-foreground text-sm">Connecting…</p>
							)}
							{onlineUsers?.length === 0 && (
								<p className="text-muted-foreground text-sm">
									No users online yet.
								</p>
							)}
						</div>
					</CardContent>
				</Card>

				{/* Chat */}
				<Card className="md:col-span-2">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<MessageCircle className="size-4" />
							Chat Room
							<Badge variant="outline">{ROOM}</Badge>
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<div className="flex gap-2">
							<Input
								onChange={(e) => setText(e.target.value)}
								onKeyDown={(e) => e.key === "Enter" && handleSend()}
								placeholder="Type a message…"
								value={text}
							/>
							<Button disabled={!text.trim()} onClick={handleSend} size="icon">
								<Send className="size-4" />
							</Button>
						</div>
						<div className="max-h-64 space-y-2 overflow-y-auto">
							{messages?.map((msg) => (
								<div className="rounded-md border p-2 text-sm" key={msg._id}>
									<span className="font-medium">{msg.author}:</span> {msg.text}
								</div>
							))}
							{messages?.length === 0 && (
								<p className="text-muted-foreground text-sm">
									No messages yet. Say hello!
								</p>
							)}
						</div>
					</CardContent>
				</Card>
			</div>
		</DemoLayout>
	);
}
