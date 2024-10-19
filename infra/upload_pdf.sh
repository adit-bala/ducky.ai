#!/bin/bash

# ================================================
# Script: upload_pdf.sh
# Description: 
#   - Cleans up existing test PDF and slides in S3.
#   - Uploads a PDF to a specified S3 bucket path to trigger an AWS Lambda function.
#   - Verifies the upload.
#   - Optionally verifies the generated slides.
# ================================================

# ----------------------------
# Hardcoded Parameters
# ----------------------------

# Replace these variables with your actual values
BUCKET_NAME=""                 # e.g., "my-pdf-bucket"
USER_ID=""                              # e.g., "user_001"
PRESENTATION_ID=""                           # e.g., "presentation_001"
PRESENTATION_NAME="testv2"                          # e.g., "SalesPitch"
LOCAL_PDF_PATH=""        # e.g., "/home/user/Documents/sample.pdf"

# ----------------------------
# Construct the S3 Keys
# ----------------------------

# Expected S3 key format for the PDF
PDF_S3_KEY="Users/${USER_ID}/presentations/${PRESENTATION_ID}/pdf/original_${PRESENTATION_NAME}.pdf"

# Expected S3 prefix for the slides
SLIDES_S3_PREFIX="Users/${USER_ID}/presentations/${PRESENTATION_ID}/slides/"

# ----------------------------
# Functions
# ----------------------------

# Function to delete an object if it exists
delete_s3_object_if_exists() {
    local bucket=$1
    local key=$2

    echo "Checking if 's3://${bucket}/${key}' exists..."
    aws s3 ls "s3://${bucket}/${key}" > /dev/null 2>&1

    if [ $? -eq 0 ]; then
        echo "✅ 's3://${bucket}/${key}' exists. Deleting..."
        aws s3 rm "s3://${bucket}/${key}"
        if [ $? -eq 0 ]; then
            echo "✅ Deleted 's3://${bucket}/${key}'."
        else
            echo "❌ Failed to delete 's3://${bucket}/${key}'."
            exit 1
        fi
    else
        echo "ℹ️ 's3://${bucket}/${key}' does not exist. Skipping deletion."
    fi
}

# Function to delete a prefix (folder) if it exists
delete_s3_prefix_if_exists() {
    local bucket=$1
    local prefix=$2

    echo "Checking if 's3://${bucket}/${prefix}' exists..."
    aws s3 ls "s3://${bucket}/${prefix}" > /dev/null 2>&1

    if [ $? -eq 0 ]; then
        echo "✅ 's3://${bucket}/${prefix}' exists. Deleting all objects under this prefix..."
        aws s3 rm "s3://${bucket}/${prefix}" --recursive
        if [ $? -eq 0 ]; then
            echo "✅ Deleted all objects under 's3://${bucket}/${prefix}'."
        else
            echo "❌ Failed to delete objects under 's3://${bucket}/${prefix}'."
            exit 1
        fi
    else
        echo "ℹ️ 's3://${bucket}/${prefix}' does not exist. Skipping deletion."
    fi
}

# Function to upload PDF to S3
upload_pdf_to_s3() {
    local bucket=$1
    local key=$2
    local pdf_path=$3

    echo "---------------------------------------------"
    echo "Starting PDF upload process..."
    echo "---------------------------------------------"
    echo "Local PDF Path       : ${pdf_path}"
    echo "S3 Bucket            : ${bucket}"
    echo "S3 Key               : ${key}"
    echo "---------------------------------------------"

    # Perform the upload
    aws s3 cp "${pdf_path}" "s3://${bucket}/${key}"

    # Check if the upload was successful
    if [ $? -eq 0 ]; then
        echo "✅ Upload successful!"
    else
        echo "❌ Upload failed. Please check the error messages above."
        exit 1
    fi
}

# Function to verify the upload
verify_upload() {
    local bucket=$1
    local key=$2

    echo "---------------------------------------------"
    echo "Verifying the uploaded PDF in S3..."
    echo "---------------------------------------------"

    # List the specific uploaded PDF
    aws s3 ls "s3://${bucket}/${key}"

    # Check if the listing was successful
    if [ $? -eq 0 ]; then
        echo "✅ Verification successful. PDF exists in S3."
    else
        echo "❌ Verification failed. PDF does not exist in S3."
        exit 1
    fi
}

# Function to verify slides generation (optional)
verify_slides_generation() {
    local bucket=$1
    local prefix=$2

    echo "---------------------------------------------"
    echo "Verifying the generated slides in S3..."
    echo "---------------------------------------------"

    # List the contents of the slides directory
    aws s3 ls "s3://${bucket}/${prefix}"

    # Check if the listing was successful
    if [ $? -eq 0 ]; then
        echo "✅ Slides verification completed. Check the listed files."
    else
        echo "❌ Slides verification failed. No slides found."
        # Depending on your requirements, you might want to exit or continue
    fi
}

# Function to clean up slides after verification (optional)
cleanup_slides() {
    local bucket=$1
    local prefix=$2

    echo "---------------------------------------------"
    echo "Cleaning up generated slides in S3..."
    echo "---------------------------------------------"

    # Delete all objects under the slides prefix
    aws s3 rm "s3://${bucket}/${prefix}" --recursive

    if [ $? -eq 0 ]; then
        echo "✅ Cleaned up slides under 's3://${bucket}/${prefix}'."
    else
        echo "❌ Failed to clean up slides under 's3://${bucket}/${prefix}'."
        exit 1
    fi
}

# ----------------------------
# Main Script Execution
# ----------------------------

# Step 1: Delete existing test PDF if it exists
delete_s3_object_if_exists "${BUCKET_NAME}" "${PDF_S3_KEY}"

# Step 2: Delete existing slides directory if it exists
delete_s3_prefix_if_exists "${BUCKET_NAME}" "${SLIDES_S3_PREFIX}"

# # Step 3: Upload the PDF to S3
# upload_pdf_to_s3 "${BUCKET_NAME}" "${PDF_S3_KEY}" "${LOCAL_PDF_PATH}"

# # Step 4: Verify the upload
# verify_upload "${BUCKET_NAME}" "${PDF_S3_KEY}"

# # Optional: Wait for Lambda to process (adjust sleep time as needed)
# echo "Waiting for Lambda to process the PDF and generate slides..."
# sleep 30  # Wait for 30 seconds. Adjust based on expected processing time.

# # Optional: Verify slides generation
# verify_slides_generation "${BUCKET_NAME}" "${SLIDES_S3_PREFIX}"

# Optional: Clean up slides after verification
# Uncomment the line below if you want to delete the slides after verification
# cleanup_slides "${BUCKET_NAME}" "${SLIDES_S3_PREFIX}"

# ----------------------------
# End of Script
# ----------------------------

echo "---------------------------------------------"
echo "Script execution completed."
echo "---------------------------------------------"