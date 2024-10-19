"""An AWS Python Pulumi program"""

import pulumi
import json
import os
from pulumi_aws import s3, iam, lambda_, cloudwatch

s3_bucket = s3.BucketV2('directory')

# Disable public access block first
bucket_public_access_block = s3.BucketPublicAccessBlock("myPublicAccessBlock",
    bucket=s3_bucket.id,
    block_public_acls=False,
    block_public_policy=False,
    ignore_public_acls=False,
    restrict_public_buckets=False
)

# Then add the bucket policy
bucket_policy = s3.BucketPolicy("directoryBucketPolicy",
    bucket=s3_bucket.id,
    policy=s3_bucket.arn.apply(lambda arn: json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": ["s3:GetObject"],
            "Resource": [f"{arn}/*"]
        }]
    })),
    opts=pulumi.ResourceOptions(depends_on=[bucket_public_access_block])
)

# Configure bucket for website hosting
website_config = s3.BucketWebsiteConfigurationV2("directoryWebsiteConfig",
    bucket=s3_bucket.id,
    index_document={
        "suffix": "index.html",
    },
    error_document={
        "key": "error.html",
    },
    opts=pulumi.ResourceOptions(depends_on=[bucket_policy])
)

# Create an IAM user
api_user = iam.User("myUser", name="apiUser")

# Update the write_only_policy to include the KMS key ARN

write_only_policy = iam.Policy("writeOnlyPolicy",
    description="A policy that grants write-only access to S3 and KMS",
    policy=pulumi.Output.all(s3_bucket.arn).apply(lambda args: json.dumps({
        "Version": "2012-10-17",
        "Statement": [
            {
                # Allow S3 bucket-level actions
                "Effect": "Allow",
                "Action": [
                    "s3:ListBucket",
                    "s3:ListBucketMultipartUploads",
                ],
                "Resource": args[0]  # S3 bucket ARN without wildcard
            },
            {
                # Allow S3 object-level actions
                "Effect": "Allow",
                "Action": [
                    "s3:PutObject",
                    "s3:PutObjectAcl",
                    "s3:AbortMultipartUpload",
                    "s3:ListMultipartUploadParts",
                    "s3:GetObject",
                    "s3:ListObjectsV2",
                    "s3:HeadObject"
                ],
                "Resource": f"{args[0]}/*"  # S3 bucket ARN with wildcard
            }
        ]
    }))
)

# Attach the policy to the user
user_policy_attachment = iam.UserPolicyAttachment("attachPolicy",
    user=api_user.name,
    policy_arn=write_only_policy.arn)

# Create the access key for the user
api_access_key = iam.AccessKey("s3writeAccessKey", user=api_user.name)

pulumi.export('directory', s3_bucket.id)
pulumi.export('bucket_website_endpoint', website_config.website_endpoint)
pulumi.export('bucket_website_domain', website_config.website_domain)
pulumi.export("access_key_id", api_access_key.id)
pulumi.export("secret_access_key", api_access_key.secret)
