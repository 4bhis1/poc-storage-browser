import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";

// ECR Repository and Image
const repo = new awsx.ecr.Repository("app-repo", {
  forceDelete: true,
});

const image = new awsx.ecr.Image("app-image", {
  repositoryUrl: repo.url,
  context: "../", // Directory with Dockerfile
  platform: "linux/amd64",
});

// Create a VPC with a single NAT gateway to save costs
const vpc = new awsx.ec2.Vpc("app-vpc", {
  natGateways: {
    strategy: "Single",
  },
  enableDnsHostnames: true,
  enableDnsSupport: true,
});

// Security Group for Database
const dbSg = new aws.ec2.SecurityGroup("db-sg", {
  vpcId: vpc.vpcId,
  description: "Allow PostgreSQL from anywhere for POC execution",
  ingress: [
    {
      protocol: "tcp",
      fromPort: 5432,
      toPort: 5432,
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  egress: [
    {
      protocol: "-1",
      fromPort: 0,
      toPort: 0,
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
});

const dbSubnetGroup = new aws.rds.SubnetGroup("db-subnets", {
  subnetIds: vpc.publicSubnetIds, // Put in public subnets for easier local prisma db push
});

// Create an RDS PostgreSQL database
const db = new aws.rds.Instance("app-db", {
  engine: "postgres",
  instanceClass: aws.rds.InstanceType.T3_Micro,
  allocatedStorage: 20,
  dbName: "filemanagement",
  username: "myuser",
  password: "mypassword123!",
  vpcSecurityGroupIds: [dbSg.id],
  dbSubnetGroupName: dbSubnetGroup.name,
  skipFinalSnapshot: true,
  publiclyAccessible: true,
});

// Security Group for Application (ALB + Tasks)
const appSg = new aws.ec2.SecurityGroup("app-sg", {
  vpcId: vpc.vpcId,
  description: "Allow HTTP traffic",
  ingress: [
    {
      protocol: "tcp",
      fromPort: 3000,
      toPort: 3000,
      cidrBlocks: ["0.0.0.0/0"],
    },
    {
      protocol: "tcp",
      fromPort: 80,
      toPort: 80,
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  egress: [
    {
      protocol: "-1",
      fromPort: 0,
      toPort: 0,
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
});

// Application Load Balancer
const alb = new awsx.lb.ApplicationLoadBalancer("app-alb", {
  subnetIds: vpc.publicSubnetIds,
  securityGroups: [appSg.id],
  defaultTargetGroup: {
    port: 3000,
    protocol: "HTTP",
    targetType: "ip",
    healthCheck: {
      path: "/",
      matcher: "200-399",
    },
  },
  listeners: [
    {
      port: 80,
      protocol: "HTTP",
    },
  ],
});

// Fargate Cluster
const cluster = new aws.ecs.Cluster("app-cluster");

// Fargate Service
const service = new awsx.ecs.FargateService("app-svc", {
  cluster: cluster.arn,
  taskDefinitionArgs: {
    container: {
      name: "app",
      image: image.imageUri,
      cpu: 512,
      memory: 1024,
      essential: true,
      portMappings: [
        {
          containerPort: 3000,
          targetGroup: alb.defaultTargetGroup,
        },
      ],
      environment: [
        {
          name: "DATABASE_URL",
          value: pulumi.interpolate`postgresql://myuser:mypassword123%21@${db.endpoint}/filemanagement?schema=public`,
        },
        { name: "JWT_SECRET", value: "supersecretkey123" },
        {
          name: "ENCRYPTION_KEY",
          value:
            "dfa35e10f81315ea9e69e3dff3f7a4ac6096a0828052aaf09f38bc11600d4a53",
        },
        // Cognito and AWS config loaded from .env
        { name: "AWS_REGION", value: process.env.AWS_REGION || "ap-south-1" },
        {
          name: "COGNITO_USER_POOL_ID",
          value: process.env.COGNITO_USER_POOL_ID || "",
        },
        {
          name: "COGNITO_CLIENT_ID",
          value: process.env.COGNITO_CLIENT_ID || "",
        },
        {
          name: "COGNITO_CLIENT_SECRET",
          value: process.env.COGNITO_CLIENT_SECRET || "",
        },
        {
          name: "COGNITO_DOMAIN_PREFIX",
          value: process.env.COGNITO_DOMAIN_PREFIX || "",
        },
        {
          name: "OAUTH_CLIENT_ID",
          value: process.env.OAUTH_CLIENT_ID || "",
        },
        {
          name: "OAUTH_CLIENT_SECRET",
          value: process.env.OAUTH_CLIENT_SECRET || "",
        },
        {
          name: "AWS_ACCESS_KEY_ID",
          value: process.env.AWS_ACCESS_KEY_ID || "",
        },
        {
          name: "AWS_SECRET_ACCESS_KEY",
          value: process.env.AWS_SECRET_ACCESS_KEY || "",
        },
        {
          name: "AWS_SESSION_TOKEN",
          value: process.env.AWS_SESSION_TOKEN || "",
        },
      ],
    },
  },
  networkConfiguration: {
    subnets: vpc.privateSubnetIds,
    securityGroups: [appSg.id],
    assignPublicIp: false, // In private subnets with NAT gateway, public IP is not required
  },
});

export const url = alb.loadBalancer.dnsName;
export const dbEndpoint = db.endpoint;
