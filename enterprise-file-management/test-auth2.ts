import { authenticateCognitoUser } from "./lib/auth-service";

async function run() {
  try {
    const res = await authenticateCognitoUser("Admin@fms.com", "Admin@Password1");
    console.log(res);
  } catch (e) {
    console.log(e);
  }
}
run();
