

# Triggers

## Blog Post
https://stack.convex.dev/triggers

Register trigger functions to run whenever data in a table changes via ctx.db.insert, ctx.db.patch, ctx.db.replace, or ctx.db.delete. The functions run in the same transaction as the mutation, atomically with the data change.

Triggers pair with custom functions to hook into each Convex mutation defined. Here's an example of using triggers to do four things:

Attach a computed fullName field to every user.
Keep a denormalized count of all users.
After the mutation, send the new user info to Clerk.
When a user is deleted, delete their messages (cascading deletes).
import { mutation as rawMutation } from "./_generated/server";
import { DataModel } from "./_generated/dataModel";
import { Triggers } from "convex-helpers/server/triggers";
import {
  customCtx,
  customMutation,
} from "convex-helpers/server/customFunctions";

const triggers = new Triggers<DataModel>();

// 1. Attach a computed `fullName` field to every user.
triggers.register("users", async (ctx, change) => {
  if (change.newDoc) {
    const fullName = `${change.newDoc.firstName} ${change.newDoc.lastName}`;
    // Abort the mutation if document is invalid.
    if (fullName === "The Balrog") {
      throw new Error("you shall not pass");
    }
    // Update denormalized field. Check first to avoid recursion
    if (change.newDoc.fullName !== fullName) {
      await ctx.db.patch(change.id, { fullName });
    }
  }
});

// 2. Keep a denormalized count of all users.
triggers.register("users", async (ctx, change) => {
  // Note writing the count to a single document increases write contention.
  // There are more scalable methods if you need high write throughput.
  const countDoc = (await ctx.db.query("userCount").unique())!;
  if (change.operation === "insert") {
    await ctx.db.patch(countDoc._id, { count: countDoc.count + 1 });
  } else if (change.operation === "delete") {
    await ctx.db.patch(countDoc._id, { count: countDoc.count - 1 });
  }
});

// 3. After the mutation, send the new user info to Clerk.
// Even if a user is modified multiple times in a single mutation,
// `internal.users.updateClerkUser` runs once.
const scheduled: Record<Id<"users">, Id<"_scheduled_functions">> = {};
triggers.register("users", async (ctx, change) => {
  if (scheduled[change.id]) {
    await ctx.scheduler.cancel(scheduled[change.id]);
  }
  scheduled[change.id] = await ctx.scheduler.runAfter(
    0,
    internal.users.updateClerkUser,
    { user: change.newDoc },
  );
});

// 4. When a user is deleted, delete their messages (cascading deletes).
triggers.register("users", async (ctx, change) => {
  // Using relationships.ts helpers for succinctness.
  await asyncMap(
    await getManyFrom(ctx.db, "messages", "owner", change.id),
    (message) => ctx.db.delete(message._id),
  );
});

// Use `mutation` to define all mutations, and the triggers will get called.
export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
Now that you have redefined mutation, add an eslint rule to forbid using the raw mutation wrappers which don't call your triggers.

What can you do with triggers?
Denormalize computed fields onto the same table or into a different table.
Such fields can be indexed for more efficient lookup.
By default, triggers will trigger more triggers.
This can be useful to ensure denormalized fields stay consistent, no matter where they are modified.
Watch out for infinite loops of triggers.
Use ctx.innerDb to perform writes without triggering more triggers.
Use global variables to coordinate across trigger invocations, e.g. to batch or debounce or single-flight async processing.
Combine with other custom functions that can pre-fetch data, like fetching the authorized user at the start of the mutation.
Throw errors, which can prevent the write by aborting the mutation.
Validate constraints and internal consistency.
Check row-level-security rules to validate the write is authorized.
Components like Aggregate can define triggers by exposing a method like TableAggregate.trigger() that returns a Trigger<Ctx, DataModel, TableName>. This "attaches" the component to a table.
Trigger semantics
The change argument tells you exactly how the document changed via a single ctx.db.insert, ctx.db.patch, ctx.db.replace, or ctx.db.delete. If these functions are called in parallel with Promise.all, they will be serialized as if they happened sequentially.
A database write is executed atomically with all of its triggers, so you can update a denormalized field in a trigger without worrying about parallel writes getting in the way.
If a write kicks off recursive triggers, they are executed with a queue, i.e. breadth-first-search order.
If a trigger function throws an error, it will be thrown from the database write (e.g. ctx.db.insert) that caused the trigger.
If a trigger's error is caught, the database write can still be committed.
To maximize fairness and consistency, all triggers still run, even if an earlier trigger threw an error. The first trigger that throws an error will have its error rethrown; other errors are console.error logged.
Warning: Triggers only run through mutations and internalMutations when wrapped with customFunctions.

If you forget to use the wrapper, the triggers won't run (use eslint rules).

If you edit data in the Convex dashboard, the triggers won't run.

If you upload data through npx convex import, the triggers won't run. const users = useQuery(api.users.getAll);
