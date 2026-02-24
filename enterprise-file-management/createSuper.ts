import { inviteUserToCognito } from "./lib/auth-service";

async function run() {
  try {
    const res = await inviteUserToCognito("Admin@fms.com", undefined, "PLATFORM_ADMIN");
    console.log(res);
  } catch (e) {
    console.log(e);
  }
}
run();
