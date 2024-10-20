import pulumi
import json
import os
from pulumi_aws import kms, s3, iam, lambda_, cloudwatch
from pulumi_command import local
from pulumi_cloudamqp import Instance, Notification, Alarm
from dotenv import load_dotenv

# Load .env file
load_dotenv()

# ========================
# 1. CloudAMPQ 
# ========================

# Retrieve CloudAMQP configurations
cloudamqp_apikey = os.environ.get("CLOUDAMPQ_API_KEY")
rabbitmq_url = os.environ.get("RABBITMQ_URI")
enable_faster_destroy = os.environ.get("CLOUDAMQP_ENABLE_FASTER_DESTROY") or False

instance = Instance("rabbitmq",
    name="cloudamqp",
    plan="lemur",
    region="amazon-web-services::us-west-1",
    tags=["pulumi"]
)


personal = Notification("personal",
    instance_id=instance.id,
    type="email",
    value="aditbala@berkeley.edu",
    name="alarm"
)

first_queue = "TRANSCRIPTION"
second_queue = "GPT"

# Parse connection details
def parse_amqp_url(amqp_url):
    from urllib.parse import urlparse
    parsed_url = urlparse(amqp_url)
    return {
        'user': parsed_url.username,
        'password': parsed_url.password,
        'host': parsed_url.hostname,
        'port': str(parsed_url.port or (5671 if parsed_url.scheme == 'amqps' else 5672)),
        'vhost': parsed_url.path.lstrip('/'),
    }

connection_details = parse_amqp_url(rabbitmq_url)

# Update queue creation commands
create_first_queue = local.Command("createFirstQueue",
    create=pulumi.Output.all(connection_details, first_queue).apply(
        lambda args: f"python3 create_queues.py {args[0]['host']} {args[0]['user']} {args[0]['password']} {args[0]['vhost']} {args[1]}"
    ),
    opts=pulumi.ResourceOptions(depends_on=[instance]),
)

create_second_queue = local.Command("createSecondQueue",
    create=pulumi.Output.all(connection_details, second_queue).apply(
        lambda args: f"python3 create_queues.py {args[0]['host']} {args[0]['user']} {args[0]['password']} {args[0]['vhost']} {args[1]}"
    ),
    opts=pulumi.ResourceOptions(depends_on=[create_first_queue]),
)




# =========================
# 2. S3 Bucket with Encryption
# =========================
s3_bucket = s3.BucketV2('directory')

# Disable public access block first
bucket_public_access_block = s3.BucketPublicAccessBlock("accessBlock",
    bucket=s3_bucket.id,
    block_public_acls=False,
    block_public_policy=False,
    ignore_public_acls=False,
    restrict_public_buckets=False
)

# Then add the bucket policy
bucket_policy = s3.BucketPolicy("dirBucketPolicy",
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
website_config = s3.BucketWebsiteConfigurationV2("dirWebsiteConfig",
    bucket=s3_bucket.id,
    index_document={
        "suffix": "index.html",
    },
    error_document={
        "key": "error.html",
    },
    opts=pulumi.ResourceOptions(depends_on=[bucket_policy])
)

# =========================
# 3. IAM Role and Policies for Lambda
# =========================

# Assume Role Policy Document for Lambda
assume_role = iam.get_policy_document(statements=[{
    "effect": "Allow",
    "principals": [{
        "type": "Service",
        "identifiers": ["lambda.amazonaws.com"],
    }],
    "actions": ["sts:AssumeRole"],
}])

# IAM Role for Lambda
lambda_role = iam.Role("lambda_role",
    name="lambda_role",
    assume_role_policy=assume_role.json)

# Define the Custom Policy for KMS and S3 Access
s3_policy = iam.Policy("lambdaCustomPolicy",
    policy=pulumi.Output.all(s3_bucket.arn).apply(lambda args: json.dumps({
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": [
                    "s3:GetObject",
                    "s3:PutObject"
                ],
                "Resource": f"{args[0]}/*"  # S3 Bucket ARN with dynamic paths
            }
        ]
    }))
)

# Attach the Custom Policy to the Lambda Role
iam.RolePolicyAttachment("lambda_custom_policy",
    role=lambda_role.name,
    policy_arn=s3_policy.arn
)


# IAM Policy for Lambda Logging
lambda_logging = iam.get_policy_document(statements=[{
    "effect": "Allow",
    "actions": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
    ],
    "resources": ["arn:aws:logs:*:*:*"],
}])

