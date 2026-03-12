import { describe, expect, it, vi } from "vitest";
import { AuditTrail } from "../../../convex/auditTrailClient";

describe("AuditTrail client", () => {
	describe("constructor", () => {
		it("should create an instance with component", () => {
			const mockComponent = { lib: {} };
			const client = new AuditTrail(mockComponent);

			expect(client).toBeInstanceOf(AuditTrail);
		});
	});

	describe("insert", () => {
		it("should call runMutation with component.lib.insert and event data", async () => {
			const mockComponent = {
				lib: {
					insert: "component.lib.insert",
				},
			};

			const mockCtx = {
				runMutation: vi.fn().mockResolvedValue("event_id_123"),
			};

			const client = new AuditTrail(mockComponent);

			const event = {
				entityId: "entity_123",
				entityType: "document",
				eventType: "created",
				actorId: "user_456",
				beforeState: '{"status":"draft"}',
				afterState: '{"status":"published"}',
				metadata: '{"source":"web"}',
				timestamp: Date.now(),
			};

			const result = await client.insert(mockCtx, event);

			expect(mockCtx.runMutation).toHaveBeenCalledWith(
				"component.lib.insert",
				event
			);
			expect(result).toBe("event_id_123");
		});

		it("should handle insert without optional fields", async () => {
			const mockComponent = {
				lib: {
					insert: "component.lib.insert",
				},
			};

			const mockCtx = {
				runMutation: vi.fn().mockResolvedValue("event_id_456"),
			};

			const client = new AuditTrail(mockComponent);

			const event = {
				entityId: "entity_789",
				entityType: "user",
				eventType: "created",
				actorId: "system",
				timestamp: 1234567890,
			};

			const result = await client.insert(mockCtx, event);

			expect(mockCtx.runMutation).toHaveBeenCalledWith(
				"component.lib.insert",
				event
			);
			expect(result).toBe("event_id_456");
		});
	});

	describe("queryByEntity", () => {
		it("should call runQuery with component.lib.queryByEntity and entityId", async () => {
			const mockComponent = {
				lib: {
					queryByEntity: "component.lib.queryByEntity",
				},
			};

			const mockEvents = [
				{
					_id: "evt_1",
					entityId: "entity_123",
					eventType: "created",
					timestamp: 1000,
				},
				{
					_id: "evt_2",
					entityId: "entity_123",
					eventType: "updated",
					timestamp: 2000,
				},
			];

			const mockCtx = {
				runQuery: vi.fn().mockResolvedValue(mockEvents),
			};

			const client = new AuditTrail(mockComponent);

			const result = await client.queryByEntity(mockCtx, {
				entityId: "entity_123",
			});

			expect(mockCtx.runQuery).toHaveBeenCalledWith(
				"component.lib.queryByEntity",
				{ entityId: "entity_123" }
			);
			expect(result).toEqual(mockEvents);
		});

		it("should return empty array for entity with no events", async () => {
			const mockComponent = {
				lib: {
					queryByEntity: "component.lib.queryByEntity",
				},
			};

			const mockCtx = {
				runQuery: vi.fn().mockResolvedValue([]),
			};

			const client = new AuditTrail(mockComponent);

			const result = await client.queryByEntity(mockCtx, {
				entityId: "nonexistent",
			});

			expect(result).toEqual([]);
		});
	});

	describe("verifyChain", () => {
		it("should call runQuery with component.lib.verifyChain and entityId", async () => {
			const mockComponent = {
				lib: {
					verifyChain: "component.lib.verifyChain",
				},
			};

			const mockVerification = {
				valid: true,
				eventCount: 5,
				errors: [],
			};

			const mockCtx = {
				runQuery: vi.fn().mockResolvedValue(mockVerification),
			};

			const client = new AuditTrail(mockComponent);

			const result = await client.verifyChain(mockCtx, {
				entityId: "entity_123",
			});

			expect(mockCtx.runQuery).toHaveBeenCalledWith(
				"component.lib.verifyChain",
				{ entityId: "entity_123" }
			);
			expect(result).toEqual(mockVerification);
		});

		it("should handle verification failure", async () => {
			const mockComponent = {
				lib: {
					verifyChain: "component.lib.verifyChain",
				},
			};

			const mockVerification = {
				valid: false,
				eventCount: 3,
				errors: ["Hash mismatch at event 2"],
			};

			const mockCtx = {
				runQuery: vi.fn().mockResolvedValue(mockVerification),
			};

			const client = new AuditTrail(mockComponent);

			const result = await client.verifyChain(mockCtx, {
				entityId: "entity_456",
			});

			expect(result.valid).toBe(false);
			expect(result.errors).toContain("Hash mismatch at event 2");
		});
	});

	describe("exportTrail", () => {
		it("should call runQuery with component.lib.exportTrail and entityId", async () => {
			const mockComponent = {
				lib: {
					exportTrail: "component.lib.exportTrail",
				},
			};

			const mockExport = {
				entityId: "entity_123",
				events: [
					{ eventType: "created", timestamp: 1000 },
					{ eventType: "updated", timestamp: 2000 },
				],
				format: "json",
			};

			const mockCtx = {
				runQuery: vi.fn().mockResolvedValue(mockExport),
			};

			const client = new AuditTrail(mockComponent);

			const result = await client.exportTrail(mockCtx, {
				entityId: "entity_123",
			});

			expect(mockCtx.runQuery).toHaveBeenCalledWith(
				"component.lib.exportTrail",
				{ entityId: "entity_123" }
			);
			expect(result).toEqual(mockExport);
		});

		it("should handle export of entity with no events", async () => {
			const mockComponent = {
				lib: {
					exportTrail: "component.lib.exportTrail",
				},
			};

			const mockExport = {
				entityId: "empty_entity",
				events: [],
				format: "json",
			};

			const mockCtx = {
				runQuery: vi.fn().mockResolvedValue(mockExport),
			};

			const client = new AuditTrail(mockComponent);

			const result = await client.exportTrail(mockCtx, {
				entityId: "empty_entity",
			});

			expect(result.events).toEqual([]);
		});
	});

	describe("getOutboxStatus", () => {
		it("should call runQuery with component.lib.getOutboxStatus", async () => {
			const mockComponent = {
				lib: {
					getOutboxStatus: "component.lib.getOutboxStatus",
				},
			};

			const mockStatus = {
				pending: 5,
				emitted: 100,
				failed: 2,
				alerts: ["2 failed entries require attention"],
			};

			const mockCtx = {
				runQuery: vi.fn().mockResolvedValue(mockStatus),
			};

			const client = new AuditTrail(mockComponent);

			const result = await client.getOutboxStatus(mockCtx);

			expect(mockCtx.runQuery).toHaveBeenCalledWith(
				"component.lib.getOutboxStatus",
				{}
			);
			expect(result).toEqual(mockStatus);
		});

		it("should handle healthy outbox status", async () => {
			const mockComponent = {
				lib: {
					getOutboxStatus: "component.lib.getOutboxStatus",
				},
			};

			const mockStatus = {
				pending: 0,
				emitted: 250,
				failed: 0,
				alerts: [],
			};

			const mockCtx = {
				runQuery: vi.fn().mockResolvedValue(mockStatus),
			};

			const client = new AuditTrail(mockComponent);

			const result = await client.getOutboxStatus(mockCtx);

			expect(result.pending).toBe(0);
			expect(result.failed).toBe(0);
			expect(result.alerts).toEqual([]);
		});
	});

	describe("emitPending", () => {
		it("should call runMutation with component.lib.emitPending", async () => {
			const mockComponent = {
				lib: {
					emitPending: "component.lib.emitPending",
				},
			};

			const mockResult = {
				emittedCount: 5,
				failedCount: 0,
			};

			const mockCtx = {
				runMutation: vi.fn().mockResolvedValue(mockResult),
			};

			const client = new AuditTrail(mockComponent);

			const result = await client.emitPending(mockCtx);

			expect(mockCtx.runMutation).toHaveBeenCalledWith(
				"component.lib.emitPending",
				{}
			);
			expect(result).toEqual(mockResult);
		});

		it("should handle emitPending with failures", async () => {
			const mockComponent = {
				lib: {
					emitPending: "component.lib.emitPending",
				},
			};

			const mockResult = {
				emittedCount: 3,
				failedCount: 2,
			};

			const mockCtx = {
				runMutation: vi.fn().mockResolvedValue(mockResult),
			};

			const client = new AuditTrail(mockComponent);

			const result = await client.emitPending(mockCtx);

			expect(result.emittedCount).toBe(3);
			expect(result.failedCount).toBe(2);
		});

		it("should handle emitPending with no pending entries", async () => {
			const mockComponent = {
				lib: {
					emitPending: "component.lib.emitPending",
				},
			};

			const mockResult = {
				emittedCount: 0,
				failedCount: 0,
			};

			const mockCtx = {
				runMutation: vi.fn().mockResolvedValue(mockResult),
			};

			const client = new AuditTrail(mockComponent);

			const result = await client.emitPending(mockCtx);

			expect(result.emittedCount).toBe(0);
			expect(result.failedCount).toBe(0);
		});
	});

	describe("append-only guarantees", () => {
		it("should not expose update, delete, or patch methods", () => {
			const mockComponent = { lib: {} };
			const client = new AuditTrail(mockComponent);

			expect(client).not.toHaveProperty("update");
			expect(client).not.toHaveProperty("delete");
			expect(client).not.toHaveProperty("patch");
		});

		it("should only expose insert, query, verify, export, and outbox methods", () => {
			const mockComponent = { lib: {} };
			const client = new AuditTrail(mockComponent);

			const methods = Object.getOwnPropertyNames(
				Object.getPrototypeOf(client)
			).filter((name) => name !== "constructor");

			expect(methods).toEqual(
				expect.arrayContaining([
					"insert",
					"queryByEntity",
					"verifyChain",
					"exportTrail",
					"getOutboxStatus",
					"emitPending",
				])
			);

			// Ensure no destructive operations
			expect(methods).not.toContain("update");
			expect(methods).not.toContain("delete");
			expect(methods).not.toContain("patch");
			expect(methods).not.toContain("remove");
		});
	});

	describe("event data validation patterns", () => {
		it("should accept valid event with all required fields", async () => {
			const mockComponent = { lib: { insert: "component.lib.insert" } };
			const mockCtx = {
				runMutation: vi.fn().mockResolvedValue("event_id"),
			};
			const client = new AuditTrail(mockComponent);

			const validEvent = {
				entityId: "doc_123",
				entityType: "document",
				eventType: "published",
				actorId: "user_456",
				timestamp: Date.now(),
			};

			await client.insert(mockCtx, validEvent);

			expect(mockCtx.runMutation).toHaveBeenCalledWith(
				"component.lib.insert",
				validEvent
			);
		});

		it("should accept event with state transition data", async () => {
			const mockComponent = { lib: { insert: "component.lib.insert" } };
			const mockCtx = {
				runMutation: vi.fn().mockResolvedValue("event_id"),
			};
			const client = new AuditTrail(mockComponent);

			const eventWithState = {
				entityId: "doc_123",
				entityType: "document",
				eventType: "status_changed",
				actorId: "user_456",
				beforeState: JSON.stringify({ status: "draft" }),
				afterState: JSON.stringify({ status: "published" }),
				timestamp: Date.now(),
			};

			await client.insert(mockCtx, eventWithState);

			expect(mockCtx.runMutation).toHaveBeenCalledWith(
				"component.lib.insert",
				expect.objectContaining({
					beforeState: expect.any(String),
					afterState: expect.any(String),
				})
			);
		});

		it("should accept event with metadata", async () => {
			const mockComponent = { lib: { insert: "component.lib.insert" } };
			const mockCtx = {
				runMutation: vi.fn().mockResolvedValue("event_id"),
			};
			const client = new AuditTrail(mockComponent);

			const eventWithMetadata = {
				entityId: "doc_123",
				entityType: "document",
				eventType: "viewed",
				actorId: "user_456",
				metadata: JSON.stringify({ ip: "192.168.1.1", userAgent: "Chrome" }),
				timestamp: Date.now(),
			};

			await client.insert(mockCtx, eventWithMetadata);

			expect(mockCtx.runMutation).toHaveBeenCalledWith(
				"component.lib.insert",
				expect.objectContaining({
					metadata: expect.any(String),
				})
			);
		});
	});
});