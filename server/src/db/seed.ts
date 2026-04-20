import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { config } from "../config";

const pool = new Pool({ connectionString: config.databaseUrl });

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    console.log("Seeding database...");

    // Users
    const passwordHash = await bcrypt.hash("test1234", 10);

    const usersResult = await client.query<{ id: string; email: string }>(
      `INSERT INTO users (email, password_hash, full_name) VALUES
         ('user1@admin.com', $1, 'User1 Admin'),
         ('user2@approver.com', $1, 'User2 Approver'),
         ('user3@member.com', $1, 'User3 Member'),
         ('user4@viewer.com', $1, 'User4 Viewer')
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING id, email`,
      [passwordHash],
    );

    const userMap = new Map(usersResult.rows.map((u) => [u.email, u.id]));
    const user1Id = userMap.get("user1@admin.com")!;
    const user2Id = userMap.get("user2@approver.com")!;
    const user3Id = userMap.get("user3@member.com")!;
    const user4Id = userMap.get("user4@viewer.com")!;

    
    // Tenant
    const tenantResult = await client.query<{ id: string }>(
      `INSERT INTO tenants (name, slug) VALUES ('ABC Properties', 'abc-properties')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
    );
    const tenantId = tenantResult.rows[0]!.id;

    // Memberships
    await client.query(
      `INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES
         ($1, $2, 'admin'),
         ($1, $3, 'approver'),
         ($1, $4, 'member'),
         ($1, $5, 'viewer')
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [tenantId, user1Id, user2Id, user3Id, user4Id],
    );

    console.log("Tenant and memberships created");

    // Workflow: Document Review
    const wfResult = await client.query<{ id: string }>(
      `INSERT INTO workflows (tenant_id, name, description, created_by)
       VALUES ($1, 'Document Review', 'Standard document review and approval workflow', $2)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [tenantId, user1Id],
    );

    if (wfResult.rows[0]) {
      const workflowId = wfResult.rows[0].id;

      // States
      const statesResult = await client.query<{ id: string; name: string }>(
        `INSERT INTO workflow_states (workflow_id, tenant_id, name, is_initial, is_terminal, position_order) VALUES
           ($1, $2, 'Draft', true, false, 0),
           ($1, $2, 'In Review', false, false, 1),
           ($1, $2, 'Approved', false, true, 2),
           ($1, $2, 'Rejected', false, true, 3),
           ($1, $2, 'Published', false, true, 4)
         RETURNING id, name`,
        [workflowId, tenantId],
      );

      const stateMap = new Map(statesResult.rows.map((s) => [s.name, s.id]));

      // Transitions
      await client.query(
        `INSERT INTO workflow_transitions
           (workflow_id, tenant_id, from_state_id, to_state_id, name, requires_approval, approval_strategy)
         VALUES
           ($1, $2, $3, $4, 'Submit for Review', false, 'none'),
           ($1, $2, $4, $5, 'Approve', true, 'single'),
           ($1, $2, $4, $6, 'Reject', false, 'none'),
           ($1, $2, $5, $7, 'Publish', false, 'none'),
           ($1, $2, $6, $3, 'Revise', false, 'none')`,
        [
          workflowId,
          tenantId,
          stateMap.get("Draft"),
          stateMap.get("In Review"),
          stateMap.get("Approved"),
          stateMap.get("Rejected"),
          stateMap.get("Published"),
        ],
      );

      console.log("Workflow created");

      // Sample items
      const initialStateId = stateMap.get("Draft")!;
      await client.query(
        `INSERT INTO items (tenant_id, workflow_id, current_state_id, title, description, created_by) VALUES
           ($1, $2, $3, 'Q3 GST Filing Report', 'Quarterly GST summary and compliance report for FY 2024-25', $4),
           ($1, $2, $3, 'HR Leave Policy Update', 'Updated leave policy including Diwali and regional holidays', $5),
           ($1, $2, $3, 'Product Roadmap FY2025', 'Strategic product roadmap for Indian and SEA markets', $4)`,
        [tenantId, workflowId, initialStateId, user1Id, user3Id],
      );

      console.log("Sample items created");
    }

    await client.query("COMMIT");
    console.log("\nSeed complete!");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
