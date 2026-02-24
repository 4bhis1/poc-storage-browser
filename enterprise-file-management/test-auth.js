const { execSync } = require('child_process');

try {
  const result = execSync(`aws cognito-idp admin-set-user-password --user-pool-id ap-south-1_LDgq3ayzF --username Admin@fms.com --password Admin@Password --permanent --profile SMC-RESEARCH-DEVELOPMENT-ADMIN`);
  console.log('Password set successfully:', result.toString());
} catch (error) {
  console.error('Error setting password:', error.message);
}