lambda_logging_policy = iam.Policy("lambda_logs",
    name="lambda_logs",
    path="/",
    description="IAM policy for logging from a lambda",
    policy=lambda_logging.json)

# Attach Logging Policy to Lambda Role
lambda_logs = iam.RolePolicyAttachment("lambda_log_policy",
    role=lambda_role.name,
    policy_arn=lambda_logging_policy.arn)

# ===================================
# 4. Lambda Layer for Poppler and Pika
# ==================================
poppler_layer = lambda_.LayerVersion("PopplerLayer",
    compatible_runtimes=["python3.9"],
    code=pulumi.AssetArchive({
        ".": pulumi.FileArchive("./layers/poppler/poppler.zip")  # Path to your poppler.zip
    }),
    layer_name="PopplerLayer",
    description="Lambda Layer with Poppler utilities",
)


pika_layer = lambda_.LayerVersion("PikaLayer",
    compatible_runtimes=["python3.9"],
    code=pulumi.FileArchive("./layers/pika/lambda_layer_pika.zip"),
    layer_name="PikaLayer",
    description="Lambda Layer with pika library",
)

# =========================
# 5a. Lambda PDF->Slides Code
# =========================
lambda_code_pdf = """
import boto3
import os
import subprocess
import logging
import tempfile
from urllib.parse import unquote_plus

s3_client = boto3.client('s3')

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handler(event, context):
    try:
        for record in event['Records']:
            bucket_name = record['s3']['bucket']['name']
            key = unquote_plus(record['s3']['object']['key'])
            filename = os.path.basename(key)

            if not filename.lower().endswith('.pdf'):
                logger.info(f"Skipped non-PDF file: {key}")
                continue

            logger.info(f"Processing PDF: {key} from bucket: {bucket_name}")

            # Extract user_id and presentation_id from the key
            # Expected key format: Users/$user_id/presentations/$presentation_id/pdf/original_{presentation_name}.pdf
            key_parts = key.split('/')
            if len(key_parts) < 6:
                logger.error(f"Unexpected key format: {key}")
                continue

            user_id = key_parts[1]
            presentation_id = key_parts[3]
            presentation_name = os.path.splitext(filename)[0].replace('original_', '')

            # Define status file keys
            completed_status_key = f"Users/{user_id}/presentations/{presentation_id}/status_completed"
            failed_status_key = f"Users/{user_id}/presentations/{presentation_id}/status_failed"

            with tempfile.TemporaryDirectory() as tmpdir:
                download_path = os.path.join(tmpdir, filename)
                
                # Download the PDF file
                s3_client.download_file(bucket_name, key, download_path)
                logger.info(f"Downloaded {filename} to {download_path}")

                # Convert the PDF to images using Poppler
                # Output files will be named as slide-1.png, slide-2.png, etc.
                subprocess.run(['pdftoppm', '-png', download_path, os.path.join(tmpdir, 'slide')], check=True)
                logger.info(f"Converted {filename} to images.")

                # Upload resulting images back to S3 under 'slides/' prefix
                for image_file in os.listdir(tmpdir):
                    if image_file.startswith('slide-') and image_file.endswith('.png'):
                        image_path = os.path.join(tmpdir, image_file)
                        # Extract the slide number
                        slide_num = str(int(image_file.split('-')[-1].split('.')[0]) - 1)
                        # Define the destination key
                        image_key = f"Users/{user_id}/presentations/{presentation_id}/slides/slide_{slide_num}.png"
                        # Upload the image
                        s3_client.upload_file(image_path, bucket_name, image_key, ExtraArgs={'ContentDisposition': 'inline', 'ContentType': 'image/png'})
                        logger.info(f"Uploaded {image_file} to {image_key}")

        logger.info("PDF processing completed successfully.")
        s3_client.put_object(Bucket=bucket_name, Key=completed_status_key, Body=b'')
        return {
            'statusCode': 200,
            'body': 'PDF processed successfully'
        }
    except subprocess.CalledProcessError as e:
        logger.error(f"Subprocess error: {e}")
        s3_client.put_object(Bucket=bucket_name, Key=failed_status_key, Body=b'')
        return {
            'statusCode': 500,
            'body': f'Subprocess error: {str(e)}'
        }
    except Exception as e:
        logger.error(f"Error processing PDF: {str(e)}")
        s3_client.put_object(Bucket=bucket_name, Key=failed_status_key, Body=b'')
        return {
            'statusCode': 500,
            'body': f'Error processing PDF: {str(e)}'
        }
"""

