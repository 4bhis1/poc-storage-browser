import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { Role } from "@/lib/generated/prisma/client";
import prisma from "@/lib/prisma";
import crypto from "crypto";

// For POC, we'll assume the Hub Account ID is drawn from an environment variable
// Fallback to a placeholder if not set.
const HUB_ACCOUNT_ID = process.env.AWS_HUB_ACCOUNT_ID || "123456789012";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== Role.PLATFORM_ADMIN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { awsAccountId } = body;

    if (!awsAccountId || !/^\d{12}$/.test(awsAccountId)) {
      return NextResponse.json(
        { error: "Invalid AWS Account ID format" },
        { status: 400 },
      );
    }

    // Generate a secure random external ID
    const randomHex = crypto.randomBytes(16).toString("hex");
    const externalId = `cams-${randomHex}`;

    // Define the ARN for the role that will be created in the customer's account
    const roleName = `camsAccess-${HUB_ACCOUNT_ID}`;
    const targetRoleArn = `arn:aws:iam::${awsAccountId}:role/${roleName}`;

    // Generate CloudFormation Template (YAML)
    const templateYaml = `AWSTemplateFormatVersion: "2010-09-09"
Description: >
  Cross-account IAM Role for CAMS Platform integration. 
  This template grants the platform minimal necessary read and write permissions to manage storage.
Parameters:
  HubAccountId:
    Type: String
    Default: "${HUB_ACCOUNT_ID}"
    Description: "The ID of the central Hub AWS Account"
  ExternalId:
    Type: String
    Default: "${externalId}"
    Description: "Secure external ID for AssumeRole verification to prevent confused deputy attacks"
Resources:
  CamsCrossAccountRole:
    Type: "AWS::IAM::Role"
    Properties:
      RoleName: "${roleName}"
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: "Allow"
            Principal:
              AWS: !Sub "arn:aws:iam::\${HubAccountId}:root"
            Action: "sts:AssumeRole"
            Condition:
              StringEquals:
                "sts:ExternalId": !Ref ExternalId
      Policies:
        - PolicyName: "CamsStoragePolicy"
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - Effect: "Allow"
                Action:
                  - "s3:ListBucket"
                  - "s3:GetBucketLocation"
                  - "s3:GetObject"
                  - "s3:PutObject"
                  - "s3:DeleteObject"
                  - "s3:PutObjectAcl"
                  - "s3:GetObjectAcl"
                  - "s3:GetBucketTagging"
                  - "s3:PutBucketTagging"
                  - "s3:DeleteBucketTagging"
                  - "s3:GetBucketPublicAccessBlock"
                  - "s3:PutBucketPublicAccessBlock"
                  - "s3:GetBucketCORS"
                  - "s3:PutBucketCORS"
                  - "s3:GetBucketVersioning"
                  - "s3:PutBucketVersioning"
                  - "s3:CreateBucket"
                  - "s3:DeleteBucket"
                  - "s3:PutEncryptionConfiguration"
                  - "s3:PutLifecycleConfiguration"
                  - "s3:GetBucketNotification"
                  - "s3:PutBucketNotification"
                Resource:
                  - "*"
              - Effect: "Allow"
                Action:
                  - "events:PutRule"
                  - "events:PutTargets"
                  - "events:DeleteRule"
                  - "events:RemoveTargets"
                  - "events:DescribeRule"
                  - "events:ListTargetsByRule"
                Resource:
                  - "*"
              - Effect: "Allow"
                Action:
                  - "iam:GetRole"
                  - "iam:CreateRole"
                  - "iam:PutRolePolicy"
                  - "iam:PassRole"
                Resource:
                  - !Sub "arn:aws:iam::${AWS::AccountId}:role/CamsEventBridgeCrossAccountRole"
Outputs:
  RoleArn:
    Description: "The ARN of the newly created IAM Role"
    Value: !GetAtt CamsCrossAccountRole.Arn
`;

    // Audit Log: Template Generated
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "CLOUDFORMATION_GENERATED",
        resource: "aws_account",
        details: JSON.stringify({ awsAccountId, roleArn: targetRoleArn }),
        status: "SUCCESS",
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        templateBody: templateYaml,
        roleArn: targetRoleArn,
        externalId: externalId,
      },
    });
  } catch (error) {
    console.error("Template generation error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
