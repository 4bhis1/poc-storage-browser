import 'dotenv/config';
import prisma from './lib/prisma';
import { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand } from "@aws-sdk/client-cognito-identity-provider";
import { fromIni } from "@aws-sdk/credential-providers";

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: fromIni({ profile: process.env.AWS_PROFILE || 'SMC-RESEARCH-DEVELOPMENT-ADMIN' }),
});
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || 'ap-south-1_LDgq3ayzF';

async function createDummyUser(email: string, name: string, role: string, tenantId?: string) {
    try {
        console.log(`Creating user ${email}...`);
        
        // 1. Create in Cognito
        const userAttributes = [
            { Name: 'email', Value: email },
            { Name: 'email_verified', Value: 'true' },
            { Name: 'custom:role', Value: role },
            { Name: 'name', Value: name }
        ];
        if (tenantId) {
            userAttributes.push({ Name: 'custom:tenantId', Value: tenantId });
        }

        try {
            await cognitoClient.send(new AdminCreateUserCommand({
                UserPoolId: USER_POOL_ID,
                Username: email,
                UserAttributes: userAttributes,
                MessageAction: 'SUPPRESS', // Don't send email
            }));
            
            // 2. Set permanent password so we can login directly
            await cognitoClient.send(new AdminSetUserPasswordCommand({
                UserPoolId: USER_POOL_ID,
                Username: email,
                Password: 'DummyPassword123!',
                Permanent: true
            }));
        } catch (e: any) {
             if (e.name === 'UsernameExistsException') {
                 console.log(`Cognito user ${email} already exists.`);
             } else {
                 throw e;
             }
        }

        // 3. Save to DB
        await prisma.user.upsert({
            where: { email },
            update: { name, role: role as any, tenantId },
            create: { email, name, role: role as any, tenantId }
        });
        
        console.log(`✅ User ${email} created (Password: DummyPassword123!)`);
    } catch (e) {
        console.error(`❌ Failed to create user ${email}:`, e);
    }
}

async function main() {
    // Let's get the first tenant to attach some users to
    let tenant = await prisma.tenant.findFirst();
    if (!tenant) {
        // Create a dummy tenant if none exists
        tenant = await prisma.tenant.create({ data: { name: 'DummyTenant' } });
    }

    await createDummyUser(
        'dummy.tenantadmin@fms.com', 
        'Dummy Tenant Admin', 
        'TENANT_ADMIN', 
        tenant.id
    );

    await createDummyUser(
        'dummy.teammate1@fms.com', 
        'Dummy Teammate 1', 
        'TEAMMATE', 
        tenant.id
    );

    await createDummyUser(
        'dummy.teammate2@fms.com', 
        'Dummy Teammate 2', 
        'TEAMMATE', 
        tenant.id
    );

    console.log("Seeding complete.");
}

main().finally(() => prisma.$disconnect());