# =========================
# 5b. Lambda Put Job On Queue Code
# =========================
lambda_code_audio = """
import boto3
import os
import logging
from urllib.parse import unquote_plus
import pika  # RabbitMQ client library
import json
import ssl

# Initialize AWS clients
s3_client = boto3.client('s3')

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handler(event, context):
    try:
        # Get the S3 bucket website endpoint from environment variables
        s3_bucket_website_endpoint = os.environ.get('S3_BUCKET_WEBSITE_ENDPOINT')

        for record in event['Records']:
            bucket_name = record['s3']['bucket']['name']
            key = unquote_plus(record['s3']['object']['key'])
            filename = os.path.basename(key)

            if not filename.lower().endswith('.webm'):
                logger.info(f"Skipped non-audio file: {key}")
                continue

            logger.info(f"Processing audio file: {key} from bucket: {bucket_name}")

            # Extract user_id, presentation_id, clip_index, clip_timestamp, and slide_index from the key
            # Expected key format: Users/$user_id/presentations/$presentation_id/clips/$clipIndex_$clipTimestamp_$isEnd/$slideIndex/audio.webm
            key_parts = key.split('/')
            if len(key_parts) < 8:
                logger.error(f"Unexpected key format: {key}")
                continue

            user_id = key_parts[1]
            presentation_id = key_parts[3]
            clip_metadata = key_parts[5]
            clip_index, clip_timestamp, is_end = clip_metadata.split('_')
            slide_index = key_parts[6]
            
            # Construct URLs using the S3 bucket website endpoint            
            # Audio URL
            audio_url = f"{s3_bucket_website_endpoint}/{key}"

            # Video URL
            video_key = f"Users/{user_id}/presentations/{presentation_id}/clips/{clip_index}_{clip_timestamp}_{is_end}/{slide_index}/video.webm"
            video_url = f"{s3_bucket_website_endpoint}/{video_key}"

            # Slide URL (assuming slides are stored in a specific location)
            slide_url = f"{s3_bucket_website_endpoint}/Users/{user_id}/presentations/{presentation_id}/slides/slide_{slide_index}.png"

            # http protocol
            http_prefix = "http://"

            # Prepare the message payload
            message = {
                'userID': user_id,
                'presentationID': presentation_id,
                'clipIndex': clip_index,
                'clipTimestamp': clip_timestamp,
                'isEnd': is_end,
                'slideURL': http_prefix + slide_url,
                'audioURL': http_prefix + audio_url,
                'videoURL': http_prefix + video_url
            }

            # Publish the message to RabbitMQ
            publish_to_rabbitmq(message)

            logger.info(f"Published message to RabbitMQ: {message}")

        return {
            'statusCode': 200,
            'body': 'Audio file processed successfully'
        }

    except Exception as e:
        logger.error(f"Error processing audio file: {str(e)}")
        return {
            'statusCode': 500,
            'body': f'Error processing audio file: {str(e)}'
        }

def publish_to_rabbitmq(message):

    # RabbitMQ connection parameters from environment variables
    rabbitmq_host = os.environ.get('RABBITMQ_HOST')
    rabbitmq_port = int(os.environ.get('RABBITMQ_PORT', '5671'))
    rabbitmq_user = os.environ.get('RABBITMQ_USER')
    rabbitmq_password = os.environ.get('RABBITMQ_PASSWORD')
    rabbitmq_queue = os.environ.get('RABBITMQ_QUEUE')
    rabbitmq_vhost = os.environ.get('RABBITMQ_VHOST')

    credentials = pika.PlainCredentials(rabbitmq_user, rabbitmq_password)
    ssl_context = ssl.create_default_context()
    parameters = pika.ConnectionParameters(
        host=rabbitmq_host,
        port=rabbitmq_port,
        credentials=credentials,
        ssl_options=pika.SSLOptions(ssl_context),
        virtual_host=rabbitmq_vhost
    )

    # Establish connection
    connection = pika.BlockingConnection(parameters)
    channel = connection.channel()

    # Declare the queue (if it doesn't exist)
    channel.queue_declare(queue=rabbitmq_queue, durable=True)

    # Publish the message
    channel.basic_publish(
        exchange='',
        routing_key=rabbitmq_queue,
        body=json.dumps(message),
        properties=pika.BasicProperties(
            delivery_mode=2,  # Make message persistent
        )
    )

    # Close the connection
    connection.close()
"""

