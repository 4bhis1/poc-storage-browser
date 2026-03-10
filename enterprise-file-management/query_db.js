const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: "postgresql://myuser:mypassword123!@app-db39c943d.chieou0uwi0l.ap-south-1.rds.amazonaws.com:5432/filemanagement?schema=public",
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const res = await client.query(`SELECT id, "parentId", name, key, "isFolder", "createdAt" FROM "FileObject" WHERE name ILIKE '%browser-dev%'`);
  console.log(JSON.stringify(res.rows, null, 2));

  await client.end();
}

main().catch(console.error);
