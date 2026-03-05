cd electron-app
DATABASE_URL="postgresql://agent_user:agent_password@localhost:5434/agent_db" npx prisma@5 studio --port 5556 --browser none