# =========================
# 6. Lambda Function Creation
# =========================

lambda_function_pdf = lambda_.Function("pdf2image",
    name="pdf2image",  # Explicitly set the Lambda function name
    runtime="python3.9",
    handler="index.handler",  # Ensure this matches the filename and function name
    role=lambda_role.arn,
    code=pulumi.AssetArchive({
        "index.py": pulumi.StringAsset(lambda_code_pdf)  # Specify the filename here
    }),
    layers=[poppler_layer.arn],
    timeout=300,
    memory_size=1024,
    opts=pulumi.ResourceOptions(depends_on=[
        lambda_logs,
    ])
)

lambda_function_audio = lambda_.Function("audio2rabbitmq",
    name="audio2rabbitmq",
    runtime="python3.9",
    handler="index.handler",
    role=lambda_role.arn,
    code=pulumi.AssetArchive({
        "index.py": pulumi.StringAsset(lambda_code_audio)
    }),
    layers=[pika_layer.arn],
    environment=lambda_.FunctionEnvironmentArgs(
        variables={
            'RABBITMQ_HOST': connection_details.get('host'),
            'RABBITMQ_PORT': connection_details.get('port'),
            'RABBITMQ_USER': connection_details.get('user'),
            'RABBITMQ_PASSWORD': connection_details.get('password'),
            'RABBITMQ_QUEUE': first_queue,
            'RABBITMQ_VHOST': connection_details.get('vhost'),            
            'S3_BUCKET_WEBSITE_ENDPOINT': website_config.website_endpoint

        }
    ),
    timeout=300,
    memory_size=1024,
    opts=pulumi.ResourceOptions(depends_on=[
        lambda_logs,
        create_second_queue
    ])
)

# =========================
# 8. Lambda Permission for S3 Invocation
# =========================
lambda_permission_pdf = lambda_.Permission("PDFInvokePermission",
    action="lambda:InvokeFunction",
    function=lambda_function_pdf.arn,  # Use the function's ARN
    principal="s3.amazonaws.com",
    source_arn=s3_bucket.arn
)

lambda_permission_audio = lambda_.Permission("AudioInvokePermission",
    action="lambda:InvokeFunction",
    function=lambda_function_audio.arn,  # Use the function's ARN
    principal="s3.amazonaws.com",
    source_arn=s3_bucket.arn
)

# =========================
# 9. Combined S3 Bucket Notification to Trigger Both Lambdas
# =========================
s3_bucket_notification = s3.BucketNotification("bucketNotif",
    bucket=s3_bucket.id,
    lambda_functions=[
        s3.BucketNotificationLambdaFunctionArgs(
            lambda_function_arn=lambda_function_pdf.arn,
            events=["s3:ObjectCreated:*"],
            filter_prefix="Users/",
            filter_suffix=".pdf"
        ),
        s3.BucketNotificationLambdaFunctionArgs(
            lambda_function_arn=lambda_function_audio.arn,
            events=["s3:ObjectCreated:*"],
            filter_prefix="Users/",
            filter_suffix="audio.webm"
        )
    ],
    opts=pulumi.ResourceOptions(depends_on=[
        lambda_permission_pdf,
        lambda_function_pdf,
        lambda_permission_audio,
        lambda_function_audio,
        s3_bucket
    ]),
)

# =========================
# 10. Access Role to Upload to S3 Bucket
# =========================

# Create an IAM user
api_user = iam.User("API_USER", name="API_USER")


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

# =========================
# 11. Export Resources
# =========================
pulumi.export('directory', s3_bucket.id)
pulumi.export('bucket_website_endpoint', website_config.website_endpoint)
pulumi.export('bucket_website_domain', website_config.website_domain)
pulumi.export("lambda_function__pdf_arn", lambda_function_pdf.arn)
pulumi.export("lambda_function__audio_arn", lambda_function_audio.arn)
pulumi.export("access_key_id", api_access_key.id)
pulumi.export("secret_access_key", api_access_key.secret)
pulumi.export("first_queue", first_queue)
pulumi.export("second_queue", second_queue)
