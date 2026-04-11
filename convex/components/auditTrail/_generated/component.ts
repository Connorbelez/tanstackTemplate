/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    lib: {
      emitPending: FunctionReference<"mutation", "internal", {}, any, Name>;
      exportTrail: FunctionReference<
        "query",
        "internal",
        { entityId: string },
        any,
        Name
      >;
      getOutboxStatus: FunctionReference<"query", "internal", {}, any, Name>;
      insert: FunctionReference<
        "mutation",
        "internal",
        {
          actorId: string;
          afterState?: string;
          beforeState?: string;
          canonicalEnvelope?: string;
          entityId: string;
          entityType: string;
          eventType: string;
          metadata?: string;
          timestamp: number;
        },
        string,
        Name
      >;
      queryByEntity: FunctionReference<
        "query",
        "internal",
        { entityId: string },
        Array<{
          _creationTime: number;
          _id: string;
          actorId: string;
          afterState?: string;
          archivedAt?: number;
          beforeState?: string;
          canonicalEnvelope?: string;
          emitFailures?: number;
          emitted: boolean;
          emittedAt?: number;
          entityId: string;
          entityType: string;
          eventType: string;
          hash: string;
          metadata?: string;
          prevHash: string;
          retentionUntilAt: number;
          sinkReference?: string;
          timestamp: number;
        }>,
        Name
      >;
      verifyChain: FunctionReference<
        "query",
        "internal",
        { entityId: string },
        any,
        Name
      >;
    };
  };
